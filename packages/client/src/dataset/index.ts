import {
  LangfuseAPIClient,
  Dataset,
  DatasetRunItem,
  DatasetItem,
} from "@langfuse/core";
import { Span } from "@opentelemetry/api";

export type LinkDatasetItemFunction = (
  obj: { otelSpan: Span },
  runName: string,
  runArgs?: {
    description?: string;
    metadata?: any;
  },
) => Promise<DatasetRunItem>;

export class DatasetManager {
  private apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

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
