import {
  joinObservationMetadataEntries,
  LangfuseOtelSpanAttributes,
  serializeObservationMetadata,
  serializeObservationMetadataEntries,
} from "@langfuse/core";
import { type Attributes, type Span } from "@opentelemetry/api";

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
export function createTraceAttributes({
  input,
  output,
}: LangfuseTraceAttributes = {}): Attributes {
  const attributes = {
    [LangfuseOtelSpanAttributes.TRACE_INPUT]: _serialize(input),
    [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: _serialize(output),
  };

  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v != null),
  );
}

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
    [LangfuseOtelSpanAttributes.OBSERVATION_METADATA]:
      serializeObservationMetadata(metadata),
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
function _serialize(obj: unknown): string | undefined {
  try {
    if (typeof obj === "string") return obj;

    return obj != null ? JSON.stringify(obj) : undefined;
  } catch {
    return "<failed to serialize>";
  }
}

/**
 * Serialized metadata fragments already written to each span, keyed by
 * metadata key. Kept so that repeated updates merge into a single
 * `langfuse.observation.metadata` attribute instead of overwriting it, while
 * only serializing the keys of each update.
 *
 * Stored on `globalThis` so that the ESM and CJS builds share it when both are
 * loaded in one process.
 */
const SPAN_METADATA_KEY = Symbol.for("langfuse.tracing.spanMetadata");
const spanMetadata: WeakMap<Span, Map<string, string>> = ((
  globalThis as Record<symbol, unknown>
)[SPAN_METADATA_KEY] ??= new WeakMap()) as WeakMap<Span, Map<string, string>>;

/**
 * Reads metadata that was written to the span without going through
 * {@link setObservationAttributes}, e.g. by `@langfuse/vercel-ai-sdk`, so it
 * is merged instead of overwritten.
 */
function readSpanMetadata(span: Span): Map<string, string> | undefined {
  // SDK spans expose their attributes, API-only spans don't
  const value = (span as Partial<{ attributes: Attributes }>).attributes?.[
    LangfuseOtelSpanAttributes.OBSERVATION_METADATA
  ];

  if (typeof value !== "string") return undefined;

  try {
    const parsed: unknown = JSON.parse(value);

    return isPlainObject(parsed)
      ? serializeObservationMetadataEntries(parsed)
      : undefined;
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Sets observation attributes on a span, merging metadata with metadata from
 * earlier updates on the same span.
 *
 * Top-level metadata keys from this update overwrite earlier values. Keys
 * with `null`, `undefined`, function or symbol values leave earlier values
 * untouched. New keys beyond the maximum number of keys are dropped with a
 * warning.
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
  const { metadata, ...rest } = attributes;
  const otelAttributes = createObservationAttributes(type, rest);

  if (options?.omitType) {
    delete otelAttributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE];
  }

  let serializedMetadata: string | undefined;

  if (isPlainObject(metadata)) {
    // Only the keys of this update are serialized. The cached fragments are
    // strings, so later changes to the caller's object don't leak into
    // future updates.
    const entries = serializeObservationMetadataEntries(
      metadata,
      spanMetadata.get(span) ?? readSpanMetadata(span),
    );

    spanMetadata.set(span, entries);
    serializedMetadata = joinObservationMetadataEntries(entries);
  } else if (metadata != null) {
    spanMetadata.delete(span);
    serializedMetadata = serializeObservationMetadata(metadata);
  }

  if (serializedMetadata !== undefined) {
    otelAttributes[LangfuseOtelSpanAttributes.OBSERVATION_METADATA] =
      serializedMetadata;
  }

  span.setAttributes(otelAttributes);
}
