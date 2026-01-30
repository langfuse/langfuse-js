import { OpenAiUsage } from "@langfuse/core";

/**
 * Types of observations that can be created in Langfuse.
 *
 * - `span`: General-purpose observations for tracking operations, functions, or logical units of work
 * - `generation`: Specialized observations for LLM calls with model parameters, usage, and costs
 * - `event`: Point-in-time occurrences or log entries within a trace
 *
 * @public
 */
export type LangfuseObservationType =
  | "span"
  | "generation"
  | "event"
  | "embedding"
  | "agent"
  | "tool"
  | "chain"
  | "retriever"
  | "evaluator"
  | "guardrail";

/**
 * Severity levels for observations in Langfuse.
 *
 * Used to categorize the importance or severity of observations:
 * - `DEBUG`: Detailed diagnostic information
 * - `DEFAULT`: Normal operation information
 * - `WARNING`: Potentially problematic situations
 * - `ERROR`: Error conditions that need attention
 *
 * @public
 */
export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
/**
 * Attributes for Langfuse span observations.
 *
 * Spans are used to track operations, functions, or logical units of work.
 * They can contain other spans, generations, or events as children.
 *
 * @public
 */
export type LangfuseSpanAttributes = {
  /** Input data for the operation being tracked */
  input?: unknown;
  /** Output data from the operation */
  output?: unknown;
  /** Additional metadata as key-value pairs */
  metadata?: Record<string, unknown>;
  /** Severity level of the observation */
  level?: ObservationLevel;
  /** Human-readable status message */
  statusMessage?: string;
  /** Version identifier for the code/model being tracked */
  version?: string;
  /** Environment where the operation is running (e.g., 'production', 'staging') */
  environment?: string;
};

/**
 * Attributes for Langfuse generation observations.
 *
 * Generations are specialized observations for tracking LLM interactions,
 * including model parameters, usage metrics, costs, and prompt information.
 *
 * @public
 */
export type LangfuseGenerationAttributes = LangfuseSpanAttributes & {
  /** Timestamp when the model started generating completion */
  completionStartTime?: Date;
  /** Name of the language model used (e.g., 'gpt-4', 'claude-3') */
  model?: string;
  /** Parameters passed to the model (temperature, max_tokens, etc.) */
  modelParameters?: {
    [key: string]: string | number;
  };
  /** Token usage and other model-specific usage metrics */
  usageDetails?:
    | {
        [key: string]: number;
      }
    | OpenAiUsage;
  /** Cost breakdown for the generation (totalCost, etc.) */
  costDetails?: {
    [key: string]: number;
  };
  /** Information about the prompt used from Langfuse prompt management */
  prompt?: {
    /** Name of the prompt template */
    name: string;
    /** Version number of the prompt template */
    version: number;
    /** Whether this is a fallback prompt due to retrieval failure */
    isFallback: boolean;
  };
};

// Span-like observation types
export type LangfuseEventAttributes = LangfuseSpanAttributes;
export type LangfuseAgentAttributes = LangfuseSpanAttributes;
export type LangfuseToolAttributes = LangfuseSpanAttributes;
export type LangfuseChainAttributes = LangfuseSpanAttributes;
export type LangfuseRetrieverAttributes = LangfuseSpanAttributes;
export type LangfuseEvaluatorAttributes = LangfuseSpanAttributes;
export type LangfuseGuardrailAttributes = LangfuseSpanAttributes;

// Generation-like observation types
export type LangfuseEmbeddingAttributes = LangfuseGenerationAttributes;

/**
 * Union type representing any Langfuse observation attributes.
 *
 * This type is used when you need to accept any type of observation attributes.
 *
 * @public
 */
export type LangfuseObservationAttributes = LangfuseSpanAttributes &
  LangfuseGenerationAttributes &
  LangfuseEventAttributes &
  LangfuseAgentAttributes &
  LangfuseToolAttributes &
  LangfuseChainAttributes &
  LangfuseRetrieverAttributes &
  LangfuseEvaluatorAttributes &
  LangfuseGuardrailAttributes;

/**
 * Attributes for setting trace-level input and output only.
 *
 * This is a restricted type used by the deprecated setTraceIO methods,
 * which only allow setting input and output on traces for backward
 * compatibility with legacy Langfuse platform features.
 *
 * @deprecated This type is for backward compatibility with legacy platform features
 * that still rely on trace-level input/output. Use propagateAttributes for other trace attributes.
 *
 * @public
 */
export type LangfuseTraceIOAttributes = {
  /** Input data that initiated the trace */
  input?: unknown;
  /** Final output data from the trace */
  output?: unknown;
};

/**
 * Context information for linking observations to traces.
 *
 * Used internally for maintaining parent-child relationships between observations.
 *
 * @public
 */
export type TraceContext = {
  /** The trace ID that observations should be linked to */
  traceId: string;
  /** Optional parent observation ID for creating hierarchical relationships */
  parentObservationId?: string;
};
