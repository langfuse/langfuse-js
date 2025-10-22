/**
 * Attribute propagation utilities for Langfuse OpenTelemetry integration.
 *
 * This module provides the `propagateAttributes` function for setting trace-level
 * attributes (userId, sessionId, metadata) that automatically propagate to all child spans
 * within the context.
 */

import {
  context as otelContext,
  trace as otelTrace,
  propagation,
  Context,
  createContextKey,
} from "@opentelemetry/api";

import { LangfuseOtelSpanAttributes } from "./constants.js";
import { getGlobalLogger } from "./logger/index.js";

export type PropagatedKey = "userId" | "sessionId" | "metadata";

export const LangfuseOtelContextKeys: Record<PropagatedKey, symbol> = {
  userId: createContextKey("langfuse_user_id"),
  sessionId: createContextKey("langfuse_session_id"),
  metadata: createContextKey("langfuse_metadata"),
};

/**
 * Parameters for propagateAttributes function.
 *
 * @public
 */
export interface PropagateAttributesParams {
  /**
   * User identifier to associate with all spans in this context.
   * Must be a string ≤200 characters. Use this to track which user
   * generated each trace and enable e.g. per-user cost/performance analysis.
   */
  userId?: string;

  /**
   * Session identifier to associate with all spans in this context.
   * Must be a string ≤200 characters. Use this to group related traces
   * within a user session (e.g., a conversation thread, multi-turn interaction).
   */
  sessionId?: string;

  /**
   * Additional key-value metadata to propagate to all spans.
   * - Keys and values must be strings
   * - All values must be ≤200 characters
   * - Use for dimensions like internal correlating identifiers
   * - AVOID: large payloads, sensitive data, non-string values (will be dropped with warning)
   */
  metadata?: Record<string, string>;

  /**
   * If true, propagates attributes using OpenTelemetry baggage for
   * cross-process/service propagation.
   *
   * **Security warning**: When enabled, attribute values are added to HTTP headers
   * on ALL outbound requests. Only enable if values are safe to transmit via HTTP
   * headers and you need cross-service tracing.
   *
   * @defaultValue false
   */
  asBaggage?: boolean;
}

/**
 * Propagate trace-level attributes to all spans created within this context.
 *
 * This function sets attributes on the currently active span AND automatically
 * propagates them to all new child spans created within the callback. This is the
 * recommended way to set trace-level attributes like userId, sessionId, and metadata
 * dimensions that should be consistently applied across all observations in a trace.
 *
 * **IMPORTANT**: Call this as early as possible within your trace/workflow. Only the
 * currently active span and spans created after entering this context will have these
 * attributes. Pre-existing spans will NOT be retroactively updated.
 *
 * **Why this matters**: Langfuse aggregation queries (e.g., total cost by userId,
 * filtering by sessionId) only include observations that have the attribute set.
 * If you call `propagateAttributes` late in your workflow, earlier spans won't be
 * included in aggregations for that attribute.
 *
 * @param params - Configuration for attributes to propagate
 * @param fn - Callback function (sync or async) within which attributes are propagated
 * @returns The result of the callback function
 *
 * @example
 * Basic usage with user and session tracking:
 *
 * ```typescript
 * import { startActiveObservation, propagateAttributes } from '@langfuse/tracing';
 *
 * // Set attributes early in the trace
 * await startActiveObservation('user_workflow', async (span) => {
 *   await propagateAttributes({
 *     userId: 'user_123',
 *     sessionId: 'session_abc',
 *     metadata: { experiment: 'variant_a', environment: 'production' }
 *   }, async () => {
 *     // All spans created here will have userId, sessionId, and metadata
 *     const llmSpan = startObservation('llm_call', { input: 'Hello' });
 *     // This span inherits: userId, sessionId, experiment, environment
 *     llmSpan.end();
 *
 *     const gen = startObservation('completion', {}, { asType: 'generation' });
 *     // This span also inherits all attributes
 *     gen.end();
 *   });
 * });
 * ```
 *
 * @example
 * Late propagation (anti-pattern):
 *
 * ```typescript
 * await startActiveObservation('workflow', async (span) => {
 *   // These spans WON'T have userId
 *   const earlySpan = startObservation('early_work', { input: 'data' });
 *   earlySpan.end();
 *
 *   // Set attributes in the middle
 *   await propagateAttributes({ userId: 'user_123' }, async () => {
 *     // Only spans created AFTER this point will have userId
 *     const lateSpan = startObservation('late_work', { input: 'more' });
 *     lateSpan.end();
 *   });
 *
 *   // Result: Aggregations by userId will miss "early_work" span
 * });
 * ```
 *
 * @example
 * Cross-service propagation with baggage (advanced):
 *
 * ```typescript
 * import fetch from 'node-fetch';
 *
 * // Service A - originating service
 * await startActiveObservation('api_request', async () => {
 *   await propagateAttributes({
 *     userId: 'user_123',
 *     sessionId: 'session_abc',
 *     asBaggage: true  // Propagate via HTTP headers
 *   }, async () => {
 *     // Make HTTP request to Service B
 *     const response = await fetch('https://service-b.example.com/api');
 *     // userId and sessionId are now in HTTP headers
 *   });
 * });
 *
 * // Service B - downstream service
 * // OpenTelemetry will automatically extract baggage from HTTP headers
 * // and propagate to spans in Service B
 * ```
 *
 * @remarks
 * - **Nesting**: Nesting `propagateAttributes` contexts is possible but
 *   discouraged. Inner contexts will overwrite outer values for the same keys.
 * - **Migration**: This replaces the deprecated `updateTrace()` method, which only
 *   sets attributes on a single span (causing aggregation gaps). Always use
 *   `propagateAttributes` for new code.
 * - **Validation**: All attribute values (userId, sessionId, metadata values)
 *   must be strings ≤200 characters. Invalid values will be dropped with a
 *   warning logged. Ensure values meet constraints before calling.
 * - **OpenTelemetry**: This uses OpenTelemetry context propagation under the hood,
 *   making it compatible with other OTel-instrumented libraries.
 * - **Baggage Security**: When `asBaggage=true`, attribute values are added to HTTP
 *   headers on outbound requests. Only use for non-sensitive values and when you
 *   need cross-service tracing.
 *
 * @public
 */
export function propagateAttributes<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(params: PropagateAttributesParams, fn: F): ReturnType<F> {
  let context = otelContext.active();

  const span = otelTrace.getActiveSpan();
  const asBaggage = params.asBaggage ?? false;

  const { userId, sessionId, metadata } = params;

  // Validate and set userId
  if (userId) {
    if (isValidPropagatedString({ value: userId, attributeName: "userId" })) {
      context = setPropagatedAttribute({
        key: "userId",
        value: userId,
        context,
        span,
        asBaggage,
      });
    }
  }

  // Validate and set sessionId
  if (sessionId) {
    if (
      isValidPropagatedString({
        value: sessionId,
        attributeName: "sessionId",
      })
    ) {
      context = setPropagatedAttribute({
        key: "sessionId",
        value: sessionId,
        context,
        span,
        asBaggage,
      });
    }
  }

  // Validate and set metadata
  if (metadata) {
    // Filter metadata to only include valid string values
    const validatedMetadata: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (
        isValidPropagatedString({
          value: value,
          attributeName: `metadata.${key}`,
        })
      ) {
        validatedMetadata[key] = value;
      }
    }

    if (Object.keys(validatedMetadata).length > 0) {
      context = setPropagatedAttribute({
        key: "metadata",
        value: validatedMetadata,
        context,
        span,
        asBaggage,
      });
    }
  }

  // Execute callback in the new context
  return otelContext.with(context, fn);
}

export function getPropagatedAttributesFromContext(
  context: Context,
): Record<string, string> {
  const propagatedAttributes: Record<string, string> = {};

  // Handle baggage
  const baggage = propagation.getBaggage(context);

  if (baggage) {
    baggage.getAllEntries().forEach(([baggageKey, baggageEntry]) => {
      if (baggageKey.startsWith(LANGFUSE_BAGGAGE_PREFIX)) {
        const spanKey = getSpanKeyFromBaggageKey(baggageKey);

        if (spanKey) {
          propagatedAttributes[spanKey] = baggageEntry.value;
        }
      }
    });
  }

  // Handle OTEL context values
  const userId = context.getValue(LangfuseOtelContextKeys["userId"]);
  if (userId && typeof userId === "string") {
    const spanKey = getSpanKeyForPropagatedKey("userId");

    propagatedAttributes[spanKey] = userId;
  }

  const sessionId = context.getValue(LangfuseOtelContextKeys["sessionId"]);
  if (sessionId && typeof sessionId === "string") {
    const spanKey = getSpanKeyForPropagatedKey("sessionId");

    propagatedAttributes[spanKey] = sessionId;
  }

  const metadata = context.getValue(LangfuseOtelContextKeys["metadata"]);
  if (metadata && typeof metadata === "object" && metadata !== null) {
    for (const [k, v] of Object.entries(metadata)) {
      const spanKey = `${LangfuseOtelSpanAttributes.TRACE_METADATA}.${k}`;

      propagatedAttributes[spanKey] = String(v);
    }
  }

  return propagatedAttributes;
}

type SetPropagatedAttributeParams = {
  context: Context;
  span: ReturnType<typeof otelTrace.getActiveSpan>;
  asBaggage: boolean;
} & (
  | {
      key: "userId" | "sessionId";
      value: string;
    }
  | {
      key: "metadata";
      value: Record<string, string>;
    }
);

function setPropagatedAttribute(params: SetPropagatedAttributeParams): Context {
  const { key, value, span, asBaggage } = params;
  let context = params.context;

  // Get the context key for this attribute
  const contextKey = getContextKeyForPropagatedKey(key);

  // Set in context
  context = context.setValue(contextKey, value);

  // Set on current span
  if (span && span.isRecording()) {
    if (key === "metadata") {
      for (const [k, v] of Object.entries(value)) {
        span.setAttribute(
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.${k}`,
          v,
        );
      }
    } else {
      const spanKey = getSpanKeyForPropagatedKey(key);
      span.setAttribute(spanKey, value);
    }
  }

  // Set on baggage
  if (asBaggage) {
    const baggageKey = getBaggageKeyForPropagatedKey(key);
    let baggage =
      propagation.getBaggage(context) || propagation.createBaggage();

    if (key === "metadata") {
      for (const [k, v] of Object.entries(value)) {
        baggage = baggage.setEntry(`${baggageKey}_${k}`, { value: v });
      }
    } else {
      baggage = baggage.setEntry(baggageKey, { value });
    }

    context = propagation.setBaggage(context, baggage);
  }

  return context;
}

function isValidPropagatedString(params: {
  value: string;
  attributeName: string;
}): boolean {
  const logger = getGlobalLogger();
  const { value, attributeName } = params;

  if (typeof value !== "string") {
    logger.warn(
      `Propagated attribute '${attributeName}' must be a string. Dropping value.`,
    );
    return false;
  }

  if (value.length > 200) {
    logger.warn(
      `Propagated attribute '${attributeName}' value is over 200 characters (${value.length} chars). Dropping value.`,
    );

    return false;
  }

  return true;
}

function getContextKeyForPropagatedKey(key: PropagatedKey): symbol {
  return LangfuseOtelContextKeys[key];
}

function getSpanKeyForPropagatedKey(key: PropagatedKey): string {
  switch (key) {
    case "userId":
      return LangfuseOtelSpanAttributes.TRACE_USER_ID;
    case "sessionId":
      return LangfuseOtelSpanAttributes.TRACE_SESSION_ID;
    case "metadata":
      return LangfuseOtelSpanAttributes.TRACE_METADATA;
  }
}

const LANGFUSE_BAGGAGE_PREFIX = "langfuse_";

function getBaggageKeyForPropagatedKey(key: PropagatedKey): string {
  // baggage keys must be snake case for correct cross service propagation
  // second service might run Python SDK that is expecting snake case keys
  switch (key) {
    case "userId":
      return `${LANGFUSE_BAGGAGE_PREFIX}user_id`;
    case "sessionId":
      return `${LANGFUSE_BAGGAGE_PREFIX}session_id`;
    case "metadata":
      return `${LANGFUSE_BAGGAGE_PREFIX}metadata`;
    default: {
      const fallback: never = key;

      throw Error("Unhandled propagated key", fallback);
    }
  }
}

function getSpanKeyFromBaggageKey(baggageKey: string): string | undefined {
  if (!baggageKey.startsWith(LANGFUSE_BAGGAGE_PREFIX)) return;

  const suffix = baggageKey.slice(LANGFUSE_BAGGAGE_PREFIX.length);

  if (suffix === "user_id") {
    return LangfuseOtelSpanAttributes.TRACE_USER_ID;
  }

  if (suffix === "session_id") {
    return LangfuseOtelSpanAttributes.TRACE_SESSION_ID;
  }

  // Metadata keys have format: langfuse_metadata_{key_name}
  if (suffix.startsWith("metadata_")) {
    const metadataKey = suffix.slice("metadata_".length);

    return `${LangfuseOtelSpanAttributes.TRACE_METADATA}.${metadataKey}`;
  }

  return;
}
