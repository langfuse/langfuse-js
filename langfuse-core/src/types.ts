import { type LangfusePromptClient } from "./prompts/promptClients";
import { type components, type paths } from "./openapi/server";

export type LangfuseCoreOptions = {
  // Langfuse API publicKey obtained from the Langfuse UI project settings
  publicKey?: string;
  // Langfuse API secretKey obtained from the Langfuse UI project settings
  secretKey?: string;
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
  // Enabled switch for the SDK. If disabled, no observability data will be sent to Langfuse. Defaults to true.
  enabled?: boolean;
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

/**
 * CreateLangfuseTraceBody
 * @property userId - The id of the trace can be set, defaults to a random id. Set it to link traces to external systems or when grouping multiple runs into a single trace (e.g. messages in a chat thread).
 * @property name - Identifier of the trace. Useful for sorting/filtering in the UI.
 * @property input - The input of the trace. Can be any JSON object.
 * @property output - The output of the trace. Can be any JSON object.
 * @property metadata - Additional metadata of the trace. Can be any JSON object. Metadata is merged when being updated via the API.object.
 * @property sessionId - Used to group multiple traces into a session in Langfuse. Use your own session/thread identifier.
 * @property userId - The id of the user that triggered the execution. Used to provide user-level analytics.
 * @property version - The version of the trace type. Used to understand how changes to the trace type affect metrics. Useful in debugging.
 * @property tags - Tags are used to categorize or label traces. Traces can be filtered by tags in the UI and GET API. Tags can also be changed in the UI. Tags are merged and never deleted via the API.
 * @property public - You can make a trace public to share it via a public link. This allows others to view the trace without needing to log in or be members of your Langfuse project.
 * @interface
 */

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

/**
 * CreateTextPromptBody
 * @interface
 */

export type CreateTextPromptBody = { type?: "text" } & Omit<CreateTextPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility

/**
 * CreateChatPromptBody
 * @interface
 */

export type CreateChatPromptBody = { type: "chat" } & Omit<CreateChatPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility

/**
 * CreatePromptBody
 * @interface
 */

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
