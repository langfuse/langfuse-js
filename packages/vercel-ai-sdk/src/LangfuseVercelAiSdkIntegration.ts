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
