import type { Tracer } from "@opentelemetry/api";

/**
 * Reference to a Langfuse prompt version, passed via the AI SDK
 * `runtimeContext.langfusePrompt` key to link a prompt to the resulting
 * generation in Langfuse. Satisfied by prompt clients returned from
 * `langfuse.prompt.get(...)` as well as plain `{ name, version }` objects.
 * Fallback prompts (`isFallback: true`) are never linked.
 *
 * @public
 */
export type LangfusePrompt = {
  /** Name of the prompt in Langfuse prompt management. */
  name: string;
  /** Version number of the prompt. */
  version: number;
  /** Whether this is a fallback prompt. Fallback prompts are never linked. */
  isFallback?: boolean;
};

/**
 * Options for the LangfuseVercelAiSdkIntegration.
 *
 * @public
 */
export type LangfuseVercelAiSdkIntegrationOptions = {
  /**
   * Custom OpenTelemetry tracer to create AI SDK spans with. Defaults to the
   * global tracer provider's tracer; only set this if you manage a
   * non-global tracer provider.
   */
  tracer?: Tracer;
};
