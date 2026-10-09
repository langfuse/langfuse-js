import {
  dropMetadataOverSpanAttributeLimit,
  getGlobalLogger,
  LangfuseOtelSpanAttributes,
  serializeMetadataValue,
} from "@langfuse/core";
import { type Attributes, type Span } from "@opentelemetry/api";

import {
  LangfuseObservationAttributes,
  LangfuseObservationType,
} from "./types.js";

export function createObservationAttributes(
  type: LangfuseObservationType,
  attributes: LangfuseObservationAttributes,
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
    Object.entries(otelAttributes).filter(([_, v]) => v != null),
  );
}

/**
 * Attributes the SDK may write in later updates of an observation. Metadata
 * leaves room for them, because OpenTelemetry drops new attributes once a span
 * reaches its attribute count limit.
 */
const RESERVED_OBSERVATION_ATTRIBUTE_KEYS: readonly string[] = [
  LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
  LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
  LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
  LangfuseOtelSpanAttributes.VERSION,
  LangfuseOtelSpanAttributes.ENVIRONMENT,
  LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
  LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
];

/**
 * Reserved attributes that only generation-like observations can write.
 */
const RESERVED_GENERATION_ATTRIBUTE_KEYS: readonly string[] = [
  ...RESERVED_OBSERVATION_ATTRIBUTE_KEYS,
  LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
  LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
  LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
  LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME,
  LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
  LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME,
  LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION,
];

/**
 * Sets observation attributes on a span.
 *
 * New metadata keys that would exceed the span's attribute count limit are
 * dropped with a warning. The limit counts all attributes already on the span
 * and keeps room for the observation attributes written in later updates, such
 * as the output. Overwrites of keys already on the span are always kept.
 *
 * @param span - Span to update
 * @param type - Observation type
 * @param attributes - Observation attributes to set
 * @param options - Set `omitType` to leave the observation type attribute unchanged
 * @internal
 */
export function setObservationAttributes(
  span: Span,
  type: LangfuseObservationType,
  attributes: LangfuseObservationAttributes,
  options?: { omitType?: boolean },
): void {
  const otelAttributes = createObservationAttributes(type, attributes);

  if (options?.omitType) {
    delete otelAttributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE];
  }

  // With `omitType` the span's actual type is unknown, so it may still be a
  // generation that writes model or usage attributes later.
  const reservedKeys =
    options?.omitType || type === "generation" || type === "embedding"
      ? RESERVED_GENERATION_ATTRIBUTE_KEYS
      : RESERVED_OBSERVATION_ATTRIBUTE_KEYS;

  span.setAttributes(
    dropMetadataOverSpanAttributeLimit(span, otelAttributes, reservedKeys),
  );
}

/**
 * Safely serializes an object to JSON string.
 *
 * @param obj - Object to serialize
 * @returns JSON string or undefined if null/undefined, error message if serialization fails
 * @internal
 */
function _serialize(obj: unknown): string | undefined {
  try {
    if (typeof obj === "string") return obj;

    return obj != null ? JSON.stringify(obj) : undefined;
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
    const serialized = serializeMetadataValue(metadata);
    if (serialized !== undefined) {
      metadataAttributes[prefix] = serialized;
    } else {
      getGlobalLogger().debug(
        "Observation metadata was not written because its value is not JSON-serializable",
      );
    }
  } else {
    for (const [key, value] of Object.entries(metadata)) {
      const serialized = serializeMetadataValue(value);
      if (serialized !== undefined) {
        metadataAttributes[`${prefix}.${key}`] = serialized;
      } else {
        getGlobalLogger().debug(
          `Observation metadata key "${key}" was not written because its value is ${value == null ? String(value) : "not JSON-serializable"}`,
        );
      }
    }
  }

  return metadataAttributes;
}
