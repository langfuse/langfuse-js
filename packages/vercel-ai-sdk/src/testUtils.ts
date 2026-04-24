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
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "ai";

export class TestContextManager implements ContextManager {
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
    const withBoundContext = this.with.bind(this);

    return function boundTarget(this: unknown, ...args: unknown[]) {
      return withBoundContext(
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

export class MockTracer implements Tracer {
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

export class MockSpan implements Span {
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

export function makeOnStartEvent(
  overrides: Partial<OnStartEvent> = {},
): OnStartEvent {
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

export function makeObjectStartEvent(
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

export function makeEmbedStartEvent(
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

export function makeRerankStartEvent(
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

export function makeStepStartEvent(
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

export function makeStepFinishEvent(
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

export function makeFinishEvent(
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

export function makeToolExecutionStartEvent(
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

export function makeToolExecutionEndEvent(
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

export function makeChunkEvent(chunk: OnChunkEvent["chunk"]): OnChunkEvent {
  return { chunk };
}
