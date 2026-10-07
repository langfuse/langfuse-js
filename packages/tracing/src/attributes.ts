import {
  isWrittenMetadataValue,
  LangfuseOtelSpanAttributes,
  serializeObservationMetadata,
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
 * Metadata already written to each span. Kept so that repeated updates merge
 * into a single `langfuse.observation.metadata` attribute instead of
 * overwriting it.
 *
 * Stored on `globalThis` so that the ESM and CJS builds share it when both are
 * loaded in one process.
 */
const SPAN_METADATA_KEY = Symbol.for("langfuse.tracing.spanMetadata");
const spanMetadata: WeakMap<Span, Record<string, unknown>> = ((
  globalThis as Record<symbol, unknown>
)[SPAN_METADATA_KEY] ??= new WeakMap()) as WeakMap<
  Span,
  Record<string, unknown>
>;

/**
 * Reads metadata that was written to the span without going through
 * {@link setObservationAttributes}, e.g. by `@langfuse/vercel-ai-sdk`, so it
 * is merged instead of overwritten.
 */
function readSpanMetadata(span: Span): Record<string, unknown> | undefined {
  // SDK spans expose their attributes, API-only spans don't
  const value = (span as Partial<{ attributes: Attributes }>).attributes?.[
    LangfuseOtelSpanAttributes.OBSERVATION_METADATA
  ];

  if (typeof value !== "string") return undefined;

  try {
    const parsed: unknown = JSON.parse(value);

    return isPlainObject(parsed) ? parsed : undefined;
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
 * untouched.
 *
 * @param span - Span to update
 * @param type - Observation type
 * @param attributes - Observation attributes to set
 * @param options - Set `omitType` to leave the observation type attribute unchanged
 * @throws Error if the merged metadata exceeds the maximum number of keys
 * @internal
 */
export function setObservationAttributes(
  span: Span,
  type: LangfuseObservationType,
  attributes: LangfuseObservationAttributes,
  options?: { omitType?: boolean },
): void {
  let metadata: unknown = attributes.metadata;
  const previous = spanMetadata.get(span) ?? readSpanMetadata(span);

  if (previous && isPlainObject(metadata)) {
    metadata = {
      ...previous,
      ...Object.fromEntries(
        Object.entries(metadata).filter(([_, v]) => isWrittenMetadataValue(v)),
      ),
    };
  }

  // Throws before any state changes if the merged metadata is too large
  const otelAttributes = createObservationAttributes(type, {
    ...attributes,
    metadata: metadata as LangfuseObservationAttributes["metadata"],
  });

  if (options?.omitType) {
    delete otelAttributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE];
  }

  if (isPlainObject(metadata)) {
    // Keep a parsed copy of what was written, not the caller's object, so
    // later changes to that object don't leak into future updates
    const serialized =
      otelAttributes[LangfuseOtelSpanAttributes.OBSERVATION_METADATA];

    spanMetadata.set(
      span,
      typeof serialized === "string" ? JSON.parse(serialized) : {},
    );
  } else if (metadata != null) {
    spanMetadata.delete(span);
  }

  span.setAttributes(otelAttributes);
}
