import {
  Dataset,
  DatasetRunItem,
  DatasetItem,
  CreateDatasetItemRequest,
  LangfuseMedia,
  LangfuseMediaReference,
  generateUUID,
  getGlobalLogger,
} from "@langfuse/core";
import { Span } from "@opentelemetry/api";

import { ExperimentResult, ExperimentParams } from "../experiment/types.js";
import { LangfuseClient } from "../LangfuseClient.js";

import { setValueAtPath } from "./jsonPath.js";

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
      itemRecord[itemKey] = setValueAtPath(
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
      });

      items.push(...itemsResponse.data.map(hydrateDatasetItemMediaReferences));

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
    // The item need not exist yet; settle its id up front so media uploads can
    // reference it and the create call below reuses it.
    const datasetItemId = request.id ?? generateUUID();

    // Walk each field, swapping media for its reference string and collecting
    // the media (deduped by id) to upload afterwards.
    const toUpload = new Map<string, { media: LangfuseMedia; field: string }>();
    const [input, expectedOutput, metadata] = await Promise.all([
      replaceDatasetItemMedia(request.input, "input", toUpload),
      replaceDatasetItemMedia(
        request.expectedOutput,
        "expectedOutput",
        toUpload,
      ),
      replaceDatasetItemMedia(request.metadata, "metadata", toUpload),
    ]);

    // Resolve the dataset id (an extra request) only when there is media to
    // upload, and upload before creating so the backend can link the references.
    if (toUpload.size > 0) {
      const datasetId = (
        await this.langfuseClient.api.datasets.get(request.datasetName)
      ).id;
      await Promise.all(
        [...toUpload.values()].map(({ media, field }) =>
          this.langfuseClient.media.uploadMedia(media, {
            datasetId,
            datasetItemId,
            field,
          }),
        ),
      );
    }

    return await this.langfuseClient.api.datasetItems.create({
      ...request,
      id: datasetItemId,
      input,
      expectedOutput,
      metadata,
    });
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

/**
 * Recursively replaces each {@link LangfuseMedia} in a dataset item field with
 * its reference string, collecting the media (deduped by id, first field wins)
 * into `collected` for the caller to upload afterwards. The reference string is
 * derived from content, so no upload happens here.
 *
 * Returns a new value; the input is not mutated. An already-resolved
 * {@link LangfuseMediaReference} is replaced with its reference string. Only
 * arrays and plain objects are traversed; non-plain objects (Date, Map, class
 * instances) are left intact so the API client serializes them as before.
 * Cyclic references and depth beyond {@link MAX_MEDIA_TRAVERSAL_DEPTH} are left
 * untouched.
 */
async function replaceDatasetItemMedia(
  data: unknown,
  field: string,
  collected: Map<string, { media: LangfuseMedia; field: string }>,
  level = 1,
  ancestors: Set<unknown> = new Set(),
): Promise<unknown> {
  if (data instanceof LangfuseMedia) {
    const [referenceString, mediaId] = await Promise.all([
      data.getTag(),
      data.getId(),
    ]);
    if (!referenceString || !mediaId) {
      throw new Error("Cannot create dataset item with invalid LangfuseMedia.");
    }
    if (!collected.has(mediaId)) {
      collected.set(mediaId, { media: data, field });
    }
    return referenceString;
  }

  if (data instanceof LangfuseMediaReference) {
    return data.referenceString;
  }

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
  const recurse = (value: unknown): Promise<unknown> =>
    replaceDatasetItemMedia(value, field, collected, level + 1, nextAncestors);

  if (isArray) {
    return Promise.all(data.map(recurse));
  }

  const entries = await Promise.all(
    Object.entries(data).map(
      async ([key, value]) => [key, await recurse(value)] as const,
    ),
  );
  return Object.fromEntries(entries);
}
