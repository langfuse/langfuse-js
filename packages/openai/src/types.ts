import { SpanContext } from "@opentelemetry/api";

/**
 * Configuration options for Langfuse OpenAI tracing.
 *
 * This interface defines all available options for customizing how OpenAI
 * SDK calls are traced and stored in Langfuse. It includes both trace-level
 * metadata and generation-specific configuration.
 *
 * @public
 */
export type LangfuseConfig = {
  /** OpenTelemetry span context to use as parent for the generated span */
  parentSpanContext?: SpanContext;
  /** Name for the trace that will contain this generation */
  traceName?: string;
  /** Session identifier to group related interactions */
  sessionId?: string;
  /** User identifier for associating the trace with a specific user */
  userId?: string;
  /** Tags for categorizing and filtering traces */
  tags?: string[];

  /** Custom name for the generation observation (defaults to SDK method name) */
  generationName?: string;
  /** Additional metadata to attach to the generation */
  generationMetadata?: Record<string, unknown>;
  /** Information about the Langfuse prompt used for this generation */
  langfusePrompt?: {
    /** Name of the prompt template in Langfuse */
    name: string;
    /** Version number of the prompt template */
    version: number;
    /** Whether this is a fallback prompt due to retrieval failure */
    isFallback: boolean;
  };
};
