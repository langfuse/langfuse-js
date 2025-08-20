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
import { getLangfuseTracer } from "./tracerProvider.js";
import {
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

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

/**
 * Creates and starts a new Langfuse span for general-purpose tracing.
 *
 * Spans are used to track operations, functions, or logical units of work.
 * They can contain other spans or generations as children.
 *
 * @param name - Name of the span
 * @param attributes - Optional attributes to set on the span
 * @param options - Optional configuration for the span
 * @returns A LangfuseSpan instance
 *
 * @example
 * ```typescript
 * import { startSpan } from '@langfuse/tracing';
 *
 * const span = startSpan('data-processing', {
 *   input: { userId: '123', data: {...} },
 *   metadata: { version: '1.0' },
 *   level: 'DEFAULT'
 * });
 *
 * try {
 *   // Do some work
 *   const result = await processData();
 *
 *   span.update({ output: result });
 * } catch (error) {
 *   span.update({
 *     level: 'ERROR',
 *     statusMessage: error.message
 *   });
 * } finally {
 *   span.end();
 * }
 * ```
 *
 * @public
 */
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

/**
 * Creates and starts a new Langfuse generation for tracking LLM calls.
 *
 * Generations are specialized observations for tracking language model
 * interactions, including model parameters, usage metrics, and costs.
 *
 * @param name - Name of the generation (typically the model or operation)
 * @param attributes - Optional generation-specific attributes
 * @param options - Optional configuration for the generation
 * @returns A LangfuseGeneration instance
 *
 * @example
 * ```typescript
 * import { startGeneration } from '@langfuse/tracing';
 *
 * const generation = startGeneration('openai-gpt-4', {
 *   input: [{ role: 'user', content: 'Hello, world!' }],
 *   model: 'gpt-4',
 *   modelParameters: {
 *     temperature: 0.7,
 *     max_tokens: 150
 *   },
 *   metadata: { feature: 'chat' }
 * });
 *
 * try {
 *   const response = await callOpenAI(messages);
 *
 *   generation.update({
 *     output: response.choices[0].message,
 *     usageDetails: {
 *       promptTokens: response.usage.prompt_tokens,
 *       completionTokens: response.usage.completion_tokens,
 *       totalTokens: response.usage.total_tokens
 *     }
 *   });
 * } finally {
 *   generation.end();
 * }
 * ```
 *
 * @public
 */
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

/**
 * Creates a Langfuse event for point-in-time occurrences.
 *
 * Events are used to capture instantaneous occurrences or log entries
 * within a trace. Unlike spans, they represent a single point in time.
 *
 * @param name - Name of the event
 * @param attributes - Optional attributes for the event
 * @param options - Optional configuration for the event
 * @returns A LangfuseEvent instance (automatically ended)
 *
 * @example
 * ```typescript
 * import { createEvent } from '@langfuse/tracing';
 *
 * // Log a user action
 * createEvent('user-click', {
 *   input: { buttonId: 'submit', userId: '123' },
 *   metadata: { page: '/checkout' },
 *   level: 'DEFAULT'
 * });
 *
 * // Log an error
 * createEvent('api-error', {
 *   level: 'ERROR',
 *   statusMessage: 'Failed to fetch user data',
 *   metadata: { endpoint: '/api/users/123', statusCode: 500 }
 * });
 * ```
 *
 * @public
 */
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

/**
 * Starts an active span and executes a function within its context.
 *
 * This function creates a span, sets it as the active span in the OpenTelemetry
 * context, executes the provided function, and automatically ends the span.
 * Perfect for wrapping operations where you want child spans to be automatically
 * linked.
 *
 * @param name - Name of the span
 * @param fn - Function to execute within the span context
 * @param options - Optional configuration for the span
 * @returns The return value of the executed function
 *
 * @example
 * ```typescript
 * import { startActiveSpan } from '@langfuse/tracing';
 *
 * // Synchronous function
 * const result = startActiveSpan('calculate-metrics', (span) => {
 *   span.update({ input: { data: rawData } });
 *
 *   const metrics = calculateMetrics(rawData);
 *   span.update({ output: metrics });
 *
 *   return metrics;
 * });
 *
 * // Asynchronous function
 * const data = await startActiveSpan('fetch-user-data', async (span) => {
 *   span.update({ input: { userId: '123' } });
 *
 *   const userData = await api.getUser('123');
 *   span.update({ output: userData });
 *
 *   return userData;
 * });
 * ```
 *
 * @public
 */
export function startActiveSpan<F extends (span: LangfuseSpan) => unknown>(
  name: string,
  fn: F,
  options?: StartActiveObservationContext,
): ReturnType<F> {
  return getLangfuseTracer().startActiveSpan(
    name,
    { startTime: options?.startTime },
    createParentContext(options?.parentSpanContext) ?? context.active(),
    (span) => {
      try {
        const result = fn(new LangfuseSpan({ otelSpan: span }));

        if (result instanceof Promise) {
          return wrapPromise(result, span, options?.endOnExit) as ReturnType<F>;
        } else {
          if (options?.endOnExit !== false) {
            span.end();
          }

          return result as ReturnType<F>;
        }
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "Unknown error",
        });

        if (options?.endOnExit !== false) {
          span.end();
        }

        throw err;
      }
    },
  );
}

/**
 * Starts an active generation and executes a function within its context.
 *
 * Similar to startActiveSpan but creates a generation for tracking LLM calls.
 * The generation is automatically ended when the function completes.
 *
 * @param name - Name of the generation
 * @param fn - Function to execute within the generation context
 * @param options - Optional configuration for the generation
 * @returns The return value of the executed function
 *
 * @example
 * ```typescript
 * import { startActiveGeneration } from '@langfuse/tracing';
 *
 * const response = await startActiveGeneration('openai-completion', async (generation) => {
 *   generation.update({
 *     input: { messages: [...] },
 *     model: 'gpt-4',
 *     modelParameters: { temperature: 0.7 }
 *   });
 *
 *   const result = await openai.chat.completions.create({...});
 *
 *   generation.update({
 *     output: result.choices[0].message,
 *     usageDetails: result.usage
 *   });
 *
 *   return result;
 * });
 * ```
 *
 * @public
 */
export function startActiveGeneration<
  F extends (span: LangfuseGeneration) => unknown,
>(name: string, fn: F, options?: StartActiveObservationContext): ReturnType<F> {
  return getLangfuseTracer().startActiveSpan(
    name,
    { startTime: options?.startTime },
    createParentContext(options?.parentSpanContext) ?? context.active(),
    (span) => {
      try {
        const result = fn(new LangfuseGeneration({ otelSpan: span }));

        if (result instanceof Promise) {
          return wrapPromise(result, span, options?.endOnExit) as ReturnType<F>;
        } else {
          if (options?.endOnExit !== false) {
            span.end();
          }

          return result as ReturnType<F>;
        }
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "Unknown error",
        });

        if (options?.endOnExit !== false) {
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

  span.setAttributes(createSpanAttributes(attributes));
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

  span.setAttributes(createGenerationAttributes(attributes));
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
        ? startGeneration(name, inputData ? { input: inputData } : {}, {
            parentSpanContext,
          })
        : startSpan(name, inputData ? { input: inputData } : {}, {
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
