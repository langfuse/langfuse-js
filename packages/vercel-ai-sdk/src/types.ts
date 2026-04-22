import type { Tracer } from "@opentelemetry/api";
import type {
  EmbedOnStartEvent,
  ObjectOnStartEvent,
  OnStartEvent,
  RerankOnStartEvent,
  Telemetry,
  TelemetryOptions,
} from "ai";

export type LangfusePrompt = {
  name: string;
  version: number;
  isFallback?: boolean;
};

export type LangfuseContext = {
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  traceName?: string;
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

export type CreateLangfuseTelemetryOptions = Pick<
  TelemetryOptions,
  "functionId" | "isEnabled" | "recordInputs" | "recordOutputs"
> &
  LangfuseContext & {
    tracer?: Tracer;
    integrations?: Telemetry | Telemetry[];
  };
