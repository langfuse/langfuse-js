import type { Tracer } from "@opentelemetry/api";

export type LangfusePrompt = {
  name: string;
  version: number;
  isFallback?: boolean;
};

export type LangfuseVercelAiSdkIntegrationOptions = {
  tracer?: Tracer;
};
