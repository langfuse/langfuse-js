export { observeOpenAI } from "./observeOpenAI.js";
export * from "./types.js";
export type { WithLangfuseIds } from "./langfuseIds.js";

/**
 * Module augmentation for OpenAI SDK response types.
 *
 * When `observeOpenAI` wraps a client, all response objects are augmented
 * with Langfuse observation and trace IDs at runtime. These declarations
 * make TypeScript aware of those properties so consumers don't need casts.
 *
 * The properties are marked optional because the base OpenAI types are also
 * used without `observeOpenAI`.
 */
declare module "openai/resources/chat/completions/completions" {
  interface ChatCompletion {
    /** Langfuse observation ID — present when the client is wrapped with `observeOpenAI` */
    langfuseObservationId?: string;
    /** Langfuse trace ID — present when the client is wrapped with `observeOpenAI` */
    langfuseTraceId?: string;
  }
}

declare module "openai/resources/responses/responses" {
  interface Response {
    /** Langfuse observation ID — present when the client is wrapped with `observeOpenAI` */
    langfuseObservationId?: string;
    /** Langfuse trace ID — present when the client is wrapped with `observeOpenAI` */
    langfuseTraceId?: string;
  }
}
