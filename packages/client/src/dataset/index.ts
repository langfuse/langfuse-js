import { Dataset, DatasetRunItem, DatasetItem } from "@langfuse/core";
import { Span } from "@opentelemetry/api";

import { ExperimentResult, ExperimentParams } from "../experiment/types.js";
import { LangfuseClient } from "../LangfuseClient.js";

export type RunExperimentOnDataset = (
  params: Omit<ExperimentParams, "data" | "dataSource">,
) => Promise<ExperimentResult>;

export type FetchedDataset = Dataset & {
  items: (DatasetItem & { link: LinkDatasetItemFunction })[];
  runExperiment: RunExperimentOnDataset;
};

/**
 * Function type for linking dataset items to OpenTelemetry spans.
 * This allows dataset items to be associated with specific traces for experiment tracking.
 *
 * @param obj - Object containing the OpenTelemetry span
 * @param runName - Name of the dataset run
 * @param runArgs - Optional arguments for the dataset run
 * @returns Promise that resolves to the created dataset run item
 *
 * @public
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
   * Retrieves a dataset by name along with all its items.
   *
   * This method automatically handles pagination to fetch all dataset items
   * and enhances each item with a `link` function for easy experiment tracking.
   *
   * @param name - The name of the dataset to retrieve
   * @param options - Optional configuration for fetching
   * @param options.fetchItemsPageSize - Number of items to fetch per page (default: 50)
   *
   * @returns Promise that resolves to the dataset with enhanced items
   *
   * @example
   * ```typescript
   * const dataset = await langfuse.dataset.get("my-dataset");
   *
   * for (const item of dataset.items) {
   *   // Use the item data for your experiment
   *   const result = await processItem(item.input);
   *
   *   // Link the result to the dataset item
   *   await item.link(
   *     { otelSpan: currentSpan },
   *     "experiment-run-1",
   *     { description: "Testing new model" }
   *   );
   * }
   * ```
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
