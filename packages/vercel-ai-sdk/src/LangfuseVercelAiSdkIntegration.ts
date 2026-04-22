import {
  type Attributes,
  type Context as OpenTelemetryContext,
  Span,
  SpanStatusCode,
  context,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import type {
  EmbedFinishEvent,
  EmbedOnFinishEvent,
  EmbedOnStartEvent,
  EmbedStartEvent,
  ObjectOnFinishEvent,
  ObjectOnStartEvent,
  ObjectOnStepFinishEvent,
  ObjectOnStepStartEvent,
  OnChunkEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  RerankFinishEvent,
  RerankOnFinishEvent,
  RerankOnStartEvent,
  RerankStartEvent,
  Telemetry,
  TelemetryOptions,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolSet,
} from "ai";

import { stringifyForTelemetry } from "./stringifyForTelemetry.js";
import type {
  LangfuseStartEvent,
  LangfuseVercelAiSdkIntegrationOptions,
} from "./types.js";
import {
  assembleOperationName,
  createLangfusePromptAttributes,
  createLangfuseTraceAttributes,
  getBaseTelemetryAttributes,
  getRuntimeContext,
  resolveLangfuseContext,
  selectAttributes,
  type ResolvedLangfuseContext,
} from "./utils.js";

interface StepStartEventWithPrompt extends OnStepStartEvent {
  readonly promptMessages?: Array<Record<string, unknown>>;
  readonly stepTools?: ReadonlyArray<Record<string, unknown>>;
  readonly stepToolChoice?: unknown;
}

interface CallState {
  operationId: string;
  telemetry: TelemetryOptions | undefined;
  rootSpan: Span | undefined;
  rootContext: OpenTelemetryContext | undefined;
  stepSpan: Span | undefined;
  stepContext: OpenTelemetryContext | undefined;
  embedSpans: Map<string, { span: Span; context: OpenTelemetryContext }>;
  rerankSpan: { span: Span; context: OpenTelemetryContext } | undefined;
  toolSpans: Map<string, { span: Span; context: OpenTelemetryContext }>;
  baseTelemetryAttributes: Attributes;
  settings: Record<string, unknown>;
  langfuse: ResolvedLangfuseContext;
}

function recordSpanError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

export class LangfuseVercelAiSdkIntegration implements Telemetry {
  private readonly callStates = new Map<string, CallState>();
  private readonly tracer: Tracer;
  private readonly configuredLangfuse;

  constructor(options: LangfuseVercelAiSdkIntegrationOptions = {}) {
    this.tracer = options.tracer ?? trace.getTracer("ai");
    this.configuredLangfuse = options.langfuse;
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
    const toolSpanEntry = this.callStates
      .get(callId)
      ?.toolSpans.get(toolCallId);
    if (!toolSpanEntry) {
      return execute();
    }

    return context.with(toolSpanEntry.context, execute);
  }

  onStart(
    event:
      | OnStartEvent
      | ObjectOnStartEvent
      | EmbedOnStartEvent
      | RerankOnStartEvent,
  ): void {
    if (event.isEnabled === false) {
      return;
    }

    if (
      event.operationId === "ai.embed" ||
      event.operationId === "ai.embedMany"
    ) {
      this.onEmbedOperationStart(event as EmbedOnStartEvent);
      return;
    }

    if (event.operationId === "ai.rerank") {
      this.onRerankOperationStart(event as RerankOnStartEvent);
      return;
    }

    if (
      event.operationId === "ai.generateObject" ||
      event.operationId === "ai.streamObject"
    ) {
      this.onObjectOperationStart(event as ObjectOnStartEvent);
      return;
    }

    this.onGenerateStart(event as OnStartEvent);
  }

  onStepStart(event: StepStartEventWithPrompt): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan || !state.rootContext) {
      return;
    }

    const stepOperationId =
      state.operationId === "ai.streamText"
        ? "ai.streamText.doStream"
        : "ai.generateText.doGenerate";

    const attributes = selectAttributes({
      telemetry: state.telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: stepOperationId,
          telemetry: state.telemetry,
        }),
        ...state.baseTelemetryAttributes,
        ...createLangfusePromptAttributes(state.langfuse.prompt),
        "ai.model.provider": event.provider,
        "ai.model.id": event.modelId,
        "ai.prompt.messages": {
          input: () =>
            event.promptMessages
              ? stringifyForTelemetry(event.promptMessages)
              : undefined,
        },
        "ai.prompt.tools": {
          input: () => event.stepTools?.map((tool) => JSON.stringify(tool)),
        },
        "ai.prompt.toolChoice": {
          input: () =>
            event.stepToolChoice != null
              ? JSON.stringify(event.stepToolChoice)
              : undefined,
        },
        "gen_ai.system": event.provider,
        "gen_ai.request.model": event.modelId,
        "gen_ai.request.frequency_penalty": state.settings.frequencyPenalty as
          | number
          | undefined,
        "gen_ai.request.max_tokens": state.settings.maxOutputTokens as
          | number
          | undefined,
        "gen_ai.request.presence_penalty": state.settings.presencePenalty as
          | number
          | undefined,
        "gen_ai.request.stop_sequences": state.settings.stopSequences as
          | string[]
          | undefined,
        "gen_ai.request.temperature": (state.settings.temperature ??
          undefined) as number | undefined,
        "gen_ai.request.top_k": state.settings.topK as number | undefined,
        "gen_ai.request.top_p": state.settings.topP as number | undefined,
      },
    });

    state.stepSpan = this.tracer.startSpan(
      stepOperationId,
      { attributes },
      state.rootContext,
    );
    state.stepContext = trace.setSpan(state.rootContext, state.stepSpan);
  }

  onToolExecutionStart(event: ToolExecutionStartEvent<ToolSet>): void {
    const state = this.callStates.get(event.callId);
    if (!state?.stepContext) {
      return;
    }

    const attributes = selectAttributes({
      telemetry: state.telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: "ai.toolCall",
          telemetry: state.telemetry,
        }),
        "ai.toolCall.name": event.toolCall.toolName,
        "ai.toolCall.id": event.toolCall.toolCallId,
        "ai.toolCall.args": {
          output: () => JSON.stringify(event.toolCall.input),
        },
      },
    });

    const toolSpan = this.tracer.startSpan(
      "ai.toolCall",
      { attributes },
      state.stepContext,
    );
    const toolContext = trace.setSpan(state.stepContext, toolSpan);

    state.toolSpans.set(event.toolCall.toolCallId, {
      span: toolSpan,
      context: toolContext,
    });
  }

  onToolExecutionEnd(event: ToolExecutionEndEvent<ToolSet>): void {
    const state = this.callStates.get(event.callId);
    if (!state) {
      return;
    }

    const toolSpanEntry = state.toolSpans.get(event.toolCall.toolCallId);
    if (!toolSpanEntry) {
      return;
    }

    const { span } = toolSpanEntry;
    if (event.success) {
      try {
        span.setAttributes(
          selectAttributes({
            telemetry: state.telemetry,
            attributes: {
              "ai.toolCall.result": {
                output: () => JSON.stringify(event.output),
              },
            },
          }),
        );
      } catch {
        // Ignore serialization failures from tool outputs.
      }
    } else {
      recordSpanError(span, event.error);
    }

    span.end();
    state.toolSpans.delete(event.toolCall.toolCallId);
  }

  onChunk(event: OnChunkEvent<ToolSet>): void {
    const chunk = event.chunk as {
      type: string;
      callId?: unknown;
      attributes?: unknown;
    };

    if (
      typeof chunk.callId !== "string" ||
      (chunk.type !== "ai.stream.firstChunk" &&
        chunk.type !== "ai.stream.finish")
    ) {
      return;
    }

    const state = this.callStates.get(chunk.callId);
    if (!state?.stepSpan) {
      return;
    }

    const attributes = Object.fromEntries(
      Object.entries(
        (chunk.attributes as Record<string, unknown>) ?? {},
      ).filter(([, value]) => value != null),
    ) as Attributes;

    state.stepSpan.addEvent(chunk.type, attributes);
    if (Object.keys(attributes).length > 0) {
      state.stepSpan.setAttributes(attributes);
    }
  }

  onStepFinish(event: OnStepFinishEvent<ToolSet>): void {
    const state = this.callStates.get(event.callId);
    if (!state?.stepSpan) {
      return;
    }

    state.stepSpan.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          "ai.response.finishReason": event.finishReason,
          "ai.response.text": {
            output: () => event.text ?? undefined,
          },
          "ai.response.reasoning": {
            output: () =>
              event.reasoning.length > 0
                ? event.reasoning
                    .filter((part) => "text" in part)
                    .map((part) => part.text)
                    .join("\n")
                : undefined,
          },
          "ai.response.toolCalls": {
            output: () =>
              event.toolCalls.length > 0
                ? JSON.stringify(
                    event.toolCalls.map((toolCall) => ({
                      toolCallId: toolCall.toolCallId,
                      toolName: toolCall.toolName,
                      input: toolCall.input,
                    })),
                  )
                : undefined,
          },
          "ai.response.files": {
            output: () =>
              event.files.length > 0
                ? JSON.stringify(
                    event.files.map((file) => ({
                      type: "file",
                      mediaType: file.mediaType,
                      data: file.base64,
                    })),
                  )
                : undefined,
          },
          "ai.response.id": event.response.id,
          "ai.response.model": event.response.modelId,
          "ai.response.timestamp": event.response.timestamp.toISOString(),
          "ai.response.providerMetadata": event.providerMetadata
            ? JSON.stringify(event.providerMetadata)
            : undefined,
          "ai.usage.inputTokens": event.usage.inputTokens,
          "ai.usage.outputTokens": event.usage.outputTokens,
          "ai.usage.totalTokens": event.usage.totalTokens,
          "ai.usage.reasoningTokens": event.usage.reasoningTokens,
          "ai.usage.cachedInputTokens": event.usage.cachedInputTokens,
          "ai.usage.inputTokenDetails.noCacheTokens":
            event.usage.inputTokenDetails?.noCacheTokens,
          "ai.usage.inputTokenDetails.cacheReadTokens":
            event.usage.inputTokenDetails?.cacheReadTokens,
          "ai.usage.inputTokenDetails.cacheWriteTokens":
            event.usage.inputTokenDetails?.cacheWriteTokens,
          "ai.usage.outputTokenDetails.textTokens":
            event.usage.outputTokenDetails?.textTokens,
          "ai.usage.outputTokenDetails.reasoningTokens":
            event.usage.outputTokenDetails?.reasoningTokens,
          "gen_ai.response.finish_reasons": [event.finishReason],
          "gen_ai.response.id": event.response.id,
          "gen_ai.response.model": event.response.modelId,
          "gen_ai.usage.input_tokens": event.usage.inputTokens,
          "gen_ai.usage.output_tokens": event.usage.outputTokens,
        },
      }),
    );

    state.stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  }

  /** @deprecated */
  onObjectStepStart(event: ObjectOnStepStartEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan || !state.rootContext) {
      return;
    }

    const stepOperationId =
      state.operationId === "ai.streamObject"
        ? "ai.streamObject.doStream"
        : "ai.generateObject.doGenerate";

    const attributes = selectAttributes({
      telemetry: state.telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: stepOperationId,
          telemetry: state.telemetry,
        }),
        ...state.baseTelemetryAttributes,
        ...createLangfusePromptAttributes(state.langfuse.prompt),
        "ai.prompt.messages": {
          input: () =>
            event.promptMessages
              ? stringifyForTelemetry(
                  event.promptMessages as Array<Record<string, unknown>>,
                )
              : undefined,
        },
        "gen_ai.system": event.provider,
        "gen_ai.request.model": event.modelId,
        "gen_ai.request.frequency_penalty": state.settings.frequencyPenalty as
          | number
          | undefined,
        "gen_ai.request.max_tokens": state.settings.maxOutputTokens as
          | number
          | undefined,
        "gen_ai.request.presence_penalty": state.settings.presencePenalty as
          | number
          | undefined,
        "gen_ai.request.temperature": (state.settings.temperature ??
          undefined) as number | undefined,
        "gen_ai.request.top_k": state.settings.topK as number | undefined,
        "gen_ai.request.top_p": state.settings.topP as number | undefined,
      },
    });

    state.stepSpan = this.tracer.startSpan(
      stepOperationId,
      { attributes },
      state.rootContext,
    );
    state.stepContext = trace.setSpan(state.rootContext, state.stepSpan);
  }

  /** @deprecated */
  onObjectStepFinish(event: ObjectOnStepFinishEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.stepSpan) {
      return;
    }

    state.stepSpan.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          "ai.response.finishReason": event.finishReason,
          "ai.response.object": {
            output: () => {
              try {
                return JSON.stringify(JSON.parse(event.objectText));
              } catch {
                return event.objectText;
              }
            },
          },
          "ai.response.id": event.response.id,
          "ai.response.model": event.response.modelId,
          "ai.response.timestamp": event.response.timestamp.toISOString(),
          "ai.response.providerMetadata": event.providerMetadata
            ? JSON.stringify(event.providerMetadata)
            : undefined,
          "ai.usage.inputTokens": event.usage.inputTokens,
          "ai.usage.outputTokens": event.usage.outputTokens,
          "ai.usage.totalTokens": event.usage.totalTokens,
          "ai.usage.reasoningTokens": event.usage.reasoningTokens,
          "ai.usage.cachedInputTokens": event.usage.cachedInputTokens,
          "gen_ai.response.finish_reasons": [event.finishReason],
          "gen_ai.response.id": event.response.id,
          "gen_ai.response.model": event.response.modelId,
          "gen_ai.usage.input_tokens": event.usage.inputTokens,
          "gen_ai.usage.output_tokens": event.usage.outputTokens,
        },
      }),
    );

    if (event.msToFirstChunk != null) {
      state.stepSpan.addEvent("ai.stream.firstChunk", {
        "ai.stream.msToFirstChunk": event.msToFirstChunk,
      });
      state.stepSpan.setAttributes({
        "ai.stream.msToFirstChunk": event.msToFirstChunk,
      });
    }

    state.stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  }

  onEmbedStart(event: EmbedStartEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan || !state.rootContext) {
      return;
    }

    const attributes = selectAttributes({
      telemetry: state.telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: event.operationId,
          telemetry: state.telemetry,
        }),
        ...state.baseTelemetryAttributes,
        "ai.values": {
          input: () => event.values.map((value) => JSON.stringify(value)),
        },
      },
    });

    const embedSpan = this.tracer.startSpan(
      event.operationId,
      { attributes },
      state.rootContext,
    );
    const embedContext = trace.setSpan(state.rootContext, embedSpan);

    state.embedSpans.set(event.embedCallId, {
      span: embedSpan,
      context: embedContext,
    });
  }

  onEmbedFinish(event: EmbedFinishEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state) {
      return;
    }

    const embedSpanEntry = state.embedSpans.get(event.embedCallId);
    if (!embedSpanEntry) {
      return;
    }

    embedSpanEntry.span.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          "ai.embeddings": {
            output: () =>
              event.embeddings.map((embedding) => JSON.stringify(embedding)),
          },
          "ai.usage.tokens": event.usage.tokens,
        },
      }),
    );

    embedSpanEntry.span.end();
    state.embedSpans.delete(event.embedCallId);
  }

  onRerankStart(event: RerankStartEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan || !state.rootContext) {
      return;
    }

    const attributes = selectAttributes({
      telemetry: state.telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: event.operationId,
          telemetry: state.telemetry,
        }),
        ...state.baseTelemetryAttributes,
        "ai.documents": {
          input: () =>
            event.documents.map((document) => JSON.stringify(document)),
        },
      },
    });

    const rerankSpan = this.tracer.startSpan(
      event.operationId,
      { attributes },
      state.rootContext,
    );
    const rerankContext = trace.setSpan(state.rootContext, rerankSpan);

    state.rerankSpan = {
      span: rerankSpan,
      context: rerankContext,
    };
  }

  onRerankFinish(event: RerankFinishEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rerankSpan) {
      return;
    }

    state.rerankSpan.span.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          "ai.ranking.type": event.documentsType,
          "ai.ranking": {
            output: () =>
              event.ranking.map((ranking) => JSON.stringify(ranking)),
          },
        },
      }),
    );

    state.rerankSpan.span.end();
    state.rerankSpan = undefined;
  }

  onFinish(
    event:
      | OnFinishEvent<ToolSet>
      | ObjectOnFinishEvent<unknown>
      | EmbedOnFinishEvent
      | RerankOnFinishEvent,
  ): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan) {
      return;
    }

    if (
      state.operationId === "ai.embed" ||
      state.operationId === "ai.embedMany"
    ) {
      this.onEmbedOperationFinish(event as EmbedOnFinishEvent);
      return;
    }

    if (state.operationId === "ai.rerank") {
      this.onRerankOperationFinish(event as RerankOnFinishEvent);
      return;
    }

    if (
      state.operationId === "ai.generateObject" ||
      state.operationId === "ai.streamObject"
    ) {
      this.onObjectOperationFinish(event as ObjectOnFinishEvent<unknown>);
      return;
    }

    this.onGenerateFinish(event as OnFinishEvent<ToolSet>);
  }

  onError(error: unknown): void {
    const event = error as { callId?: string; error?: unknown };
    if (!event.callId) {
      return;
    }

    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan) {
      return;
    }

    const actualError = event.error ?? error;

    if (state.stepSpan) {
      recordSpanError(state.stepSpan, actualError);
      state.stepSpan.end();
      state.stepSpan = undefined;
      state.stepContext = undefined;
    }

    for (const { span } of state.embedSpans.values()) {
      recordSpanError(span, actualError);
      span.end();
    }
    state.embedSpans.clear();

    if (state.rerankSpan) {
      recordSpanError(state.rerankSpan.span, actualError);
      state.rerankSpan.span.end();
      state.rerankSpan = undefined;
    }

    for (const { span } of state.toolSpans.values()) {
      recordSpanError(span, actualError);
      span.end();
    }
    state.toolSpans.clear();

    recordSpanError(state.rootSpan, actualError);
    state.rootSpan.end();
    this.callStates.delete(event.callId);
  }

  // Compatibility shim for older v7 betas that still emitted tool call events
  onToolCallStart?(event: ToolExecutionStartEvent<ToolSet>): void {
    this.onToolExecutionStart(event);
  }

  // Compatibility shim for older v7 betas that still emitted tool call events
  onToolCallFinish?(event: ToolExecutionEndEvent<ToolSet>): void {
    this.onToolExecutionEnd(event);
  }

  private onGenerateStart(event: OnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxOutputTokens: event.maxOutputTokens,
      temperature: event.temperature,
      topP: event.topP,
      topK: event.topK,
      presencePenalty: event.presencePenalty,
      frequencyPenalty: event.frequencyPenalty,
      stopSequences: event.stopSequences,
      seed: event.seed,
      maxRetries: event.maxRetries,
    };

    const langfuse = this.resolveStartEventLangfuseContext(event);
    const runtimeContext = getRuntimeContext(
      event as unknown as Record<string, unknown>,
    );
    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: {
        provider: event.provider,
        modelId: event.modelId,
      },
      settings,
      headers: event.headers,
      runtimeContext,
    });

    const attributes = selectAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: event.operationId,
          telemetry,
        }),
        ...baseTelemetryAttributes,
        ...createLangfuseTraceAttributes(langfuse),
        "ai.model.provider": event.provider,
        "ai.model.id": event.modelId,
        "ai.prompt": {
          input: () =>
            JSON.stringify({
              system: event.system,
              prompt: event.prompt,
              messages: event.messages,
            }),
        },
      },
    });

    const rootSpan = this.tracer.startSpan(event.operationId, { attributes });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
      langfuse,
    });
  }

  private onObjectOperationStart(event: ObjectOnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxOutputTokens: event.maxOutputTokens,
      temperature: event.temperature,
      topP: event.topP,
      topK: event.topK,
      presencePenalty: event.presencePenalty,
      frequencyPenalty: event.frequencyPenalty,
      seed: event.seed,
      maxRetries: event.maxRetries,
    };

    const langfuse = this.resolveStartEventLangfuseContext(event);
    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: {
        provider: event.provider,
        modelId: event.modelId,
      },
      settings,
      headers: event.headers,
      runtimeContext: undefined,
    });

    const attributes = selectAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: event.operationId,
          telemetry,
        }),
        ...baseTelemetryAttributes,
        ...createLangfuseTraceAttributes(langfuse),
        "ai.prompt": {
          input: () =>
            JSON.stringify({
              system: event.system,
              prompt: event.prompt,
              messages: event.messages,
            }),
        },
        "ai.schema": event.schema
          ? { input: () => JSON.stringify(event.schema) }
          : undefined,
        "ai.schema.name": event.schemaName,
        "ai.schema.description": event.schemaDescription,
        "ai.settings.output": event.output,
      },
    });

    const rootSpan = this.tracer.startSpan(event.operationId, { attributes });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
      langfuse,
    });
  }

  private onEmbedOperationStart(event: EmbedOnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxRetries: event.maxRetries,
    };

    const langfuse = this.resolveStartEventLangfuseContext(event);
    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: {
        provider: event.provider,
        modelId: event.modelId,
      },
      settings,
      headers: event.headers,
      runtimeContext: undefined,
    });

    const attributes = selectAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: event.operationId,
          telemetry,
        }),
        ...baseTelemetryAttributes,
        ...createLangfuseTraceAttributes(langfuse),
        ...(event.operationId === "ai.embedMany"
          ? {
              "ai.values": {
                input: () =>
                  (event.value as string[]).map((value) =>
                    JSON.stringify(value),
                  ),
              },
            }
          : {
              "ai.value": {
                input: () => JSON.stringify(event.value),
              },
            }),
      },
    });

    const rootSpan = this.tracer.startSpan(event.operationId, { attributes });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
      langfuse,
    });
  }

  private onRerankOperationStart(event: RerankOnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxRetries: event.maxRetries,
    };

    const langfuse = this.resolveStartEventLangfuseContext(event);
    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: {
        provider: event.provider,
        modelId: event.modelId,
      },
      settings,
      headers: event.headers,
      runtimeContext: undefined,
    });

    const attributes = selectAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: event.operationId,
          telemetry,
        }),
        ...baseTelemetryAttributes,
        ...createLangfuseTraceAttributes(langfuse),
        "ai.documents": {
          input: () =>
            event.documents.map((document) => JSON.stringify(document)),
        },
      },
    });

    const rootSpan = this.tracer.startSpan(event.operationId, { attributes });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
      langfuse,
    });
  }

  private onGenerateFinish(event: OnFinishEvent<ToolSet>): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan) {
      return;
    }

    state.rootSpan.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          "ai.response.finishReason": event.finishReason,
          "ai.response.text": {
            output: () => event.text ?? undefined,
          },
          "ai.response.reasoning": {
            output: () =>
              event.reasoning.length > 0
                ? event.reasoning
                    .filter((part) => "text" in part)
                    .map((part) => part.text)
                    .join("\n")
                : undefined,
          },
          "ai.response.toolCalls": {
            output: () =>
              event.toolCalls.length > 0
                ? JSON.stringify(
                    event.toolCalls.map((toolCall) => ({
                      toolCallId: toolCall.toolCallId,
                      toolName: toolCall.toolName,
                      input: toolCall.input,
                    })),
                  )
                : undefined,
          },
          "ai.response.files": {
            output: () =>
              event.files.length > 0
                ? JSON.stringify(
                    event.files.map((file) => ({
                      type: "file",
                      mediaType: file.mediaType,
                      data: file.base64,
                    })),
                  )
                : undefined,
          },
          "ai.response.providerMetadata": event.providerMetadata
            ? JSON.stringify(event.providerMetadata)
            : undefined,
          "ai.usage.inputTokens": event.totalUsage.inputTokens,
          "ai.usage.outputTokens": event.totalUsage.outputTokens,
          "ai.usage.totalTokens": event.totalUsage.totalTokens,
          "ai.usage.reasoningTokens": event.totalUsage.reasoningTokens,
          "ai.usage.cachedInputTokens": event.totalUsage.cachedInputTokens,
          "ai.usage.inputTokenDetails.noCacheTokens":
            event.totalUsage.inputTokenDetails?.noCacheTokens,
          "ai.usage.inputTokenDetails.cacheReadTokens":
            event.totalUsage.inputTokenDetails?.cacheReadTokens,
          "ai.usage.inputTokenDetails.cacheWriteTokens":
            event.totalUsage.inputTokenDetails?.cacheWriteTokens,
          "ai.usage.outputTokenDetails.textTokens":
            event.totalUsage.outputTokenDetails?.textTokens,
          "ai.usage.outputTokenDetails.reasoningTokens":
            event.totalUsage.outputTokenDetails?.reasoningTokens,
        },
      }),
    );

    state.rootSpan.end();
    this.callStates.delete(event.callId);
  }

  private onObjectOperationFinish(event: ObjectOnFinishEvent<unknown>): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan) {
      return;
    }

    state.rootSpan.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          "ai.response.finishReason": event.finishReason,
          "ai.response.object": {
            output: () =>
              event.object != null ? JSON.stringify(event.object) : undefined,
          },
          "ai.response.providerMetadata": event.providerMetadata
            ? JSON.stringify(event.providerMetadata)
            : undefined,
          "ai.usage.inputTokens": event.usage.inputTokens,
          "ai.usage.outputTokens": event.usage.outputTokens,
          "ai.usage.totalTokens": event.usage.totalTokens,
          "ai.usage.reasoningTokens": event.usage.reasoningTokens,
          "ai.usage.cachedInputTokens": event.usage.cachedInputTokens,
        },
      }),
    );

    state.rootSpan.end();
    this.callStates.delete(event.callId);
  }

  private onEmbedOperationFinish(event: EmbedOnFinishEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan) {
      return;
    }

    state.rootSpan.setAttributes(
      selectAttributes({
        telemetry: state.telemetry,
        attributes: {
          ...(state.operationId === "ai.embedMany"
            ? {
                "ai.embeddings": {
                  output: () =>
                    (event.embedding as number[][]).map((embedding) =>
                      JSON.stringify(embedding),
                    ),
                },
              }
            : {
                "ai.embedding": {
                  output: () => JSON.stringify(event.embedding),
                },
              }),
          "ai.usage.tokens": event.usage.tokens,
        },
      }),
    );

    state.rootSpan.end();
    this.callStates.delete(event.callId);
  }

  private onRerankOperationFinish(event: RerankOnFinishEvent): void {
    const state = this.callStates.get(event.callId);
    if (!state?.rootSpan) {
      return;
    }

    state.rootSpan.end();
    this.callStates.delete(event.callId);
  }

  private resolveStartEventLangfuseContext(
    event: LangfuseStartEvent,
  ): ResolvedLangfuseContext {
    return resolveLangfuseContext({
      configuredLangfuse: this.configuredLangfuse,
      event,
    });
  }
}
