import { OpenTelemetry } from "@ai-sdk/otel";
import {
  Span,
  trace,
  type Context as OpenTelemetryContext,
  type SpanOptions,
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
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolSet,
} from "ai";

import type { LangfuseVercelAiSdkIntegrationOptions } from "./types.js";
import {
  createLangfuseObservationAttributes,
  hasLangfuseObservationAttributes,
  resolveLangfuseContext,
  type ResolvedLangfuseContext,
} from "./utils.js";

type CallIdLookup = {
  getPendingCallId: () => string | undefined;
  getContext: (callId: string) => ResolvedLangfuseContext | undefined;
  onSpanStarted: (callId: string, span: Span) => void;
  getCallIdForParentContext: (
    parentContext: OpenTelemetryContext | undefined,
  ) => string | undefined;
};

class LangfuseDecoratingTracer implements Tracer {
  constructor(
    private readonly delegate: Tracer,
    private readonly callIds: CallIdLookup,
  ) {}

  startSpan(
    name: string,
    options?: SpanOptions,
    parentContext?: OpenTelemetryContext,
  ): Span {
    const callId =
      this.callIds.getPendingCallId() ??
      this.callIds.getCallIdForParentContext(parentContext);
    const langfuseContext = callId
      ? this.callIds.getContext(callId)
      : undefined;
    const langfuseAttributes = langfuseContext
      ? createLangfuseObservationAttributes(langfuseContext, name)
      : {};

    const span = this.delegate.startSpan(
      name,
      Object.keys(langfuseAttributes).length > 0
        ? {
            ...options,
            attributes: {
              ...options?.attributes,
              ...langfuseAttributes,
            },
          }
        : options,
      parentContext,
    );

    if (callId) {
      this.callIds.onSpanStarted(callId, span);
    }

    return span;
  }

  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    context: OpenTelemetryContext,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    arg1: F | SpanOptions,
    arg2?: F | OpenTelemetryContext,
    arg3?: F,
  ): ReturnType<F> {
    return (
      this.delegate.startActiveSpan as (...args: unknown[]) => ReturnType<F>
    )(name, arg1, arg2, arg3);
  }
}

export class LangfuseVercelAiSdkIntegration implements Telemetry {
  private readonly contextsByCallId = new Map<
    string,
    ResolvedLangfuseContext
  >();
  private readonly callIdsBySpanId = new Map<string, string>();
  private readonly delegate: OpenTelemetry;
  private pendingStartCallId: string | undefined;
  private readonly configuredLangfuse;

  constructor(options: LangfuseVercelAiSdkIntegrationOptions = {}) {
    this.configuredLangfuse = options.langfuse;

    const tracer = new LangfuseDecoratingTracer(
      options.tracer ?? trace.getTracer("ai"),
      {
        getPendingCallId: () => this.pendingStartCallId,
        getContext: (callId) => this.contextsByCallId.get(callId),
        onSpanStarted: (callId, span) => {
          this.callIdsBySpanId.set(span.spanContext().spanId, callId);
        },
        getCallIdForParentContext: (parentContext) => {
          const parentSpan = parentContext
            ? trace.getSpan(parentContext)
            : undefined;
          const parentSpanId = parentSpan?.spanContext().spanId;
          return parentSpanId
            ? this.callIdsBySpanId.get(parentSpanId)
            : undefined;
        },
      },
    );

    this.delegate = new OpenTelemetry({ tracer });
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
      | OnStartEvent
      | ObjectOnStartEvent
      | EmbedOnStartEvent
      | RerankOnStartEvent,
  ): void {
    if (event.isEnabled !== false) {
      const langfuseContext = resolveLangfuseContext({
        configuredLangfuse: this.configuredLangfuse,
        event,
      });

      if (hasLangfuseObservationAttributes(langfuseContext)) {
        this.contextsByCallId.set(event.callId, langfuseContext);
      }
    }

    this.pendingStartCallId = event.callId;
    try {
      this.delegate.onStart(event);
    } finally {
      this.pendingStartCallId = undefined;
    }
  }

  onStepStart(event: OnStepStartEvent): void {
    this.delegate.onStepStart(event);
  }

  onToolExecutionStart(event: ToolExecutionStartEvent<ToolSet>): void {
    this.delegate.onToolExecutionStart(event);
  }

  onToolExecutionEnd(event: ToolExecutionEndEvent<ToolSet>): void {
    this.delegate.onToolExecutionEnd(event);
  }

  onChunk(event: OnChunkEvent<ToolSet>): void {
    this.delegate.onChunk(event);
  }

  onStepFinish(event: OnStepFinishEvent<ToolSet>): void {
    this.delegate.onStepFinish(event);
  }

  /** @deprecated */
  onObjectStepStart(event: ObjectOnStepStartEvent): void {
    this.delegate.onObjectStepStart(event);
  }

  /** @deprecated */
  onObjectStepFinish(event: ObjectOnStepFinishEvent): void {
    this.delegate.onObjectStepFinish(event);
  }

  onEmbedStart(event: EmbedStartEvent): void {
    this.delegate.onEmbedStart(event);
  }

  onEmbedFinish(event: EmbedFinishEvent): void {
    this.delegate.onEmbedFinish(event);
  }

  onRerankStart(event: RerankStartEvent): void {
    this.delegate.onRerankStart(event);
  }

  onRerankFinish(event: RerankFinishEvent): void {
    this.delegate.onRerankFinish(event);
  }

  onFinish(
    event:
      | OnFinishEvent<ToolSet>
      | ObjectOnFinishEvent<unknown>
      | EmbedOnFinishEvent
      | RerankOnFinishEvent,
  ): void {
    try {
      this.delegate.onFinish(event);
    } finally {
      this.cleanup(event.callId);
    }
  }

  onError(error: unknown): void {
    const callId =
      typeof error === "object" && error !== null && "callId" in error
        ? String(error.callId)
        : undefined;

    try {
      this.delegate.onError(error);
    } finally {
      if (callId) {
        this.cleanup(callId);
      }
    }
  }

  private cleanup(callId: string): void {
    this.contextsByCallId.delete(callId);

    for (const [spanId, spanCallId] of this.callIdsBySpanId.entries()) {
      if (spanCallId === callId) {
        this.callIdsBySpanId.delete(spanId);
      }
    }
  }
}
