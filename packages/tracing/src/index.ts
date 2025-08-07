import { getGlobalLogger } from "@langfuse/core";
import {
  trace,
  context,
  TimeInput,
  SpanStatusCode,
  Span,
  Context,
  SpanContext,
} from "@opentelemetry/api";

import {
  createGenerationAttributes,
  createSpanAttributes,
  createTraceAttributes,
} from "./attributes.js";
import {
  LangfuseEvent,
  LangfuseGeneration,
  LangfuseSpan,
} from "./spanWrapper.js";
import {
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseTraceAttributes,
} from "./types.js";
import { getLangfuseTracer } from "./utils.js";

export type {
  LangfuseObservationType,
  ObservationLevel,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

export * from "./spanWrapper.js";
export {
  createTraceAttributes,
  createSpanAttributes,
  createGenerationAttributes,
} from "./attributes.js";

export { LangfuseOtelSpanAttributes } from "@langfuse/core";

export type StartObservationOptions = {
  startTime?: Date;
  parentSpanContext?: SpanContext;
};

function createOtelSpan(params: {
  name: string;
  startTime?: TimeInput;
  parentSpanContext?: SpanContext;
}): Span {
  return getLangfuseTracer().startSpan(
    params.name,
    { startTime: params.startTime },
    createParentContext(params.parentSpanContext),
  );
}

function createParentContext(
  parentSpanContext?: SpanContext,
): Context | undefined {
  if (!parentSpanContext) return;

  return trace.setSpanContext(context.active(), parentSpanContext);
}

function wrapPromise<T>(promise: Promise<T>, span: Span): Promise<T> {
  return promise.then(
    (value) => {
      span.end(); // End span AFTER Promise resolves

      return value;
    },
    (err: unknown) => {
      span
        .setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "Unknown error",
        })
        .end(); // End span AFTER Promise rejects

      throw err;
    },
  );
}

export function startSpan(
  name: string,
  attributes?: LangfuseSpanAttributes,
  options?: {
    startTime?: TimeInput;
    parentSpanContext?: SpanContext;
  },
): LangfuseSpan {
  const otelSpan = createOtelSpan({
    name,
    ...options,
  });

  return new LangfuseSpan({ otelSpan, attributes });
}

export function startGeneration(
  name: string,
  attributes?: LangfuseGenerationAttributes,
  options?: StartObservationOptions,
): LangfuseGeneration {
  const otelSpan = createOtelSpan({
    name,
    ...options,
  });

  return new LangfuseGeneration({ otelSpan, attributes });
}

export function createEvent(
  name: string,
  attributes?: LangfuseEventAttributes,
  options?: StartObservationOptions,
) {
  const timestamp = options?.startTime ?? new Date();

  const otelSpan = createOtelSpan({
    name,
    ...options,
    startTime: timestamp,
  });

  return new LangfuseEvent({ otelSpan, attributes, timestamp });
}

export function startActiveSpan<F extends (span: LangfuseSpan) => unknown>(
  name: string,
  fn: F,
  options?: StartObservationOptions,
): ReturnType<F> {
  return getLangfuseTracer().startActiveSpan(
    name,
    { startTime: options?.startTime },
    createParentContext(options?.parentSpanContext) ?? context.active(),
    (span) => {
      try {
        const result = fn(new LangfuseSpan({ otelSpan: span }));

        if (result instanceof Promise) {
          return wrapPromise(result, span) as ReturnType<F>;
        } else {
          span.end();

          return result as ReturnType<F>;
        }
      } catch (err) {
        span
          .setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : "Unknown error",
          })
          .end();

        throw err;
      }
    },
  );
}

export function startActiveGeneration<
  F extends (span: LangfuseGeneration) => unknown,
>(name: string, fn: F, options?: StartObservationOptions): ReturnType<F> {
  return getLangfuseTracer().startActiveSpan(
    name,
    { startTime: options?.startTime },
    createParentContext(options?.parentSpanContext) ?? context.active(),
    (span) => {
      try {
        const result = fn(new LangfuseGeneration({ otelSpan: span }));

        if (result instanceof Promise) {
          return wrapPromise(result, span) as ReturnType<F>;
        } else {
          span.end();

          return result as ReturnType<F>;
        }
      } catch (err) {
        span
          .setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : "Unknown error",
          })
          .end();

        throw err;
      }
    },
  );
}

export function updateActiveTrace(attributes: LangfuseTraceAttributes) {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping trace update.",
    );

    return;
  }

  span.setAttributes(createTraceAttributes(attributes));
}

export function updateActiveSpan(attributes: LangfuseSpanAttributes) {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping span update.",
    );

    return;
  }

  span.setAttributes(createSpanAttributes(attributes));
}

export function updateActiveGeneration(
  attributes: LangfuseGenerationAttributes,
) {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping generation update.",
    );

    return;
  }

  span.setAttributes(createGenerationAttributes(attributes));
}

export interface ObserveOptions {
  name?: string;
  asType?: "span" | "generation";
  captureInput?: boolean;
  captureOutput?: boolean;
}

export function observe<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: ObserveOptions = {},
): T {
  const {
    name = fn.name || "anonymous-function",
    asType = "span",
    captureInput = true,
    captureOutput = true,
  } = options;

  const wrappedFunction = (...args: Parameters<T>): ReturnType<T> => {
    // Prepare input data
    const inputData = captureInput ? _captureArguments(args) : undefined;

    // Create the appropriate observation type
    const observation =
      asType === "generation"
        ? startGeneration(name, inputData ? { input: inputData } : {})
        : startSpan(name, inputData ? { input: inputData } : {});

    // Set the observation span as active in the context
    const activeContext = trace.setSpan(context.active(), observation.otelSpan);

    try {
      const result = context.with(activeContext, () => fn(...args));

      // Handle async functions - check if result is a Promise
      // TODO: handle returned generators for streamed responses
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            if (captureOutput) {
              observation.update({ output: _captureOutput(value) });
            }
            observation.end();

            return value;
          },
          (error: unknown) => {
            observation
              .update({
                level: "ERROR",
                statusMessage:
                  (error instanceof Error ? error.message : String(error)) ||
                  "Function threw an error",
                output: captureOutput ? { error: String(error) } : undefined,
              })
              .end();

            throw error;
          },
        ) as ReturnType<T>;
      } else {
        // Handle sync functions
        if (captureOutput) {
          observation.update({ output: _captureOutput(result) });
        }
        observation.end();

        return result as ReturnType<T>;
      }
    } catch (error: unknown) {
      observation
        .update({
          level: "ERROR",
          statusMessage:
            (error instanceof Error ? error.message : String(error)) ||
            "Function threw an error",
          output: captureOutput ? { error: String(error) } : undefined,
        })
        .end();

      throw error;
    }
  };

  return wrappedFunction as T;
}

// Helper function to safely capture function arguments
function _captureArguments(args: unknown[]): unknown {
  try {
    if (args.length === 0) return undefined;
    if (args.length === 1) return args[0];
    return args;
  } catch {
    return "<failed to capture arguments>";
  }
}

// Helper function to safely capture function output
function _captureOutput(value: unknown): unknown {
  try {
    // Handle undefined/null
    if (value === undefined || value === null) return value;

    // For primitive types, return as-is
    if (typeof value !== "object") return value;

    // For objects, return them directly (serialization happens in span processor)
    return value;
  } catch {
    return "<failed to capture output>";
  }
}

/**
 * Creates a trace ID for OpenTelemetry spans.
 *
 * @param seed - A seed string for deterministic trace ID generation.
 *               If provided (non-empty), the same seed will always generate the same trace ID.
 *               If empty or falsy, generates a random trace ID.
 *
 *               Using a seed is especially useful when trying to correlate external,
 *               non-W3C compliant IDs with Langfuse trace IDs. This allows you to later
 *               have a method available for scoring the Langfuse trace given only the
 *               external ID by regenerating the same trace ID from the external ID.
 *
 * @returns A Promise that resolves to a 32-character lowercase hexadecimal string suitable for use as an OpenTelemetry trace ID.
 *
 * @example
 * ```typescript
 * // Deterministic trace ID from seed
 * const traceId1 = await createTraceId("my-session-123");
 * const traceId2 = await createTraceId("my-session-123");
 * console.log(traceId1 === traceId2); // true
 *
 * // Random trace ID
 * const randomId1 = await createTraceId("");
 * const randomId2 = await createTraceId("");
 * console.log(randomId1 === randomId2); // false
 *
 * // Use with spans
 * const span = startSpan("my-span", {}, {
 *   parentSpanContext: {
 *     traceId: await createTraceId("session-456"),
 *     spanId: "0123456789abcdef",
 *     traceFlags: 1
 *   }
 * });
 *
 * // Correlating external IDs with Langfuse traces
 * const externalId = "ext-12345-67890";
 * const traceId = await createTraceId(externalId);
 *
 * // Later, when you need to score this trace, regenerate the same ID
 * const scoringTraceId = await createTraceId(externalId);
 * console.log(traceId === scoringTraceId); // true - can now find and score the trace
 * ```
 */
export async function createTraceId(seed?: string): Promise<string> {
  if (seed) {
    const data = new TextEncoder().encode(seed);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    const hashArray = new Uint8Array(hashBuffer);

    return uint8ArrayToHex(hashArray).slice(0, 32);
  }

  const randomValues = crypto.getRandomValues(new Uint8Array(16));

  return uint8ArrayToHex(randomValues);
}

function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
