import type { Tracer } from "@opentelemetry/api";
import type {
  EmbedOnStartEvent,
  ObjectOnStartEvent,
  OnStartEvent,
  RerankOnStartEvent,
} from "ai";

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

export type LangfuseStartEvent =
  | OnStartEvent
  | ObjectOnStartEvent
  | EmbedOnStartEvent
  | RerankOnStartEvent;

export type LangfuseContextResolver = (
  event: LangfuseStartEvent,
) => LangfuseContext | undefined;

export type LangfuseVercelAiSdkIntegrationOptions = {
  tracer?: Tracer;
  langfuse?: LangfuseContext | LangfuseContextResolver;
};
