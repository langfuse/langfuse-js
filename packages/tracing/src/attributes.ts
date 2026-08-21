import {
  LangfuseOtelSpanAttributes,
  serializeWithMediaReferences,
} from "@langfuse/core";
import { type Attributes } from "@opentelemetry/api";

import {
  LangfuseObservationAttributes,
  LangfuseObservationType,
  LangfuseTraceAttributes,
} from "./types.js";

/**
 * Creates OpenTelemetry attributes from Langfuse trace IO attributes.
 *
 * Converts trace input/output into the internal OpenTelemetry
 * attribute format required by the span processor.
 *
 * @param attributes - Langfuse trace IO attributes to convert
 * @returns OpenTelemetry attributes object with non-null values
 *
 * @deprecated This is for backward compatibility with legacy platform features
 * that still rely on trace-level input/output. Use propagateAttributes for other trace attributes.
 *
 * @internal
 */
export function createTraceAttributes(
  { input, output }: LangfuseTraceAttributes = {},
  options: { referenceOwner?: object } = {},
): Attributes {
  const attributes = {
    [LangfuseOtelSpanAttributes.TRACE_INPUT]: _serialize(
      input,
      options.referenceOwner,
    ),
    [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: _serialize(
      output,
      options.referenceOwner,
    ),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v != null),
  );
}

export function createObservationAttributes(
  type: LangfuseObservationType,
  attributes: LangfuseObservationAttributes,
  options: { referenceOwner?: object } = {},
): Attributes {
  const {
    metadata,
    input,
    output,
    level,
    statusMessage,
    version,
    environment,
    completionStartTime,
    model,
    modelParameters,
    usageDetails,
    costDetails,
    prompt,
  } = attributes;

  let otelAttributes: Attributes = {
    [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: type,
    [LangfuseOtelSpanAttributes.OBSERVATION_LEVEL]: level,
    [LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE]: statusMessage,
    [LangfuseOtelSpanAttributes.VERSION]: version,
    [LangfuseOtelSpanAttributes.ENVIRONMENT]: environment,
    [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: _serialize(
      input,
      options.referenceOwner,
    ),
    [LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]: _serialize(
      output,
      options.referenceOwner,
    ),
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL]: model,
    [LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS]: _serialize(
      usageDetails,
      options.referenceOwner,
    ),
    [LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS]: _serialize(
      costDetails,
      options.referenceOwner,
    ),
    [LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME]: _serialize(
      completionStartTime,
      options.referenceOwner,
    ),
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS]: _serialize(
      modelParameters,
      options.referenceOwner,
    ),
    ...(prompt && !prompt.isFallback
      ? {
          [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]: prompt.name,
          [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]:
            prompt.version,
        }
      : {}),
    ..._flattenAndSerializeMetadata(
      metadata,
      "observation",
      options.referenceOwner,
    ),
  };

  return Object.fromEntries(
    Object.entries(otelAttributes).filter(([_, v]) => v != null),
  );
}

/**
 * Safely serializes an object to JSON string.
 *
 * @param obj - Object to serialize
 * @returns JSON string or undefined if null/undefined, error message if serialization fails
 * @internal
 */
function _serialize(obj: unknown, referenceOwner?: object): string | undefined {
  try {
    if (typeof obj === "string") return obj;

    return obj != null
      ? serializeWithMediaReferences(obj, { referenceOwner })
      : undefined;
  } catch {
    return "<failed to serialize>";
  }
}

/**
 * Flattens and serializes metadata into OpenTelemetry attribute format.
 *
 * Converts nested metadata objects into dot-notation attribute keys.
 * For example, `{ database: { host: 'localhost' } }` becomes
 * `{ 'langfuse.metadata.database.host': 'localhost' }`.
 *
 * @param metadata - Metadata object to flatten
 * @param type - Whether this is for observation or trace metadata
 * @returns Flattened metadata attributes
 * @internal
 */
function _flattenAndSerializeMetadata(
  metadata: unknown,
  type: "observation" | "trace",
  referenceOwner?: object,
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
    const serialized = _serialize(metadata, referenceOwner);
    if (serialized) {
      metadataAttributes[prefix] = serialized;
    }
  } else {
    for (const [key, value] of Object.entries(metadata)) {
      const serialized =
        typeof value === "string" ? value : _serialize(value, referenceOwner);
      if (serialized) {
        metadataAttributes[`${prefix}.${key}`] = serialized;
      }
    }
  }

  return metadataAttributes;
}
