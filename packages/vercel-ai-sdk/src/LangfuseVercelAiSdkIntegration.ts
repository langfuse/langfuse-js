import { OpenTelemetry } from "@ai-sdk/otel";
import type {
  EmbedEndEvent,
  EmbedStartEvent,
  EmbeddingModelCallEndEvent,
  EmbeddingModelCallStartEvent,
  GenerateObjectEndEvent,
  GenerateObjectStartEvent,
  GenerateObjectStepEndEvent,
  GenerateObjectStepStartEvent,
  GenerateTextAbortEvent,
  GenerateTextEndEvent,
  GenerateTextStartEvent,
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  RerankEndEvent,
  RerankStartEvent,
  RerankingModelCallEndEvent,
  RerankingModelCallStartEvent,
  Telemetry,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolSet,
} from "ai";

import type { LangfuseVercelAiSdkIntegrationOptions } from "./types.js";
import { createLangfuseObservationAttributes } from "./utils.js";

/**
 * Langfuse telemetry integration for Vercel AI SDK v7 (`ai@7`).
 *
 * Register this once at application startup (or pass it per-call via
 * `telemetry.integrations`) and every AI SDK call — `generateText`,
 * `streamText`, `generateObject`, `embed`, tool executions — is traced as
 * Langfuse observations. Requires the `LangfuseSpanProcessor` from
 * `@langfuse/otel` to be registered with your OpenTelemetry setup; this
 * integration only creates spans, the processor exports them to Langfuse.
 *
 * For AI SDK versions ≤6, do not use this class — enable
 * `experimental_telemetry: { isEnabled: true }` on each call instead; the
 * `LangfuseSpanProcessor` picks those spans up without an integration.
 *
 * Trace-level attributes (userId, sessionId, tags, traceName, metadata)
 * should be set with `propagateAttributes` from `@langfuse/tracing` around
 * the AI SDK call. Runtime context keys included via the AI SDK `telemetry`
 * option become Langfuse observation metadata; the special key
 * `langfusePrompt` links a Langfuse prompt version to model-call
 * observations instead.
 *
 * @example
 * ```typescript
 * // instrumentation.ts — run once at startup
 * import { registerTelemetry } from "ai";
 * import { LangfuseSpanProcessor } from "@langfuse/otel";
 * import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
 * import { NodeSDK } from "@opentelemetry/sdk-node";
 *
 * const sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] });
 * sdk.start();
 * registerTelemetry(new LangfuseVercelAiSdkIntegration());
 *
 * // app code
 * import { generateText } from "ai";
 * import { propagateAttributes } from "@langfuse/tracing";
 *
 * const { text } = await propagateAttributes(
 *   { userId: "user-123", sessionId: "session-456" },
 *   () =>
 *     generateText({
 *       model,
 *       prompt: "Explain RAG in one paragraph",
 *       telemetry: { functionId: "chat-assistant" },
 *     }),
 * );
 * ```
 *
 * @see https://langfuse.com/integrations/frameworks/vercel-ai-sdk for the full guide incl. Next.js setup
 * @see https://langfuse.com/docs/observability/sdk/overview
 *
 * @public
 */
export class LangfuseVercelAiSdkIntegration implements Telemetry {
  private readonly delegate: OpenTelemetry;

  constructor(options: LangfuseVercelAiSdkIntegrationOptions = {}) {
    const openTelemetryOptions: ConstructorParameters<typeof OpenTelemetry>[0] =
      {
        tracer: options.tracer,
        enrichSpan: ({ spanType, runtimeContext }) =>
          createLangfuseObservationAttributes({
            spanType,
            runtimeContext,
          }),
      };

    this.delegate = new OpenTelemetry(openTelemetryOptions);
  }

  executeTool<T>(params: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }): PromiseLike<T> {
    return this.delegate.executeTool(params);
  }

  executeLanguageModelCall<T>(params: {
    callId: string;
    execute: () => PromiseLike<T>;
  }): PromiseLike<T> {
    return this.delegate.executeLanguageModelCall(params);
  }

  onStart(
    event:
      | GenerateTextStartEvent
      | GenerateObjectStartEvent
      | EmbedStartEvent
      | RerankStartEvent,
  ): void {
    this.delegate.onStart(event);
  }

  onStepStart(event: GenerateTextStepStartEvent): void {
    this.delegate.onStepStart(event);
  }

  onLanguageModelCallStart(event: LanguageModelCallStartEvent): void {
    this.delegate.onLanguageModelCallStart(event);
  }

  onLanguageModelCallEnd(event: LanguageModelCallEndEvent<ToolSet>): void {
    this.delegate.onLanguageModelCallEnd(event);
  }

  onToolExecutionStart(event: ToolExecutionStartEvent<ToolSet>): void {
    this.delegate.onToolExecutionStart(event);
  }

  onToolExecutionEnd(event: ToolExecutionEndEvent<ToolSet>): void {
    this.delegate.onToolExecutionEnd(event);
  }

  onStepEnd(event: GenerateTextStepEndEvent<ToolSet>): void {
    this.delegate.onStepEnd(event);
  }

  /** @deprecated AI SDK v7 still emits object generation model spans through this callback. */
  onObjectStepStart(event: GenerateObjectStepStartEvent): void {
    this.delegate.onObjectStepStart(event);
  }

  /** @deprecated AI SDK v7 still emits object generation model spans through this callback. */
  onObjectStepEnd(event: GenerateObjectStepEndEvent): void {
    this.delegate.onObjectStepEnd(event);
  }

  onEmbedStart(event: EmbeddingModelCallStartEvent): void {
    this.delegate.onEmbedStart(event);
  }

  onEmbedEnd(event: EmbeddingModelCallEndEvent): void {
    this.delegate.onEmbedEnd(event);
  }

  onRerankStart(event: RerankingModelCallStartEvent): void {
    this.delegate.onRerankStart(event);
  }

  onRerankEnd(event: RerankingModelCallEndEvent): void {
    this.delegate.onRerankEnd(event);
  }

  onEnd(
    event:
      | GenerateTextEndEvent<ToolSet>
      | GenerateObjectEndEvent<unknown>
      | EmbedEndEvent
      | RerankEndEvent,
  ): void {
    this.delegate.onEnd(event);
  }

  onAbort(event: GenerateTextAbortEvent<ToolSet>): void {
    this.delegate.onAbort(event);
  }

  onError(error: unknown): void {
    this.delegate.onError(error);
  }
}
