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
  createObservationAttributes,
  createTraceAttributes,
} from "./attributes.js";
import {
  LangfuseEvent,
  LangfuseGeneration,
  LangfuseSpan,
} from "./spanWrapper.js";
import { getLangfuseTracer } from "./tracerProvider.js";
import {
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseObservationType,
  LangfuseSpanAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

export type {
  LangfuseObservationType,
  ObservationLevel,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseObservationAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

export * from "./spanWrapper.js";
export {
  createTraceAttributes,
  createObservationAttributes,
} from "./attributes.js";
export {
  setLangfuseTracerProvider,
  getLangfuseTracerProvider,
  getLangfuseTracer,
} from "./tracerProvider.js";

export { LangfuseOtelSpanAttributes } from "@langfuse/core";

/**
 * Options for starting observations (spans, generations, events).
 *
 * @public
 */
export type StartObservationOptions = {
  /** Custom start time for the observation */
  startTime?: Date;
  /** Parent span context to attach this observation to */
  parentSpanContext?: SpanContext;
};

/**
 * Options for starting an observations set to active in context
 *
 * Extends StartObservationOptions with additional context-specific configuration.
 *
 * @public
 */
export type StartActiveObservationContext = StartObservationOptions & {
  /** Whether to automatically end the observation when exiting the context. Default is true */
  endOnExit?: boolean;
};

/**
 * Options for startObservation function.
 *
 * @public
 */
export type StartObservationOpts = StartObservationOptions & {
  /** Type of observation to create. Defaults to 'span' */
  asType?: LangfuseObservationType;
};

/**
 * Options for startActiveObservation function.
 *
 * @public
 */
export type StartActiveObservationOpts = StartActiveObservationContext & {
  /** Type of observation to create. Defaults to 'span' */
  asType?: LangfuseObservationType;
};

/**
 * Creates an OpenTelemetry span with the Langfuse tracer.
 *
 * @param params - Parameters for span creation
 * @returns The created OpenTelemetry span
 * @internal
 */
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

/**
 * Creates a parent context from a span context.
 *
 * @param parentSpanContext - The span context to use as parent
 * @returns The created context or undefined if no parent provided
 * @internal
 */
function createParentContext(
  parentSpanContext?: SpanContext,
): Context | undefined {
  if (!parentSpanContext) return;

  return trace.setSpanContext(context.active(), parentSpanContext);
}

/**
 * Wraps a promise to automatically end the span when the promise resolves or rejects.
 *
 * @param promise - The promise to wrap
 * @param span - The span to end when promise completes
 * @returns The wrapped promise
 * @internal
 */
function wrapPromise<T>(
  promise: Promise<T>,
  span: Span,
  endOnExit: boolean | undefined,
): Promise<T> {
  return promise.then(
    (value) => {
      if (endOnExit !== false) {
        span.end(); // End span AFTER Promise resolves
      }

      return value;
    },
    (err: unknown) => {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : "Unknown error",
      });

      if (endOnExit !== false) {
        span.end(); // End span AFTER Promise rejects
      }

      throw err;
    },
  );
}

// Function overloads for proper type inference
export function startObservation(
  name: string,
  attributes: LangfuseGenerationAttributes,
  options: StartObservationOpts & { asType: "generation" },
): LangfuseGeneration;
export function startObservation(
  name: string,
  attributes: LangfuseEventAttributes,
  options: StartObservationOpts & { asType: "event" },
): LangfuseEvent;
export function startObservation(
  name: string,
  attributes?: LangfuseSpanAttributes,
  options?: StartObservationOpts & { asType?: "span" },
): LangfuseSpan;

/**
 * Creates and starts a new Langfuse observation (span, generation, or event).
 *
 * This is a consolidated function that replaces the separate startSpan, startGeneration,
 * and createEvent functions. The observation type is controlled by the `asType` option,
 * which defaults to 'span'.
 *
 * @param name - Name of the observation
 * @param attributes - Attributes to set on the observation (type depends on asType)
 * @param options - Configuration options including observation type
 * @returns The created observation (LangfuseSpan, LangfuseGeneration, or LangfuseEvent)
 *
 * @example
 * ```typescript
 * // Create a span (default) - returns LangfuseSpan
 * const span = startObservation('data-processing', {
 *   input: { userId: '123' },
 *   metadata: { version: '1.0' }
 * });
 *
 * // Create a generation - returns LangfuseGeneration
 * const generation = startObservation('openai-gpt-4', {
 *   input: [{ role: 'user', content: 'Hello!' }],
 *   model: 'gpt-4',
 *   modelParameters: { temperature: 0.7 }
 * }, { asType: 'generation' });
 *
 * // Create an event - returns LangfuseEvent
 * const event = startObservation('user-click', {
 *   input: { buttonId: 'submit' },
 *   level: 'DEFAULT'
 * }, { asType: 'event' });
 * ```
 *
 * @public
 */
export function startObservation(
  name: string,
  attributes?:
    | LangfuseSpanAttributes
    | LangfuseGenerationAttributes
    | LangfuseEventAttributes,
  options?: StartObservationOpts,
): LangfuseSpan | LangfuseGeneration | LangfuseEvent {
  const { asType = "span", ...observationOptions } = options || {};

  const otelSpan = createOtelSpan({
    name,
    ...observationOptions,
  });

  switch (asType) {
    case "generation":
      return new LangfuseGeneration({
        otelSpan,
        attributes: attributes as LangfuseGenerationAttributes,
      });
    case "event": {
      const timestamp = observationOptions?.startTime ?? new Date();
      return new LangfuseEvent({
        otelSpan,
        attributes: attributes as LangfuseEventAttributes,
        timestamp,
      });
    }
    case "span":
    default:
      return new LangfuseSpan({
        otelSpan,
        attributes: attributes as LangfuseSpanAttributes,
      });
  }
}

// Function overloads for proper type inference
export function startActiveObservation<
  F extends (span: LangfuseSpan) => unknown,
>(
  name: string,
  fn: F,
  options?: StartActiveObservationOpts & { asType?: "span" },
): ReturnType<F>;
export function startActiveObservation<
  F extends (generation: LangfuseGeneration) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "generation" },
): ReturnType<F>;

/**
 * Starts an active observation and executes a function within its context.
 *
 * This is a consolidated function that replaces the separate startActiveSpan and
 * startActiveGeneration functions. The observation type is controlled by the `asType`
 * option, which defaults to 'span'.
 *
 * The function creates an observation, sets it as active in the OpenTelemetry context,
 * executes the provided function, and automatically ends the observation.
 *
 * @param name - Name of the observation
 * @param fn - Function to execute within the observation context
 * @param options - Configuration options including observation type
 * @returns The return value of the executed function
 *
 * @example
 * ```typescript
 * // Create an active span (default) - receives LangfuseSpan
 * const result = startActiveObservation('calculate-metrics', (span) => {
 *   span.update({ input: { data: rawData } });
 *   const metrics = calculateMetrics(rawData);
 *   span.update({ output: metrics });
 *   return metrics;
 * });
 *
 * // Create an active generation - receives LangfuseGeneration
 * const response = await startActiveObservation('openai-completion', async (generation) => {
 *   generation.update({
 *     input: { messages: [...] },
 *     model: 'gpt-4',
 *     modelParameters: { temperature: 0.7 }
 *   });
 *   const result = await openai.chat.completions.create({...});
 *   generation.update({
 *     output: result.choices[0].message,
 *     usageDetails: result.usage
 *   });
 *   return result;
 * }, { asType: 'generation' });
 * ```
 *
 * @public
 */
export function startActiveObservation<
  F extends (observation: LangfuseSpan | LangfuseGeneration) => unknown,
>(name: string, fn: F, options?: StartActiveObservationOpts): ReturnType<F> {
  const { asType = "span", ...observationOptions } = options || {};

  return getLangfuseTracer().startActiveSpan(
    name,
    { startTime: observationOptions?.startTime },
    createParentContext(observationOptions?.parentSpanContext) ??
      context.active(),
    (span) => {
      try {
        const observation =
          asType === "generation"
            ? new LangfuseGeneration({ otelSpan: span })
            : new LangfuseSpan({ otelSpan: span });

        const result = fn(observation as Parameters<F>[0]);

        if (result instanceof Promise) {
          return wrapPromise(
            result,
            span,
            observationOptions?.endOnExit,
          ) as ReturnType<F>;
        } else {
          if (observationOptions?.endOnExit !== false) {
            span.end();
          }

          return result as ReturnType<F>;
        }
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "Unknown error",
        });

        if (observationOptions?.endOnExit !== false) {
          span.end();
        }

        throw err;
      }
    },
  );
}

/**
 * Updates the currently active trace with new attributes.
 *
 * This function finds the currently active OpenTelemetry span and updates
 * it with trace-level attributes. If no active span is found, a warning is logged.
 *
 * @param attributes - Trace attributes to set
 *
 * @example
 * ```typescript
 * import { updateActiveTrace } from '@langfuse/tracing';
 *
 * // Inside an active span context
 * updateActiveTrace({
 *   name: 'user-workflow',
 *   userId: '123',
 *   sessionId: 'session-456',
 *   tags: ['production', 'critical'],
 *   public: true
 * });
 * ```
 *
 * @public
 */
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

/**
 * Updates the currently active span with new attributes.
 *
 * This function finds the currently active OpenTelemetry span and updates
 * it with span-level attributes. If no active span is found, a warning is logged.
 *
 * @param attributes - Span attributes to set
 *
 * @example
 * ```typescript
 * import { updateActiveSpan } from '@langfuse/tracing';
 *
 * // Inside an active span context
 * updateActiveSpan({
 *   level: 'WARNING',
 *   statusMessage: 'Operation completed with warnings',
 *   metadata: { warningCount: 3 }
 * });
 * ```
 *
 * @public
 */
export function updateActiveSpan(attributes: LangfuseSpanAttributes) {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping span update.",
    );

    return;
  }

  span.setAttributes(createObservationAttributes("span", attributes));
}

/**
 * Updates the currently active generation with new attributes.
 *
 * This function finds the currently active OpenTelemetry span and updates
 * it with generation-level attributes. If no active span is found, a warning is logged.
 *
 * @param attributes - Generation attributes to set
 *
 * @example
 * ```typescript
 * import { updateActiveGeneration } from '@langfuse/tracing';
 *
 * // Inside an active generation context
 * updateActiveGeneration({
 *   usageDetails: {
 *     promptTokens: 50,
 *     completionTokens: 100,
 *     totalTokens: 150
 *   },
 *   costDetails: { totalCost: 0.003 }
 * });
 * ```
 *
 * @public
 */
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

  span.setAttributes(createObservationAttributes("generation", attributes));
}

/**
 * Options for the observe decorator function.
 *
 * @public
 */
export interface ObserveOptions {
  /** Name for the observation (defaults to function name) */
  name?: string;
  /** Type of observation to create */
  asType?: "span" | "generation";
  /** Whether to capture function input as observation input */
  captureInput?: boolean;
  /** Whether to capture function output as observation output */
  captureOutput?: boolean;
  /** Parent span context to attach this observation to */
  parentSpanContext?: SpanContext;
  /** Whether to automatically end the observation when exiting the context. Default is true */
  endOnExit?: boolean;
}

/**
 * Decorator function that automatically wraps a function with Langfuse tracing.
 *
 * This function creates a wrapper around the provided function that automatically:
 * - Creates a span or generation when the function is called
 * - Captures input arguments (if enabled)
 * - Captures return value/output (if enabled)
 * - Handles errors and sets appropriate status
 * - Ends the observation when the function completes
 *
 * @param fn - The function to wrap with tracing
 * @param options - Configuration options for the observation
 * @returns A wrapped version of the function that includes tracing
 *
 * @example
 * ```typescript
 * import { observe } from '@langfuse/tracing';
 *
 * // Wrap a regular function
 * const processData = observe(
 *   async (userId: string, data: any) => {
 *     // Function implementation
 *     return await processUserData(userId, data);
 *   },
 *   {
 *     name: 'process-user-data',
 *     asType: 'span',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Wrap an LLM call
 * const generateText = observe(
 *   async (prompt: string) => {
 *     return await openai.chat.completions.create({
 *       model: 'gpt-4',
 *       messages: [{ role: 'user', content: prompt }]
 *     });
 *   },
 *   {
 *     name: 'openai-generation',
 *     asType: 'generation',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Usage
 * const result = await processData('123', { key: 'value' });
 * const text = await generateText('Hello, world!');
 * ```
 *
 * @public
 */
export function observe<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: ObserveOptions = {},
): T {
  const {
    name = fn.name || "anonymous-function",
    asType = "span",
    captureInput = true,
    captureOutput = true,
    parentSpanContext = undefined,
  } = options;

  const wrappedFunction = function (
    this: any,
    ...args: Parameters<T>
  ): ReturnType<T> {
    // Prepare input data
    const inputData = captureInput ? _captureArguments(args) : undefined;

    // Create the appropriate observation type
    const observation =
      asType === "generation"
        ? startObservation(name, inputData ? { input: inputData } : {}, {
            asType: "generation",
            parentSpanContext,
          })
        : startObservation(name, inputData ? { input: inputData } : {}, {
            parentSpanContext,
          });

    // Set the observation span as active in the context
    const activeContext = trace.setSpan(context.active(), observation.otelSpan);

    try {
      const result = context.with(activeContext, () => fn.apply(this, args));

      // Handle async functions - check if result is a Promise
      // TODO: handle returned generators for streamed responses
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            if (captureOutput) {
              observation.update({ output: _captureOutput(value) });
            }

            if (options?.endOnExit !== false) {
              observation.end();
            }

            return value;
          },
          (error: unknown) => {
            observation.update({
              level: "ERROR",
              statusMessage:
                (error instanceof Error ? error.message : String(error)) ||
                "Function threw an error",
              output: captureOutput ? { error: String(error) } : undefined,
            });

            if (options?.endOnExit !== false) {
              observation.end();
            }

            throw error;
          },
        ) as ReturnType<T>;
      } else {
        // Handle sync functions
        if (captureOutput) {
          observation.update({ output: _captureOutput(result) });
        }

        if (options?.endOnExit !== false) {
          observation.end();
        }

        return result as ReturnType<T>;
      }
    } catch (error: unknown) {
      observation.update({
        level: "ERROR",
        statusMessage:
          (error instanceof Error ? error.message : String(error)) ||
          "Function threw an error",
        output: captureOutput ? { error: String(error) } : undefined,
      });

      if (options?.endOnExit !== false) {
        observation.end();
      }
      throw error;
    }
  };

  return wrappedFunction as T;
}

/**
 * Helper function to safely capture function arguments.
 *
 * @param args - Function arguments array
 * @returns Captured arguments or error message
 * @internal
 */
function _captureArguments(args: unknown[]): unknown {
  try {
    if (args.length === 0) return undefined;
    if (args.length === 1) return args[0];
    return args;
  } catch {
    return "<failed to capture arguments>";
  }
}

/**
 * Helper function to safely capture function output.
 *
 * @param value - Function return value
 * @returns Captured output or error message
 * @internal
 */
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
 * const span = startObservation("my-span", {}, {
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
 *
 * @public
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

/**
 * Converts a Uint8Array to a hexadecimal string.
 *
 * @param array - The byte array to convert
 * @returns Hexadecimal string representation
 * @internal
 */
function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Gets the current active trace ID.
 *
 * If there is no span in the current context, returns undefined.
 *
 * @returns The trace ID of the currently active span, or undefined if no span is active
 *
 * @public
 */
export function getActiveTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

/**
 * Gets the current active observation ID.
 *
 * If there is no OTEL span in the current context, returns undefined.
 *
 * @returns The ID of the currently active OTEL span, or undefined if no OTEL span is active
 *
 * @public
 */
export function getActiveSpanId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().spanId;
}
