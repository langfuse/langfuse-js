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

/** AnnotationQueueStatus */
export type ApiAnnotationQueueStatus = "PENDING" | "COMPLETED";

/** AnnotationQueueObjectType */
export type ApiAnnotationQueueObjectType = "TRACE" | "OBSERVATION";

/** AnnotationQueue */
export interface ApiAnnotationQueue {
  id: string;
  name: string;
  description?: string | null;
  scoreConfigIds: string[];
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

/** AnnotationQueueItem */
export interface ApiAnnotationQueueItem {
  id: string;
  queueId: string;
  objectId: string;
  objectType: ApiAnnotationQueueObjectType;
  status: ApiAnnotationQueueStatus;
  /** @format date-time */
  completedAt?: string | null;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

/** PaginatedAnnotationQueues */
export interface ApiPaginatedAnnotationQueues {
  data: ApiAnnotationQueue[];
  meta: ApiUtilsMetaResponse;
}

/** PaginatedAnnotationQueueItems */
export interface ApiPaginatedAnnotationQueueItems {
  data: ApiAnnotationQueueItem[];
  meta: ApiUtilsMetaResponse;
}

/** CreateAnnotationQueueItemRequest */
export interface ApiCreateAnnotationQueueItemRequest {
  objectId: string;
  objectType: ApiAnnotationQueueObjectType;
  /** Defaults to PENDING for new queue items */
  status?: ApiAnnotationQueueStatus | null;
}

/** UpdateAnnotationQueueItemRequest */
export interface ApiUpdateAnnotationQueueItemRequest {
  status?: ApiAnnotationQueueStatus | null;
}

/** DeleteAnnotationQueueItemResponse */
export interface ApiDeleteAnnotationQueueItemResponse {
  success: boolean;
  message: string;
}

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
  /** The environment from which this trace originated. Can be any lowercase alphanumeric string with hyphens and underscores that does not start with 'langfuse'. */
  environment?: string | null;
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
  scores: ApiScoreV1[];
};

/** Session */
export interface ApiSession {
  id: string;
  /** @format date-time */
  createdAt: string;
  projectId: string;
  /** The environment from which this session originated. */
  environment?: string | null;
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
  /** The environment from which this observation originated. Can be any lowercase alphanumeric string with hyphens and underscores that does not start with 'langfuse'. */
  environment?: string | null;
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

/** BaseScoreV1 */
export interface ApiBaseScoreV1 {
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
  metadata?: any;
  /** Reference a score config on a score. When set, config and score name must be equal and value must comply to optionally defined numerical range */
  configId?: string | null;
  /** Reference an annotation queue on a score. Populated if the score was initially created in an annotation queue. */
  queueId?: string | null;
  /** The environment from which this score originated. Can be any lowercase alphanumeric string with hyphens and underscores that does not start with 'langfuse'. */
  environment?: string | null;
}

/** NumericScoreV1 */
export type ApiNumericScoreV1 = ApiBaseScoreV1 & {
  /**
   * The numeric value of the score
   * @format double
   */
  value: number;
};

/** BooleanScoreV1 */
export type ApiBooleanScoreV1 = ApiBaseScoreV1 & {
  /**
   * The numeric value of the score. Equals 1 for "True" and 0 for "False"
   * @format double
   */
  value: number;
  /** The string representation of the score value. Is inferred from the numeric value and equals "True" or "False" */
  stringValue: string;
};

/** CategoricalScoreV1 */
export type ApiCategoricalScoreV1 = ApiBaseScoreV1 & {
  /**
   * Only defined if a config is linked. Represents the numeric category mapping of the stringValue
   * @format double
   */
  value?: number | null;
  /** The string representation of the score value. If no config is linked, can be any string. Otherwise, must map to a config category */
  stringValue: string;
};

/** ScoreV1 */
export type ApiScoreV1 =
  | ({
      dataType: "NUMERIC";
    } & ApiNumericScoreV1)
  | ({
      dataType: "CATEGORICAL";
    } & ApiCategoricalScoreV1)
  | ({
      dataType: "BOOLEAN";
    } & ApiBooleanScoreV1);

/** BaseScore */
export interface ApiBaseScore {
  id: string;
  traceId?: string | null;
  sessionId?: string | null;
  observationId?: string | null;
  datasetRunId?: string | null;
  name: string;
  source: ApiScoreSource;
  /** @format date-time */
  timestamp: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  authorUserId?: string | null;
  comment?: string | null;
  metadata?: any;
  /** Reference a score config on a score. When set, config and score name must be equal and value must comply to optionally defined numerical range */
  configId?: string | null;
  /** Reference an annotation queue on a score. Populated if the score was initially created in an annotation queue. */
  queueId?: string | null;
  /** The environment from which this score originated. Can be any lowercase alphanumeric string with hyphens and underscores that does not start with 'langfuse'. */
  environment?: string | null;
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
   * Deprecated. See 'prices' instead. Price (USD) per input unit
   * @format double
   */
  inputPrice?: number | null;
  /**
   * Deprecated. See 'prices' instead. Price (USD) per output unit
   * @format double
   */
  outputPrice?: number | null;
  /**
   * Deprecated. See 'prices' instead. Price (USD) per total unit. Cannot be set if input or output price is set.
   * @format double
   */
  totalPrice?: number | null;
  /** Optional. Tokenizer to be applied to observations which match to this model. See docs for more details. */
  tokenizerId?: string | null;
  /** Optional. Configuration for the selected tokenizer. Needs to be JSON. See docs for more details. */
  tokenizerConfig?: any;
  isLangfuseManaged: boolean;
  /** Price (USD) by usage type */
  prices: Record<string, ApiModelPrice>;
}

/** ModelPrice */
export interface ApiModelPrice {
  /** @format double */
  price: number;
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

/** DeleteDatasetItemResponse */
export interface ApiDeleteDatasetItemResponse {
  /** Success message after deletion */
  message: string;
}

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

/** PaginatedDatasetRunItems */
export interface ApiPaginatedDatasetRunItems {
  data: ApiDatasetRunItem[];
  meta: ApiUtilsMetaResponse;
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

/** DeleteDatasetRunResponse */
export interface ApiDeleteDatasetRunResponse {
  message: string;
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
  environment?: string | null;
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
  environment?: string | null;
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
  environment?: string | null;
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
  traceId?: string | null;
  sessionId?: string | null;
  observationId?: string | null;
  datasetRunId?: string | null;
  /** @example "novelty" */
  name: string;
  environment?: string | null;
  /** The value of the score. Must be passed as string for categorical scores, and numeric for boolean and numeric scores. Boolean score values must equal either 1 or 0 (true or false) */
  value: ApiCreateScoreValue;
  comment?: string | null;
  metadata?: any;
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

/**
 * OpenAICompletionUsageSchema
 * OpenAI Usage schema from (Chat-)Completion APIs
 */
export interface ApiOpenAICompletionUsageSchema {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: Record<string, number | null>;
  completion_tokens_details?: Record<string, number | null>;
}

/**
 * OpenAIResponseUsageSchema
 * OpenAI Usage schema from Response API
 */
export interface ApiOpenAIResponseUsageSchema {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: Record<string, number | null>;
  output_tokens_details?: Record<string, number | null>;
}

/** UsageDetails */
export type ApiUsageDetails = Record<string, number> | ApiOpenAICompletionUsageSchema | ApiOpenAIResponseUsageSchema;

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

/** MetricsResponse */
export interface ApiMetricsResponse {
  /**
   * The metrics data. Each item in the list contains the metric values and dimensions requested in the query.
   * Format varies based on the query parameters.
   * Histograms will return an array with [lower, upper, height] tuples.
   */
  data: Record<string, any>[];
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

/** MembershipRole */
export type ApiMembershipRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

/** MembershipRequest */
export interface ApiMembershipRequest {
  userId: string;
  role: ApiMembershipRole;
}

/** MembershipResponse */
export interface ApiMembershipResponse {
  userId: string;
  role: ApiMembershipRole;
  email: string;
  name: string;
}

/** MembershipsResponse */
export interface ApiMembershipsResponse {
  memberships: ApiMembershipResponse[];
}

/** OrganizationProject */
export interface ApiOrganizationProject {
  id: string;
  name: string;
  metadata?: Record<string, any>;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

/** OrganizationProjectsResponse */
export interface ApiOrganizationProjectsResponse {
  projects: ApiOrganizationProject[];
}

/** Projects */
export interface ApiProjects {
  data: ApiProject[];
}

/** Project */
export interface ApiProject {
  id: string;
  name: string;
  /** Metadata for the project */
  metadata: Record<string, any>;
  /** Number of days to retain data. Null or 0 means no retention. Omitted if no retention is configured. */
  retentionDays?: number | null;
}

/** ProjectDeletionResponse */
export interface ApiProjectDeletionResponse {
  success: boolean;
  message: string;
}

/**
 * ApiKeyList
 * List of API keys for a project
 */
export interface ApiApiKeyList {
  apiKeys: ApiApiKeySummary[];
}

/**
 * ApiKeySummary
 * Summary of an API key
 */
export interface ApiApiKeySummary {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  expiresAt?: string | null;
  /** @format date-time */
  lastUsedAt?: string | null;
  note?: string | null;
  publicKey: string;
  displaySecretKey: string;
}

/**
 * ApiKeyResponse
 * Response for API key creation
 */
export interface ApiApiKeyResponse {
  id: string;
  /** @format date-time */
  createdAt: string;
  publicKey: string;
  secretKey: string;
  displaySecretKey: string;
  note?: string | null;
}

/**
 * ApiKeyDeletionResponse
 * Response for API key deletion
 */
export interface ApiApiKeyDeletionResponse {
  success: boolean;
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
  prompt: ApiChatMessageWithPlaceholders[];
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
  /** The dependency resolution graph for the current prompt. Null if prompt has no dependencies. */
  resolutionGraph?: Record<string, any>;
}

/** ChatMessageWithPlaceholders */
export type ApiChatMessageWithPlaceholders =
  | ({
      type: "chatmessage";
    } & ApiChatMessage)
  | ({
      type: "placeholder";
    } & ApiPlaceholderMessage);

/** ChatMessage */
export interface ApiChatMessage {
  role: string;
  content: string;
}

/** PlaceholderMessage */
export interface ApiPlaceholderMessage {
  name: string;
}

/** TextPrompt */
export type ApiTextPrompt = ApiBasePrompt & {
  prompt: string;
};

/** ChatPrompt */
export type ApiChatPrompt = ApiBasePrompt & {
  prompt: ApiChatMessageWithPlaceholders[];
};

/** ServiceProviderConfig */
export interface ApiServiceProviderConfig {
  schemas: string[];
  documentationUri: string;
  patch: ApiScimFeatureSupport;
  bulk: ApiBulkConfig;
  filter: ApiFilterConfig;
  changePassword: ApiScimFeatureSupport;
  sort: ApiScimFeatureSupport;
  etag: ApiScimFeatureSupport;
  authenticationSchemes: ApiAuthenticationScheme[];
  meta: ApiResourceMeta;
}

/** ScimFeatureSupport */
export interface ApiScimFeatureSupport {
  supported: boolean;
}

/** BulkConfig */
export interface ApiBulkConfig {
  supported: boolean;
  maxOperations: number;
  maxPayloadSize: number;
}

/** FilterConfig */
export interface ApiFilterConfig {
  supported: boolean;
  maxResults: number;
}

/** ResourceMeta */
export interface ApiResourceMeta {
  resourceType: string;
  location: string;
}

/** AuthenticationScheme */
export interface ApiAuthenticationScheme {
  name: string;
  description: string;
  specUri: string;
  type: string;
  primary: boolean;
}

/** ResourceTypesResponse */
export interface ApiResourceTypesResponse {
  schemas: string[];
  totalResults: number;
  Resources: ApiResourceType[];
}

/** ResourceType */
export interface ApiResourceType {
  schemas?: string[] | null;
  id: string;
  name: string;
  endpoint: string;
  description: string;
  schema: string;
  schemaExtensions: ApiSchemaExtension[];
  meta: ApiResourceMeta;
}

/** SchemaExtension */
export interface ApiSchemaExtension {
  schema: string;
  required: boolean;
}

/** SchemasResponse */
export interface ApiSchemasResponse {
  schemas: string[];
  totalResults: number;
  Resources: ApiSchemaResource[];
}

/** SchemaResource */
export interface ApiSchemaResource {
  id: string;
  name: string;
  description: string;
  attributes: any[];
  meta: ApiResourceMeta;
}

/** ScimUsersListResponse */
export interface ApiScimUsersListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ApiScimUser[];
}

/** ScimUser */
export interface ApiScimUser {
  schemas: string[];
  id: string;
  userName: string;
  name: ApiScimName;
  emails: ApiScimEmail[];
  meta: ApiUserMeta;
}

/** UserMeta */
export interface ApiUserMeta {
  resourceType: string;
  created?: string | null;
  lastModified?: string | null;
}

/** ScimName */
export interface ApiScimName {
  formatted?: string | null;
}

/** ScimEmail */
export interface ApiScimEmail {
  primary: boolean;
  value: string;
  type: string;
}

/**
 * EmptyResponse
 * Empty response for 204 No Content responses
 */
export type ApiEmptyResponse = object;

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

/** GetScoresResponseTraceData */
export interface ApiGetScoresResponseTraceData {
  /** The user ID associated with the trace referenced by score */
  userId?: string | null;
  /** A list of tags associated with the trace referenced by score */
  tags?: string[] | null;
  /** The environment of the trace referenced by score */
  environment?: string | null;
}

/** GetScoresResponseDataNumeric */
export type ApiGetScoresResponseDataNumeric = ApiNumericScore & {
  trace?: ApiGetScoresResponseTraceData | null;
};

/** GetScoresResponseDataCategorical */
export type ApiGetScoresResponseDataCategorical = ApiCategoricalScore & {
  trace?: ApiGetScoresResponseTraceData | null;
};

/** GetScoresResponseDataBoolean */
export type ApiGetScoresResponseDataBoolean = ApiBooleanScore & {
  trace?: ApiGetScoresResponseTraceData | null;
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

/** CreateScoreRequest */
export interface ApiCreateScoreRequest {
  id?: string | null;
  traceId?: string | null;
  sessionId?: string | null;
  observationId?: string | null;
  datasetRunId?: string | null;
  /** @example "novelty" */
  name: string;
  /** The value of the score. Must be passed as string for categorical scores, and numeric for boolean and numeric scores. Boolean score values must equal either 1 or 0 (true or false) */
  value: ApiCreateScoreValue;
  comment?: string | null;
  metadata?: any;
  /** The environment of the score. Can be any lowercase alphanumeric string with hyphens and underscores that does not start with 'langfuse'. */
  environment?: string | null;
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

/** DeleteTraceResponse */
export interface ApiDeleteTraceResponse {
  message: string;
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

export interface ApiAnnotationQueuesListQueuesParams {
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
}

export interface ApiAnnotationQueuesListQueueItemsParams {
  /** Filter by status */
  status?: ApiAnnotationQueueStatus | null;
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
  /** The unique identifier of the annotation queue */
  queueId: string;
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

export interface ApiDatasetRunItemsListParams {
  datasetId: string;
  runName: string;
  /** page number, starts at 1 */
  page?: number | null;
  /** limit of items per page */
  limit?: number | null;
  response: ApiPaginatedDatasetRunItems;
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

export interface ApiMetricsMetricsParams {
  /**
   * JSON string containing the query parameters with the following structure:
   * ```json
   * {
   *   "view": string,           // Required. One of "traces", "observations", "scores-numeric", "scores-categorical"
   *   "dimensions": [           // Optional. Default: []
   *     {
   *       "field": string       // Field to group by, e.g. "name", "userId", "sessionId"
   *     }
   *   ],
   *   "metrics": [              // Required. At least one metric must be provided
   *     {
   *       "measure": string,    // What to measure, e.g. "count", "latency", "value"
   *       "aggregation": string // How to aggregate, e.g. "count", "sum", "avg", "p95", "histogram"
   *     }
   *   ],
   *   "filters": [              // Optional. Default: []
   *     {
   *       "column": string,     // Column to filter on
   *       "operator": string,   // Operator, e.g. "=", ">", "<", "contains"
   *       "value": any,         // Value to compare against
   *       "type": string,       // Data type, e.g. "string", "number", "stringObject"
   *       "key": string         // Required only when filtering on metadata
   *     }
   *   ],
   *   "timeDimension": {        // Optional. Default: null. If provided, results will be grouped by time
   *     "granularity": string   // One of "minute", "hour", "day", "week", "month", "auto"
   *   },
   *   "fromTimestamp": string,  // Required. ISO datetime string for start of time range
   *   "toTimestamp": string,    // Required. ISO datetime string for end of time range
   *   "orderBy": [              // Optional. Default: null
   *     {
   *       "field": string,      // Field to order by
   *       "direction": string   // "asc" or "desc"
   *     }
   *   ],
   *   "config": {               // Optional. Query-specific configuration
   *     "bins": number,         // Optional. Number of bins for histogram (1-100), default: 10
   *     "row_limit": number     // Optional. Row limit for results (1-1000)
   *   }
   * }
   * ```
   */
  query: string;
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
  /** Optional filter for observations where the environment is one of the provided values. */
  environment?: (string | null)[];
  /**
   * Retrieve only observations with a start_time on or after this datetime (ISO 8601).
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

export interface ApiProjectsCreatePayload {
  name: string;
  /** Optional metadata for the project */
  metadata?: Record<string, any>;
  /** Number of days to retain data. Must be 0 or at least 3 days. Requires data-retention entitlement for non-zero values. Optional. */
  retention: number;
}

export interface ApiProjectsUpdatePayload {
  name: string;
  /** Optional metadata for the project */
  metadata?: Record<string, any>;
  /** Number of days to retain data. Must be 0 or at least 3 days. Requires data-retention entitlement for non-zero values. Optional. */
  retention: number;
}

export interface ApiProjectsCreateApiKeyPayload {
  /** Optional note for the API key */
  note?: string | null;
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

export interface ApiScimListUsersParams {
  /** Filter expression (e.g. userName eq "value") */
  filter?: string | null;
  /** 1-based index of the first result to return (default 1) */
  startIndex?: number | null;
  /** Maximum number of results to return (default 100) */
  count?: number | null;
}

export interface ApiScimCreateUserPayload {
  /** User's email address (required) */
  userName: string;
  /** User's name information */
  name: ApiScimName;
  /** User's email addresses */
  emails?: ApiScimEmail[] | null;
  /** Whether the user is active */
  active?: boolean | null;
  /** Initial password for the user */
  password?: string | null;
}

export interface ApiScoreConfigsGetParams {
  /** Page number, starts at 1. */
  page?: number | null;
  /** Limit of items per page. If you encounter api issues due to too large page sizes, try to reduce the limit */
  limit?: number | null;
}

export interface ApiScoreV2GetParams {
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
  /** Optional filter for scores where the environment is one of the provided values. */
  environment?: (string | null)[];
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
  /** Optional filter for sessions where the environment is one of the provided values. */
  environment?: (string | null)[];
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
  /** Optional filter for traces where the environment is one of the provided values. */
  environment?: (string | null)[];
  /** Comma-separated list of fields to include in the response. Available field groups are 'core' (always included), 'io' (input, output, metadata), 'scores', 'observations', 'metrics'. If not provided, all fields are included. Example: 'core,scores,metrics' */
  fields?: string | null;
}

export interface ApiTraceDeleteMultiplePayload {
  /** List of trace IDs to delete */
  traceIds: string[];
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
     * @description Add an item to an annotation queue
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesCreateQueueItem
     * @request POST:/api/public/annotation-queues/{queueId}/items
     * @secure
     */
    annotationQueuesCreateQueueItem: (
      queueId: string,
      data: ApiCreateAnnotationQueueItemRequest,
      params: RequestParams = {}
    ) =>
      this.request<ApiAnnotationQueueItem, any>({
        path: `/api/public/annotation-queues/${queueId}/items`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Remove an item from an annotation queue
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesDeleteQueueItem
     * @request DELETE:/api/public/annotation-queues/{queueId}/items/{itemId}
     * @secure
     */
    annotationQueuesDeleteQueueItem: (queueId: string, itemId: string, params: RequestParams = {}) =>
      this.request<ApiDeleteAnnotationQueueItemResponse, any>({
        path: `/api/public/annotation-queues/${queueId}/items/${itemId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get an annotation queue by ID
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesGetQueue
     * @request GET:/api/public/annotation-queues/{queueId}
     * @secure
     */
    annotationQueuesGetQueue: (queueId: string, params: RequestParams = {}) =>
      this.request<ApiAnnotationQueue, any>({
        path: `/api/public/annotation-queues/${queueId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a specific item from an annotation queue
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesGetQueueItem
     * @request GET:/api/public/annotation-queues/{queueId}/items/{itemId}
     * @secure
     */
    annotationQueuesGetQueueItem: (queueId: string, itemId: string, params: RequestParams = {}) =>
      this.request<ApiAnnotationQueueItem, any>({
        path: `/api/public/annotation-queues/${queueId}/items/${itemId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get items for a specific annotation queue
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesListQueueItems
     * @request GET:/api/public/annotation-queues/{queueId}/items
     * @secure
     */
    annotationQueuesListQueueItems: (
      { queueId, ...query }: ApiAnnotationQueuesListQueueItemsParams,
      params: RequestParams = {}
    ) =>
      this.request<ApiPaginatedAnnotationQueueItems, any>({
        path: `/api/public/annotation-queues/${queueId}/items`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all annotation queues
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesListQueues
     * @request GET:/api/public/annotation-queues
     * @secure
     */
    annotationQueuesListQueues: (query: ApiAnnotationQueuesListQueuesParams, params: RequestParams = {}) =>
      this.request<ApiPaginatedAnnotationQueues, any>({
        path: `/api/public/annotation-queues`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update an annotation queue item
     *
     * @tags AnnotationQueues
     * @name AnnotationQueuesUpdateQueueItem
     * @request PATCH:/api/public/annotation-queues/{queueId}/items/{itemId}
     * @secure
     */
    annotationQueuesUpdateQueueItem: (
      queueId: string,
      itemId: string,
      data: ApiUpdateAnnotationQueueItemRequest,
      params: RequestParams = {}
    ) =>
      this.request<ApiAnnotationQueueItem, any>({
        path: `/api/public/annotation-queues/${queueId}/items/${itemId}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

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
     * @description Delete a dataset item and all its run items. This action is irreversible.
     *
     * @tags DatasetItems
     * @name DatasetItemsDelete
     * @request DELETE:/api/public/dataset-items/{id}
     * @secure
     */
    datasetItemsDelete: (id: string, params: RequestParams = {}) =>
      this.request<ApiDeleteDatasetItemResponse, any>({
        path: `/api/public/dataset-items/${id}`,
        method: "DELETE",
        secure: true,
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
     * @description List dataset run items
     *
     * @tags DatasetRunItems
     * @name DatasetRunItemsList
     * @request GET:/api/public/dataset-run-items
     * @secure
     */
    datasetRunItemsList: (query: ApiDatasetRunItemsListParams, params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/api/public/dataset-run-items`,
        method: "GET",
        query: query,
        secure: true,
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
     * @description Delete a dataset run and all its run items. This action is irreversible.
     *
     * @tags Datasets
     * @name DatasetsDeleteRun
     * @request DELETE:/api/public/datasets/{datasetName}/runs/{runName}
     * @secure
     */
    datasetsDeleteRun: (datasetName: string, runName: string, params: RequestParams = {}) =>
      this.request<ApiDeleteDatasetRunResponse, any>({
        path: `/api/public/datasets/${datasetName}/runs/${runName}`,
        method: "DELETE",
        secure: true,
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
     * @description Batched ingestion for Langfuse Tracing. If you want to use tracing via the API, such as to build your own Langfuse client implementation, this is the only API route you need to implement. Within each batch, there can be multiple events. Each event has a type, an id, a timestamp, metadata and a body. Internally, we refer to this as the "event envelope" as it tells us something about the event but not the trace. We use the event id within this envelope to deduplicate messages to avoid processing the same event twice, i.e. the event id should be unique per request. The event.body.id is the ID of the actual trace and will be used for updates and will be visible within the Langfuse App. I.e. if you want to update a trace, you'd use the same body id, but separate event IDs. Notes: - Introduction to data model: https://langfuse.com/docs/tracing-data-model - Batch sizes are limited to 3.5 MB in total. You need to adjust the number of events per batch accordingly. - The API does not return a 4xx status code for input errors. Instead, it responds with a 207 status code, which includes a list of the encountered errors.
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
     * @description Get metrics from the Langfuse project using a query object
     *
     * @tags Metrics
     * @name MetricsMetrics
     * @request GET:/api/public/metrics
     * @secure
     */
    metricsMetrics: (query: ApiMetricsMetricsParams, params: RequestParams = {}) =>
      this.request<ApiMetricsResponse, any>({
        path: `/api/public/metrics`,
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
     * @description Get all memberships for the organization associated with the API key (requires organization-scoped API key)
     *
     * @tags Organizations
     * @name OrganizationsGetOrganizationMemberships
     * @request GET:/api/public/organizations/memberships
     * @secure
     */
    organizationsGetOrganizationMemberships: (params: RequestParams = {}) =>
      this.request<ApiMembershipsResponse, any>({
        path: `/api/public/organizations/memberships`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all projects for the organization associated with the API key (requires organization-scoped API key)
     *
     * @tags Organizations
     * @name OrganizationsGetOrganizationProjects
     * @request GET:/api/public/organizations/projects
     * @secure
     */
    organizationsGetOrganizationProjects: (params: RequestParams = {}) =>
      this.request<ApiOrganizationProjectsResponse, any>({
        path: `/api/public/organizations/projects`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all memberships for a specific project (requires organization-scoped API key)
     *
     * @tags Organizations
     * @name OrganizationsGetProjectMemberships
     * @request GET:/api/public/projects/{projectId}/memberships
     * @secure
     */
    organizationsGetProjectMemberships: (projectId: string, params: RequestParams = {}) =>
      this.request<ApiMembershipsResponse, any>({
        path: `/api/public/projects/${projectId}/memberships`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create or update a membership for the organization associated with the API key (requires organization-scoped API key)
     *
     * @tags Organizations
     * @name OrganizationsUpdateOrganizationMembership
     * @request PUT:/api/public/organizations/memberships
     * @secure
     */
    organizationsUpdateOrganizationMembership: (data: ApiMembershipRequest, params: RequestParams = {}) =>
      this.request<ApiMembershipResponse, any>({
        path: `/api/public/organizations/memberships`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Create or update a membership for a specific project (requires organization-scoped API key). The user must already be a member of the organization.
     *
     * @tags Organizations
     * @name OrganizationsUpdateProjectMembership
     * @request PUT:/api/public/projects/{projectId}/memberships
     * @secure
     */
    organizationsUpdateProjectMembership: (projectId: string, data: ApiMembershipRequest, params: RequestParams = {}) =>
      this.request<ApiMembershipResponse, any>({
        path: `/api/public/projects/${projectId}/memberships`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a new project (requires organization-scoped API key)
     *
     * @tags Projects
     * @name ProjectsCreate
     * @request POST:/api/public/projects
     * @secure
     */
    projectsCreate: (data: ApiProjectsCreatePayload, params: RequestParams = {}) =>
      this.request<ApiProject, any>({
        path: `/api/public/projects`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a new API key for a project (requires organization-scoped API key)
     *
     * @tags Projects
     * @name ProjectsCreateApiKey
     * @request POST:/api/public/projects/{projectId}/apiKeys
     * @secure
     */
    projectsCreateApiKey: (projectId: string, data: ApiProjectsCreateApiKeyPayload, params: RequestParams = {}) =>
      this.request<ApiApiKeyResponse, any>({
        path: `/api/public/projects/${projectId}/apiKeys`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete a project by ID (requires organization-scoped API key). Project deletion is processed asynchronously.
     *
     * @tags Projects
     * @name ProjectsDelete
     * @request DELETE:/api/public/projects/{projectId}
     * @secure
     */
    projectsDelete: (projectId: string, params: RequestParams = {}) =>
      this.request<ApiProjectDeletionResponse, any>({
        path: `/api/public/projects/${projectId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete an API key for a project (requires organization-scoped API key)
     *
     * @tags Projects
     * @name ProjectsDeleteApiKey
     * @request DELETE:/api/public/projects/{projectId}/apiKeys/{apiKeyId}
     * @secure
     */
    projectsDeleteApiKey: (projectId: string, apiKeyId: string, params: RequestParams = {}) =>
      this.request<ApiApiKeyDeletionResponse, any>({
        path: `/api/public/projects/${projectId}/apiKeys/${apiKeyId}`,
        method: "DELETE",
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
     * @description Get all API keys for a project (requires organization-scoped API key)
     *
     * @tags Projects
     * @name ProjectsGetApiKeys
     * @request GET:/api/public/projects/{projectId}/apiKeys
     * @secure
     */
    projectsGetApiKeys: (projectId: string, params: RequestParams = {}) =>
      this.request<ApiApiKeyList, any>({
        path: `/api/public/projects/${projectId}/apiKeys`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update a project by ID (requires organization-scoped API key).
     *
     * @tags Projects
     * @name ProjectsUpdate
     * @request PUT:/api/public/projects/{projectId}
     * @secure
     */
    projectsUpdate: (projectId: string, data: ApiProjectsUpdatePayload, params: RequestParams = {}) =>
      this.request<ApiProject, any>({
        path: `/api/public/projects/${projectId}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
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
     * @description Create a new user in the organization (requires organization-scoped API key)
     *
     * @tags Scim
     * @name ScimCreateUser
     * @request POST:/api/public/scim/Users
     * @secure
     */
    scimCreateUser: (data: ApiScimCreateUserPayload, params: RequestParams = {}) =>
      this.request<ApiScimUser, any>({
        path: `/api/public/scim/Users`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Remove a user from the organization (requires organization-scoped API key). Note that this only removes the user from the organization but does not delete the user entity itself.
     *
     * @tags Scim
     * @name ScimDeleteUser
     * @request DELETE:/api/public/scim/Users/{userId}
     * @secure
     */
    scimDeleteUser: (userId: string, params: RequestParams = {}) =>
      this.request<ApiEmptyResponse, any>({
        path: `/api/public/scim/Users/${userId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get SCIM Resource Types (requires organization-scoped API key)
     *
     * @tags Scim
     * @name ScimGetResourceTypes
     * @request GET:/api/public/scim/ResourceTypes
     * @secure
     */
    scimGetResourceTypes: (params: RequestParams = {}) =>
      this.request<ApiResourceTypesResponse, any>({
        path: `/api/public/scim/ResourceTypes`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get SCIM Schemas (requires organization-scoped API key)
     *
     * @tags Scim
     * @name ScimGetSchemas
     * @request GET:/api/public/scim/Schemas
     * @secure
     */
    scimGetSchemas: (params: RequestParams = {}) =>
      this.request<ApiSchemasResponse, any>({
        path: `/api/public/scim/Schemas`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get SCIM Service Provider Configuration (requires organization-scoped API key)
     *
     * @tags Scim
     * @name ScimGetServiceProviderConfig
     * @request GET:/api/public/scim/ServiceProviderConfig
     * @secure
     */
    scimGetServiceProviderConfig: (params: RequestParams = {}) =>
      this.request<ApiServiceProviderConfig, any>({
        path: `/api/public/scim/ServiceProviderConfig`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a specific user by ID (requires organization-scoped API key)
     *
     * @tags Scim
     * @name ScimGetUser
     * @request GET:/api/public/scim/Users/{userId}
     * @secure
     */
    scimGetUser: (userId: string, params: RequestParams = {}) =>
      this.request<ApiScimUser, any>({
        path: `/api/public/scim/Users/${userId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description List users in the organization (requires organization-scoped API key)
     *
     * @tags Scim
     * @name ScimListUsers
     * @request GET:/api/public/scim/Users
     * @secure
     */
    scimListUsers: (query: ApiScimListUsersParams, params: RequestParams = {}) =>
      this.request<ApiScimUsersListResponse, any>({
        path: `/api/public/scim/Users`,
        method: "GET",
        query: query,
        secure: true,
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
     * @description Create a score (supports both trace and session scores)
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
     * @description Delete a score (supports both trace and session scores)
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
     * @description Get a list of scores (supports both trace and session scores)
     *
     * @tags ScoreV2
     * @name ScoreV2Get
     * @request GET:/api/public/v2/scores
     * @secure
     */
    scoreV2Get: (query: ApiScoreV2GetParams, params: RequestParams = {}) =>
      this.request<ApiGetScoresResponse, any>({
        path: `/api/public/v2/scores`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a score (supports both trace and session scores)
     *
     * @tags ScoreV2
     * @name ScoreV2GetById
     * @request GET:/api/public/v2/scores/{scoreId}
     * @secure
     */
    scoreV2GetById: (scoreId: string, params: RequestParams = {}) =>
      this.request<ApiScore, any>({
        path: `/api/public/v2/scores/${scoreId}`,
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
     * @description Delete a specific trace
     *
     * @tags Trace
     * @name TraceDelete
     * @request DELETE:/api/public/traces/{traceId}
     * @secure
     */
    traceDelete: (traceId: string, params: RequestParams = {}) =>
      this.request<ApiDeleteTraceResponse, any>({
        path: `/api/public/traces/${traceId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete multiple traces
     *
     * @tags Trace
     * @name TraceDeleteMultiple
     * @request DELETE:/api/public/traces
     * @secure
     */
    traceDeleteMultiple: (data: ApiTraceDeleteMultiplePayload, params: RequestParams = {}) =>
      this.request<ApiDeleteTraceResponse, any>({
        path: `/api/public/traces`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
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
