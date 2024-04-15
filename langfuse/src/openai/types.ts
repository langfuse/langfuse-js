import type OpenAI from "openai";
import type {
  CreateLangfuseTraceBody,
  CreateLangfuseGenerationBody,
  LangfuseTraceClient,
  LangfuseSpanClient,
  LangfuseGenerationClient,
} from "langfuse-core";
import type { LangfuseSingleton } from "./LangfuseSingleton";

type LangfuseTraceConfig = Pick<
  CreateLangfuseTraceBody,
  "sessionId" | "userId" | "release" | "version" | "metadata" | "tags"
>;
type LangfuseGenerationConfig = Pick<
  CreateLangfuseGenerationBody,
  "metadata" | "version" | "promptName" | "promptVersion"
>;

type LangfuseNewTraceConfig = LangfuseTraceConfig & { clientInitParams?: any }; // TODO
export type LangfuseParent = LangfuseTraceClient | LangfuseSpanClient | LangfuseGenerationClient;
type LangfuseWithParentConfig = { parent: LangfuseParent } & LangfuseGenerationConfig;

export type LangfuseConfig = (LangfuseNewTraceConfig | LangfuseWithParentConfig) & { generationName?: string };
export type LangfuseExtension = OpenAI & Pick<ReturnType<typeof LangfuseSingleton.getInstance>, "flushAsync">;
