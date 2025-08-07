import {
  LangfuseAPIClient,
  Dataset,
  DatasetRunItem,
  DatasetItem,
} from "@langfuse/core";
import { Span } from "@opentelemetry/api";

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
  private apiClient: LangfuseAPIClient;

  /**
   * Creates a new DatasetManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
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
  ): Promise<
    Dataset & {
      items: (DatasetItem & { link: LinkDatasetItemFunction })[];
    }
  > {
    const dataset = await this.apiClient.datasets.get(name);
    const items: DatasetItem[] = [];

    let page = 1;

    while (true) {
      const itemsResponse = await this.apiClient.datasetItems.list({
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

    const returnDataset = {
      ...dataset,
      items: items.map((item) => ({
        ...item,
        link: this.createDatasetItemLinkFunction(item),
      })),
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
      return await this.apiClient.datasetRunItems.create({
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
