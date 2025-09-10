import { Dataset, DatasetRunItem, DatasetItem } from "@langfuse/core";
import { Span } from "@opentelemetry/api";

import { ExperimentResult, ExperimentParams } from "../experiment/types.js";
import { LangfuseClient } from "../LangfuseClient.js";

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
 *   task: myTask,
 *   evaluators: [myEvaluator]
 * });
 * ```
 *
 * @public
 * @since 4.0.0
 */
export type RunExperimentOnDataset = (
  params: Omit<ExperimentParams, "data">,
) => Promise<ExperimentResult>;

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
   * console.log(await result.prettyPrint());
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
      fetchItemsPageSize: number;
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
      });

      items.push(...itemsResponse.data);

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
        ...params,
      });
    };

    const returnDataset = {
      ...dataset,
      items: itemsWithLinkMethod,
      runExperiment,
    };

    return returnDataset;
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
