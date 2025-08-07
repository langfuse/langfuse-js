import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { type Attributes } from "@opentelemetry/api";

import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

/**
 * Creates OpenTelemetry attributes from Langfuse trace attributes.
 *
 * Converts user-friendly trace attributes into the internal OpenTelemetry
 * attribute format required by the span processor.
 *
 * @param attributes - Langfuse trace attributes to convert
 * @returns OpenTelemetry attributes object with non-null values
 *
 * @example
 * ```typescript
 * import { createTraceAttributes } from '@langfuse/tracing';
 *
 * const otelAttributes = createTraceAttributes({
 *   name: 'user-checkout-flow',
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   tags: ['checkout', 'payment'],
 *   metadata: { version: '2.1.0' }
 * });
 *
 * span.setAttributes(otelAttributes);
 * ```
 *
 * @public
 */
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

/**
 * Creates OpenTelemetry attributes from Langfuse span attributes.
 *
 * Converts user-friendly span attributes into the internal OpenTelemetry
 * attribute format required by the span processor.
 *
 * @param attributes - Langfuse span attributes to convert
 * @returns OpenTelemetry attributes object with non-null values
 *
 * @example
 * ```typescript
 * import { createSpanAttributes } from '@langfuse/tracing';
 *
 * const otelAttributes = createSpanAttributes({
 *   input: { query: 'SELECT * FROM users' },
 *   output: { rowCount: 42 },
 *   level: 'DEFAULT',
 *   metadata: { database: 'prod' }
 * });
 *
 * span.setAttributes(otelAttributes);
 * ```
 *
 * @public
 */
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

/**
 * Creates OpenTelemetry attributes from Langfuse generation attributes.
 *
 * Converts user-friendly generation attributes into the internal OpenTelemetry
 * attribute format required by the span processor. Includes special handling
 * for LLM-specific fields like model parameters, usage, and costs.
 *
 * @param attributes - Langfuse generation attributes to convert
 * @returns OpenTelemetry attributes object with non-null values
 *
 * @example
 * ```typescript
 * import { createGenerationAttributes } from '@langfuse/tracing';
 *
 * const otelAttributes = createGenerationAttributes({
 *   input: [{ role: 'user', content: 'Hello!' }],
 *   output: { role: 'assistant', content: 'Hi there!' },
 *   model: 'gpt-4',
 *   modelParameters: { temperature: 0.7 },
 *   usageDetails: {
 *     promptTokens: 10,
 *     completionTokens: 15,
 *     totalTokens: 25
 *   },
 *   costDetails: { totalCost: 0.001 }
 * });
 *
 * span.setAttributes(otelAttributes);
 * ```
 *
 * @public
 */
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

/**
 * Creates OpenTelemetry attributes from Langfuse event attributes.
 *
 * Converts user-friendly event attributes into the internal OpenTelemetry
 * attribute format required by the span processor. Events are point-in-time
 * observations that are automatically ended when created.
 *
 * @param attributes - Langfuse event attributes to convert
 * @returns OpenTelemetry attributes object with non-null values
 *
 * @example
 * ```typescript
 * import { createEventAttributes } from '@langfuse/tracing';
 *
 * const otelAttributes = createEventAttributes({
 *   input: { action: 'button_click', elementId: 'submit' },
 *   level: 'DEFAULT',
 *   metadata: { page: '/checkout', userId: '123' }
 * });
 *
 * span.setAttributes(otelAttributes);
 * ```
 *
 * @public
 */
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

/**
 * Safely serializes an object to JSON string.
 *
 * @param obj - Object to serialize
 * @returns JSON string or undefined if null/undefined, error message if serialization fails
 * @internal
 */
function _serialize(obj: unknown): string | undefined {
  try {
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
