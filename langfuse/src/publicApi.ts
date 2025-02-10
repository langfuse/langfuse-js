/* eslint-disable */
/* tslint:disable */
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

/** CreateCommentRequest */
export interface ApiCreateCommentRequest {
  /** The id of the project to attach the comment to. */
  projectId: string;
  /** The type of the object to attach the comment to (trace, observation, session, prompt). */
  objectType: string;
  /** The id of the object to attach the comment to. If this does not reference a valid existing object, an error will be thrown. */
  objectId: string;
  /** The content of the comment. May include markdown. Currently limited to 3000 characters. */
  content: string;
  /** The id of the user who created the comment. */
  authorUserId?: string | null;
}

/** CreateCommentResponse */
export interface ApiCreateCommentResponse {
  /** The id of the created object in Langfuse */
  id: string;
}

/** GetCommentsResponse */
export interface ApiGetCommentsResponse {
  data: ApiComment[];
  meta: ApiUtilsMetaResponse;
}

/** Trace */
export interface ApiTrace {
  /** The unique identifier of a trace */
  id: string;
  /**
   * The timestamp when the trace was created
   * @format date-time
   */
  timestamp: string;
  /** The name of the trace */
  name?: string | null;
  /** The input data of the trace. Can be any JSON. */
  input?: any;
  /** The output data of the trace. Can be any JSON. */
  output?: any;
  /** The session identifier associated with the trace */
  sessionId?: string | null;
  /** The release version of the application when the trace was created */
  release?: string | null;
  /** The version of the trace */
  version?: string | null;
  /** The user identifier associated with the trace */
  userId?: string | null;
  /** The metadata associated with the trace. Can be any JSON. */
  metadata?: any;
  /** The tags associated with the trace. Can be an array of strings or null. */
  tags?: string[] | null;
  /** Public traces are accessible via url without login */
  public?: boolean | null;
}

/** TraceWithDetails */
export type ApiTraceWithDetails = ApiTrace & {
  /** Path of trace in Langfuse UI */
  htmlPath: string;
  /**
   * Latency of trace in seconds
   * @format double
   */
  latency: number;
  /**
   * Cost of trace in USD
   * @format double
   */
  totalCost: number;
  /** List of observation ids */
  observations: string[];
  /** List of score ids */
  scores: string[];
};

/** TraceWithFullDetails */
export type ApiTraceWithFullDetails = ApiTrace & {
  /** Path of trace in Langfuse UI */
  htmlPath: string;
  /**
   * Latency of trace in seconds
   * @format double
   */
  latency: number;
  /**
   * Cost of trace in USD
   * @format double
   */
  totalCost: number;
  /** List of observations */
  observations: ApiObservationsView[];
  /** List of scores */
  scores: ApiScore[];
};

/** Session */
export interface ApiSession {
  id: string;
  /** @format date-time */
  createdAt: string;
  projectId: string;
}

/** SessionWithTraces */
export type ApiSessionWithTraces = ApiSession & {
  traces: ApiTrace[];
};

/** Observation */
export interface ApiObservation {
  /** The unique identifier of the observation */
  id: string;
  /** The trace ID associated with the observation */
  traceId?: string | null;
  /** The type of the observation */
  type: string;
  /** The name of the observation */
  name?: string | null;
  /**
   * The start time of the observation
   * @format date-time
   */
  startTime: string;
  /**
   * The end time of the observation.
   * @format date-time
   */
  endTime?: string | null;
  /**
   * The completion start time of the observation
   * @format date-time
   */
  completionStartTime?: string | null;
  /** The model used for the observation */
  model?: string | null;
  /** The parameters of the model used for the observation */
  modelParameters?: Record<string, ApiMapValue>;
  /** The input data of the observation */
  input?: any;
  /** The version of the observation */
  version?: string | null;
  /** Additional metadata of the observation */
  metadata?: any;
  /** The output data of the observation */
  output?: any;
  /** (Deprecated. Use usageDetails and costDetails instead.) The usage data of the observation */
  usage?: ApiUsage | null;
  /** The level of the observation */
  level: ApiObservationLevel;
  /** The status message of the observation */
  statusMessage?: string | null;
  /** The parent observation ID */
  parentObservationId?: string | null;
  /** The prompt ID associated with the observation */
  promptId?: string | null;
  /** The usage details of the observation. Key is the name of the usage metric, value is the number of units consumed. The total key is the sum of all (non-total) usage metrics or the total value ingested. */
  usageDetails?: Record<string, number>;
  /** The cost details of the observation. Key is the name of the cost metric, value is the cost in USD. The total key is the sum of all (non-total) cost metrics or the total value ingested. */
  costDetails?: Record<string, number>;
}

/** ObservationsView */
export type ApiObservationsView = ApiObservation & {
  /** The name of the prompt associated with the observation */
  promptName?: string | null;
  /** The version of the prompt associated with the observation */
  promptVersion?: number | null;
  /** The unique identifier of the model */
  modelId?: string | null;
  /**
   * The price of the input in USD
   * @format double
   */
  inputPrice?: number | null;
  /**
   * The price of the output in USD.
   * @format double
   */
  outputPrice?: number | null;
  /**
   * The total price in USD.
   * @format double
   */
  totalPrice?: number | null;
  /**
   * (Deprecated. Use usageDetails and costDetails instead.) The calculated cost of the input in USD
   * @format double
   */
  calculatedInputCost?: number | null;
  /**
   * (Deprecated. Use usageDetails and costDetails instead.) The calculated cost of the output in USD
   * @format double
   */
  calculatedOutputCost?: number | null;
  /**
   * (Deprecated. Use usageDetails and costDetails instead.) The calculated total cost in USD
   * @format double
   */
  calculatedTotalCost?: number | null;
  /**
   * The latency in seconds.
   * @format double
   */
  latency?: number | null;
  /**
   * The time to the first token in seconds
   * @format double
   */
  timeToFirstToken?: number | null;
};

/**
 * Usage
 * (Deprecated. Use usageDetails and costDetails instead.) Standard interface for usage and cost
 */
export interface ApiUsage {
  /** Number of input units (e.g. tokens) */
  input?: number | null;
  /** Number of output units (e.g. tokens) */
  output?: number | null;
  /** Defaults to input+output if not set */
  total?: number | null;
  /** Unit of usage in Langfuse */
  unit?: ApiModelUsageUnit | null;
  /**
   * USD input cost
   * @format double
   */
  inputCost?: number | null;
  /**
   * USD output cost
   * @format double
   */
  outputCost?: number | null;
  /**
   * USD total cost, defaults to input+output
   * @format double
   */
  totalCost?: number | null;
}

/**
 * ScoreConfig
 * Configuration for a score
 */
export interface ApiScoreConfig {
  id: string;
  name: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  projectId: string;
  dataType: ApiScoreDataType;
  /** Whether the score config is archived. Defaults to false */
  isArchived: boolean;
  /**
   * Sets minimum value for numerical scores. If not set, the minimum value defaults to -∞
   * @format double
   */
  minValue?: number | null;
  /**
   * Sets maximum value for numerical scores. If not set, the maximum value defaults to +∞
   * @format double
   */
  maxValue?: number | null;
  /** Configures custom categories for categorical scores */
  categories?: ApiConfigCategory[] | null;
  description?: string | null;
}

/** ConfigCategory */
export interface ApiConfigCategory {
  /** @format double */
  value: number;
  label: string;
}

/** BaseScore */
export interface ApiBaseScore {
  id: string;
  traceId: string;
  name: string;
  source: ApiScoreSource;
  observationId?: string | null;
  /** @format date-time */
  timestamp: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  authorUserId?: string | null;
  comment?: string | null;
  /** Reference a score config on a score. When set, config and score name must be equal and value must comply to optionally defined numerical range */
  configId?: string | null;
  /** Reference an annotation queue on a score. Populated if the score was initially created in an annotation queue. */
  queueId?: string | null;
}

/** NumericScore */
export type ApiNumericScore = ApiBaseScore & {
  /**
   * The numeric value of the score
   * @format double
   */
  value: number;
};

/** BooleanScore */
export type ApiBooleanScore = ApiBaseScore & {
  /**
   * The numeric value of the score. Equals 1 for "True" and 0 for "False"
   * @format double
   */
  value: number;
  /** The string representation of the score value. Is inferred from the numeric value and equals "True" or "False" */
  stringValue: string;
};

/** CategoricalScore */
export type ApiCategoricalScore = ApiBaseScore & {
  /**
   * Only defined if a config is linked. Represents the numeric category mapping of the stringValue
   * @format double
   */
  value?: number | null;
  /** The string representation of the score value. If no config is linked, can be any string. Otherwise, must map to a config category */
  stringValue: string;
};

/** Score */
export type ApiScore =
  | ({
      dataType: "NUMERIC";
    } & ApiNumericScore)
  | ({
      dataType: "CATEGORICAL";
    } & ApiCategoricalScore)
  | ({
      dataType: "BOOLEAN";
    } & ApiBooleanScore);

/**
 * CreateScoreValue
 * The value of the score. Must be passed as string for categorical scores, and numeric for boolean and numeric scores
 */
export type ApiCreateScoreValue = number | string;

/** Comment */
export interface ApiComment {
  id: string;
  projectId: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  objectType: ApiCommentObjectType;
  objectId: string;
  content: string;
  authorUserId?: string | null;
}

/** Dataset */
export interface ApiDataset {
  id: string;
  name: string;
  description?: string | null;
  metadata?: any;
  projectId: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

/** DatasetItem */
export interface ApiDatasetItem {
  id: string;
  status: ApiDatasetStatus;
  input?: any;
  expectedOutput?: any;
  metadata?: any;
  sourceTraceId?: string | null;
  sourceObservationId?: string | null;
  datasetId: string;
  datasetName: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

/** DatasetRunItem */
export interface ApiDatasetRunItem {
  id: string;
  datasetRunId: string;
  datasetRunName: string;
  datasetItemId: string;
  traceId: string;
  observationId?: string | null;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

/** DatasetRun */
export interface ApiDatasetRun {
  /** Unique identifier of the dataset run */
  id: string;
  /** Name of the dataset run */
  name: string;
  /** Description of the run */
  description?: string | null;
  /** Metadata of the dataset run */
  metadata?: any;
  /** Id of the associated dataset */
  datasetId: string;
  /** Name of the associated dataset */
  datasetName: string;
  /**
   * The date and time when the dataset run was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The date and time when the dataset run was last updated
   * @format date-time
   */
  updatedAt: string;
}

/** DatasetRunWithItems */
export type ApiDatasetRunWithItems = ApiDatasetRun & {
  datasetRunItems: ApiDatasetRunItem[];
};

/**
 * Model
 * Model definition used for transforming usage into USD cost and/or tokenization.
 */
export interface ApiModel {
  id: string;
  /** Name of the model definition. If multiple with the same name exist, they are applied in the following order: (1) custom over built-in, (2) newest according to startTime where model.startTime<observation.startTime */
  modelName: string;
  /** Regex pattern which matches this model definition to generation.model. Useful in case of fine-tuned models. If you want to exact match, use `(?i)^modelname$` */
  matchPattern: string;
  /**
   * Apply only to generations which are newer than this ISO date.
   * @format date-time
   */
  startDate?: string | null;
  /** Unit used by this model. */
  unit?: ApiModelUsageUnit | null;
  /**
   * Price (USD) per input unit
   * @format double
   */
  inputPrice?: number | null;
  /**
   * Price (USD) per output unit
   * @format double
   */
  outputPrice?: number | null;
  /**
   * Price (USD) per total unit. Cannot be set if input or output price is set.
   * @format double
   */
  totalPrice?: number | null;
  /** Optional. Tokenizer to be applied to observations which match to this model. See docs for more details. */
  tokenizerId?: string | null;
  /** Optional. Configuration for the selected tokenizer. Needs to be JSON. See docs for more details. */
  tokenizerConfig?: any;
  isLangfuseManaged: boolean;
}

/**
 * ModelUsageUnit
 * Unit of usage in Langfuse
 */
export type ApiModelUsageUnit = "CHARACTERS" | "TOKENS" | "MILLISECONDS" | "SECONDS" | "IMAGES" | "REQUESTS";

/** ObservationLevel */
export type ApiObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

/** MapValue */
export type ApiMapValue = string | null | number | null | boolean | null | string[] | null;

/** CommentObjectType */
export type ApiCommentObjectType = "TRACE" | "OBSERVATION" | "SESSION" | "PROMPT";

/** DatasetStatus */
export type ApiDatasetStatus = "ACTIVE" | "ARCHIVED";

/** ScoreSource */
export type ApiScoreSource = "ANNOTATION" | "API" | "EVAL";

/** ScoreDataType */
export type ApiScoreDataType = "NUMERIC" | "BOOLEAN" | "CATEGORICAL";

/** CreateDatasetItemRequest */
export interface ApiCreateDatasetItemRequest {
  datasetName: string;
  input?: any;
  expectedOutput?: any;
  metadata?: any;
  sourceTraceId?: string | null;
  sourceObservationId?: string | null;
  /** Dataset items are upserted on their id. Id needs to be unique (project-level) and cannot be reused across datasets. */
  id?: string | null;
  /** Defaults to ACTIVE for newly created items */
  status?: ApiDatasetStatus | null;
}

/** PaginatedDatasetItems */
export interface ApiPaginatedDatasetItems {
  data: ApiDatasetItem[];
  meta: ApiUtilsMetaResponse;
}

/** CreateDatasetRunItemRequest */
export interface ApiCreateDatasetRunItemRequest {
  runName: string;
  /** Description of the run. If run exists, description will be updated. */
  runDescription?: string | null;
  /** Metadata of the dataset run, updates run if run already exists */
  metadata?: any;
  datasetItemId: string;
  observationId?: string | null;
  /** traceId should always be provided. For compatibility with older SDK versions it can also be inferred from the provided observationId. */
  traceId?: string | null;
}

/** PaginatedDatasets */
export interface ApiPaginatedDatasets {
  data: ApiDataset[];
  meta: ApiUtilsMetaResponse;
}

/** CreateDatasetRequest */
export interface ApiCreateDatasetRequest {
  name: string;
  description?: string | null;
  metadata?: any;
}

/** PaginatedDatasetRuns */
export interface ApiPaginatedDatasetRuns {
  data: ApiDatasetRun[];
  meta: ApiUtilsMetaResponse;
}

/** HealthResponse */
export interface ApiHealthResponse {
  /**
   * Langfuse server version
   * @example "1.25.0"
   */
  version: string;
  /** @example "OK" */
  status: string;
}

/** IngestionEvent */
export type ApiIngestionEvent =
  | ({
      type: "trace-create";
    } & ApiTraceEvent)
  | ({
      type: "score-create";
    } & ApiScoreEvent)
  | ({
      type: "span-create";
    } & ApiCreateSpanEvent)
  | ({
      type: "span-update";
    } & ApiUpdateSpanEvent)
  | ({
      type: "generation-create";
    } & ApiCreateGenerationEvent)
  | ({
      type: "generation-update";
    } & ApiUpdateGenerationEvent)
  | ({
      type: "event-create";
    } & ApiCreateEventEvent)
  | ({
      type: "sdk-log";
    } & ApiSDKLogEvent)
  | ({
      type: "observation-create";
    } & ApiCreateObservationEvent)
  | ({
      type: "observation-update";
    } & ApiUpdateObservationEvent);

/** ObservationType */
export type ApiObservationType = "SPAN" | "GENERATION" | "EVENT";

/** IngestionUsage */
export type ApiIngestionUsage = ApiUsage | ApiOpenAIUsage;

/**
 * OpenAIUsage
 * Usage interface of OpenAI for improved compatibility.
 */
export interface ApiOpenAIUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}

/** OptionalObservationBody */
export interface ApiOptionalObservationBody {
  traceId?: string | null;
  name?: string | null;
  /** @format date-time */
  startTime?: string | null;
  metadata?: any;
  input?: any;
  output?: any;
  level?: ApiObservationLevel | null;
  statusMessage?: string | null;
  parentObservationId?: string | null;
  version?: string | null;
}

/** CreateEventBody */
export type ApiCreateEventBody = ApiOptionalObservationBody & {
  id?: string | null;
};

/** UpdateEventBody */
export type ApiUpdateEventBody = ApiOptionalObservationBody & {
  id: string;
};

/** CreateSpanBody */
export type ApiCreateSpanBody = ApiCreateEventBody & {
  /** @format date-time */
  endTime?: string | null;
};

/** UpdateSpanBody */
export type ApiUpdateSpanBody = ApiUpdateEventBody & {
  /** @format date-time */
  endTime?: string | null;
};

/** CreateGenerationBody */
export type ApiCreateGenerationBody = ApiCreateSpanBody & {
  /** @format date-time */
  completionStartTime?: string | null;
  model?: string | null;
  modelParameters?: Record<string, ApiMapValue>;
  usage?: ApiIngestionUsage | null;
  usageDetails?: ApiUsageDetails | null;
  costDetails?: Record<string, number>;
  promptName?: string | null;
  promptVersion?: number | null;
};

/** UpdateGenerationBody */
export type ApiUpdateGenerationBody = ApiUpdateSpanBody & {
  /** @format date-time */
  completionStartTime?: string | null;
  model?: string | null;
  modelParameters?: Record<string, ApiMapValue>;
  usage?: ApiIngestionUsage | null;
  promptName?: string | null;
  usageDetails?: ApiUsageDetails | null;
  costDetails?: Record<string, number>;
  promptVersion?: number | null;
};

/** ObservationBody */
export interface ApiObservationBody {
  id?: string | null;
  traceId?: string | null;
  type: ApiObservationType;
  name?: string | null;
  /** @format date-time */
  startTime?: string | null;
  /** @format date-time */
  endTime?: string | null;
  /** @format date-time */
  completionStartTime?: string | null;
  model?: string | null;
  modelParameters?: Record<string, ApiMapValue>;
  input?: any;
  version?: string | null;
  metadata?: any;
  output?: any;
  /** (Deprecated. Use usageDetails and costDetails instead.) Standard interface for usage and cost */
  usage?: ApiUsage | null;
  level?: ApiObservationLevel | null;
  statusMessage?: string | null;
  parentObservationId?: string | null;
}

/** TraceBody */
export interface ApiTraceBody {
  id?: string | null;
  /** @format date-time */
  timestamp?: string | null;
  name?: string | null;
  userId?: string | null;
  input?: any;
  output?: any;
  sessionId?: string | null;
  release?: string | null;
  version?: string | null;
  metadata?: any;
  tags?: string[] | null;
  /** Make trace publicly accessible via url */
  public?: boolean | null;
}

/** SDKLogBody */
export interface ApiSDKLogBody {
  log: any;
}

/** ScoreBody */
export interface ApiScoreBody {
  id?: string | null;
  /** @example "cdef-1234-5678-90ab" */
  traceId: string;
  /** @example "novelty" */
  name: string;
  /** The value of the score. Must be passed as string for categorical scores, and numeric for boolean and numeric scores. Boolean score values must equal either 1 or 0 (true or false) */
  value: ApiCreateScoreValue;
  observationId?: string | null;
  comment?: string | null;
  /** When set, must match the score value's type. If not set, will be inferred from the score value or config */
  dataType?: ApiScoreDataType | null;
  /** Reference a score config on a score. When set, the score name must equal the config name and scores must comply with the config's range and data type. For categorical scores, the value must map to a config category. Numeric scores might be constrained by the score config's max and min values */
  configId?: string | null;
}

/** BaseEvent */
export interface ApiBaseEvent {
  /** UUID v4 that identifies the event */
  id: string;
  /** Datetime (ISO 8601) of event creation in client. Should be as close to actual event creation in client as possible, this timestamp will be used for ordering of events in future release. Resolution: milliseconds (required), microseconds (optimal). */
  timestamp: string;
  /** Optional. Metadata field used by the Langfuse SDKs for debugging. */
  metadata?: any;
}

/** TraceEvent */
export type ApiTraceEvent = ApiBaseEvent & {
  body: ApiTraceBody;
};

/** CreateObservationEvent */
export type ApiCreateObservationEvent = ApiBaseEvent & {
  body: ApiObservationBody;
};

/** UpdateObservationEvent */
export type ApiUpdateObservationEvent = ApiBaseEvent & {
  body: ApiObservationBody;
};

/** ScoreEvent */
export type ApiScoreEvent = ApiBaseEvent & {
  body: ApiScoreBody;
};

/** SDKLogEvent */
export type ApiSDKLogEvent = ApiBaseEvent & {
  body: ApiSDKLogBody;
};

/** CreateGenerationEvent */
export type ApiCreateGenerationEvent = ApiBaseEvent & {
  body: ApiCreateGenerationBody;
};

/** UpdateGenerationEvent */
export type ApiUpdateGenerationEvent = ApiBaseEvent & {
  body: ApiUpdateGenerationBody;
};

/** CreateSpanEvent */
export type ApiCreateSpanEvent = ApiBaseEvent & {
  body: ApiCreateSpanBody;
};

/** UpdateSpanEvent */
export type ApiUpdateSpanEvent = ApiBaseEvent & {
  body: ApiUpdateSpanBody;
};

/** CreateEventEvent */
export type ApiCreateEventEvent = ApiBaseEvent & {
  body: ApiCreateEventBody;
};

/** IngestionSuccess */
export interface ApiIngestionSuccess {
  id: string;
  status: number;
}

/** IngestionError */
export interface ApiIngestionError {
  id: string;
  status: number;
  message?: string | null;
  error?: any;
}

/** IngestionResponse */
export interface ApiIngestionResponse {
  successes: ApiIngestionSuccess[];
  errors: ApiIngestionError[];
}

/** OpenAIUsageSchema */
export interface ApiOpenAIUsageSchema {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: Record<string, number>;
  completion_tokens_details?: Record<string, number>;
}

/** UsageDetails */
export type ApiUsageDetails = Record<string, number> | ApiOpenAIUsageSchema;

/** GetMediaResponse */
export interface ApiGetMediaResponse {
  /** The unique langfuse identifier of a media record */
  mediaId: string;
  /** The MIME type of the media record */
  contentType: string;
  /** The size of the media record in bytes */
  contentLength: number;
  /**
   * The date and time when the media record was uploaded
   * @format date-time
   */
  uploadedAt: string;
  /** The download URL of the media record */
  url: string;
  /** The expiry date and time of the media record download URL */
  urlExpiry: string;
}

/** PatchMediaBody */
export interface ApiPatchMediaBody {
  /**
   * The date and time when the media record was uploaded
   * @format date-time
   */
  uploadedAt: string;
  /** The HTTP status code of the upload */
  uploadHttpStatus: number;
  /** The HTTP error message of the upload */
  uploadHttpError?: string | null;
  /** The time in milliseconds it took to upload the media record */
  uploadTimeMs?: number | null;
}

/** GetMediaUploadUrlRequest */
export interface ApiGetMediaUploadUrlRequest {
  /** The trace ID associated with the media record */
  traceId: string;
  /** The observation ID associated with the media record. If the media record is associated directly with a trace, this will be null. */
  observationId?: string | null;
  /** The MIME type of the media record */
  contentType: ApiMediaContentType;
  /** The size of the media record in bytes */
  contentLength: number;
  /** The SHA-256 hash of the media record */
  sha256Hash: string;
  /** The trace / observation field the media record is associated with. This can be one of `input`, `output`, `metadata` */
  field: string;
}

/** GetMediaUploadUrlResponse */
export interface ApiGetMediaUploadUrlResponse {
  /** The presigned upload URL. If the asset is already uploaded, this will be null */
  uploadUrl?: string | null;
  /** The unique langfuse identifier of a media record */
  mediaId: string;
}

/**
 * MediaContentType
 * The MIME type of the media record
 */
export type ApiMediaContentType =
  | "image/png"
  | "image/jpeg"
  | "image/jpg"
  | "image/webp"
  | "image/gif"
  | "image/svg+xml"
  | "image/tiff"
  | "image/bmp"
  | "audio/mpeg"
  | "audio/mp3"
  | "audio/wav"
  | "audio/ogg"
  | "audio/oga"
  | "audio/aac"
  | "audio/mp4"
  | "audio/flac"
  | "video/mp4"
  | "video/webm"
  | "text/plain"
  | "text/html"
  | "text/css"
  | "text/csv"
  | "application/pdf"
  | "application/msword"
  | "application/vnd.ms-excel"
  | "application/zip"
  | "application/json"
  | "application/xml"
  | "application/octet-stream";

/** DailyMetrics */
export interface ApiDailyMetrics {
  /** A list of daily metrics, only days with ingested data are included. */
  data: ApiDailyMetricsDetails[];
  meta: ApiUtilsMetaResponse;
}

/** DailyMetricsDetails */
export interface ApiDailyMetricsDetails {
  /** @format date */
  date: string;
  countTraces: number;
  countObservations: number;
  /**
   * Total model cost in USD
   * @format double
   */
  totalCost: number;
  usage: ApiUsageByModel[];
}

/**
 * UsageByModel
 * Daily usage of a given model. Usage corresponds to the unit set for the specific model (e.g. tokens).
 */
export interface ApiUsageByModel {
  model?: string | null;
  /** Total number of generation input units (e.g. tokens) */
  inputUsage: number;
  /** Total number of generation output units (e.g. tokens) */
  outputUsage: number;
  /** Total number of generation total units (e.g. tokens) */
  totalUsage: number;
  countTraces: number;
  countObservations: number;
  /**
   * Total model cost in USD
   * @format double
   */
  totalCost: number;
}

/** PaginatedModels */
export interface ApiPaginatedModels {
  data: ApiModel[];
  meta: ApiUtilsMetaResponse;
}

/** CreateModelRequest */
export interface ApiCreateModelRequest {
  /** Name of the model definition. If multiple with the same name exist, they are applied in the following order: (1) custom over built-in, (2) newest according to startTime where model.startTime<observation.startTime */
  modelName: string;
  /** Regex pattern which matches this model definition to generation.model. Useful in case of fine-tuned models. If you want to exact match, use `(?i)^modelname$` */
  matchPattern: string;
  /**
   * Apply only to generations which are newer than this ISO date.
   * @format date-time
   */
  startDate?: string | null;
  /** Unit used by this model. */
  unit?: ApiModelUsageUnit | null;
  /**
   * Price (USD) per input unit
   * @format double
   */
  inputPrice?: number | null;
  /**
   * Price (USD) per output unit
   * @format double
   */
  outputPrice?: number | null;
  /**
   * Price (USD) per total units. Cannot be set if input or output price is set.
   * @format double
   */
  totalPrice?: number | null;
  /** Optional. Tokenizer to be applied to observations which match to this model. See docs for more details. */
  tokenizerId?: string | null;
  /** Optional. Configuration for the selected tokenizer. Needs to be JSON. See docs for more details. */
  tokenizerConfig?: any;
}

/** Observations */
export interface ApiObservations {
  data: ApiObservation[];
  meta: ApiUtilsMetaResponse;
}

/** ObservationsViews */
export interface ApiObservationsViews {
  data: ApiObservationsView[];
  meta: ApiUtilsMetaResponse;
}

/** Projects */
export interface ApiProjects {
  data: ApiProject[];
}

/** Project */
export interface ApiProject {
  id: string;
  name: string;
}

/** PromptMetaListResponse */
export interface ApiPromptMetaListResponse {
  data: ApiPromptMeta[];
  meta: ApiUtilsMetaResponse;
}

/** PromptMeta */
export interface ApiPromptMeta {
  name: string;
  versions: number[];
  labels: string[];
  tags: string[];
  /** @format date-time */
  lastUpdatedAt: string;
  /** Config object of the most recent prompt version that matches the filters (if any are provided) */
  lastConfig: any;
}

/** CreatePromptRequest */
export type ApiCreatePromptRequest =
  | ({
      type: "chat";
    } & ApiCreateChatPromptRequest)
  | ({
      type: "text";
    } & ApiCreateTextPromptRequest);

/** CreateChatPromptRequest */
export interface ApiCreateChatPromptRequest {
  name: string;
  prompt: ApiChatMessage[];
  config?: any;
  /** List of deployment labels of this prompt version. */
  labels?: string[] | null;
  /** List of tags to apply to all versions of this prompt. */
  tags?: string[] | null;
  /** Commit message for this prompt version. */
  commitMessage?: string | null;
}

/** CreateTextPromptRequest */
export interface ApiCreateTextPromptRequest {
  name: string;
  prompt: string;
  config?: any;
  /** List of deployment labels of this prompt version. */
  labels?: string[] | null;
  /** List of tags to apply to all versions of this prompt. */
  tags?: string[] | null;
  /** Commit message for this prompt version. */
  commitMessage?: string | null;
}

/** Prompt */
export type ApiPrompt =
  | ({
      type: "chat";
    } & ApiChatPrompt)
  | ({
      type: "text";
    } & ApiTextPrompt);

/** BasePrompt */
export interface ApiBasePrompt {
  name: string;
  version: number;
  config: any;
  /** List of deployment labels of this prompt version. */
  labels: string[];
  /** List of tags. Used to filter via UI and API. The same across versions of a prompt. */
  tags: string[];
  /** Commit message for this prompt version. */
  commitMessage?: string | null;
}

/** ChatMessage */
export interface ApiChatMessage {
  role: string;
  content: string;
}

/** TextPrompt */
export type ApiTextPrompt = ApiBasePrompt & {
  prompt: string;
};

/** ChatPrompt */
export type ApiChatPrompt = ApiBasePrompt & {
  prompt: ApiChatMessage[];
};

/** ScoreConfigs */
export interface ApiScoreConfigs {
  data: ApiScoreConfig[];
  meta: ApiUtilsMetaResponse;
}

/** CreateScoreConfigRequest */
export interface ApiCreateScoreConfigRequest {
  name: string;
  dataType: ApiScoreDataType;
  /** Configure custom categories for categorical scores. Pass a list of objects with `label` and `value` properties. Categories are autogenerated for boolean configs and cannot be passed */
  categories?: ApiConfigCategory[] | null;
  /**
   * Configure a minimum value for numerical scores. If not set, the minimum value defaults to -∞
   * @format double
   */
  minValue?: number | null;
  /**
   * Configure a maximum value for numerical scores. If not set, the maximum value defaults to +∞
   * @format double
   */
  maxValue?: number | null;
  /** Description is shown across the Langfuse UI and can be used to e.g. explain the config categories in detail, why a numeric range was set, or provide additional context on config name or usage */
  description?: string | null;
}

/** CreateScoreRequest */
export interface ApiCreateScoreRequest {
  id?: string | null;
  /** @example "cdef-1234-5678-90ab" */
  traceId: string;
  /** @example "novelty" */
  name: string;
  /** The value of the score. Must be passed as string for categorical scores, and numeric for boolean and numeric scores. Boolean score values must equal either 1 or 0 (true or false) */
  value: ApiCreateScoreValue;
  observationId?: string | null;
  comment?: string | null;
  /** The data type of the score. When passing a configId this field is inferred. Otherwise, this field must be passed or will default to numeric. */
  dataType?: ApiScoreDataType | null;
  /** Reference a score config on a score. The unique langfuse identifier of a score config. When passing this field, the dataType and stringValue fields are automatically populated. */
  configId?: string | null;
}

/** CreateScoreResponse */
export interface ApiCreateScoreResponse {
  /** The id of the created object in Langfuse */
  id: string;
}

/** GetScoresResponseTraceData */
export interface ApiGetScoresResponseTraceData {
  /** The user ID associated with the trace referenced by score */
  userId?: string | null;
  /** A list of tags associated with the trace referenced by score */
  tags?: string[] | null;
}

/** GetScoresResponseDataNumeric */
export type ApiGetScoresResponseDataNumeric = ApiNumericScore & {
  trace: ApiGetScoresResponseTraceData;
};

/** GetScoresResponseDataCategorical */
export type ApiGetScoresResponseDataCategorical = ApiCategoricalScore & {
  trace: ApiGetScoresResponseTraceData;
};

/** GetScoresResponseDataBoolean */
export type ApiGetScoresResponseDataBoolean = ApiBooleanScore & {
  trace: ApiGetScoresResponseTraceData;
};

/** GetScoresResponseData */
export type ApiGetScoresResponseData =
  | ({
      dataType: "NUMERIC";
    } & ApiGetScoresResponseDataNumeric)
  | ({
      dataType: "CATEGORICAL";
    } & ApiGetScoresResponseDataCategorical)
  | ({
      dataType: "BOOLEAN";
    } & ApiGetScoresResponseDataBoolean);

/** GetScoresResponse */
export interface ApiGetScoresResponse {
  data: ApiGetScoresResponseData[];
  meta: ApiUtilsMetaResponse;
}

/** PaginatedSessions */
export interface ApiPaginatedSessions {
  data: ApiSession[];
  meta: ApiUtilsMetaResponse;
}

/** Traces */
export interface ApiTraces {
  data: ApiTraceWithDetails[];
  meta: ApiUtilsMetaResponse;
}

/** Sort */
export interface ApiSort {
  id: string;
}

/** utilsMetaResponse */
export interface ApiUtilsMetaResponse {
  /** current page number */
  page: number;
  /** number of items per page */
  limit: number;
  /** number of total items given the current filters/selection (if any) */
  totalItems: number;
  /** number of total pages given the current limit */
  totalPages: number;
}

export interface ApiCommentsGetParams {
  /** Page number, starts at 1. */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit */
  limit?: number | null;
  /** Filter comments by object type (trace, observation, session, prompt). */
  objectType?: string | null;
  /** Filter comments by object id. If objectType is not provided, an error will be thrown. */
  objectId?: string | null;
  /** Filter comments by author user id. */
  authorUserId?: string | null;
}

export interface ApiDatasetItemsListParams {
  datasetName?: string | null;
  sourceTraceId?: string | null;
  sourceObservationId?: string | null;
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
}

export interface ApiDatasetsListParams {
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
}

export interface ApiDatasetsGetRunsParams {
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
  datasetName: string;
}

export interface ApiIngestionBatchPayload {
  /** Batch of tracing events to be ingested. Discriminated by attribute `type`. */
  batch: ApiIngestionEvent[];
  /** Optional. Metadata field used by the Langfuse SDKs for debugging. */
  metadata?: any;
}

export interface ApiMetricsDailyParams {
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
  /** Optional filter by the name of the trace */
  traceName?: string | null;
  /** Optional filter by the userId associated with the trace */
  userId?: string | null;
  /** Optional filter for metrics where traces include all of these tags */
  tags?: (string | null)[];
  /**
   * Optional filter to only include traces and observations on or after a certain datetime (ISO 8601)
   * @format date-time
   */
  fromTimestamp?: string | null;
  /**
   * Optional filter to only include traces and observations before a certain datetime (ISO 8601)
   * @format date-time
   */
  toTimestamp?: string | null;
}

export interface ApiModelsListParams {
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
}

export interface ApiObservationsGetManyParams {
  /** Page number, starts at 1. */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit. */
  limit?: number | null;
  name?: string | null;
  userId?: string | null;
  type?: string | null;
  traceId?: string | null;
  parentObservationId?: string | null;
  /**
   * Retrieve only observations with a start_time or or after this datetime (ISO 8601).
   * @format date-time
   */
  fromStartTime?: string | null;
  /**
   * Retrieve only observations with a start_time before this datetime (ISO 8601).
   * @format date-time
   */
  toStartTime?: string | null;
  /** Optional filter to only include observations with a certain version. */
  version?: string | null;
}

export interface ApiPromptVersionUpdatePayload {
  /** New labels for the prompt version. Labels are unique across versions. The "latest" label is reserved and managed by Langfuse. */
  newLabels: string[];
}

export interface ApiPromptsGetParams {
  /** Version of the prompt to be retrieved. */
  version?: number | null;
  /** Label of the prompt to be retrieved. Defaults to "production" if no label or version is set. */
  label?: string | null;
  /** The name of the prompt */
  promptName: string;
}

export interface ApiPromptsListParams {
  name?: string | null;
  label?: string | null;
  tag?: string | null;
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
  /**
   * Optional filter to only include prompt versions created/updated on or after a certain datetime (ISO 8601)
   * @format date-time
   */
  fromUpdatedAt?: string | null;
  /**
   * Optional filter to only include prompt versions created/updated before a certain datetime (ISO 8601)
   * @format date-time
   */
  toUpdatedAt?: string | null;
}

export interface ApiScoreConfigsGetParams {
  /** Page number, starts at 1. */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit */
  limit?: number | null;
}

export interface ApiScoreGetParams {
  /** Page number, starts at 1. */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit. */
  limit?: number | null;
  /** Retrieve only scores with this userId associated to the trace. */
  userId?: string | null;
  /** Retrieve only scores with this name. */
  name?: string | null;
  /**
   * Optional filter to only include scores created on or after a certain datetime (ISO 8601)
   * @format date-time
   */
  fromTimestamp?: string | null;
  /**
   * Optional filter to only include scores created before a certain datetime (ISO 8601)
   * @format date-time
   */
  toTimestamp?: string | null;
  /** Retrieve only scores from a specific source. */
  source?: ApiScoreSource | null;
  /** Retrieve only scores with <operator> value. */
  operator?: string | null;
  /**
   * Retrieve only scores with <operator> value.
   * @format double
   */
  value?: number | null;
  /** Comma-separated list of score IDs to limit the results to. */
  scoreIds?: string | null;
  /** Retrieve only scores with a specific configId. */
  configId?: string | null;
  /** Retrieve only scores with a specific annotation queueId. */
  queueId?: string | null;
  /** Retrieve only scores with a specific dataType. */
  dataType?: ApiScoreDataType | null;
  /** Only scores linked to traces that include all of these tags will be returned. */
  traceTags?: (string | null)[];
}

export interface ApiSessionsListParams {
  /** Page number, starts at 1 */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit. */
  limit?: number | null;
  /**
   * Optional filter to only include sessions created on or after a certain datetime (ISO 8601)
   * @format date-time
   */
  fromTimestamp?: string | null;
  /**
   * Optional filter to only include sessions created before a certain datetime (ISO 8601)
   * @format date-time
   */
  toTimestamp?: string | null;
}

export interface ApiTraceListParams {
  /** Page number, starts at 1 */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit. */
  limit?: number | null;
  userId?: string | null;
  name?: string | null;
  sessionId?: string | null;
  /**
   * Optional filter to only include traces with a trace.timestamp on or after a certain datetime (ISO 8601)
   * @format date-time
   */
  fromTimestamp?: string | null;
  /**
   * Optional filter to only include traces with a trace.timestamp before a certain datetime (ISO 8601)
   * @format date-time
   */
  toTimestamp?: string | null;
  /** Format of the string [field].[asc/desc]. Fields: id, timestamp, name, userId, release, version, public, bookmarked, sessionId. Example: timestamp.asc */
  orderBy?: string | null;
  /** Only traces that include all of these tags will be returned. */
  tags?: (string | null)[];
  /** Optional filter to only include traces with a certain version. */
  version?: string | null;
  /** Optional filter to only include traces with a certain release. */
  release?: string | null;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<FullRequestParams, "body" | "method" | "query" | "path">;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (securityData: SecurityDataType | null) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown> extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) => fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter((key) => "undefined" !== typeof query[key]);
    return keys
      .map((key) => (Array.isArray(query[key]) ? this.addArrayQueryParam(query, key) : this.addQueryParam(query, key)))
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string") ? JSON.stringify(input) : input,
    [ContentType.Text]: (input: any) => (input !== null && typeof input !== "string" ? JSON.stringify(input) : input),
    [ContentType.FormData]: (input: any) =>
      Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`
        );
        return formData;
      }, new FormData()),
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(params1: RequestParams, params2?: RequestParams): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (cancelToken: CancelToken): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<T> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(`${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`, {
      ...requestParams,
      headers: {
        ...(requestParams.headers || {}),
        ...(type && type !== ContentType.FormData ? { "Content-Type": type } : {}),
      },
      signal: (cancelToken ? this.createAbortSignal(cancelToken) : requestParams.signal) || null,
      body: typeof body === "undefined" || body === null ? null : payloadFormatter(body),
    }).then(async (response) => {
      const r = response.clone() as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const data = !responseFormat
        ? r
        : await response[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data.data;
    });
  };
}

/**
 * @title langfuse
 *
 * ## Authentication
 *
 * Authenticate with the API using [Basic Auth](https://en.wikipedia.org/wiki/Basic_access_authentication), get API keys in the project settings:
 *
 * - username: Langfuse Public Key
 * - password: Langfuse Secret Key
 *
 * ## Exports
 *
 * - OpenAPI spec: https://cloud.langfuse.com/generated/api/openapi.yml
 * - Postman collection: https://cloud.langfuse.com/generated/postman/collection.json
 */
export class LangfusePublicApi<SecurityDataType extends unknown> extends HttpClient<SecurityDataType> {
  api = {
    /**
     * @description Create a comment. Comments may be attached to different object types (trace, observation, session, prompt).
     *
     * @tags Comments
     * @name CommentsCreate
     * @request POST:/api/public/comments
     * @secure
     */
    commentsCreate: (data: ApiCreateCommentRequest, params: RequestParams = {}) =>
      this.request<ApiCreateCommentResponse, any>({
        path: `/api/public/comments`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all comments
     *
     * @tags Comments
     * @name CommentsGet
     * @request GET:/api/public/comments
     * @secure
     */
    commentsGet: (query: ApiCommentsGetParams, params: RequestParams = {}) =>
      this.request<ApiGetCommentsResponse, any>({
        path: `/api/public/comments`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a comment by id
     *
     * @tags Comments
     * @name CommentsGetById
     * @request GET:/api/public/comments/{commentId}
     * @secure
     */
    commentsGetById: (commentId: string, params: RequestParams = {}) =>
      this.request<ApiComment, any>({
        path: `/api/public/comments/${commentId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a dataset item
     *
     * @tags DatasetItems
     * @name DatasetItemsCreate
     * @request POST:/api/public/dataset-items
     * @secure
     */
    datasetItemsCreate: (data: ApiCreateDatasetItemRequest, params: RequestParams = {}) =>
      this.request<ApiDatasetItem, any>({
        path: `/api/public/dataset-items`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a dataset item
     *
     * @tags DatasetItems
     * @name DatasetItemsGet
     * @request GET:/api/public/dataset-items/{id}
     * @secure
     */
    datasetItemsGet: (id: string, params: RequestParams = {}) =>
      this.request<ApiDatasetItem, any>({
        path: `/api/public/dataset-items/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get dataset items
     *
     * @tags DatasetItems
     * @name DatasetItemsList
     * @request GET:/api/public/dataset-items
     * @secure
     */
    datasetItemsList: (query: ApiDatasetItemsListParams, params: RequestParams = {}) =>
      this.request<ApiPaginatedDatasetItems, any>({
        path: `/api/public/dataset-items`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a dataset run item
     *
     * @tags DatasetRunItems
     * @name DatasetRunItemsCreate
     * @request POST:/api/public/dataset-run-items
     * @secure
     */
    datasetRunItemsCreate: (data: ApiCreateDatasetRunItemRequest, params: RequestParams = {}) =>
      this.request<ApiDatasetRunItem, any>({
        path: `/api/public/dataset-run-items`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a dataset
     *
     * @tags Datasets
     * @name DatasetsCreate
     * @request POST:/api/public/v2/datasets
     * @secure
     */
    datasetsCreate: (data: ApiCreateDatasetRequest, params: RequestParams = {}) =>
      this.request<ApiDataset, any>({
        path: `/api/public/v2/datasets`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a dataset
     *
     * @tags Datasets
     * @name DatasetsGet
     * @request GET:/api/public/v2/datasets/{datasetName}
     * @secure
     */
    datasetsGet: (datasetName: string, params: RequestParams = {}) =>
      this.request<ApiDataset, any>({
        path: `/api/public/v2/datasets/${datasetName}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a dataset run and its items
     *
     * @tags Datasets
     * @name DatasetsGetRun
     * @request GET:/api/public/datasets/{datasetName}/runs/{runName}
     * @secure
     */
    datasetsGetRun: (datasetName: string, runName: string, params: RequestParams = {}) =>
      this.request<ApiDatasetRunWithItems, any>({
        path: `/api/public/datasets/${datasetName}/runs/${runName}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get dataset runs
     *
     * @tags Datasets
     * @name DatasetsGetRuns
     * @request GET:/api/public/datasets/{datasetName}/runs
     * @secure
     */
    datasetsGetRuns: ({ datasetName, ...query }: ApiDatasetsGetRunsParams, params: RequestParams = {}) =>
      this.request<ApiPaginatedDatasetRuns, any>({
        path: `/api/public/datasets/${datasetName}/runs`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all datasets
     *
     * @tags Datasets
     * @name DatasetsList
     * @request GET:/api/public/v2/datasets
     * @secure
     */
    datasetsList: (query: ApiDatasetsListParams, params: RequestParams = {}) =>
      this.request<ApiPaginatedDatasets, any>({
        path: `/api/public/v2/datasets`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Check health of API and database
     *
     * @tags Health
     * @name HealthHealth
     * @request GET:/api/public/health
     */
    healthHealth: (params: RequestParams = {}) =>
      this.request<ApiHealthResponse, void>({
        path: `/api/public/health`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * @description Batched ingestion for Langfuse Tracing. If you want to use tracing via the API, such as to build your own Langfuse client implementation, this is the only API route you need to implement. Notes: - Introduction to data model: https://langfuse.com/docs/tracing-data-model - Batch sizes are limited to 3.5 MB in total. You need to adjust the number of events per batch accordingly. - The API does not return a 4xx status code for input errors. Instead, it responds with a 207 status code, which includes a list of the encountered errors.
     *
     * @tags Ingestion
     * @name IngestionBatch
     * @request POST:/api/public/ingestion
     * @secure
     */
    ingestionBatch: (data: ApiIngestionBatchPayload, params: RequestParams = {}) =>
      this.request<ApiIngestionResponse, any>({
        path: `/api/public/ingestion`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a media record
     *
     * @tags Media
     * @name MediaGet
     * @request GET:/api/public/media/{mediaId}
     * @secure
     */
    mediaGet: (mediaId: string, params: RequestParams = {}) =>
      this.request<ApiGetMediaResponse, any>({
        path: `/api/public/media/${mediaId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a presigned upload URL for a media record
     *
     * @tags Media
     * @name MediaGetUploadUrl
     * @request POST:/api/public/media
     * @secure
     */
    mediaGetUploadUrl: (data: ApiGetMediaUploadUrlRequest, params: RequestParams = {}) =>
      this.request<ApiGetMediaUploadUrlResponse, any>({
        path: `/api/public/media`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Patch a media record
     *
     * @tags Media
     * @name MediaPatch
     * @request PATCH:/api/public/media/{mediaId}
     * @secure
     */
    mediaPatch: (mediaId: string, data: ApiPatchMediaBody, params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/api/public/media/${mediaId}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * @description Get daily metrics of the Langfuse project
     *
     * @tags Metrics
     * @name MetricsDaily
     * @request GET:/api/public/metrics/daily
     * @secure
     */
    metricsDaily: (query: ApiMetricsDailyParams, params: RequestParams = {}) =>
      this.request<ApiDailyMetrics, any>({
        path: `/api/public/metrics/daily`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a model
     *
     * @tags Models
     * @name ModelsCreate
     * @request POST:/api/public/models
     * @secure
     */
    modelsCreate: (data: ApiCreateModelRequest, params: RequestParams = {}) =>
      this.request<ApiModel, any>({
        path: `/api/public/models`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete a model. Cannot delete models managed by Langfuse. You can create your own definition with the same modelName to override the definition though.
     *
     * @tags Models
     * @name ModelsDelete
     * @request DELETE:/api/public/models/{id}
     * @secure
     */
    modelsDelete: (id: string, params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/api/public/models/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * @description Get a model
     *
     * @tags Models
     * @name ModelsGet
     * @request GET:/api/public/models/{id}
     * @secure
     */
    modelsGet: (id: string, params: RequestParams = {}) =>
      this.request<ApiModel, any>({
        path: `/api/public/models/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all models
     *
     * @tags Models
     * @name ModelsList
     * @request GET:/api/public/models
     * @secure
     */
    modelsList: (query: ApiModelsListParams, params: RequestParams = {}) =>
      this.request<ApiPaginatedModels, any>({
        path: `/api/public/models`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a observation
     *
     * @tags Observations
     * @name ObservationsGet
     * @request GET:/api/public/observations/{observationId}
     * @secure
     */
    observationsGet: (observationId: string, params: RequestParams = {}) =>
      this.request<ApiObservationsView, any>({
        path: `/api/public/observations/${observationId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a list of observations
     *
     * @tags Observations
     * @name ObservationsGetMany
     * @request GET:/api/public/observations
     * @secure
     */
    observationsGetMany: (query: ApiObservationsGetManyParams, params: RequestParams = {}) =>
      this.request<ApiObservationsViews, any>({
        path: `/api/public/observations`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get Project associated with API key
     *
     * @tags Projects
     * @name ProjectsGet
     * @request GET:/api/public/projects
     * @secure
     */
    projectsGet: (params: RequestParams = {}) =>
      this.request<ApiProjects, any>({
        path: `/api/public/projects`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a new version for the prompt with the given `name`
     *
     * @tags Prompts
     * @name PromptsCreate
     * @request POST:/api/public/v2/prompts
     * @secure
     */
    promptsCreate: (data: ApiCreatePromptRequest, params: RequestParams = {}) =>
      this.request<ApiPrompt, any>({
        path: `/api/public/v2/prompts`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a prompt
     *
     * @tags Prompts
     * @name PromptsGet
     * @request GET:/api/public/v2/prompts/{promptName}
     * @secure
     */
    promptsGet: ({ promptName, ...query }: ApiPromptsGetParams, params: RequestParams = {}) =>
      this.request<ApiPrompt, any>({
        path: `/api/public/v2/prompts/${promptName}`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a list of prompt names with versions and labels
     *
     * @tags Prompts
     * @name PromptsList
     * @request GET:/api/public/v2/prompts
     * @secure
     */
    promptsList: (query: ApiPromptsListParams, params: RequestParams = {}) =>
      this.request<ApiPromptMetaListResponse, any>({
        path: `/api/public/v2/prompts`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update labels for a specific prompt version
     *
     * @tags PromptVersion
     * @name PromptVersionUpdate
     * @request PATCH:/api/public/v2/prompts/{name}/versions/{version}
     * @secure
     */
    promptVersionUpdate: (
      name: string,
      version: number,
      data: ApiPromptVersionUpdatePayload,
      params: RequestParams = {}
    ) =>
      this.request<ApiPrompt, any>({
        path: `/api/public/v2/prompts/${name}/versions/${version}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a score configuration (config). Score configs are used to define the structure of scores
     *
     * @tags ScoreConfigs
     * @name ScoreConfigsCreate
     * @request POST:/api/public/score-configs
     * @secure
     */
    scoreConfigsCreate: (data: ApiCreateScoreConfigRequest, params: RequestParams = {}) =>
      this.request<ApiScoreConfig, any>({
        path: `/api/public/score-configs`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all score configs
     *
     * @tags ScoreConfigs
     * @name ScoreConfigsGet
     * @request GET:/api/public/score-configs
     * @secure
     */
    scoreConfigsGet: (query: ApiScoreConfigsGetParams, params: RequestParams = {}) =>
      this.request<ApiScoreConfigs, any>({
        path: `/api/public/score-configs`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a score config
     *
     * @tags ScoreConfigs
     * @name ScoreConfigsGetById
     * @request GET:/api/public/score-configs/{configId}
     * @secure
     */
    scoreConfigsGetById: (configId: string, params: RequestParams = {}) =>
      this.request<ApiScoreConfig, any>({
        path: `/api/public/score-configs/${configId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a score
     *
     * @tags Score
     * @name ScoreCreate
     * @request POST:/api/public/scores
     * @secure
     */
    scoreCreate: (data: ApiCreateScoreRequest, params: RequestParams = {}) =>
      this.request<ApiCreateScoreResponse, any>({
        path: `/api/public/scores`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete a score
     *
     * @tags Score
     * @name ScoreDelete
     * @request DELETE:/api/public/scores/{scoreId}
     * @secure
     */
    scoreDelete: (scoreId: string, params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/api/public/scores/${scoreId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * @description Get a list of scores
     *
     * @tags Score
     * @name ScoreGet
     * @request GET:/api/public/scores
     * @secure
     */
    scoreGet: (query: ApiScoreGetParams, params: RequestParams = {}) =>
      this.request<ApiGetScoresResponse, any>({
        path: `/api/public/scores`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a score
     *
     * @tags Score
     * @name ScoreGetById
     * @request GET:/api/public/scores/{scoreId}
     * @secure
     */
    scoreGetById: (scoreId: string, params: RequestParams = {}) =>
      this.request<ApiScore, any>({
        path: `/api/public/scores/${scoreId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a session. Please note that `traces` on this endpoint are not paginated, if you plan to fetch large sessions, consider `GET /api/public/traces?sessionId=<sessionId>`
     *
     * @tags Sessions
     * @name SessionsGet
     * @request GET:/api/public/sessions/{sessionId}
     * @secure
     */
    sessionsGet: (sessionId: string, params: RequestParams = {}) =>
      this.request<ApiSessionWithTraces, any>({
        path: `/api/public/sessions/${sessionId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get sessions
     *
     * @tags Sessions
     * @name SessionsList
     * @request GET:/api/public/sessions
     * @secure
     */
    sessionsList: (query: ApiSessionsListParams, params: RequestParams = {}) =>
      this.request<ApiPaginatedSessions, any>({
        path: `/api/public/sessions`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a specific trace
     *
     * @tags Trace
     * @name TraceGet
     * @request GET:/api/public/traces/{traceId}
     * @secure
     */
    traceGet: (traceId: string, params: RequestParams = {}) =>
      this.request<ApiTraceWithFullDetails, any>({
        path: `/api/public/traces/${traceId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get list of traces
     *
     * @tags Trace
     * @name TraceList
     * @request GET:/api/public/traces
     * @secure
     */
    traceList: (query: ApiTraceListParams, params: RequestParams = {}) =>
      this.request<ApiTraces, any>({
        path: `/api/public/traces`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
}
