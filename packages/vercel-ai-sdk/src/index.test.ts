import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { context, trace } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MockTracer,
  TestContextManager,
  makeChunkEvent,
  makeFinishEvent,
  makeOnStartEvent,
  makeStepStartEvent,
  makeToolExecutionEndEvent,
  makeToolExecutionStartEvent,
} from "./testUtils.js";

import { LangfuseVercelAiSdkIntegration } from "./index.js";

describe("@langfuse/vercel-ai-sdk", () => {
  const contextManager = new TestContextManager();

  beforeAll(() => {
    context.setGlobalContextManager(contextManager.enable());
  });

  afterAll(() => {
    contextManager.disable();
  });

  it("delegates AI SDK span creation to the upstream OpenTelemetry integration", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(makeOnStartEvent());
    integration.onStepStart!(
      makeStepStartEvent({
        promptMessages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(tracer.spans).toHaveLength(2);
    expect(tracer.spans[0].name).toBe("ai.generateText");
    expect(tracer.spans[1].name).toBe("ai.generateText.doGenerate");
    expect(tracer.spans[1].attributes["ai.prompt.messages"]).toContain("hello");
  });

  it("adds Langfuse prompt attributes to generated model-call spans", () => {
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
        promptMessages: [{ role: "user", content: "hello" }],
      }),
    );

    const rootSpan = tracer.spans[0];
    const stepSpan = tracer.spans[1];

    expect(
      rootSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBeUndefined();
    expect(
      stepSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBe("assistant/default");
    expect(
      stepSpan.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION
      ],
    ).toBe(7);
  });

  it("adds observation metadata without setting trace-level Langfuse attributes", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({
      tracer,
      langfuse: {
        metadata: {
          feature: "assistant",
          nested: {
            requestId: "req-123",
          },
        },
      },
    });

    integration.onStart!(makeOnStartEvent());

    const rootSpan = tracer.spans[0];
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.feature`
      ],
    ).toBe("assistant");
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.nested`
      ],
    ).toBe(JSON.stringify({ requestId: "req-123" }));
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
      undefined,
    );
    expect(
      rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
    ).toBe(undefined);
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toBe(
      undefined,
    );
    expect(rootSpan.attributes[LangfuseOtelSpanAttributes.TRACE_NAME]).toBe(
      undefined,
    );
  });

  it("extracts per-call Langfuse context from runtimeContext", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({
      tracer,
      langfuse: {
        metadata: {
          source: "constructor",
          shared: "constructor",
        },
      },
    });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: {
          langfuse: {
            metadata: {
              shared: "runtime",
              requestId: "req-123",
            },
            prompt: {
              name: "runtime/prompt",
              version: 3,
            },
          },
        },
      }),
    );
    integration.onStepStart!(
      makeStepStartEvent({
        promptMessages: [{ role: "user", content: "hello" }],
      }),
    );

    const stepSpan = tracer.spans[1];
    expect(
      stepSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.source`
      ],
    ).toBe("constructor");
    expect(
      stepSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.shared`
      ],
    ).toBe("runtime");
    expect(
      stepSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.requestId`
      ],
    ).toBe("req-123");
    expect(
      stepSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBe("runtime/prompt");
  });

  it("runs nested tool work inside the upstream tool span context", async () => {
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

  it("records stream chunk events through the upstream integration", () => {
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

  it("cleans up Langfuse context after a call finishes", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: {
          langfuse: {
            metadata: {
              call: "first",
            },
          },
        },
      }),
    );
    integration.onFinish!(makeFinishEvent());

    integration.onStart!(
      makeOnStartEvent({
        callId: "call-2",
      }),
    );

    const secondRootSpan = tracer.spans[1];
    expect(
      secondRootSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.call`
      ],
    ).toBeUndefined();
  });
});
