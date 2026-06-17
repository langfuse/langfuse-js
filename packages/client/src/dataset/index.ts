import {
  Dataset,
  DatasetRunItem,
  DatasetItem,
  CreateDatasetItemRequest,
  LangfuseMedia,
  LangfuseMediaReference,
  getGlobalLogger,
} from "@langfuse/core";
import { Span } from "@opentelemetry/api";
import { JSONPath, type JSONPathOptions } from "jsonpath-plus";

import { ExperimentResult, ExperimentParams } from "../experiment/types.js";
import { LangfuseClient } from "../LangfuseClient.js";

/** Maximum recursion depth when walking dataset item values for media. */
const MAX_MEDIA_TRAVERSAL_DEPTH = 20;

/**
 * Whether a value is a plain object (literal / `Object.create(null)`), as
 * opposed to a class instance such as `Date`, `Map`, or `LangfuseMedia`. Only
 * plain objects and arrays are traversed for media; everything else is left
 * intact so the API client serializes it as before (e.g. `Date` -> ISO string).
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Maps a {@link DatasetItem} media-reference field enum value to the
 * corresponding key on the dataset item. The enum values match the item keys,
 * but this lookup is kept as the allowlist that guards against unknown fields.
 */
const MEDIA_REFERENCE_FIELD_TO_ITEM_KEY = {
  input: "input",
  expectedOutput: "expectedOutput",
  metadata: "metadata",
} as const;

/**
 * Replaces the value(s) at `jsonPath` within `root` with `replacement`.
 *
 * Mutates `root` in place for nested paths and returns it. When the path
 * targets the root itself (`$`), `replacement` is returned instead. If the path
 * matches nothing, `root` is returned unchanged.
 *
 * Uses `jsonpath-plus` with script evaluation disabled — the Langfuse API only
 * emits concrete member paths (e.g. `$['image']`), never filter expressions, so
 * no scripting engine is required (safe under strict CSP / edge runtimes).
 */
function setAtJsonPath(
  root: unknown,
  jsonPath: string,
  replacement: unknown,
): unknown {
  const matches = JSONPath({
    path: jsonPath,
    json: root as JSONPathOptions["json"],
    resultType: "all",
    wrap: true,
    eval: false,
  }) as
    | Array<{ parent: unknown; parentProperty: string | number | null }>
    | undefined;

  // jsonpath-plus returns undefined (not []) when `root` is null/undefined.
  if (!matches || matches.length === 0) {
    return root;
  }

  let newRoot = root;
  for (const match of matches) {
    if (match.parent == null || match.parentProperty == null) {
      // The path matched the root value itself.
      newRoot = replacement;
    } else {
      (match.parent as Record<string | number, unknown>)[match.parentProperty] =
        replacement;
    }
  }

  return newRoot;
}

/**
 * Replaces Langfuse media reference strings in a dataset item's `input`,
 * `expectedOutput`, and `metadata` with {@link LangfuseMediaReference} objects,
 * based on the `mediaReferences` returned by the API. Mutates and returns the
 * item.
 */
function hydrateDatasetItemMediaReferences(item: DatasetItem): DatasetItem {
  const mediaReferences = item.mediaReferences ?? [];

  for (const mediaReference of mediaReferences) {
    const media = mediaReference.media;
    if (!media) {
      continue;
    }

    // Guard against an unknown field value (e.g. a server-side enum variant
    // added before the SDK is updated) so we never write to a "undefined" key.
    const itemKey = MEDIA_REFERENCE_FIELD_TO_ITEM_KEY[mediaReference.field];
    if (!itemKey) {
      getGlobalLogger().warn(
        `Unrecognised media reference field "${mediaReference.field}", skipping hydration.`,
      );
      continue;
    }

    const replacement = new LangfuseMediaReference({
      mediaId: media.mediaId,
      contentType: media.contentType,
      url: media.url,
      urlExpiry: media.urlExpiry,
      contentLength: media.contentLength,
      referenceString: mediaReference.referenceString,
    });

    const itemRecord = item as unknown as Record<string, unknown>;
    try {
      itemRecord[itemKey] = setAtJsonPath(
        itemRecord[itemKey],
        mediaReference.jsonPath,
        replacement,
      );
    } catch (error) {
      getGlobalLogger().warn(
        `Failed to hydrate dataset media reference at JSONPath ${mediaReference.jsonPath}`,
        error,
      );
    }
  }

  return item;
}

/**
 * Function type for running experiments on Langfuse datasets.
 *
 * This function type is attached to fetched datasets to enable convenient
 * experiment execution directly on dataset objects.
 *
 * @param params - Experiment parameters excluding data (since data comes from the dataset)
 * @returns Promise resolving to experiment results
 *
 * @example
 * ```typescript
 * const dataset = await langfuse.dataset.get("my-dataset");
 * const result = await dataset.runExperiment({
 *   name: "Model Evaluation",
 *   runName: "Model Evaluation Run 1", // optional
 *   task: myTask,
 *   evaluators: [myEvaluator]
 * });
 * ```
 *
 * @public
 * @since 4.0.0
 */
export type RunExperimentOnDataset = (
  params: Omit<ExperimentParams<any, any, Record<string, any>>, "data">,
) => Promise<ExperimentResult<any, any, Record<string, any>>>;

/**
 * Enhanced dataset object with additional methods for linking and experiments.
 *
 * This type extends the base Dataset with functionality for:
 * - Linking dataset items to traces/observations
 * - Running experiments directly on the dataset
 *
 * @example Working with a fetched dataset
 * ```typescript
 * const dataset = await langfuse.dataset.get("my-evaluation-dataset");
 *
 * // Access dataset metadata
 * console.log(dataset.name, dataset.description);
 *
 * // Work with individual items
 * for (const item of dataset.items) {
 *   console.log(item.input, item.expectedOutput);
 *
 *   // Link item to a trace
 *   await item.link(myObservation, "experiment-run-1");
 * }
 *
 * // Run experiments on the entire dataset
 * const result = await dataset.runExperiment({
 *   name: "Model Comparison",
 *   task: myTask,
 *   evaluators: [accuracyEvaluator]
 * });
 * ```
 *
 * @public
 * @since 4.0.0
 */
export type FetchedDataset = Dataset & {
  /** Dataset items with additional linking functionality */
  items: (DatasetItem & { link: LinkDatasetItemFunction })[];
  /** ISO 8601 timestamp (RFC 3339, Section 5.6) in UTC (e.g., "2026-01-21T14:35:42Z").
   * If provided, returns state of dataset at this timestamp.
   * If not provided, returns the latest version.
   */
  version?: string;
  /** Function to run experiments directly on this dataset */
  runExperiment: RunExperimentOnDataset;
};

/**
 * Function type for linking dataset items to OpenTelemetry spans.
 *
 * This function creates a connection between a dataset item and a trace/observation,
 * enabling tracking of which dataset items were used in which experiments or runs.
 * This is essential for creating dataset runs and tracking experiment lineage.
 *
 * @param obj - Object containing the OpenTelemetry span to link to
 * @param obj.otelSpan - The OpenTelemetry span from a Langfuse observation
 * @param runName - Name of the experiment run for grouping related items
 * @param runArgs - Optional configuration for the dataset run
 * @param runArgs.description - Description of the experiment run
 * @param runArgs.metadata - Additional metadata to attach to the run
 * @returns Promise that resolves to the created dataset run item
 *
 * @example Basic linking
 * ```typescript
 * const dataset = await langfuse.dataset.get("my-dataset");
 * const span = startObservation("my-task", { input: "test" });
 * span.update({ output: "result" });
 * span.end();
 *
 * // Link the dataset item to this execution
 * await dataset.items[0].link(
 *   { otelSpan: span.otelSpan },
 *   "experiment-run-1"
 * );
 * ```
 *
 * @example Linking with metadata
 * ```typescript
 * await dataset.items[0].link(
 *   { otelSpan: span.otelSpan },
 *   "model-comparison-v2",
 *   {
 *     description: "Comparing GPT-4 vs Claude performance",
 *     metadata: {
 *       modelVersion: "gpt-4-1106-preview",
 *       temperature: 0.7,
 *       timestamp: new Date().toISOString()
 *     }
 *   }
 * );
 * ```
 *
 * @see {@link https://langfuse.com/docs/datasets} Langfuse datasets documentation
 * @public
 * @since 4.0.0
 */
export type LinkDatasetItemFunction = (
  obj: { otelSpan: Span },
  runName: string,
  runArgs?: {
    /** Description of the dataset run */
    description?: string;
    /** Additional metadata for the dataset run */
    metadata?: any;
  },
) => Promise<DatasetRunItem>;

/**
 * Manager for dataset operations in Langfuse.
 *
 * Provides methods to retrieve datasets and their items, with automatic
 * pagination handling and convenient linking functionality for experiments.
 *
 * @public
 */
export class DatasetManager {
  private langfuseClient: LangfuseClient;

  /**
   * Creates a new DatasetManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { langfuseClient: LangfuseClient }) {
    this.langfuseClient = params.langfuseClient;
  }

  /**
   * Retrieves a dataset by name with all its items and experiment functionality.
   *
   * This method fetches a dataset and all its associated items, with support
   * for automatic pagination to handle large datasets efficiently. The returned
   * dataset object includes enhanced functionality for linking items to traces
   * and running experiments directly on the dataset.
   *
   * @param name - The name of the dataset to retrieve
   * @param options - Optional configuration for data fetching
   * @param options.fetchItemsPageSize - Number of items to fetch per page (default: 50)
   * @returns Promise resolving to enhanced dataset with items, linking, and experiment capabilities
   *
   * @example Basic dataset retrieval
   * ```typescript
   * const dataset = await langfuse.dataset.get("my-evaluation-dataset");
   * console.log(`Dataset ${dataset.name} has ${dataset.items.length} items`);
   *
   * // Access dataset properties
   * console.log(dataset.description);
   * console.log(dataset.metadata);
   * ```
   *
   * @example Working with dataset items
   * ```typescript
   * const dataset = await langfuse.dataset.get("qa-dataset");
   *
   * for (const item of dataset.items) {
   *   console.log("Question:", item.input);
   *   console.log("Expected Answer:", item.expectedOutput);
   *
   *   // Each item has a link function for connecting to traces
   *   // await item.link(span, "experiment-name");
   * }
   * ```
   *
   * @example Running experiments on datasets
   * ```typescript
   * const dataset = await langfuse.dataset.get("benchmark-dataset");
   *
   * const result = await dataset.runExperiment({
   *   name: "GPT-4 Benchmark",
   *   runName: "GPT-4 Benchmark v1.2", // optional exact run name
   *   description: "Evaluating GPT-4 on our benchmark tasks",
   *   task: async ({ input }) => {
   *     const response = await openai.chat.completions.create({
   *       model: "gpt-4",
   *       messages: [{ role: "user", content: input }]
   *     });
   *     return response.choices[0].message.content;
   *   },
   *   evaluators: [
   *     async ({ output, expectedOutput }) => ({
   *       name: "exact_match",
   *       value: output === expectedOutput ? 1 : 0
   *     })
   *   ]
   * });
   *
   * console.log(await result.format());
   * ```
   *
   * @example Handling large datasets
   * ```typescript
   * // For very large datasets, use smaller page sizes
   * const largeDataset = await langfuse.dataset.get(
   *   "large-dataset",
   *   { fetchItemsPageSize: 100 }
   * );
   * ```
   *
   * @throws {Error} If the dataset does not exist or cannot be accessed
   * @see {@link FetchedDataset} for the complete return type specification
   * @see {@link RunExperimentOnDataset} for experiment execution details
   * @public
   * @since 4.0.0
   */
  async get(
    name: string,
    options?: {
      fetchItemsPageSize?: number;
      /**
       * ISO 8601 timestamp (RFC 3339, Section 5.6) in UTC (e.g., "2026-01-21T14:35:42Z").
       * If provided, returns state of dataset at this timestamp.
       * If not provided, returns the latest version.
       */
      version?: string;
      /**
       * If true, resolve Langfuse media reference strings in each item's
       * `input`, `expectedOutput`, and `metadata` to {@link LangfuseMediaReference}
       * objects with signed download URLs. Defaults to false.
       */
      resolveMediaReferences?: boolean;
    },
  ): Promise<FetchedDataset> {
    const dataset = await this.langfuseClient.api.datasets.get(name);
    const items: DatasetItem[] = [];

    let page = 1;

    while (true) {
      const itemsResponse = await this.langfuseClient.api.datasetItems.list({
        datasetName: name,
        limit: options?.fetchItemsPageSize ?? 50,
        page,
        ...(options?.version && { version: options.version }),
        ...(options?.resolveMediaReferences && {
          includeMediaReferences: true,
        }),
      });

      items.push(
        ...(options?.resolveMediaReferences
          ? itemsResponse.data.map(hydrateDatasetItemMediaReferences)
          : itemsResponse.data),
      );

      if (itemsResponse.meta.totalPages <= page) {
        break;
      }

      page++;
    }

    const itemsWithLinkMethod = items.map((item) => ({
      ...item,
      link: this.createDatasetItemLinkFunction(item),
    }));

    const runExperiment: RunExperimentOnDataset = (params) => {
      return this.langfuseClient.experiment.run({
        data: items,
        datasetVersion: options?.version,
        ...params,
      });
    };

    const returnDataset = {
      ...dataset,
      items: itemsWithLinkMethod,
      version: options?.version,
      runExperiment,
    };

    return returnDataset;
  }

  /**
   * Creates (or upserts) a dataset item, handling media upload.
   *
   * Any {@link LangfuseMedia} found in `input`, `expectedOutput`, or `metadata`
   * (including nested in objects and arrays) is uploaded to Langfuse and
   * replaced with a media reference string before the item is created. The same
   * media is uploaded at most once per call.
   *
   * @param request - The dataset item to create
   * @returns The created dataset item
   *
   * @example Creating an item with media
   * ```typescript
   * await langfuse.dataset.createItem({
   *   datasetName: "vision-eval",
   *   input: {
   *     question: "Compare the candidate image against the reference image.",
   *     candidate: new LangfuseMedia({
   *       source: "bytes",
   *       contentBytes: candidateBytes,
   *       contentType: "image/png",
   *     }),
   *   },
   *   expectedOutput: {
   *     reference: new LangfuseMedia({
   *       source: "bytes",
   *       contentBytes: referenceBytes,
   *       contentType: "image/png",
   *     }),
   *     label: "match",
   *   },
   * });
   * ```
   *
   * @public
   */
  async createItem(request: CreateDatasetItemRequest): Promise<DatasetItem> {
    // Shared across all three fields so the same media (by ID) is uploaded once,
    // even when fields are processed concurrently.
    const uploads = new Map<string, Promise<void>>();

    const [input, expectedOutput, metadata] = await Promise.all([
      this.processItemMedia(request.input, uploads),
      this.processItemMedia(request.expectedOutput, uploads),
      this.processItemMedia(request.metadata, uploads),
    ]);

    return await this.langfuseClient.api.datasetItems.create({
      ...request,
      input,
      expectedOutput,
      metadata,
    });
  }

  /**
   * Recursively replaces {@link LangfuseMedia} instances within a dataset item
   * value with media reference strings, uploading the media in parallel.
   *
   * Returns a new value; the input is not mutated. Cyclic references and depth
   * beyond {@link MAX_MEDIA_TRAVERSAL_DEPTH} are left untouched.
   *
   * @internal
   */
  private async processItemMedia(
    data: unknown,
    uploads: Map<string, Promise<void>>,
    level = 1,
    ancestors: Set<unknown> = new Set(),
  ): Promise<unknown> {
    if (data instanceof LangfuseMedia) {
      return this.uploadItemMedia(data, uploads);
    }

    // An already-resolved reference (from get(resolveMediaReferences: true)):
    // emit its reference string so a re-used item links back to its media
    // instead of persisting a JSON object with a soon-to-expire signed URL.
    if (data instanceof LangfuseMediaReference) {
      return data.referenceString;
    }

    // Only arrays and plain objects are traversed. Primitives and non-plain
    // objects (Date, Map, other class instances with custom serialization) are
    // returned untouched so the API client serializes them as before.
    const isArray = Array.isArray(data);
    if (
      data === null ||
      typeof data !== "object" ||
      (!isArray && !isPlainObject(data))
    ) {
      return data;
    }

    if (ancestors.has(data)) {
      return data;
    }

    if (level > MAX_MEDIA_TRAVERSAL_DEPTH) {
      getGlobalLogger().warn(
        `Dataset item media traversal exceeded ${MAX_MEDIA_TRAVERSAL_DEPTH} levels; any LangfuseMedia nested deeper will not be uploaded.`,
      );
      return data;
    }

    const nextAncestors = new Set(ancestors).add(data);
    const process = (value: unknown): Promise<unknown> =>
      this.processItemMedia(value, uploads, level + 1, nextAncestors);

    if (isArray) {
      return Promise.all(data.map(process));
    }

    const entries = await Promise.all(
      Object.entries(data).map(
        async ([key, value]) => [key, await process(value)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  /**
   * Uploads a single {@link LangfuseMedia} and returns its reference string for
   * embedding in the dataset item. Concurrent calls for the same media ID share
   * a single upload via the {@link uploads} cache.
   *
   * @internal
   */
  private async uploadItemMedia(
    media: LangfuseMedia,
    uploads: Map<string, Promise<void>>,
  ): Promise<string> {
    const [referenceString, mediaId] = await Promise.all([
      media.getTag(),
      media.getId(),
    ]);

    if (!referenceString || !mediaId) {
      throw new Error("Cannot create dataset item with invalid LangfuseMedia.");
    }

    const upload =
      uploads.get(mediaId) ?? this.langfuseClient.media.uploadMedia(media);
    uploads.set(mediaId, upload);
    await upload;

    return referenceString;
  }

  /**
   * Creates a link function for a specific dataset item.
   *
   * @param item - The dataset item to create a link function for
   * @returns A function that can link the item to OpenTelemetry spans
   * @internal
   */
  private createDatasetItemLinkFunction(
    item: DatasetItem,
  ): LinkDatasetItemFunction {
    const linkFunction = async (
      obj: { otelSpan: Span },
      runName: string,
      runArgs?: {
        description?: string;
        metadata?: any;
      },
    ): Promise<DatasetRunItem> => {
      return await this.langfuseClient.api.datasetRunItems.create({
        runName,
        datasetItemId: item.id,
        traceId: obj.otelSpan.spanContext().traceId,
        runDescription: runArgs?.description,
        metadata: runArgs?.metadata,
      });
    };

    return linkFunction;
  }
}
