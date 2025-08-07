import { LANGFUSE_SDK_VERSION, LANGFUSE_TRACER_NAME } from "@langfuse/core";
import { trace } from "@opentelemetry/api";

/**
 * Gets the OpenTelemetry tracer instance for Langfuse.
 *
 * This function returns a tracer specifically configured for Langfuse
 * with the correct tracer name and version. Used internally by all
 * Langfuse tracing functions to ensure consistent trace creation.
 *
 * @returns The Langfuse OpenTelemetry tracer instance
 *
 * @example
 * ```typescript
 * import { getLangfuseTracer } from '@langfuse/tracing';
 *
 * const tracer = getLangfuseTracer();
 * const span = tracer.startSpan('my-operation');
 * ```
 *
 * @public
 */
export function getLangfuseTracer() {
  return trace.getTracer(LANGFUSE_TRACER_NAME, LANGFUSE_SDK_VERSION);
}
