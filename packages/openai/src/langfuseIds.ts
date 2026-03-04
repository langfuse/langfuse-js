import type { LangfuseGeneration } from "@langfuse/tracing";

/**
 * Extends a response object with Langfuse observation and trace IDs.
 *
 * @public
 */
export type WithLangfuseIds<T> = T & {
  /** The Langfuse observation ID for this generation */
  langfuseObservationId: string;
  /** The Langfuse trace ID for this generation */
  langfuseTraceId: string;
};

/**
 * Attaches Langfuse observation and trace IDs to a response object as non-enumerable properties.
 *
 * The properties are non-enumerable so they don't appear in JSON.stringify output
 * or for-in loops, but are directly accessible on the response object.
 *
 * @internal
 */
export function attachLangfuseIds<T>(
  result: T,
  generation: LangfuseGeneration,
): asserts result is T & WithLangfuseIds<T> {
  if (result && typeof result === "object") {
    Object.defineProperty(result, "langfuseObservationId", {
      value: generation.id,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    Object.defineProperty(result, "langfuseTraceId", {
      value: generation.traceId,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}
