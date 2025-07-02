import { LangfuseTraceAttributes, OTELAttributes } from "./types";

// Placeholder types - to be properly typed later
type SpanLevel = any;
type MapValue = any;
type PromptClient = any;

export enum LangfuseOtelSpanAttributes {
  // Langfuse-Trace attributes
  TRACE_NAME = "langfuse.trace.name",
  TRACE_USER_ID = "user.id",
  TRACE_SESSION_ID = "session.id",
  TRACE_TAGS = "langfuse.trace.tags",
  TRACE_PUBLIC = "langfuse.trace.public",
  TRACE_METADATA = "langfuse.trace.metadata",
  TRACE_INPUT = "langfuse.trace.input",
  TRACE_OUTPUT = "langfuse.trace.output",

  // Langfuse-observation attributes
  OBSERVATION_TYPE = "langfuse.observation.type",
  OBSERVATION_METADATA = "langfuse.observation.metadata",
  OBSERVATION_LEVEL = "langfuse.observation.level",
  OBSERVATION_STATUS_MESSAGE = "langfuse.observation.status_message",
  OBSERVATION_INPUT = "langfuse.observation.input",
  OBSERVATION_OUTPUT = "langfuse.observation.output",

  // Langfuse-observation of type Generation attributes
  OBSERVATION_COMPLETION_START_TIME = "langfuse.observation.completion_start_time",
  OBSERVATION_MODEL = "langfuse.observation.model.name",
  OBSERVATION_MODEL_PARAMETERS = "langfuse.observation.model.parameters",
  OBSERVATION_USAGE_DETAILS = "langfuse.observation.usage_details",
  OBSERVATION_COST_DETAILS = "langfuse.observation.cost_details",
  OBSERVATION_PROMPT_NAME = "langfuse.observation.prompt.name",
  OBSERVATION_PROMPT_VERSION = "langfuse.observation.prompt.version",

  //   General
  ENVIRONMENT = "langfuse.environment",
  RELEASE = "langfuse.release",
  VERSION = "langfuse.version",

  // Internal
  AS_ROOT = "langfuse.internal.as_root",

  // Compatibility - Map properties that were documented in https://langfuse.com/docs/opentelemetry/get-started#property-mapping,
  // but have a new assignment
  TRACE_COMPAT_USER_ID = "langfuse.user.id",
  TRACE_COMPAT_SESSION_ID = "langfuse.session.id",
}

export function createTraceAttributes({
  name,
  userId,
  sessionId,
  version,
  release,
  input,
  output,
  metadata,
  tags,
  public: isPublic,
}: LangfuseTraceAttributes = {}): OTELAttributes {
  const attributes = {
    [LangfuseOtelSpanAttributes.TRACE_NAME]: name,
    [LangfuseOtelSpanAttributes.TRACE_USER_ID]: userId,
    [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: sessionId,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.RELEASE]: release,
    [LangfuseOtelSpanAttributes.TRACE_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: _serialize(output),
    [LangfuseOtelSpanAttributes.TRACE_TAGS]: tags,
    [LangfuseOtelSpanAttributes.TRACE_PUBLIC]: isPublic,
    ..._flattenAndSerializeMetadata(metadata, "trace"),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v !== undefined)
  );
}

export function createSpanAttributes({
  metadata,
  input,
  output,
  level,
  statusMessage,
  version,
}: {
  metadata?: any;
  input?: any;
  output?: any;
  level?: SpanLevel;
  statusMessage?: string;
  version?: string;
} = {}): Record<string, any> {
  const attributes = {
    [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: "span",
    [LangfuseOtelSpanAttributes.OBSERVATION_LEVEL]: level,
    [LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE]: statusMessage,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]: _serialize(output),
    ..._flattenAndSerializeMetadata(metadata, "observation"),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v !== undefined)
  );
}

export function createGenerationAttributes({
  name,
  completionStartTime,
  metadata,
  level,
  statusMessage,
  version,
  model,
  modelParameters,
  input,
  output,
  usageDetails,
  costDetails,
  prompt,
}: {
  name?: string;
  completionStartTime?: Date;
  metadata?: any;
  level?: SpanLevel;
  statusMessage?: string;
  version?: string;
  model?: string;
  modelParameters?: Record<string, MapValue>;
  input?: any;
  output?: any;
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
  prompt?: PromptClient;
} = {}): Record<string, any> {
  const attributes = {
    [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: "generation",
    [LangfuseOtelSpanAttributes.OBSERVATION_LEVEL]: level,
    [LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE]: statusMessage,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]: _serialize(output),
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL]: model,
    [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]:
      prompt && !(prompt as any).is_fallback ? (prompt as any).name : undefined,
    [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]:
      prompt && !(prompt as any).is_fallback
        ? (prompt as any).version
        : undefined,
    [LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS]:
      _serialize(usageDetails),
    [LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS]:
      _serialize(costDetails),
    [LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME]:
      _serialize(completionStartTime),
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS]:
      _serialize(modelParameters),
    ..._flattenAndSerializeMetadata(metadata, "observation"),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v !== undefined)
  );
}

function _serialize(obj: any): string | undefined {
  try {
    return obj !== undefined && obj !== null ? JSON.stringify(obj) : undefined;
  } catch (err) {
    return "<failed to serialize>";
  }
}

function _flattenAndSerializeMetadata(
  metadata: any,
  type: "observation" | "trace"
): Record<string, string> {
  const prefix =
    type === "observation"
      ? LangfuseOtelSpanAttributes.OBSERVATION_METADATA
      : LangfuseOtelSpanAttributes.TRACE_METADATA;

  const metadataAttributes: Record<string, string> = {};

  if (metadata === undefined || metadata === null) {
    return metadataAttributes;
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    const serialized = _serialize(metadata);
    if (serialized) {
      metadataAttributes[prefix] = serialized;
    }
  } else {
    for (const [key, value] of Object.entries(metadata)) {
      const serialized = _serialize(value);
      if (serialized) {
        metadataAttributes[`${prefix}.${key}`] = serialized;
      }
    }
  }

  return metadataAttributes;
}
