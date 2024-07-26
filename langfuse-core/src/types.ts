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
 * @property id - The id of the trace can be set, defaults to a random id. Set it to link traces to external systems or when grouping multiple runs into a single trace (e.g. messages in a chat thread).
 * @property name - Identifier of the trace. Useful for sorting/filtering in the UI.
 * @property input - The input of the trace. Can be any JSON object.
 * @property output - The output of the trace. Can be any JSON object.
 * @property metadata - Additional metadata of the trace. Can be any JSON object. Metadata is merged when being updated via the API.object.
 * @property sessionId - Used to group multiple traces into a session in Langfuse. Use your own session/thread identifier.
 * @property release - Release number/hash of the application to provide analytics grouped by release.
 * @property timestamp - The time at which the trace was created, defaults to the current time.
 * @property userId - The id of the user that triggered the execution. Used to provide user-level analytics.
 * @property version - The version of the trace type. Used to understand how changes to the trace type affect metrics. Useful in debugging.
 * @property tags - Tags are used to categorize or label traces. Traces can be filtered by tags in the UI and GET API. Tags can also be changed in the UI. Tags are merged and never deleted via the API.
 * @property public - You can make a trace public to share it via a public link. This allows others to view the trace without needing to log in or be members of your Langfuse project.
 * @interface
 */
export interface CreateLangfuseTraceBody extends FixTypes<components["schemas"]["TraceBody"]> {}

/**
 * CreateLangfuseEventBody
 * @property id - The id of the event can be set, defaults to a random id.
 * @property startTime - The time at which the event started, defaults to the current time.
 * @property name - Identifier of the event. Useful for sorting/filtering in the UI.
 * @property parentObservationId - The id of the observation to which the event should be attached. Automatically set if you use {generation,span,event}.score({})
 * @property traceId - The id of the trace to which the event should be attached. Automatically set if you use {trace,generation,span,event}.score({})
 * @property metadata - Additional metadata of the event. Can be any JSON object. Metadata is merged when being updated via the API.
 * @property level - The level of the event. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the event. Additional field for context of the event. E.g. the error message of an error event.
 * @property input - The input to the event. Can be any JSON object.
 * @property output - The output to the event. Can be any JSON object.
 * @property version - The version of the event type. Used to understand how changes to the event type affect metrics. Useful in debugging.
 * @interface
 */
export interface CreateLangfuseEventBody extends FixTypes<components["schemas"]["CreateEventBody"]> {}

/**
 * CreateLangfuseSpanBody
 * @property id - The id of the span can be set, otherwise a random id is generated.
 * @property startTime - The time at which the span started, defaults to the current time.
 * @property endTime - The time at which the span ended.
 * @property name - Identifier of the span. Useful for sorting/filtering in the UI.
 * @property parentObservationId - The id of the observation to which the span should be attached. Automatically set if you use {generation,span,event}.score({})
 * @property traceId - The id of the trace to which the span should be attached. Automatically set if you use {trace,generation,span,event}.score({})
 * @property metadata - Additional metadata of the span. Can be any JSON object. Metadata is merged when being updated via the API.
 * @property level - The level of the span. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the span. Additional field for context of the event. E.g. the error message of an error event.
 * @property input - The input to the span. Can be any JSON object.
 * @property output - The output to the span. Can be any JSON object.
 * @property version - The version of the span type. Used to understand how changes to the span type affect metrics. Useful in debugging.
 * @interface
 */
export interface CreateLangfuseSpanBody extends FixTypes<components["schemas"]["CreateSpanBody"]> {}

export type UpdateLangfuseSpanBody = FixTypes<components["schemas"]["UpdateSpanBody"]>;

export type Usage = FixTypes<components["schemas"]["IngestionUsage"]>;

/**
 * CreateLangfuseGenerationBody
 * @property id - The id of the generation can be set, defaults to random id.
 * @property name - Identifier of the generation. Useful for sorting/filtering in the UI.
 * @property startTime - The time at which the generation started, defaults to the current time.
 * @property completionStartTime - The timestamp indicating when the completion process began (streaming). Setting this property helps in obtaining more accurate latency analytics, such as TimeToFirstToken.
 * @property traceId - The id of the trace to which the generation should be attached. Automatically set if you use {trace,generation
 * @property parentObservationId - The id of the observation to which the generation should be attached. Automatically set if you use {generation,span,event}.score({})
 * @property endTime - The time at which the generation ended.
 * @property model - The name of the model used for the generation.
 * @property modelParameters - The parameters of the model used for the generation; can be any key-value pairs.
 * @property input - 	The input to the generation - the prompt. Can be any JSON object or string.
 * @property output - The output to the generation - the completion. Can be any JSON object or string.
 * @property usage - The usage object supports the OpenAi structure with (promptTokens, completionTokens, totalTokens) and a more generic version (input, output, total, unit, inputCost, outputCost, totalCost) where unit can be of value "TOKENS", "CHARACTERS", "MILLISECONDS", "SECONDS", "IMAGES". Refer to the docs on how to automatically calculate tokens and costs by Langfuse.
 * @property metadata - Additional metadata of the generation. Can be any JSON object. Metadata is merged when being updated via the API.
 * @property level - The level of the generation. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the generation. Additional field for context of the event. E.g. the error message of an error event.
 * @property version - The version of the generation type. Used to understand how changes to the generation type affect metrics. Reflects e.g. the version of a prompt.
 * @property promptName - The name of the prompt.
 * @property promptVersion - The version of the prompt.
 * @interface
 */
export interface CreateLangfuseGenerationBody extends FixTypes<components["schemas"]["CreateGenerationBody"]> {}
export type UpdateLangfuseGenerationBody = FixTypes<components["schemas"]["UpdateGenerationBody"]>;

/**
 * CreateLangfuseScoreBody
 * @property id - The id of the score can be set, defaults to a random id.
 * @property traceId - The id of the trace to which the score should be attached. Automatically set if you use {trace,generation,span,event}.score({})
 * @property observationId - The id of the observation to which the score should be attached. Automatically set if you use {generation,span,event}.score({})
 * @property name - Identifier of the score.
 * @property value - The value of the score. Can be any number, often standardized to 0..1
 * @property comment - Additional context/explanation of the score.
 * @interface
 */
export interface CreateLangfuseScoreBody extends FixTypes<components["schemas"]["ScoreBody"]> {}
// SYNC
export type GetLangfuseTracesQuery = FixTypes<paths["/api/public/traces"]["get"]["parameters"]["query"]>;
export type GetLangfuseTracesResponse = FixTypes<
  paths["/api/public/traces"]["get"]["responses"]["200"]["content"]["application/json"]
>;
export type GetLangfuseTraceResponse = FixTypes<
  paths["/api/public/traces/{traceId}"]["get"]["responses"]["200"]["content"]["application/json"]
>;

/**
 * GetLangfuseObservationsQuery
 * @param page - The page number for pagination. Can be number, null or undefined.
 * @param limit - The limit for pagination. Can be number, null or undefined.
 * @param name - The name of the observation. Can be string, null or undefined.
 * @param userId - The user id associated with the observation. Can be string, null or undefined.
 * @param type - The type of the observation. Can be string, null or undefined.
 * @param traceId - The id of the trace associated with the observation. Can be string, null or undefined.
 * @param parentObservationId - The id of the parent observation. Can be string, null or undefined.
 * @param fromStartTime - The start time of the observation. Can be Date, null or undefined.
 * @param toStartTime - The end time of the observation. Can be Date, null or undefined.
 */
export type GetLangfuseObservationsQuery = FixTypes<paths["/api/public/observations"]["get"]["parameters"]["query"]>;

/**
 * GetLangfuseObservationsResponse
 * @property data - List of observations.
 * @property meta - Metadata about the response.
 * @property meta.page - The current page number.
 * @property meta.limit - The number of items per page.
 * @property meta.totalItems - The total number of items given the current filters/selection (if any).
 * @property meta.totalPages - The total number of pages given the current limit.
 * @interface
 */
export interface GetLangfuseObservationsResponse
  extends FixTypes<paths["/api/public/observations"]["get"]["responses"]["200"]["content"]["application/json"]> {}
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

/**
 * CreateLangfuseDatasetRunBody
 * @property metadata - Additional metadata of the dataset run. Can be any JSON object.
 * @property traceId - The id of the trace to which the dataset run should be attached.
 * @property observationId - The id of the observation to which the dataset run should be attached.
 * @property runName - Name of the dataset run.
 * @property runDescription - Description of the dataset run.
 * @property datasetItemId - Id of the dataset item in which the dataset run should be created.
 * @interface
 */
export interface CreateLangfuseDatasetRunItemBody
  extends FixTypes<paths["/api/public/dataset-run-items"]["post"]["requestBody"]["content"]["application/json"]> {}

/**
 * CreateLangfuseDatasetRunItemResponse
 * @property id - Id of the dataset run item.
 * @property traceId - The id of the trace to which the dataset run item is attached.
 * @property observationId - The id of the observation to which the dataset run item is attached.
 * @property createdAt - Creation time of the dataset run item.
 * @property updatedAt - Last update time of the dataset run item.
 * @property datasetItemId - Id of the dataset item.
 * @property datasetRunId - Id of the dataset run.
 * @property datasetRunName - Name of the dataset run.
 * @interface
 */
export interface CreateLangfuseDatasetRunItemResponse
  extends FixTypes<paths["/api/public/dataset-run-items"]["post"]["responses"]["200"]["content"]["application/json"]> {}

export type CreateLangfuseDatasetBody =
  paths["/api/public/v2/datasets"]["post"]["requestBody"]["content"]["application/json"];

/**
 * CreateLangfuseDatasetResponse
 * @property id - Id of the dataset.
 * @property name - Name of the dataset.
 * @property metadata - Additional metadata.
 * @property items - List of dataset items.
 * @property description - Description of the dataset.
 * @property createdAt - Creation time of the dataset.
 * @property runs - List of dataset runs.
 * @property projectId - Id of the project.
 * @property updatedAt - Last update time of the dataset.
 * @interface
 */
export interface CreateLangfuseDatasetResponse
  extends FixTypes<paths["/api/public/v2/datasets"]["post"]["responses"]["200"]["content"]["application/json"]> {}

/**
 * CreateLangfuseDatasetItemBody
 * @property datasetName - Name of the dataset in which the dataset item should be created.
 * @property id - Id of the dataset item. Defaults to None.
 * @property input - Input data. Defaults to None. Can contain any dict, list or scalar.
 * @property expected_output - Expected output data. Defaults to None. Can contain any dict, list or scalar.
 * @property metadata - Additional metadata. Defaults to None. Can contain any dict, list or scalar.
 * @property sourceTraceId - Id of the source trace. Defaults to None.
 * @property sourceObservationId - Id of the source observation. Defaults to None.
 * @property status - Status of the dataset item. Defaults to ACTIVE for newly created items.
 * @interface
 */
export interface CreateLangfuseDatasetItemBody
  extends FixTypes<paths["/api/public/dataset-items"]["post"]["requestBody"]["content"]["application/json"]> {}

/**
 * CreateLangfuseDatasetItemResponse
 * @property id - Id of the dataset item.
 * @property input - Input data.
 * @property metadata - Additional metadata.
 * @property datasetName - Name of the dataset.
 * @property createdAt - Creation time of the dataset item.
 * @property updatedAt - Last update time of the dataset item.
 * @property expectedOutput - Expected output data.
 * @property sourceTraceId - Id of the source trace.
 * @property sourceObservationId - Id of the source observation.
 * @property status - Status of the dataset item.
 * @property datasetId - Id of the dataset.
 * @interface
 */
export interface CreateLangfuseDatasetItemResponse
  extends FixTypes<paths["/api/public/dataset-items"]["post"]["responses"]["200"]["content"]["application/json"]> {}

/**
 * GetLangfuseDatasetRunParams
 * @property datasetName - Name of the dataset.
 * @property runName - Name of the dataset run.
 * @interface
 */
export interface GetLangfuseDatasetRunParams
  extends FixTypes<paths["/api/public/datasets/{datasetName}/runs/{runName}"]["get"]["parameters"]["path"]> {}
/**
 * GetLangfuseDatasetRunResponse
 * @property name - Name of the dataset run.
 * @property id - Id of the dataset run.
 * @property metadata - Additional metadata.
 * @property datasetName - Name of the dataset.
 * @property description - Description of the dataset run.
 * @property createdAt - Creation time of the dataset run.
 * @property updatedAt - Last update time of the dataset run.
 * @property datasetId - Id of the dataset.
 * @property datasetRunItems - List of dataset run items.
 * @interface
 */
export interface GetLangfuseDatasetRunResponse
  extends FixTypes<
    paths["/api/public/datasets/{datasetName}/runs/{runName}"]["get"]["responses"]["200"]["content"]["application/json"]
  > {}
export type GetLangfuseDatasetRunsQuery =
  paths["/api/public/datasets/{datasetName}/runs"]["get"]["parameters"]["query"];
export type GetLangfuseDatasetRunsPath = paths["/api/public/datasets/{datasetName}/runs"]["get"]["parameters"]["path"];

export type GetLangfuseDatasetRunsResponse = FixTypes<
  paths["/api/public/datasets/{datasetName}/runs"]["get"]["responses"]["200"]["content"]["application/json"]
>;

/**
 * CreateLangfusePromptBody
 * @property name - Unique name of the prompt within a Langfuse project.
 * @property type - The type of the prompt, either "text" for TextPrompt or "chat" for ChatPrompt.
 * @property prompt - The prompt content. For TextPrompt, this is the text template with variables (e.g. This is a prompt with a {{variable}}). For ChatPrompt, this is a list of chat messages each with role and content.
 * @property isActive - Whether the prompt is active.
 * @property config - Optional JSON object to store any parameters (e.g. model parameters or model tools).
 *
 * @interface
 */
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

/**
 * ChatMessage
 * @property role - The role of the message, e.g. USER or SYSTEM.
 * @property content - The content of the message.
 */
export type ChatMessage = FixTypes<components["schemas"]["ChatMessage"]>;

/**
 * ChatPrompt
 * @property prompt - The prompt content.
 * @property type - The type of the prompt, always "chat" for ChatPrompt.
 */
export type ChatPrompt = FixTypes<components["schemas"]["ChatPrompt"]> & { type: "chat" };
/**
 * TextPrompt
 * @property prompt - The prompt content.
 * @property type - The type of the prompt, always "text" for TextPrompt.
 * @interface
 */
export type TextPrompt = FixTypes<components["schemas"]["TextPrompt"]> & { type: "text" };

type CreateTextPromptRequest = FixTypes<components["schemas"]["CreateTextPromptRequest"]>;
type CreateChatPromptRequest = FixTypes<components["schemas"]["CreateChatPromptRequest"]>;

/**
 * CreateTextPromptBody
 * @interface
 * @property type - The type of the prompt, always "text" for TextPrompt.
 * @property prompt - The text template with variables (e.g. This is a prompt with a {{variable}}).
 * @property isActive - Whether the prompt is active.
 * @property name - Unique name of the prompt within a Langfuse project.
 * @property config - Optional JSON object to store any parameters (e.g. model parameters or model tools).
 */

export type CreateTextPromptBody = { type?: "text" } & Omit<CreateTextPromptRequest, "type"> & { isActive?: boolean }; // isActive is optional for backward compatibility

/**
 * CreateChatPromptBody
 * @interface
 * @property type - The type of the prompt, always "chat" for ChatPrompt.
 * @property prompt - The prompt content, which is a list of chat messages each with role and content.
 * @property isActive - Whether the prompt is active.
 * @property name - Unique name of the prompt within a Langfuse project.
 * @property config - Optional JSON object to store any parameters (e.g. model parameters or model tools).
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

/**
 * CreateLangfuseGeneration
 * @property id - The id of the generation can be set, defaults to random id.
 * @property name - Identifier of the generation. Useful for sorting/filtering in the UI.
 * @property startTime - The time at which the generation started, defaults to the current time.
 * @property completionStartTime - The timestamp indicating when the completion process began (streaming). Setting this property helps in obtaining more accurate latency analytics, such as TimeToFirstToken.
 * @property endTime - The time at which the generation ended.
 * @property model - The name of the model used for the generation.
 * @property modelParameters - The parameters of the model used for the generation; can be any key-value pairs.
 * @property input - 	The input to the generation - the prompt. Can be any JSON object or string.
 * @property output - The output to the generation - the completion. Can be any JSON object or string.
 * @property usage - The usage object supports the OpenAi structure with (promptTokens, completionTokens, totalTokens) and a more generic version (input, output, total, unit, inputCost, outputCost, totalCost) where unit can be of value "TOKENS", "CHARACTERS", "MILLISECONDS", "SECONDS", "IMAGES". Refer to the docs on how to automatically calculate tokens and costs by Langfuse.
 * @property metadata - Additional metadata of the generation. Can be any JSON object. Metadata is merged when being updated via the API.
 * @property level - The level of the generation. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the generation. Additional field for context of the event. E.g. the error message of an error event.
 * @property version - The version of the generation type. Used to understand how changes to the generation type affect metrics. Reflects e.g. the version of a prompt.
 * @property traceId - The id of the trace to which the generation should be attached.
 * @property parentObservationId - The id of the observation to which the generation should be attached.
 * @property prompt - The prompt client to be used for the generation.
 * @interface
 */
export type CreateLangfuseGeneration = Omit<CreateLangfuseGenerationBody, "promptName" | "promptVersion"> & PromptInput;

/**
 * CreateLangfuseGenerationWithoutParent
 * @property id - The id of the generation can be set, defaults to random id.
 * @property name - Identifier of the generation. Useful for sorting/filtering in the UI.
 * @property startTime - The time at which the generation started, defaults to the current time.
 * @property completionStartTime - The timestamp indicating when the completion process began (streaming). Setting this property helps in obtaining more accurate latency analytics, such as TimeToFirstToken.
 * @property endTime - The time at which the generation ended.
 * @property model - The name of the model used for the generation.
 * @property modelParameters - The parameters of the model used for the generation; can be any key-value pairs.
 * @property input - 	The input to the generation - the prompt. Can be any JSON object or string.
 * @property output - The output to the generation - the completion. Can be any JSON object or string.
 * @property usage - The usage object supports the OpenAi structure with (promptTokens, completionTokens, totalTokens) and a more generic version (input, output, total, unit, inputCost, outputCost, totalCost) where unit can be of value "TOKENS", "CHARACTERS", "MILLISECONDS", "SECONDS", "IMAGES". Refer to the docs on how to automatically calculate tokens and costs by Langfuse.
 * @property metadata - Additional metadata of the generation. Can be any JSON object. Metadata is merged when being updated via the API.
 * @property level - The level of the generation. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the generation. Additional field for context of the event. E.g. the error message of an error event.
 * @property version - The version of the generation type. Used to understand how changes to the generation type affect metrics. Reflects e.g. the version of a prompt.
 * @property prompt - The prompt client to be used for the generation.
 * @interface
 */
export type CreateLangfuseGenerationWithoutParent = Omit<
  CreateLangfuseGenerationBody,
  "traceId" | "parentObservationId" | "promptName" | "promptVersion"
> &
  PromptInput;
/**
 * CreateLangfuseEvent
 *
 * @property id - The id of the event can be set, defaults to a random id.
 * @property name - Identifier of the event. Useful for sorting/filtering in the UI.
 * @property input - The input of the event. Can be any JSON object.
 * @property output - The output of the event. Can be any JSON object.
 * @property version - The version of the event type. Used to understand how changes to the event type affect metrics. Useful in debugging.
 * @property metadata - Additional metadata of the event. Can be any JSON object.
 * @property startTime - The time at which the event started, defaults to the current time.
 * @property level - The level of the event. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the event. Additional field for context of the event. E.g. the error message of an error event.
 *
 * @interface
 */
export type CreateLangfuseEvent = Omit<CreateLangfuseEventBody, "traceId" | "parentObservationId">;

/**
 * CreateLangfuseSpan
 * @property id - The id of the span can be set, otherwise a random id is generated.
 * @property name - Identifier of the span. Useful for sorting/filtering in the UI.
 * @property input - The input to the span. Can be any JSON object.
 * @property output - The output to the span. Can be any JSON object.
 * @property version - The version of the span type. Used to understand how changes to the span type affect metrics. Useful in debugging.
 * @property startTime - The time at which the span started, defaults to the current time.
 * @property level - The level of the span. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the span. Additional field for context of the event. E.g. the error message of an error event.
 * @property endTime - The time at which the span ended.
 * @interface
 */
export type CreateLangfuseSpan = Omit<CreateLangfuseSpanBody, "traceId" | "parentObservationId">;

/**
 * CreateLangfuseScore
 * @property id - The id of the score can be set, defaults to a random id.
 * @property name - Identifier of the score.
 * @property value - The value of the score. Can be any number, often standardized to 0..1
 * @property observationId - The id of the observation to which the score should be attached. Automatically set if you use {generation,span,event}.score({})
 * @property comment - Additional context/explanation of the score.
 * @interface
 */
export type CreateLangfuseScore = Omit<CreateLangfuseScoreBody, "traceId" | "parentObservationId">;

/**
 * UpdateLangfuseGeneration
 * @property name - Identifier of the generation. Useful for sorting/filtering in the UI.
 * @property input - 	The input to the generation.
 * @property output - The output to the generation.
 * @property version - The version of the generation.
 * @property metadata - Additional metadata of the generation. Can be any JSON object.
 * @property startTime - The time at which the generation started, defaults to the current time.
 * @property completionStartTime - The timestamp indicating when the completion process began (streaming). Setting this property helps in obtaining more accurate latency analytics, such as TimeToFirstToken.
 * @property endTime - The time at which the generation ended.
 * @property model - The name of the model used for the generation.
 * @property modelParameters - The parameters of the model used for the generation; can be any key-value pairs.
 * @property usage - The usage object supports the OpenAi structure with (promptTokens, completionTokens, totalTokens) and a more generic version (input, output, total, unit, inputCost, outputCost, totalCost) where unit can be of value "TOKENS", "CHARACTERS", "MILLISECONDS", "SECONDS", "IMAGES". Refer to the docs on how to automatically calculate tokens and costs by Langfuse.
 * @property level - The level of the generation. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the generation. Additional field for context of the event. E.g. the error message of an error event.
 *
 * @interface
 */
export type UpdateLangfuseGeneration = Omit<
  UpdateLangfuseGenerationBody,
  "id" | "traceId" | "promptName" | "promptVersion"
> &
  PromptInput;
/**
 * EndLangfuseGeneration
 * @property name - Identifier of the generation. Useful for sorting/filtering in the UI.
 * @property input - 	The input to the generation.
 * @property output - The output to the generation.
 * @property version - The version of the generation.
 * @property metadata - Additional metadata of the generation. Can be any JSON object.
 * @property startTime - The time at which the generation started, defaults to the current time.
 * @property completionStartTime - The timestamp indicating when the completion process began (streaming). Setting this property helps in obtaining more accurate latency analytics, such as TimeToFirstToken.
 * @property endTime - The time at which the generation ended.
 * @property model - The name of the model used for the generation.
 * @property modelParameters - The parameters of the model used for the generation; can be any key-value pairs.
 * @property usage - The usage object supports the OpenAi structure with (promptTokens, completionTokens, totalTokens) and a more generic version (input, output, total, unit, inputCost, outputCost, totalCost) where unit can be of value "TOKENS", "CHARACTERS", "MILLISECONDS", "SECONDS", "IMAGES". Refer to the docs on how to automatically calculate tokens and costs by Langfuse.
 * @property level - The level of the generation. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the generation. Additional field for context of the event. E.g. the error message of an error event.
 *
 * @interface
 */
export type EndLangfuseGeneration = Omit<
  UpdateLangfuseGenerationBody,
  "id" | "traceId" | "endTime" | "promptName" | "promptVersion"
> &
  PromptInput;

/**
 * UpdateLangfuseSpan
 * @property name - Identifier of the span. Useful for sorting/filtering in the UI.
 * @property input - The input to the span.
 * @property output - The output to the span.
 * @property version - The version of the span.
 * @property metadata - Additional metadata of the span. Can be any JSON object.
 * @property startTime - The time at which the span started.
 * @property level - The level of the span. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the span. Additional field for context of the event. E.g. the error message of an error event.
 * @property parentObservationId - The id of the observation to which the span should be attached.
 * @property endTime - The time at which the span ended.
 * @interface
 */
export type UpdateLangfuseSpan = Omit<UpdateLangfuseSpanBody, "id" | "traceId">;

/**
 * EndLangfuseSpan
 * @property name - Identifier of the span. Useful for sorting/filtering in the UI.
 * @property input - The input to the span.
 * @property output - The output to the span.
 * @property version - The version of the span.
 * @property metadata - Additional metadata of the span. Can be any JSON object.
 * @property startTime - The time at which the span started.
 * @property level - The level of the span. Can be DEBUG, DEFAULT, WARNING or ERROR. Used for sorting/filtering of traces with elevated error levels and for highlighting in the UI.
 * @property statusMessage - The status message of the span. Additional field for context of the event. E.g. the error message of an error event.
 * @property parentObservationId - The id of the observation to which the span should be attached.
 * @interface
 */
export type EndLangfuseSpan = Omit<UpdateLangfuseSpanBody, "id" | "endTime" | "traceId">;

/**
 * UpdateLangfuseTrace
 * @property name - Identifier of the trace. Useful for sorting/filtering in the UI.
 * @property timestamp - The time at which the trace was created. Defaults to the current time.
 * @property input - The input of the trace.
 * @property output - The output of the trace.
 * @property metadata - Additional metadata of the trace. Can be any JSON object.
 * @property sessionId - Used to group multiple traces into a session in Langfuse.
 * @property userId - The id of the user that triggered the execution.
 * @property version - The version of the trace type.
 * @property tags - Tags are used to categorize or label traces.
 * @property public - You can make a trace public to share it via a public link.
 * @interface
 */
export type UpdateLangfuseTrace = Omit<CreateLangfuseTraceBody, "id">;
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
