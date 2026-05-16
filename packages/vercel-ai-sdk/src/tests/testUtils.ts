import { AsyncLocalStorage } from "async_hooks";

import {
  ROOT_CONTEXT,
  context,
  trace,
  type AttributeValue,
  type Attributes,
  type Context,
  type ContextManager,
  type Exception,
  type Link,
  type Span,
  type SpanContext,
  type SpanOptions,
  type SpanStatus,
  type TimeInput,
  type Tracer,
} from "@opentelemetry/api";
import type {
  EmbedStartEvent,
  GenerateObjectStartEvent,
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  RerankStartEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "ai";

function makeLanguageModelPerformance() {
  return {
    responseTimeMs: 42,
    effectiveOutputTokensPerSecond: 500,
    outputTokensPerSecond: undefined,
    inputTokensPerSecond: undefined,
    effectiveTotalTokensPerSecond: 750,
    timeToFirstOutputTokenMs: undefined,
  };
}

function makeStepPerformance() {
  return {
    ...makeLanguageModelPerformance(),
    stepTimeMs: 50,
    toolExecutionMs: {},
  };
}

export class TestContextManager implements ContextManager {
  private readonly asyncLocalStorage = new AsyncLocalStorage<Context>();

  active(): Context {
    return this.asyncLocalStorage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    executionContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.asyncLocalStorage.run(executionContext, () =>
      fn.call(thisArg as ThisParameterType<F>, ...args),
    );
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
    this.asyncLocalStorage.disable();
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
    parentContext: Context,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    arg1: F | SpanOptions,
    arg2?: F | Context,
    arg3?: F,
  ): ReturnType<F> {
    if (typeof arg1 === "function") {
      const span = this.startSpan(name);
      return context.with(trace.setSpan(context.active(), span), () =>
        arg1(span),
      ) as ReturnType<F>;
    }

    if (typeof arg2 === "function") {
      const span = this.startSpan(name, arg1 as SpanOptions);
      return context.with(trace.setSpan(context.active(), span), () =>
        arg2(span),
      ) as ReturnType<F>;
    }

    if (typeof arg3 === "function") {
      const span = this.startSpan(
        name,
        arg1 as SpanOptions,
        arg2 as Context | undefined,
      );
      return context.with(trace.setSpan(context.active(), span), () =>
        arg3(span),
      ) as ReturnType<F>;
    }

    throw new TypeError("startActiveSpan requires a callback");
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

  addEvent(
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    _startTime?: TimeInput,
  ): this {
    const attributes = isAttributes(attributesOrStartTime)
      ? attributesOrStartTime
      : undefined;

    this.events.push({ name, attributes });
    return this;
  }

  addLink(_link: Link): this {
    return this;
  }

  addLinks(_links: Link[]): this {
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  updateName(_name: string): this {
    return this;
  }

  end(_endTime?: TimeInput): void {
    this.ended = true;
  }

  isRecording(): boolean {
    return true;
  }

  recordException(_exception: Exception, _time?: TimeInput): void {
    // No-op for tests
  }
}

function isAttributes(
  value: Attributes | TimeInput | undefined,
): value is Attributes {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

export function makeOnStartEvent(
  overrides: Partial<OnStartEvent> = {},
): OnStartEvent {
  return {
    callId: "call-1",
    operationId: "ai.generateText",
    provider: "mock-provider",
    modelId: "mock-model-id",
    instructions: undefined,
    messages: [],
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
    output: undefined,
    runtimeContext: {},
    toolsContext: {},
    ...overrides,
  };
}

export function makeObjectStartEvent(
  overrides: Partial<GenerateObjectStartEvent> = {},
): GenerateObjectStartEvent {
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
    ...overrides,
  };
}

export function makeEmbedStartEvent(
  overrides: Partial<EmbedStartEvent> = {},
): EmbedStartEvent {
  return {
    callId: "call-1",
    operationId: "ai.embed",
    provider: "mock-provider",
    modelId: "mock-model-id",
    value: "hello",
    maxRetries: 2,
    headers: undefined,
    providerOptions: undefined,
    ...overrides,
  };
}

export function makeRerankStartEvent(
  overrides: Partial<RerankStartEvent> = {},
): RerankStartEvent {
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
    instructions: undefined,
    messages: [],
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    steps: [],
    providerOptions: undefined,
    output: undefined,
    runtimeContext: {},
    toolsContext: {},
    promptMessages: undefined,
    stepTools: undefined,
    stepToolChoice: undefined,
    ...overrides,
  };
}

export function makeLanguageModelCallStartEvent(
  overrides: Partial<LanguageModelCallStartEvent> = {},
): LanguageModelCallStartEvent {
  return {
    callId: "call-1",
    provider: "mock-provider",
    modelId: "mock-model-id",
    instructions: undefined,
    messages: [],
    tools: undefined,
    maxOutputTokens: 100,
    temperature: 0.7,
    topP: undefined,
    topK: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    stopSequences: undefined,
    seed: undefined,
    ...overrides,
  };
}

export function makeLanguageModelCallEndEvent(
  overrides: Partial<LanguageModelCallEndEvent> = {},
): LanguageModelCallEndEvent {
  return {
    callId: "call-1",
    provider: "mock-provider",
    modelId: "mock-model-id",
    finishReason: "stop",
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
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
    content: [{ type: "text", text: "Hello world" }],
    responseId: "resp-1",
    performance: makeLanguageModelPerformance(),
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
    performance: makeStepPerformance(),
    providerMetadata: undefined,
    ...overrides,
  };
}

export function makeFinishEvent(
  overrides: Partial<OnFinishEvent> = {},
): OnFinishEvent {
  return {
    ...makeStepFinishEvent(),
    responseMessages: [],
    steps: [],
    totalUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
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
    toolCall: {
      type: "tool-call",
      toolCallId: "tool-call-1",
      toolName: "weather",
      input: { location: "Berlin" },
    },
    messages: [],
    toolContext: undefined,
    ...overrides,
  };
}

export function makeToolExecutionEndEvent(
  overrides: Partial<ToolExecutionEndEvent> = {},
): ToolExecutionEndEvent {
  return {
    callId: "call-1",
    toolCall: {
      type: "tool-call",
      toolCallId: "tool-call-1",
      toolName: "weather",
      input: { location: "Berlin" },
    },
    messages: [],
    durationMs: 42,
    toolContext: undefined,
    toolOutput: {
      type: "tool-result",
      toolCallId: "tool-call-1",
      toolName: "weather",
      input: { location: "Berlin" },
      output: { temperature: 21 },
    },
    ...overrides,
  } as ToolExecutionEndEvent;
}
