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
  StreamTextChunkEvent,
  Telemetry,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolSet,
} from "ai";

import type { LangfuseVercelAiSdkIntegrationOptions } from "./types.js";
import {
  createLangfuseObservationAttributes,
  resolveLangfuseContext,
} from "./utils.js";

export class LangfuseVercelAiSdkIntegration implements Telemetry {
  private readonly delegate: OpenTelemetry;

  constructor(options: LangfuseVercelAiSdkIntegrationOptions = {}) {
    const openTelemetryOptions: ConstructorParameters<typeof OpenTelemetry>[0] =
      {
        tracer: options.tracer,
        enrichSpan: ({ spanType, runtimeContext }) => {
          const langfuseContext = resolveLangfuseContext({
            configuredLangfuse: options.langfuse,
            runtimeContext,
          });

          return createLangfuseObservationAttributes(langfuseContext, spanType);
        },
      };

    this.delegate = new OpenTelemetry(openTelemetryOptions);
  }

  executeTool<T>({
    callId,
    toolCallId,
    execute,
  }: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }): PromiseLike<T> {
    return this.delegate.executeTool({ callId, toolCallId, execute });
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

  onChunk(event: StreamTextChunkEvent<ToolSet>): void {
    this.delegate.onChunk(event);
  }

  onStepFinish(event: GenerateTextStepEndEvent<ToolSet>): void {
    this.delegate.onStepFinish(event);
  }

  /** @deprecated */
  onObjectStepStart(event: GenerateObjectStepStartEvent): void {
    this.delegate.onObjectStepStart(event);
  }

  /** @deprecated */
  onObjectStepFinish(event: GenerateObjectStepEndEvent): void {
    this.delegate.onObjectStepFinish(event);
  }

  onEmbedStart(event: EmbeddingModelCallStartEvent): void {
    this.delegate.onEmbedStart(event);
  }

  onEmbedFinish(event: EmbeddingModelCallEndEvent): void {
    this.delegate.onEmbedFinish(event);
  }

  onRerankStart(event: RerankingModelCallStartEvent): void {
    this.delegate.onRerankStart(event);
  }

  onRerankFinish(event: RerankingModelCallEndEvent): void {
    this.delegate.onRerankFinish(event);
  }

  onFinish(
    event:
      | GenerateTextEndEvent<ToolSet>
      | GenerateObjectEndEvent<unknown>
      | EmbedEndEvent
      | RerankEndEvent,
  ): void {
    this.delegate.onFinish(event);
  }

  onError(error: unknown): void {
    this.delegate.onError(error);
  }
}
