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

export type LangfuseQueueItem = SingleIngestionEvent & {
  callback?: (err: any) => void;
};

export type SingleIngestionEvent =
  paths["/api/public/ingestion"]["post"]["requestBody"]["content"]["application/json"]["batch"][number];

export type IngestionReturnType =
  paths["/api/public/ingestion"]["post"]["responses"][200]["content"]["application/json"];

export type LangfuseEventProperties = {
  [key: string]: any;
};

export type LangfuseMetadataProperties = {
  [key: string]: any;
};

// ASYNC
export type CreateLangfuseTraceBody = {
  id?: string | null;
  name?: string | null;
  userId?: string | null;
  release?: string | null;
  version?: string | null;
  metadata?: any; // Record<string, unknown> | null;
  /** @description Make trace publicly accessible via url */
  public?: boolean | null;
};
export type CreateLangfuseEventBody = {
  id?: string | null;
  traceId?: string | null;
  name?: string | null;
  /** Format: date-time */
  startTime?: Date | null;
  metadata?: any | null;
  input?: any | null;
  output?: any | null;
  level?: components["schemas"]["ObservationLevel"];
  statusMessage?: string | null;
  parentObservationId?: string | null;
  version?: string | null;
};
export type CreateLangfuseSpanBody = {
  /** Format: date-time */
  endTime?: Date | null;
} & CreateLangfuseEventBody;
export type CreateLangfuseGenerationBody = {
  /** Format: date-time */
  completionStartTime?: Date | null;
  model?: string | null;
  modelParameters?: {
    [key: string]: components["schemas"]["MapValue"] | undefined;
  } | null;
  prompt?: any | null;
  completion?: any | null;
  usage?: components["schemas"]["Usage"];
} & CreateLangfuseSpanBody;
export type CreateLangfuseScoreBody = {
  id?: string | null;
  traceId: string;
  name: string;
  /** Format: double */
  value: number;
  observationId?: string | null;
  comment?: string | null;
};
export type UpdateLangfuseSpanBody = {
  spanId: string;
  traceId?: string | null;
  /** Format: date-time */
  startTime?: Date | null;
  /** Format: date-time */
  endTime?: Date | null;
  name?: string | null;
  metadata?: any | null;
  input?: any | null;
  output?: any | null;
  level?: components["schemas"]["ObservationLevel"];
  version?: string | null;
  statusMessage?: string | null;
};
export type UpdateLangfuseGenerationBody = {
  generationId: string;
  traceId?: string | null;
  name?: string | null;
  /** Format: date-time */
  startTime?: Date | null;
  /** Format: date-time */
  endTime?: Date | null;
  /** Format: date-time */
  completionStartTime?: Date | null;
  model?: string | null;
  modelParameters?: {
    [key: string]: components["schemas"]["MapValue"] | undefined;
  } | null;
  prompt?: null;
  version?: string | null;
  metadata?: any | null;
  completion?: any | null;
  usage?: components["schemas"]["Usage"];
  level?: components["schemas"]["ObservationLevel"];
  statusMessage?: string | null;
};

export type LangfuseObject = SingleIngestionEvent["type"];

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
