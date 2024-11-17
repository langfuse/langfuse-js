import type OpenAI from "openai";
import type {
  CreateLangfuseTraceBody,
  CreateLangfuseGenerationBody,
  LangfuseCoreOptions,
  LangfuseTraceClient,
  LangfuseSpanClient,
  LangfuseGenerationClient,
  LangfusePromptClient,
} from "langfuse-core";
import type { LangfuseSingleton } from "./LangfuseSingleton";

export type LangfuseInitParams = {
  publicKey?: string;
  secretKey?: string;
} & LangfuseCoreOptions;

type LangfuseTraceConfig = Pick<
  CreateLangfuseTraceBody,
  "sessionId" | "userId" | "release" | "version" | "metadata" | "tags"
>;
type LangfuseGenerationConfig = Pick<
  CreateLangfuseGenerationBody,
  "metadata" | "version" | "promptName" | "promptVersion"
>;

export type LangfuseNewTraceConfig = LangfuseTraceConfig & { traceId?: string; clientInitParams?: LangfuseInitParams };
export type LangfuseParent = LangfuseTraceClient | LangfuseSpanClient | LangfuseGenerationClient;
export type LangfuseWithParentConfig = LangfuseGenerationConfig & { parent: LangfuseParent };

export type LangfuseConfig = (LangfuseNewTraceConfig | LangfuseWithParentConfig) & {
  generationName?: string;
  langfusePrompt?: LangfusePromptClient;
};
export type LangfuseExtension = OpenAI &
  Pick<ReturnType<typeof LangfuseSingleton.getInstance>, "flushAsync" | "shutdownAsync">;
