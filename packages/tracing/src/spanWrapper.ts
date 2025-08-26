import { Span, TimeInput } from "@opentelemetry/api";

import {
  createObservationAttributes,
  createTraceAttributes,
} from "./attributes.js";
import { getLangfuseTracer } from "./tracerProvider.js";
import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseTraceAttributes,
} from "./types.js";
import type {
  LangfuseAgentAttributes,
  LangfuseChainAttributes,
  LangfuseEmbeddingAttributes,
  LangfuseEvaluatorAttributes,
  LangfuseGuardrailAttributes,
  LangfuseObservationAttributes,
  LangfuseObservationType,
  LangfuseRetrieverAttributes,
  LangfuseToolAttributes,
} from "./types.js";

import { startObservation } from "./index.js";

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
  | LangfuseEvent
  | LangfuseAgent
  | LangfuseTool
  | LangfuseChain
  | LangfuseRetriever
  | LangfuseEvaluator
  | LangfuseGuardrail
  | LangfuseEmbedding;

/**
 * Parameters for creating a Langfuse observation wrapper.
 *
 * @internal
 */
type LangfuseObservationParams = {
  otelSpan: Span;
  type: LangfuseObservationType;
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
abstract class LangfuseBaseObservation {
  /** The underlying OpenTelemetry span */
  public readonly otelSpan: Span;
  /** The underlying OpenTelemetry span */
  public readonly type: LangfuseObservationType;
  /** The span ID from the OpenTelemetry span context */
  public id: string;
  /** The trace ID from the OpenTelemetry span context */
  public traceId: string;

  constructor(params: LangfuseObservationParams) {
    this.otelSpan = params.otelSpan;
    this.id = params.otelSpan.spanContext().spanId;
    this.traceId = params.otelSpan.spanContext().traceId;
    this.type = params.type;

    if (params.attributes) {
      this.otelSpan.setAttributes(
        createObservationAttributes(params.type, params.attributes),
      );
    }
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

  updateOtelSpanAttributes(attributes: LangfuseObservationAttributes) {
    this.otelSpan.setAttributes(
      createObservationAttributes(this.type, attributes),
    );
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

  /**
   * Starts a new child observation within this observation.
   *
   * This is a consolidated method that replaces the separate startSpan, startGeneration,
   * and createEvent methods. The observation type is controlled by the `asType` option,
   * which defaults to 'span'.
   *
   * @param name - Name of the observation
   * @param attributes - Attributes to set on the observation (type depends on asType)
   * @param options - Configuration options including observation type
   * @returns The created observation (LangfuseSpan, LangfuseGeneration, or LangfuseEvent)
   *
   * @example
   * ```typescript
   * // Create a child span (default)
   * const childSpan = parentObservation.startObservation('database-query', {
   *   input: { query: 'SELECT * FROM users' },
   *   metadata: { database: 'primary' }
   * });
   *
   * // Create a child generation
   * const generation = parentObservation.startObservation('gpt-4', {
   *   input: [{ role: 'user', content: 'Hello!' }],
   *   model: 'gpt-4',
   *   modelParameters: { temperature: 0.7 }
   * }, { asType: 'generation' });
   *
   * // Create an event
   * const event = parentObservation.startObservation('user-action', {
   *   input: { action: 'click', button: 'submit' },
   *   metadata: { userId: '123' }
   * }, { asType: 'event' });
   * ```
   */
  public startObservation(
    name: string,
    attributes: LangfuseGenerationAttributes,
    options: { asType: "generation" },
  ): LangfuseGeneration;
  public startObservation(
    name: string,
    attributes: LangfuseEventAttributes,
    options: { asType: "event" },
  ): LangfuseEvent;
  public startObservation(
    name: string,
    attributes: LangfuseAgentAttributes,
    options: { asType: "agent" },
  ): LangfuseAgent;
  public startObservation(
    name: string,
    attributes: LangfuseToolAttributes,
    options: { asType: "tool" },
  ): LangfuseTool;
  public startObservation(
    name: string,
    attributes: LangfuseChainAttributes,
    options: { asType: "chain" },
  ): LangfuseChain;
  public startObservation(
    name: string,
    attributes: LangfuseRetrieverAttributes,
    options: { asType: "retriever" },
  ): LangfuseRetriever;
  public startObservation(
    name: string,
    attributes: LangfuseEvaluatorAttributes,
    options: { asType: "evaluator" },
  ): LangfuseEvaluator;
  public startObservation(
    name: string,
    attributes: LangfuseGuardrailAttributes,
    options: { asType: "guardrail" },
  ): LangfuseGuardrail;
  public startObservation(
    name: string,
    attributes: LangfuseEmbeddingAttributes,
    options: { asType: "embedding" },
  ): LangfuseEmbedding;
  public startObservation(
    name: string,
    attributes?: LangfuseSpanAttributes,
    options?: { asType?: "span" },
  ): LangfuseSpan;
  public startObservation(
    name: string,
    attributes?:
      | LangfuseSpanAttributes
      | LangfuseGenerationAttributes
      | LangfuseEventAttributes
      | LangfuseAgentAttributes
      | LangfuseToolAttributes
      | LangfuseChainAttributes
      | LangfuseRetrieverAttributes
      | LangfuseEvaluatorAttributes
      | LangfuseGuardrailAttributes
      | LangfuseEmbeddingAttributes,
    options?: { asType?: LangfuseObservationType },
  ): LangfuseObservation {
    const { asType = "span" } = options || {};

    return startObservation(name, attributes, {
      asType: asType as "span", // typecast necessary as ts cannot narrow the type correctly
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }
}

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
export class LangfuseSpan extends LangfuseBaseObservation {
  constructor(params: LangfuseSpanParams) {
    super({ ...params, type: "span" });
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
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseAgentParams = {
  otelSpan: Span;
  attributes?: LangfuseAgentAttributes;
};

export class LangfuseAgent extends LangfuseBaseObservation {
  constructor(params: LangfuseAgentParams) {
    super({ ...params, type: "span" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseToolParams = {
  otelSpan: Span;
  attributes?: LangfuseToolAttributes;
};

export class LangfuseTool extends LangfuseBaseObservation {
  constructor(params: LangfuseToolParams) {
    super({ ...params, type: "span" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseChainParams = {
  otelSpan: Span;
  attributes?: LangfuseChainAttributes;
};

export class LangfuseChain extends LangfuseBaseObservation {
  constructor(params: LangfuseChainParams) {
    super({ ...params, type: "span" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseRetrieverParams = {
  otelSpan: Span;
  attributes?: LangfuseRetrieverAttributes;
};

export class LangfuseRetriever extends LangfuseBaseObservation {
  constructor(params: LangfuseRetrieverParams) {
    super({ ...params, type: "span" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseEvaluatorParams = {
  otelSpan: Span;
  attributes?: LangfuseEvaluatorAttributes;
};

export class LangfuseEvaluator extends LangfuseBaseObservation {
  constructor(params: LangfuseEvaluatorParams) {
    super({ ...params, type: "span" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseGuardrailParams = {
  otelSpan: Span;
  attributes?: LangfuseGuardrailAttributes;
};

export class LangfuseGuardrail extends LangfuseBaseObservation {
  constructor(params: LangfuseGuardrailParams) {
    super({ ...params, type: "span" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
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
export class LangfuseGeneration extends LangfuseBaseObservation {
  constructor(params: LangfuseGenerationParams) {
    super({ ...params, type: "generation" });
  }

  update(attributes: LangfuseGenerationAttributes): LangfuseGeneration {
    this.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseEmbeddingParams = {
  otelSpan: Span;
  attributes?: LangfuseEmbeddingAttributes;
};

export class LangfuseEmbedding extends LangfuseBaseObservation {
  constructor(params: LangfuseEmbeddingParams) {
    super({ ...params, type: "generation" });
  }

  update(attributes: LangfuseGenerationAttributes): LangfuseGeneration {
    this.updateOtelSpanAttributes(attributes);

    return this;
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
export class LangfuseEvent extends LangfuseBaseObservation {
  constructor(params: LangfuseEventParams) {
    super({ ...params, type: "event" });

    // Events are automatically ended at their timestamp
    this.otelSpan.end(params.timestamp);
  }
}
