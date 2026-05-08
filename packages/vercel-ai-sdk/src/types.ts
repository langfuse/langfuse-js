import type { Tracer } from "@opentelemetry/api";

export type LangfusePrompt = {
  name: string;
  version: number;
  isFallback?: boolean;
};

export type LangfuseContext = {
  /**
   * Metadata attached to AI SDK observations created by this integration.
   * Trace-level user, session, tags, trace name, and metadata should be set
   * with `propagateAttributes` from `@langfuse/tracing`.
   */
  metadata?: Record<string, unknown>;
  prompt?: LangfusePrompt;
};

export type LangfuseVercelAiSdkIntegrationOptions = {
  tracer?: Tracer;
  langfuse?: LangfuseContext;
};
