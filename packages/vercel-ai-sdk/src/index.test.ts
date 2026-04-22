import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import {
  ROOT_CONTEXT,
  context,
  trace,
  type AttributeValue,
  type Attributes,
  type Context,
  type ContextManager,
  type Exception,
  type Span,
  type SpanContext,
  type SpanOptions,
  type SpanStatus,
  type TimeInput,
  type Tracer,
} from "@opentelemetry/api";
import type {
  EmbedOnStartEvent,
  ObjectOnStartEvent,
  OnChunkEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  RerankOnStartEvent,
  Telemetry,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LangfuseVercelAiSdkIntegration,
  createLangfuseTelemetry,
} from "./index.js";

class TestContextManager implements ContextManager {
  private currentContext: Context = ROOT_CONTEXT;

  active(): Context {
    return this.currentContext;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    executionContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previousContext = this.currentContext;
    this.currentContext = executionContext;

    try {
      return fn.call(thisArg as ThisParameterType<F>, ...args);
    } finally {
      this.currentContext = previousContext;
    }
  }

  bind<T>(executionContext: Context, target: T): T {
    if (typeof target !== "function") {
      return target;
    }

    const manager = this;

    return function boundTarget(this: unknown, ...args: unknown[]) {
      return manager.with(
        executionContext,
        target as (...fnArgs: unknown[]) => unknown,
        this,
        ...args,
      );
    } as T;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this.currentContext = ROOT_CONTEXT;
    return this;
  }
}

class MockTracer implements Tracer {
  public spans: MockSpan[] = [];

  startSpan(
    name: string,
    options?: SpanOptions,
    parentContext?: Context,
  ): Span {
    const span = new MockSpan(name, options, parentContext);
    this.spans.push(span);
    return span;
  }

  startActiveSpan(
    name: string,
    arg1: unknown,
    arg2?: unknown,
    arg3?: (span: Span) => unknown,
  ): unknown {
    if (typeof arg1 === "function") {
      const span = this.startSpan(name);
      return context.with(trace.setSpan(context.active(), span), () =>
        arg1(span),
      );
    }

    if (typeof arg2 === "function") {
      const span = this.startSpan(name, arg1 as SpanOptions);
      return context.with(trace.setSpan(context.active(), span), () =>
        arg2(span),
      );
    }

    if (typeof arg3 === "function") {
      const span = this.startSpan(
        name,
        arg1 as SpanOptions,
        arg2 as Context | undefined,
      );
      return context.with(trace.setSpan(context.active(), span), () =>
        arg3(span),
      );
    }
  }
}

class MockSpan implements Span {
  public attributes: Attributes;
  public events: Array<{ name: string; attributes?: Attributes }> = [];
  public status?: SpanStatus;
  public ended = false;
  public parentContext?: Context;
  private readonly spanCtx: SpanContext;

  constructor(
    public readonly name: string,
    options?: SpanOptions,
    parentContext?: Context,
  ) {
    this.attributes = options?.attributes ?? {};
    this.parentContext = parentContext;
    this.spanCtx = {
      traceId: "trace-id",
      spanId: `span-${Math.random().toString(16).slice(2, 10)}`,
      traceFlags: 1,
    };
  }

  spanContext(): SpanContext {
    return this.spanCtx;
  }

  setAttribute(key: string, value: AttributeValue): this {
    this.attributes = { ...this.attributes, [key]: value };
    return this;
  }

  setAttributes(attributes: Attributes): this {
    this.attributes = { ...this.attributes, ...attributes };
    return this;
  }

  addEvent(name: string, attributes?: Attributes): this {
    this.events.push({ name, attributes });
    return this;
  }

  addLink(): this {
    return this;
  }

  addLinks(): this {
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  updateName(): this {
    return this;
  }

  end(): void {
    this.ended = true;
  }

  isRecording(): boolean {
    return true;
  }

  recordException(_exception: Exception, _time?: TimeInput): void {
    // No-op for tests
  }
}

function makeOnStartEvent(overrides: Partial<OnStartEvent> = {}): OnStartEvent {
  return {
    callId: "call-1",
    operationId: "ai.generateText",
    provider: "mock-provider",
    modelId: "mock-model-id",
    system: undefined,
    prompt: "Hello",
    messages: undefined,
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    maxOutputTokens: 100,
    temperature: 0.7,
    topP: undefined,
    topK: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    stopSequences: undefined,
    seed: undefined,
    maxRetries: 2,
    timeout: undefined,
    headers: {
      "user-agent": "ai/7-test",
    },
    providerOptions: undefined,
    stopWhen: [],
    output: undefined,
    isEnabled: true,
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: "test-function",
    runtimeContext: {},
    toolsContext: {},
    ...overrides,
  };
}

function makeObjectStartEvent(
  overrides: Partial<ObjectOnStartEvent> = {},
): ObjectOnStartEvent {
  return {
    callId: "call-1",
    operationId: "ai.generateObject",
    provider: "mock-provider",
    modelId: "mock-model-id",
    system: undefined,
    prompt: "Hello",
    messages: undefined,
    schema: undefined,
    schemaName: undefined,
    schemaDescription: undefined,
    output: "object",
    maxOutputTokens: 100,
    temperature: 0.7,
    topP: undefined,
    topK: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    seed: undefined,
    maxRetries: 2,
    headers: undefined,
    providerOptions: undefined,
    isEnabled: true,
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: "test-function",
    ...overrides,
  };
}

function makeEmbedStartEvent(
  overrides: Partial<EmbedOnStartEvent> = {},
): EmbedOnStartEvent {
  return {
    callId: "call-1",
    operationId: "ai.embed",
    provider: "mock-provider",
    modelId: "mock-model-id",
    value: "hello",
    maxRetries: 2,
    headers: undefined,
    providerOptions: undefined,
    isEnabled: true,
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: "embed-function",
    ...overrides,
  };
}

function makeRerankStartEvent(
  overrides: Partial<RerankOnStartEvent> = {},
): RerankOnStartEvent {
  return {
    callId: "call-1",
    operationId: "ai.rerank",
    provider: "mock-provider",
    modelId: "mock-model-id",
    documents: ["a", "b"],
    query: "hello",
    topN: 2,
    maxRetries: 2,
    headers: undefined,
    providerOptions: undefined,
    isEnabled: true,
    recordInputs: undefined,
    recordOutputs: undefined,
    functionId: "rerank-function",
    ...overrides,
  };
}

function makeStepStartEvent(
  overrides: Partial<OnStepStartEvent> & {
    promptMessages?: Array<Record<string, unknown>>;
    stepTools?: ReadonlyArray<Record<string, unknown>>;
    stepToolChoice?: unknown;
  } = {},
): OnStepStartEvent & {
  promptMessages?: Array<Record<string, unknown>>;
  stepTools?: ReadonlyArray<Record<string, unknown>>;
  stepToolChoice?: unknown;
} {
  return {
    callId: "call-1",
    stepNumber: 0,
    provider: "mock-provider",
    modelId: "mock-model-id",
    system: undefined,
    messages: [],
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    steps: [],
    providerOptions: undefined,
    timeout: undefined,
    headers: undefined,
    stopWhen: [],
    output: undefined,
    functionId: "test-function",
    runtimeContext: {},
    toolsContext: {},
    promptMessages: undefined,
    stepTools: undefined,
    stepToolChoice: undefined,
    ...overrides,
  };
}

function makeStepFinishEvent(
  overrides: Partial<OnStepFinishEvent> = {},
): OnStepFinishEvent {
  return {
    callId: "call-1",
    stepNumber: 0,
    model: {
      provider: "mock-provider",
      modelId: "mock-model-id",
    },
    functionId: "test-function",
    runtimeContext: {},
    toolsContext: {},
    content: [{ type: "text", text: "Hello world" }],
    text: "Hello world",
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: "stop",
    rawFinishReason: "stop",
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
    },
    warnings: [],
    request: { body: undefined },
    response: {
      id: "resp-1",
      modelId: "mock-model-id",
      timestamp: new Date("2026-01-01T00:00:00Z"),
      headers: undefined,
      body: undefined,
      messages: [],
    },
    providerMetadata: undefined,
    ...overrides,
  };
}

function makeFinishEvent(
  overrides: Partial<OnFinishEvent> = {},
): OnFinishEvent {
  return {
    ...makeStepFinishEvent(),
    steps: [],
    totalUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
    },
    ...overrides,
  };
}

function makeToolExecutionStartEvent(
  overrides: Partial<ToolExecutionStartEvent> = {},
): ToolExecutionStartEvent {
  return {
    callId: "call-1",
    stepNumber: 0,
    provider: "mock-provider",
    modelId: "mock-model-id",
    toolCall: {
      type: "tool-call",
      toolCallId: "tool-call-1",
      toolName: "weather",
      input: { location: "Berlin" },
    },
    messages: [],
    functionId: "test-function",
    context: {},
    ...overrides,
  };
}

function makeToolExecutionEndEvent(
  overrides: Partial<ToolExecutionEndEvent> = {},
): ToolExecutionEndEvent {
  return {
    callId: "call-1",
    stepNumber: 0,
    provider: "mock-provider",
    modelId: "mock-model-id",
    toolCall: {
      type: "tool-call",
      toolCallId: "tool-call-1",
      toolName: "weather",
      input: { location: "Berlin" },
    },
    messages: [],
    durationMs: 42,
    functionId: "test-function",
    context: {},
    success: true as const,
    output: { temperature: 21 },
    ...overrides,
  } as ToolExecutionEndEvent;
}

function makeChunkEvent(chunk: OnChunkEvent["chunk"]): OnChunkEvent {
  return { chunk };
}

describe("@langfuse/vercel-ai-sdk", () => {
  const contextManager = new TestContextManager();

  beforeAll(() => {
    context.setGlobalContextManager(contextManager.enable());
  });

  afterAll(() => {
    contextManager.disable();
  });

  it("builds per-call telemetry settings with the Langfuse integration", () => {
    const extraIntegration: Telemetry = {
      onStart: () => {},
    };

    const telemetry = createLangfuseTelemetry({
      functionId: "chat",
      userId: "user-123",
      integrations: extraIntegration,
    });

    expect(telemetry.functionId).toBe("chat");
    expect(telemetry.isEnabled).toBe(true);
    expect(Array.isArray(telemetry.integrations)).toBe(true);
    expect(telemetry.integrations as Telemetry[]).toHaveLength(2);
  });

  it("records AI SDK attributes and Langfuse trace attributes on the root span", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({
      tracer,
      langfuse: {
        userId: "user-123",
        sessionId: "session-456",
        tags: ["production", "chat"],
        metadata: {
          feature: "assistant",
        },
        traceName: "assistant-trace",
      },
    });

    integration.onStart!(makeOnStartEvent());

    expect(tracer.spans).toHaveLength(1);

    const rootSpan = tracer.spans[0];
    expect(rootSpan.name).toBe("ai.generateText");
    expect(rootSpan.attributes["ai.operationId"]).toBe("ai.generateText");
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
      "user-123",
    );
    expect(
      rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
    ).toBe("session-456");
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
      "production",
      "chat",
    ]);
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_NAME]).toBe(
      "assistant-trace",
    );
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.TRACE_METADATA}.feature`
      ],
    ).toBe("assistant");
  });

  it("extracts Langfuse context from runtimeContext for globally registered integrations", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: {
          langfuse: {
            userId: "user-789",
            tags: ["runtime"],
            metadata: {
              team: "growth",
            },
          },
        },
      }),
    );

    const rootSpan = tracer.spans[0];
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
      "user-789",
    );
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
      "runtime",
    ]);
    expect(
      rootSpan.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.team`],
    ).toBe("growth");
  });

  it("lets per-call Langfuse context override constructor defaults", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({
      tracer,
      langfuse: {
        userId: "default-user",
        sessionId: "default-session",
        tags: ["default"],
        metadata: {
          source: "constructor",
          shared: "default",
        },
      },
    });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: {
          langfuse: {
            userId: "runtime-user",
            tags: ["runtime"],
            metadata: {
              shared: "runtime",
              requestId: "req-123",
            },
          },
        },
      }),
    );

    const rootSpan = tracer.spans[0];
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
      "runtime-user",
    );
    expect(
      rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
    ).toBe("default-session");
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
      "runtime",
    ]);
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.TRACE_METADATA}.source`
      ],
    ).toBe("constructor");
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.TRACE_METADATA}.shared`
      ],
    ).toBe("runtime");
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.TRACE_METADATA}.requestId`
      ],
    ).toBe("req-123");
  });

  it("supports legacy metadata extraction for earlier v7 betas", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: undefined,
        metadata: {
          userId: "legacy-user",
          sessionId: "legacy-session",
          tags: ["legacy"],
          langfusePrompt: {
            name: "prompt/name",
            version: 3,
            isFallback: false,
          },
          feature: "legacy-assistant",
        },
      } as Partial<OnStartEvent>),
    );

    integration.onStepStart!(
      makeStepStartEvent({
        promptMessages: [{ role: "user", content: "hello" }],
      }),
    );

    const rootSpan = tracer.spans[0];
    const stepSpan = tracer.spans[1];

    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
      "legacy-user",
    );
    expect(
      stepSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBe("prompt/name");
    expect(
      stepSpan.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION
      ],
    ).toBe(3);
  });

  it("adds Langfuse prompt attributes to generation step spans", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({
      tracer,
      langfuse: {
        prompt: {
          name: "assistant/default",
          version: 7,
          isFallback: false,
        },
      },
    });

    integration.onStart!(makeOnStartEvent());
    integration.onStepStart!(
      makeStepStartEvent({
        promptMessages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "image/png",
                data: new Uint8Array([1, 2, 3]),
              },
            ],
          },
        ],
      }),
    );

    expect(tracer.spans).toHaveLength(2);

    const stepSpan = tracer.spans[1];
    expect(stepSpan.name).toBe("ai.generateText.doGenerate");
    expect(
      stepSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBe("assistant/default");
    expect(
      stepSpan.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION
      ],
    ).toBe(7);
    expect(stepSpan.attributes["ai.prompt.messages"]).toContain("AQID");
  });

  it("creates tool spans and runs nested work inside the tool span context", async () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(makeOnStartEvent());
    integration.onStepStart!(makeStepStartEvent());
    integration.onToolExecutionStart!(makeToolExecutionStartEvent());

    let activeSpanId: string | undefined;

    await integration.executeTool!({
      callId: "call-1",
      toolCallId: "tool-call-1",
      execute: async () => {
        activeSpanId = trace.getSpan(context.active())?.spanContext().spanId;
        return "ok";
      },
    });

    integration.onToolExecutionEnd!(makeToolExecutionEndEvent());

    expect(tracer.spans).toHaveLength(3);
    expect(activeSpanId).toBe(tracer.spans[2].spanContext().spanId);
    expect(tracer.spans[2].attributes["ai.toolCall.name"]).toBe("weather");
    expect(tracer.spans[2].ended).toBe(true);
  });

  it("supports the older tool callback names as compatibility shims", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(makeOnStartEvent());
    integration.onStepStart!(makeStepStartEvent());
    integration.onToolCallStart?.(makeToolExecutionStartEvent());
    integration.onToolCallFinish?.(makeToolExecutionEndEvent());

    expect(tracer.spans).toHaveLength(3);
    expect(tracer.spans[2].ended).toBe(true);
  });

  it("records stream chunk events on the active step span", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(makeOnStartEvent({ operationId: "ai.streamText" }));
    integration.onStepStart!(makeStepStartEvent());
    integration.onChunk!(
      makeChunkEvent({
        type: "ai.stream.firstChunk",
        callId: "call-1",
        stepNumber: 0,
        attributes: {
          "ai.stream.msToFirstChunk": 42,
        },
      }),
    );

    expect(tracer.spans[1].events).toEqual([
      {
        name: "ai.stream.firstChunk",
        attributes: {
          "ai.stream.msToFirstChunk": 42,
        },
      },
    ]);
    expect(tracer.spans[1].attributes["ai.stream.msToFirstChunk"]).toBe(42);
  });
});
