/**
 * Context keys for Langfuse context propagation.
 *
 * These keys are used to store and retrieve trace-level values (userId, sessionId, metadata)
 * from OpenTelemetry context. They are created as Symbols to ensure uniqueness and
 * avoid conflicts with other context values.
 *
 * Note: These constants must be imported using the exact same reference to work correctly.
 * Do not recreate them as strings - use the imported Symbol constants.
 *
 * @module context-keys
 * @packageDocumentation
 */

/**
 * Context key for storing user ID in OpenTelemetry context.
 *
 * Used by the tracing package's `withUser()`, `withContext()` functions and
 * by the otel package's span processor for context propagation.
 *
 * @public
 */
export const LANGFUSE_CTX_USER_ID = Symbol.for("langfuse.ctx.user.id");

/**
 * Context key for storing session ID in OpenTelemetry context.
 *
 * Used by the tracing package's `withSession()`, `withContext()` functions and
 * by the otel package's span processor for context propagation.
 *
 * @public
 */
export const LANGFUSE_CTX_SESSION_ID = Symbol.for("langfuse.ctx.session.id");

/**
 * Context key for storing metadata in OpenTelemetry context.
 *
 * Used by the tracing package's `withMetadata()`, `withContext()` functions and
 * by the otel package's span processor for context propagation.
 *
 * @public
 */
export const LANGFUSE_CTX_METADATA = Symbol.for("langfuse.ctx.metadata");
