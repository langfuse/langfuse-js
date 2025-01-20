import { type LangfuseObjectClient } from "./index";
import { type LangfusePromptClient } from "./prompts/promptClients";
import { type components, type paths } from "./openapi/server";

export type LangfuseCoreOptions = {
  // Langfuse API publicKey obtained from the Langfuse UI project settings
  publicKey?: string;
  // Langfuse API secretKey obtained from the Langfuse UI project settings
  secretKey?: string;
  // Langfuse API baseUrl (https://cloud.langfuse.com by default)
  baseUrl?: string;
  // Additional HTTP headers to send with each request
  additionalHeaders?: Record<string, string>;
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
  // Mask function to mask data in the event body
  mask?: MaskFunction;
  // Project ID to use for the SDK in admin mode. This should never be set by users.
  _projectId?: string;
  // Whether to enable local event export. Defaults to false.
  _isLocalEventExportEnabled?: boolean;
};

export enum LangfusePersistedProperty {
  Props = "props",
  Queue = "queue",
  OptedOut = "opted_out",
}

export type LangfuseFetchOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers: { [key: string]: string };
  body?: string | Buffer;
  signal?: AbortSignal;
};

export type LangfuseFetchResponse<T = any> = {
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
  arrayBuffer: () => Promise<ArrayBuffer>;
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
export type EventBody =
  | CreateLangfuseTraceBody
  | CreateLangfuseEventBody
  | CreateLangfuseSpanBody
  | CreateLangfuseGenerationBody
  | CreateLangfuseScoreBody
  | UpdateLangfuseSpanBody
  | UpdateLangfuseGenerationBody;

export type Usage = FixTypes<components["schemas"]["IngestionUsage"]>;
export type UsageDetails = FixTypes<components["schemas"]["UsageDetails"]>;
export type CreateLangfuseGenerationBody = FixTypes<components["schemas"]["CreateGenerationBody"]>;
export type UpdateLangfuseGenerationBody = FixTypes<components["schemas"]["UpdateGenerationBody"]>;

export type CreateLangfuseScoreBody = FixTypes<components["schemas"]["ScoreBody"]>;

// SYNC
export type GetLangfuseTracesQuery = FixTypes<paths["/api/public/traces"]["get"]["parameters"]["query"]>;
export type GetLangfuseTracesResponse = FixTypes<
  paths["/api/public/traces"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseTraceResponse = FixTypes<
  paths["/api/public/traces/{traceId}"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseObservationsQuery = FixTypes<paths["/api/public/observations"]["get"]["parameters"]["query"]>;
export type GetLangfuseObservationsResponse = FixTypes<
  paths["/api/public/observations"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseObservationResponse = FixTypes<
  paths["/api/public/observations/{observationId}"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseSessionsQuery = FixTypes<paths["/api/public/sessions"]["get"]["parameters"]["query"]>;
export type GetLangfuseSessionsResponse = FixTypes<
  paths["/api/public/sessions"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseDatasetParams = FixTypes<
  paths["/api/public/v2/datasets/{datasetName}"]["get"]["parameters"]["path"]
>;
export type GetLangfuseDatasetResponse = FixTypes<
  paths["/api/public/v2/datasets/{datasetName}"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseDatasetItemsQuery = paths["/api/public/dataset-items"]["get"]["parameters"]["query"];
export type GetLangfuseDatasetItemsResponse = FixTypes<
  paths["/api/public/dataset-items"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetRunItemBody = FixTypes<
  paths["/api/public/dataset-run-items"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetRunItemResponse = FixTypes<
  paths["/api/public/dataset-run-items"]["post"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfuseDatasetBody =
  paths["/api/public/v2/datasets"]["post"]["requestBody"]["content"]["application/json"];
export type CreateLangfuseDatasetResponse = FixTypes<
  paths["/api/public/v2/datasets"]["post"]["responses"]["200"]["content"]["application/json"]
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
export type GetLangfuseDatasetRunsQuery =
  paths["/api/public/datasets/{datasetName}/runs"]["get"]["parameters"]["query"];
export type GetLangfuseDatasetRunsPath = paths["/api/public/datasets/{datasetName}/runs"]["get"]["parameters"]["path"];

export type GetLangfuseDatasetRunsResponse = FixTypes<
  paths["/api/public/datasets/{datasetName}/runs"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type CreateLangfusePromptBody = FixTypes<
  paths["/api/public/v2/prompts"]["post"]["requestBody"]["content"]["application/json"]
>;
export type UpdatePromptBody = FixTypes<
  paths["/api/public/v2/prompts/{promptName}/version/{version}"]["patch"]["requestBody"]["content"]["application/json"]
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

// Media
export type GetMediaUploadUrlRequest = FixTypes<components["schemas"]["GetMediaUploadUrlRequest"]>;
export type GetMediaUploadUrlResponse = FixTypes<components["schemas"]["GetMediaUploadUrlResponse"]>;
export type MediaContentType = components["schemas"]["MediaContentType"];
export type PatchMediaBody = FixTypes<components["schemas"]["PatchMediaBody"]>;
export type GetMediaResponse = FixTypes<components["schemas"]["GetMediaResponse"]>;

type CreateTextPromptRequest = FixTypes<components["schemas"]["CreateTextPromptRequest"]>;
type CreateChatPromptRequest = FixTypes<components["schemas"]["CreateChatPromptRequest"]>;
export type CreateTextPromptBody = { type?: "text" } & Omit<CreateTextPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility
export type CreateChatPromptBody = { type: "chat" } & Omit<CreateChatPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility

export type CreatePromptBody = CreateTextPromptBody | CreateChatPromptBody;

export type PromptInput = {
  prompt?: LangfusePromptRecord | LangfusePromptClient;
};

export type JsonType = string | number | boolean | null | { [key: string]: JsonType } | Array<JsonType>;

type OptionalTypes<T> = T extends null | undefined ? T : never;

type FixTypes<T> = T extends undefined
  ? undefined
  : Omit<
      {
        [P in keyof T]: P extends
          | "startTime"
          | "endTime"
          | "timestamp"
          | "completionStartTime"
          | "createdAt"
          | "updatedAt"
          | "fromTimestamp"
          | "toTimestamp"
          | "fromStartTime"
          | "toStartTime"
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

// Datasets
export type DatasetItemData = GetLangfuseDatasetItemsResponse["data"][number];
export type LinkDatasetItem = (
  obj: LangfuseObjectClient,
  runName: string,
  runArgs?: {
    description?: string;
    metadata?: any;
  }
) => Promise<{ id: string }>;
export type DatasetItem = DatasetItemData & { link: LinkDatasetItem };

export type MaskFunction = (params: { data: any }) => any;

export type LangfusePromptRecord = (TextPrompt | ChatPrompt) & { isFallback: boolean };
