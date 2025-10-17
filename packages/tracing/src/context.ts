/**
 * Context propagation utilities for Langfuse tracing.
 *
 * This module provides functions for automatic propagation of trace attributes
 * (userId, sessionId, metadata) from parent contexts to child spans using
 * OpenTelemetry's context and baggage mechanisms.
 *
 * @module context
 */

import {
  LANGFUSE_CTX_USER_ID,
  LANGFUSE_CTX_SESSION_ID,
  LANGFUSE_CTX_METADATA,
  LangfuseOtelSpanAttributes,
} from "@langfuse/core";
import { context, propagation, trace } from "@opentelemetry/api";

/**
 * Options for context propagation functions.
 *
 * @public
 */
export interface ContextPropagationOptions {
  /**
   * If true, stores the context value in OpenTelemetry baggage for cross-service propagation.
   * When enabled, the value will be included in HTTP headers of outbound requests.
   *
   * **Security Warning**: Only use this for non-sensitive identifiers that are safe to
   * transmit across service boundaries. Baggage values are transmitted in HTTP headers
   * and may be visible to intermediaries.
   *
   * @defaultValue false
   */
  asBaggage?: boolean;
}

/**
 * Executes a callback within a user context, propagating userId to all child spans.
 *
 * All observations created within the callback (and any nested callbacks) will
 * automatically inherit the specified userId. This provides a cleaner alternative
 * to manually setting userId on each span.
 *
 * ## Context Scoping
 * - Context is scoped to the callback execution
 * - Nested `withUser()` calls will override the userId for their scope
 * - Context is automatically cleaned up when the callback completes
 * - Works correctly with async/await and Promise chains
 *
 * ## Cross-Service Propagation
 * Set `asBaggage: true` to propagate the userId across service boundaries via HTTP headers.
 * Only use this for non-sensitive user identifiers.
 *
 * @param userId - The user identifier to propagate to child spans
 * @param fn - Callback function to execute within the user context
 * @param options - Optional configuration for baggage propagation
 * @returns The return value of the callback function
 *
 * @example
 * ```typescript
 * import { withUser, startObservation } from '@langfuse/tracing';
 *
 * // All spans created within this block will have userId='user-123'
 * withUser('user-123', () => {
 *   const span = startObservation('operation');
 *   const child = span.startObservation('child-operation');
 *   child.end();
 *   span.end();
 * });
 *
 * // Async usage
 * await withUser('user-123', async () => {
 *   const result = await someAsyncOperation();
 *   return result;
 * });
 *
 * // Cross-service propagation (use with caution)
 * withUser('public-user-id', () => {
 *   // userId will be propagated in HTTP headers
 *   fetch('https://api.example.com/data');
 * }, { asBaggage: true });
 * ```
 *
 * @public
 */
export function withUser<T>(
  userId: string,
  fn: () => T,
  options?: ContextPropagationOptions,
): T {
  let newContext = context.active().setValue(LANGFUSE_CTX_USER_ID, userId);

  // Set attribute on currently active span if exists
  const currentSpan = trace.getActiveSpan();
  if (currentSpan?.isRecording()) {
    currentSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId);
  }

  // Optionally set baggage for cross-service propagation
  if (options?.asBaggage) {
    const bag =
      propagation.getBaggage(newContext) || propagation.createBaggage();
    const updatedBag = bag.setEntry(LangfuseOtelSpanAttributes.TRACE_USER_ID, {
      value: userId,
    });
    newContext = propagation.setBaggage(newContext, updatedBag);
  }

  return context.with(newContext, fn);
}

/**
 * Executes a callback within a session context, propagating sessionId to all child spans.
 *
 * All observations created within the callback (and any nested callbacks) will
 * automatically inherit the specified sessionId. This provides a cleaner alternative
 * to manually setting sessionId on each span.
 *
 * ## Context Scoping
 * - Context is scoped to the callback execution
 * - Nested `withSession()` calls will override the sessionId for their scope
 * - Context is automatically cleaned up when the callback completes
 * - Works correctly with async/await and Promise chains
 *
 * ## Cross-Service Propagation
 * Set `asBaggage: true` to propagate the sessionId across service boundaries via HTTP headers.
 * Only use this for non-sensitive session identifiers.
 *
 * @param sessionId - The session identifier to propagate to child spans
 * @param fn - Callback function to execute within the session context
 * @param options - Optional configuration for baggage propagation
 * @returns The return value of the callback function
 *
 * @example
 * ```typescript
 * import { withSession, startObservation } from '@langfuse/tracing';
 *
 * // All spans created within this block will have sessionId='session-456'
 * withSession('session-456', () => {
 *   const span = startObservation('operation');
 *   const child = span.startObservation('child-operation');
 *   child.end();
 *   span.end();
 * });
 *
 * // Async usage
 * await withSession('session-456', async () => {
 *   const result = await someAsyncOperation();
 *   return result;
 * });
 *
 * // Cross-service propagation
 * withSession('public-session-id', () => {
 *   fetch('https://api.example.com/data');
 * }, { asBaggage: true });
 * ```
 *
 * @public
 */
export function withSession<T>(
  sessionId: string,
  fn: () => T,
  options?: ContextPropagationOptions,
): T {
  let newContext = context
    .active()
    .setValue(LANGFUSE_CTX_SESSION_ID, sessionId);

  // Set attribute on currently active span if exists
  const currentSpan = trace.getActiveSpan();
  if (currentSpan?.isRecording()) {
    currentSpan.setAttribute(
      LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
      sessionId,
    );
  }

  // Optionally set baggage for cross-service propagation
  if (options?.asBaggage) {
    const bag =
      propagation.getBaggage(newContext) || propagation.createBaggage();
    const updatedBag = bag.setEntry(
      LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
      { value: sessionId },
    );
    newContext = propagation.setBaggage(newContext, updatedBag);
  }

  return context.with(newContext, fn);
}

/**
 * Executes a callback within a metadata context, propagating metadata to all child spans.
 *
 * All observations created within the callback (and any nested callbacks) will
 * automatically inherit the specified metadata. Metadata keys are stored as individual
 * attributes with the `langfuse.metadata.` prefix.
 * Try to keep metadata keys and values small to avoid a performance drag within your application.
 *
 * ## Context Scoping
 * - Context is scoped to the callback execution
 * - Nested `withMetadata()` calls will replace metadata for their scope (not merge)
 * - Context is automatically cleaned up when the callback completes
 * - Works correctly with async/await and Promise chains
 *
 * ## Cross-Service Propagation
 * Set `asBaggage: true` to propagate metadata across service boundaries via HTTP headers.
 * Only use this for non-sensitive metadata.
 *
 * @param metadata - Key-value pairs of metadata to propagate to child spans
 * @param fn - Callback function to execute within the metadata context
 * @param options - Optional configuration for baggage propagation
 * @returns The return value of the callback function
 *
 * @example
 * ```typescript
 * import { withMetadata, startObservation } from '@langfuse/tracing';
 *
 * // All spans will have these metadata attributes
 * withMetadata({ experiment: 'A', version: '1.0' }, () => {
 *   const span = startObservation('operation');
 *   // span will have metadata.experiment='A', metadata.version='1.0'
 *   span.end();
 * });
 *
 * // Async usage
 * await withMetadata({ feature: 'new-ui', region: 'us-east' }, async () => {
 *   const result = await someAsyncOperation();
 *   return result;
 * });
 *
 * // Nested contexts (inner overrides outer)
 * withMetadata({ env: 'prod' }, () => {
 *   withMetadata({ env: 'staging' }, () => {
 *     // This scope has env='staging'
 *   });
 *   // This scope has env='prod'
 * });
 * ```
 *
 * @public
 */
export function withMetadata<T>(
  metadata: Record<string, unknown>,
  fn: () => T,
  options?: ContextPropagationOptions,
): T {
  if (!metadata || Object.keys(metadata).length === 0) {
    // No metadata to set, just execute the function
    return fn();
  }

  let newContext = context.active().setValue(LANGFUSE_CTX_METADATA, metadata);

  // Set attributes on currently active span if exists
  const currentSpan = trace.getActiveSpan();
  if (currentSpan?.isRecording()) {
    for (const [key, value] of Object.entries(metadata)) {
      const attrKey = `langfuse.metadata.${key}`;
      // Convert value to appropriate type for span attribute
      const attrValue =
        typeof value === "object" && value !== null && value !== undefined
          ? JSON.stringify(value)
          : value;
      currentSpan.setAttribute(attrKey, attrValue as string | number | boolean);
    }
  }

  // Optionally set baggage for cross-service propagation
  if (options?.asBaggage) {
    let bag = propagation.getBaggage(newContext) || propagation.createBaggage();
    for (const [key, value] of Object.entries(metadata)) {
      bag = bag.setEntry(`langfuse.metadata.${key}`, { value: String(value) });
    }
    newContext = propagation.setBaggage(newContext, bag);
  }

  return context.with(newContext, fn);
}

/**
 * Configuration for combined context propagation.
 *
 * @public
 */
export interface ContextConfig {
  /**
   * User identifier to propagate to child spans.
   */
  userId?: string;

  /**
   * Session identifier to propagate to child spans.
   */
  sessionId?: string;

  /**
   * Metadata key-value pairs to propagate to child spans.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Executes a callback with multiple context values set at once.
 *
 * This is a convenience function that combines `withUser()`, `withSession()`, and
 * `withMetadata()` into a single call. All observations created within the callback
 * will automatically inherit the specified context values.
 *
 * ## Context Scoping
 * - All context values are scoped to the callback execution
 * - Nested `withContext()` calls can override individual values
 * - Context is automatically cleaned up when the callback completes
 * - Works correctly with async/await and Promise chains
 *
 * ## Cross-Service Propagation
 * Set `asBaggage: true` to propagate all context values across service boundaries.
 * Only use this for non-sensitive identifiers.
 *
 * @param config - Configuration object with userId, sessionId, and/or metadata
 * @param fn - Callback function to execute within the context
 * @param options - Optional configuration for baggage propagation
 * @returns The return value of the callback function
 *
 * @example
 * ```typescript
 * import { withContext, startObservation } from '@langfuse/tracing';
 *
 * // Set all context values at once
 * withContext(
 *   {
 *     userId: 'user-123',
 *     sessionId: 'session-456',
 *     metadata: { experiment: 'A', version: '1.0' }
 *   },
 *   () => {
 *     const span = startObservation('operation');
 *     // span has userId, sessionId, and metadata
 *     span.end();
 *   }
 * );
 *
 * // Async usage
 * const result = await withContext(
 *   { userId: 'user-123', sessionId: 'session-456' },
 *   async () => {
 *     return await someAsyncOperation();
 *   }
 * );
 *
 * // Partial context values
 * withContext({ userId: 'user-123' }, () => {
 *   // Only userId is set, no sessionId or metadata
 * });
 * ```
 *
 * @public
 */
export function withContext<T>(
  config: ContextConfig,
  fn: () => T,
  options?: ContextPropagationOptions,
): T {
  let newContext = context.active();

  // Set userId if provided
  if (config.userId !== undefined) {
    newContext = newContext.setValue(LANGFUSE_CTX_USER_ID, config.userId);

    // Set attribute on currently active span
    const currentSpan = trace.getActiveSpan();
    if (currentSpan?.isRecording()) {
      currentSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        config.userId,
      );
    }

    // Set baggage if requested
    if (options?.asBaggage) {
      const bag =
        propagation.getBaggage(newContext) || propagation.createBaggage();
      const updatedBag = bag.setEntry(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        { value: config.userId },
      );
      newContext = propagation.setBaggage(newContext, updatedBag);
    }
  }

  // Set sessionId if provided
  if (config.sessionId !== undefined) {
    newContext = newContext.setValue(LANGFUSE_CTX_SESSION_ID, config.sessionId);

    // Set attribute on currently active span
    const currentSpan = trace.getActiveSpan();
    if (currentSpan?.isRecording()) {
      currentSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        config.sessionId,
      );
    }

    // Set baggage if requested
    if (options?.asBaggage) {
      const bag =
        propagation.getBaggage(newContext) || propagation.createBaggage();
      const updatedBag = bag.setEntry(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        {
          value: config.sessionId,
        },
      );
      newContext = propagation.setBaggage(newContext, updatedBag);
    }
  }

  // Set metadata if provided
  if (
    config.metadata !== undefined &&
    Object.keys(config.metadata).length > 0
  ) {
    newContext = newContext.setValue(LANGFUSE_CTX_METADATA, config.metadata);

    // Set attributes on currently active span
    const currentSpan = trace.getActiveSpan();
    if (currentSpan?.isRecording()) {
      for (const [key, value] of Object.entries(config.metadata)) {
        const attrKey = `langfuse.metadata.${key}`;
        const attrValue =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value;
        currentSpan.setAttribute(
          attrKey,
          attrValue as string | number | boolean,
        );
      }
    }

    // Set baggage if requested
    if (options?.asBaggage) {
      let bag =
        propagation.getBaggage(newContext) || propagation.createBaggage();
      for (const [key, value] of Object.entries(config.metadata)) {
        bag = bag.setEntry(`langfuse.metadata.${key}`, {
          value: String(value),
        });
      }
      newContext = propagation.setBaggage(newContext, bag);
    }
  }

  return context.with(newContext, fn);
}
