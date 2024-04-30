import { type LangfusePromptClient } from "./prompts/promptClients";
import { type components, type paths } from "./openapi/server";

export type LangfuseCoreOptions = {
  // Langfuse API baseUrl (https://cloud.langfuse.com by default)
  baseUrl?: string;
  // The number of events to queue before sending to Langfuse (flushing)
  flushAt?: number;
  // The interval in milliseconds between periodic flushes
  flushInterval?: number;
  // How many times we will retry HTTP requests
  fetchRetryCount?: number;
  // The delay between HTTP request retries
  fetchRetryDelay?: number;
  // Timeout in milliseconds for any calls. Defaults to 10 seconds.
  requestTimeout?: number;
  // release (version) of the application, defaults to env LANGFUSE_RELEASE
  release?: string;
  // integration type of the SDK.
  sdkIntegration?: string; // DEFAULT, LANGCHAIN, or any other custom value
};

export enum LangfusePersistedProperty {
  Props = "props",
  Queue = "queue",
  OptedOut = "opted_out",
}

export type LangfuseFetchOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers: { [key: string]: string };
  body?: string;
  signal?: AbortSignal;
};

export type LangfuseFetchResponse<T = any> = {
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
};

export type LangfuseObject = SingleIngestionEvent["type"];

export type LangfuseQueueItem = SingleIngestionEvent & {
  callback?: (err: any) => void;
};

export type SingleIngestionEvent =
  paths["/api/public/ingestion"]["post"]["requestBody"]["content"]["application/json"]["batch"][number];

// return type of ingestion endpoint defined on 200 status error in fern as 207 is not possible
export type IngestionReturnType =
  paths["/api/public/ingestion"]["post"]["responses"][200]["content"]["application/json"];

export type LangfuseEventProperties = {
  [key: string]: any;
};

export type LangfuseMetadataProperties = {
  [key: string]: any;
};

// ASYNC
export type CreateLangfuseTraceBody = FixTypes<components["schemas"]["TraceBody"]>;

export type CreateLangfuseEventBody = FixTypes<components["schemas"]["CreateEventBody"]>;

export type CreateLangfuseSpanBody = FixTypes<components["schemas"]["CreateSpanBody"]>;
export type UpdateLangfuseSpanBody = FixTypes<components["schemas"]["UpdateSpanBody"]>;

export type Usage = FixTypes<components["schemas"]["IngestionUsage"]>;
export type CreateLangfuseGenerationBody = FixTypes<components["schemas"]["CreateGenerationBody"]>;
export type UpdateLangfuseGenerationBody = FixTypes<components["schemas"]["UpdateGenerationBody"]>;

export type CreateLangfuseScoreBody = FixTypes<components["schemas"]["ScoreBody"]>;

// SYNC
export type GetLangfuseDatasetParams = FixTypes<
  paths["/api/public/datasets/{datasetName}"]["get"]["parameters"]["path"]
>;
export type GetLangfuseDatasetResponse = FixTypes<
  paths["/api/public/datasets/{datasetName}"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetRunItemBody = FixTypes<
  paths["/api/public/dataset-run-items"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetRunItemResponse = FixTypes<
  paths["/api/public/dataset-run-items"]["post"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetBody =
  paths["/api/public/datasets"]["post"]["requestBody"]["content"]["application/json"];
export type CreateLangfuseDatasetResponse = FixTypes<
  paths["/api/public/datasets"]["post"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetItemBody = FixTypes<
  paths["/api/public/dataset-items"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetItemResponse = FixTypes<
  paths["/api/public/dataset-items"]["post"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseDatasetRunParams = FixTypes<
  paths["/api/public/datasets/{datasetName}/runs/{runName}"]["get"]["parameters"]["path"]
>;
export type GetLangfuseDatasetRunResponse = FixTypes<
  paths["/api/public/datasets/{datasetName}/runs/{runName}"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfusePromptBody = FixTypes<
  paths["/api/public/v2/prompts"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfusePromptResponse =
  paths["/api/public/v2/prompts"]["post"]["responses"]["200"]["content"]["application/json"];

export type GetLangfusePromptSuccessData =
  paths["/api/public/v2/prompts/{promptName}"]["get"]["responses"]["200"]["content"]["application/json"];

export type GetLangfusePromptFailureData = { message?: string };
export type GetLangfusePromptResponse =
  | {
      fetchResult: "success";
      data: GetLangfusePromptSuccessData;
    }
  | { fetchResult: "failure"; data: GetLangfusePromptFailureData };

export type ChatMessage = FixTypes<components["schemas"]["ChatMessage"]>;
export type ChatPrompt = FixTypes<components["schemas"]["ChatPrompt"]> & { type: "chat" };
export type TextPrompt = FixTypes<components["schemas"]["TextPrompt"]> & { type: "text" };

type CreateTextPromptRequest = FixTypes<components["schemas"]["CreateTextPromptRequest"]>;
type CreateChatPromptRequest = FixTypes<components["schemas"]["CreateChatPromptRequest"]>;
export type CreateTextPromptBody = { type?: "text" } & Omit<CreateTextPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility
export type CreateChatPromptBody = { type: "chat" } & Omit<CreateChatPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility

export type CreatePromptBody = CreateTextPromptBody | CreateChatPromptBody;

export type PromptInput = {
  prompt?: LangfusePromptClient;
};

export type JsonType = string | number | boolean | null | { [key: string]: JsonType } | Array<JsonType>;

type OptionalTypes<T> = T extends null | undefined ? T : never;
type FixTypes<T> = Omit<
  {
    [P in keyof T]: P extends "startTime" | "endTime" | "timestamp" | "completionStartTime" | "createdAt" | "updatedAt"
      ? // Dates instead of strings
        Date | OptionalTypes<T[P]>
      : P extends "metadata" | "input" | "output" | "completion" | "expectedOutput"
        ? // JSON instead of strings
          any | OptionalTypes<T[P]>
        : T[P];
  },
  "externalId" | "traceIdType"
>;

export type DeferRuntime = {
  langfuseTraces: (
    traces: {
      id: string;
      name: string;
      url: string;
    }[]
  ) => void;
};
