import { type paths } from "./openapi/server";

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

export type LangfuseQueueItem = {
  apiRoute: keyof paths;
  method: "POST" | "PATCH";
  id: string;
  body: any;
  callback?: (err: any) => void;
};

export type LangfuseEventProperties = {
  [key: string]: any;
};

export type LangfuseMetadataProperties = {
  [key: string]: any;
};

// ASYNC
export type CreateLangfuseTraceBody = FixTypes<
  paths["/api/public/traces"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfuseEventBody = FixTypes<
  paths["/api/public/events"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfuseSpanBody = FixTypes<
  paths["/api/public/spans"]["post"]["requestBody"]["content"]["application/json"]
>;
export type CreateLangfuseGenerationBody = Omit<
  FixTypes<paths["/api/public/generations"]["post"]["requestBody"]["content"]["application/json"]>,
  "input" | "output"
>;
export type CreateLangfuseScoreBody = FixTypes<
  paths["/api/public/scores"]["post"]["requestBody"]["content"]["application/json"]
>;
export type UpdateLangfuseSpanBody = FixTypes<
  paths["/api/public/spans"]["patch"]["requestBody"]["content"]["application/json"]
>;
export type UpdateLangfuseGenerationBody = FixTypes<
  paths["/api/public/generations"]["patch"]["requestBody"]["content"]["application/json"]
>;

export type LangfuseObject =
  | "createTrace"
  | "createEvent"
  | "createSpan"
  | "createGeneration"
  | "createScore"
  | "updateSpan"
  | "updateGeneration";

export const LangfusePostApiRoutes: Record<LangfuseObject, [LangfuseQueueItem["method"], keyof paths]> = {
  createTrace: ["POST", "/api/public/traces"],
  createEvent: ["POST", "/api/public/events"],
  createSpan: ["POST", "/api/public/spans"],
  updateSpan: ["PATCH", "/api/public/spans"],
  createGeneration: ["POST", "/api/public/generations"],
  updateGeneration: ["PATCH", "/api/public/generations"],
  createScore: ["POST", "/api/public/scores"],
};

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

export type JsonType = string | number | boolean | null | { [key: string]: JsonType } | Array<JsonType>;

type OptionalTypes<T> = T extends null | undefined ? T : never;
type FixTypes<T> = Omit<
  {
    [P in keyof T]: P extends "startTime" | "endTime" | "timestamp" | "completionStartTime" | "createdAt" | "updatedAt"
      ? // Dates instead of strings
        Date | OptionalTypes<T[P]>
      : P extends "metadata" | "input" | "output" | "prompt" | "completion" | "expectedOutput"
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
