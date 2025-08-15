import { Span, TimeInput } from "@opentelemetry/api";

import {
  createEventAttributes,
  createGenerationAttributes,
  createSpanAttributes,
  createTraceAttributes,
} from "./attributes.js";
import { getLangfuseTracer } from "./tracerProvider.js";
import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

import { createEvent, startGeneration, startSpan } from "./index.js";

/**
 * Union type representing any Langfuse observation wrapper.
 *
 * Used when you need to accept any type of Langfuse observation
 * (span, generation, or event).
 *
 * @public
 */
export type LangfuseObservation =
  | LangfuseSpan
  | LangfuseGeneration
  | LangfuseEvent;

/**
 * Parameters for creating a Langfuse span wrapper.
 *
 * @internal
 */
type LangfuseSpanWrapperParams = {
  otelSpan: Span;
  attributes?:
    | LangfuseSpanAttributes
    | LangfuseGenerationAttributes
    | LangfuseEventAttributes;
};

/**
 * Base class for all Langfuse observation wrappers.
 *
 * Provides common functionality for spans, generations, and events including
 * access to the underlying OpenTelemetry span, span ID, trace ID, and basic
 * operations like ending the observation and updating trace attributes.
 *
 * @internal
 */
abstract class LangfuseSpanWrapper {
  /** The underlying OpenTelemetry span */
  public readonly otelSpan: Span;
  /** The span ID from the OpenTelemetry span context */
  public id: string;
  /** The trace ID from the OpenTelemetry span context */
  public traceId: string;

  constructor(params: LangfuseSpanWrapperParams) {
    this.otelSpan = params.otelSpan;
    this.id = params.otelSpan.spanContext().spanId;
    this.traceId = params.otelSpan.spanContext().traceId;
  }

  /** Gets the Langfuse OpenTelemetry tracer instance */
  protected get tracer() {
    return getLangfuseTracer();
  }

  /**
   * Ends the observation, marking it as complete.
   *
   * @param endTime - Optional end time, defaults to current time
   */
  public end(endTime?: TimeInput) {
    this.otelSpan.end(endTime);
  }

  /**
   * Updates the parent trace with new attributes.
   *
   * This sets trace-level attributes that apply to the entire trace,
   * not just this specific observation.
   *
   * @param attributes - Trace attributes to set
   * @returns This observation for method chaining
   */
  public updateTrace(attributes: LangfuseTraceAttributes) {
    this.otelSpan.setAttributes(createTraceAttributes(attributes));

    return this;
  }
}

/**
 * Parameters for creating a Langfuse span.
 *
 * @internal
 */
type LangfuseSpanParams = {
  otelSpan: Span;
  attributes?: LangfuseSpanAttributes;
};

/**
 * Langfuse span wrapper for general-purpose tracing.
 *
 * Spans are used to track operations, functions, or logical units of work.
 * They can contain other spans, generations, or events as children and have
 * a duration from start to end.
 *
 * @public
 */
export class LangfuseSpan extends LangfuseSpanWrapper {
  constructor(params: LangfuseSpanParams) {
    super(params);
    if (params.attributes) {
      this.otelSpan.setAttributes(createSpanAttributes(params.attributes));
    }
  }

  /**
   * Updates this span with new attributes.
   *
   * @param attributes - Span attributes to set
   * @returns This span for method chaining
   *
   * @example
   * ```typescript
   * span.update({
   *   output: { result: 'success' },
   *   level: 'DEFAULT',
   *   metadata: { duration: 150 }
   * });
   * ```
   */
  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    this.otelSpan.setAttributes(createSpanAttributes(attributes));

    return this;
  }

  /**
   * Starts a new child span within this span.
   *
   * @param name - Name of the child span
   * @param attributes - Optional attributes for the child span
   * @returns The new child span
   *
   * @example
   * ```typescript
   * const childSpan = parentSpan.startSpan('database-query', {
   *   input: { query: 'SELECT * FROM users' },
   *   metadata: { database: 'primary' }
   * });
   * ```
   */
  public startSpan(
    name: string,
    attributes?: LangfuseSpanAttributes,
  ): LangfuseSpan {
    return startSpan(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }

  /**
   * Starts a new child generation within this span.
   *
   * @param name - Name of the generation (typically the model name)
   * @param attributes - Optional generation-specific attributes
   * @returns The new child generation
   *
   * @example
   * ```typescript
   * const generation = parentSpan.startGeneration('gpt-4', {
   *   input: [{ role: 'user', content: 'Hello!' }],
   *   model: 'gpt-4',
   *   modelParameters: { temperature: 0.7 }
   * });
   * ```
   */
  public startGeneration(
    name: string,
    attributes?: LangfuseGenerationAttributes,
  ): LangfuseGeneration {
    return startGeneration(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }

  /**
   * Creates a new event within this span.
   *
   * Events are point-in-time occurrences and are automatically ended.
   *
   * @param name - Name of the event
   * @param attributes - Optional event attributes
   * @returns The created event (already ended)
   *
   * @example
   * ```typescript
   * parentSpan.createEvent('user-action', {
   *   input: { action: 'click', button: 'submit' },
   *   metadata: { userId: '123' }
   * });
   * ```
   */
  public createEvent(
    name: string,
    attributes?: LangfuseEventAttributes,
  ): LangfuseEvent {
    return createEvent(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }
}

/**
 * Parameters for creating a Langfuse generation.
 *
 * @internal
 */
type LangfuseGenerationParams = {
  otelSpan: Span;
  attributes?: LangfuseGenerationAttributes;
};

/**
 * Langfuse generation wrapper for tracking LLM interactions.
 *
 * Generations are specialized observations for tracking language model
 * calls, including model parameters, usage metrics, costs, and prompts.
 *
 * @public
 */
export class LangfuseGeneration extends LangfuseSpanWrapper {
  constructor(params: LangfuseGenerationParams) {
    super(params);
    if (params.attributes) {
      this.otelSpan.setAttributes(
        createGenerationAttributes(params.attributes),
      );
    }
  }

  /**
   * Updates this generation with new attributes.
   *
   * @param attributes - Generation attributes to set
   * @returns This generation for method chaining
   *
   * @example
   * ```typescript
   * generation.update({
   *   output: { role: 'assistant', content: 'Hello there!' },
   *   usageDetails: {
   *     promptTokens: 10,
   *     completionTokens: 15,
   *     totalTokens: 25
   *   },
   *   costDetails: { totalCost: 0.001 }
   * });
   * ```
   */
  update(attributes: LangfuseGenerationAttributes): LangfuseGeneration {
    this.otelSpan.setAttributes(createGenerationAttributes(attributes));

    return this;
  }

  /**
   * Creates a new event within this generation.
   *
   * Events are point-in-time occurrences and are automatically ended.
   *
   * @param name - Name of the event
   * @param attributes - Optional event attributes
   * @returns The created event (already ended)
   *
   * @example
   * ```typescript
   * generation.createEvent('token-limit-reached', {
   *   level: 'WARNING',
   *   metadata: { requestedTokens: 2000, maxTokens: 1500 }
   * });
   * ```
   */
  createEvent(
    name: string,
    attributes?: LangfuseEventAttributes,
  ): LangfuseEvent {
    return createEvent(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }
}

/**
 * Parameters for creating a Langfuse event.
 *
 * @internal
 */
type LangfuseEventParams = {
  otelSpan: Span;
  attributes?: LangfuseEventAttributes;
  timestamp: TimeInput;
};

/**
 * Langfuse event wrapper for point-in-time observations.
 *
 * Events represent instantaneous occurrences or log entries within a trace.
 * Unlike spans and generations, they don't have duration and are automatically
 * ended when created.
 *
 * @public
 */
export class LangfuseEvent extends LangfuseSpanWrapper {
  constructor(params: LangfuseEventParams) {
    super(params);

    if (params.attributes) {
      this.otelSpan.setAttributes(createEventAttributes(params.attributes));
    }

    // Events are automatically ended at their timestamp
    this.otelSpan.end(params.timestamp);
  }
}
