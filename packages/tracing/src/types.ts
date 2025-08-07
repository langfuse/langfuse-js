import { OpenAiUsage } from "@langfuse/core";

export type LangfuseObservationType = "span" | "generation" | "event";
export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
export type LangfuseSpanAttributes = {
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  level?: ObservationLevel;
  statusMessage?: string;
  version?: string;
  environment?: string;
};
export type LangfuseEventAttributes = LangfuseSpanAttributes;
export type LangfuseGenerationAttributes = LangfuseSpanAttributes & {
  completionStartTime?: Date;
  model?: string | null;
  modelParameters?: {
    [key: string]: string | number | null;
  };
  usageDetails?:
    | {
        [key: string]: number;
      }
    | OpenAiUsage;
  costDetails?: {
    [key: string]: number;
  };
  prompt?: {
    name: string;
    version: number;
    isFallback: boolean;
  };
};

export type LangfuseAttributes =
  | LangfuseSpanAttributes
  | LangfuseGenerationAttributes
  | LangfuseEventAttributes;

export type LangfuseTraceAttributes = {
  name?: string;
  userId?: string;
  sessionId?: string;
  version?: string;
  release?: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  tags?: string[];
  public?: boolean;
  environment?: string;
};

export type TraceContext = {
  traceId: string;
  parentObservationId?: string;
};
