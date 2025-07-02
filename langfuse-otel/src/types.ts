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

export type LangfuseGenerationAttributes = {
  completionStartTime?: Date;
  model?: string | null;
  modelParameters?: {
    [key: string]: string | number | null;
  };
  usageDetails?: {
    [key: string]: number;
  };
  costDetails?: {
    [key: string]: number;
  };
  prompt?: {
    name: string;
    version: number;
  };
};

export type LangfuseTraceAttributes = {
  name?: string;
  userId?: string;
  sessionId?: string;
  version?: string;
  release?: string;
  input?: any;
  output?: any;
  metadata?: any;
  tags?: string[];
  public?: boolean;
};

export type OTELAttributes = Record<
  string,
  string | number | null | undefined | [string | number | null | undefined][]
>;
