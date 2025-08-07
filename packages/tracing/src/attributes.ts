import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { type Attributes } from "@opentelemetry/api";

import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

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
  environment,
  public: isPublic,
}: LangfuseTraceAttributes = {}): Attributes {
  const attributes = {
    [LangfuseOtelSpanAttributes.TRACE_NAME]: name,
    [LangfuseOtelSpanAttributes.TRACE_USER_ID]: userId,
    [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: sessionId,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.RELEASE]: release,
    [LangfuseOtelSpanAttributes.TRACE_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: _serialize(output),
    [LangfuseOtelSpanAttributes.TRACE_TAGS]: tags,
    [LangfuseOtelSpanAttributes.ENVIRONMENT]: environment,
    [LangfuseOtelSpanAttributes.TRACE_PUBLIC]: isPublic,
    ..._flattenAndSerializeMetadata(metadata, "trace"),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v != null),
  );
}

export function createSpanAttributes({
  metadata,
  input,
  output,
  level,
  statusMessage,
  version,
}: LangfuseSpanAttributes): Attributes {
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
    Object.entries(attributes).filter(([_, v]) => v != null),
  );
}

export function createGenerationAttributes({
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
}: LangfuseGenerationAttributes): Attributes {
  const attributes = {
    [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: "generation",
    [LangfuseOtelSpanAttributes.OBSERVATION_LEVEL]: level,
    [LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE]: statusMessage,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]: _serialize(output),
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL]: model,
    [LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS]:
      _serialize(usageDetails),
    [LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS]:
      _serialize(costDetails),
    [LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME]:
      _serialize(completionStartTime),
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS]:
      _serialize(modelParameters),
    ...(prompt && !prompt.isFallback
      ? {
          [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]: prompt.name,
          [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]:
            prompt.version,
        }
      : {}),
    ..._flattenAndSerializeMetadata(metadata, "observation"),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v != null),
  ) as Attributes;
}

export function createEventAttributes({
  metadata,
  input,
  output,
  level,
  statusMessage,
  version,
}: LangfuseSpanAttributes): Attributes {
  const attributes = {
    [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: "event",
    [LangfuseOtelSpanAttributes.OBSERVATION_LEVEL]: level,
    [LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE]: statusMessage,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]: _serialize(output),
    ..._flattenAndSerializeMetadata(metadata, "observation"),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v != null),
  );
}

function _serialize(obj: unknown): string | undefined {
  try {
    return obj != null ? JSON.stringify(obj) : undefined;
  } catch {
    return "<failed to serialize>";
  }
}

function _flattenAndSerializeMetadata(
  metadata: unknown,
  type: "observation" | "trace",
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
      const serialized = typeof value === "string" ? value : _serialize(value);
      if (serialized) {
        metadataAttributes[`${prefix}.${key}`] = serialized;
      }
    }
  }

  return metadataAttributes;
}
