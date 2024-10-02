import type { LangfuseCore } from "langfuse-core";

import { CallbackHandler } from "./callback";

import type { DatasetItem, LangfuseTraceClient } from "langfuse-core";

type CreateDatasetItemHandlerParams = {
  runName: string;
  item: DatasetItem;
  langfuseClient: LangfuseCore;
  options?: {
    runDescription?: string;
    runMetadata?: Record<string, any>;
  };
};

export const createDatasetItemHandler = async (
  params: CreateDatasetItemHandlerParams
): Promise<{ handler: CallbackHandler; trace: LangfuseTraceClient }> => {
  const { runName, item, langfuseClient, options } = params;

  // Snake case properties to match Python SDK
  const metadata: Record<string, string> = {
    dataset_item_id: item.id,
    dataset_id: item.datasetId,
    dataset_run_name: runName,
  };

  const trace = langfuseClient.trace();

  await item.link(trace, runName, {
    description: options?.runDescription,
    metadata: options?.runMetadata,
  });

  return {
    handler: new CallbackHandler({ root: trace, updateRoot: true, metadata }),
    trace,
  };
};
