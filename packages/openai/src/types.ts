import { SpanContext } from "@opentelemetry/api";

export type LangfuseConfig = {
  parentSpanContext?: SpanContext;
  traceName?: string;
  sessionId?: string;
  userId?: string;
  tags?: string[];

  generationName?: string;
  generationMetadata?: Record<string, unknown>;
  langfusePrompt?: {
    name: string;
    version: number;
    isFallback: boolean;
  };
};
