import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { context, trace } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LangfuseVercelAiSdkIntegration } from "../index.js";

import {
  MockTracer,
  TestContextManager,
  makeFinishEvent,
  makeLanguageModelCallEndEvent,
  makeLanguageModelCallStartEvent,
  makeOnStartEvent,
  makeStepStartEvent,
  makeToolExecutionEndEvent,
  makeToolExecutionStartEvent,
} from "./testUtils.js";

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
        messages: [{ role: "user", content: "hello" }],
      }),
    );
    integration.onLanguageModelCallStart!(
      makeLanguageModelCallStartEvent({
        messages: [{ role: "user", content: "hello" }],
      }),
    );
    integration.onLanguageModelCallEnd!(makeLanguageModelCallEndEvent());

    expect(tracer.spans).toHaveLength(3);
    expect(tracer.spans[0].name).toBe("invoke_agent mock-model-id");
    expect(tracer.spans[1].name).toBe("step 1");
    expect(tracer.spans[2].name).toBe("chat mock-model-id");
    expect(tracer.spans[2].attributes["gen_ai.input.messages"]).toContain(
      "hello",
    );
    expect(tracer.spans[2].ended).toBe(true);
  });

  it("adds Langfuse prompt attributes to generated model-call spans", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });
    const runtimeContext = {
      langfusePrompt: {
        name: "assistant/default",
        version: 7,
        isFallback: false,
      },
    };

    integration.onStart!(makeOnStartEvent({ runtimeContext }));
    integration.onStepStart!(makeStepStartEvent({ runtimeContext }));
    integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());

    const rootSpan = tracer.spans[0];
    const stepSpan = tracer.spans[1];
    const modelCallSpan = tracer.spans[2];

    expect(
      rootSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBeUndefined();
    expect(
      stepSpan.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME],
    ).toBeUndefined();
    expect(
      modelCallSpan.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME
      ],
    ).toBe("assistant/default");
    expect(
      modelCallSpan.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION
      ],
    ).toBe(7);
  });

  it("adds observation metadata without setting trace-level Langfuse attributes", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: {
          feature: "assistant",
          nested: {
            requestId: "req-123",
          },
          langfuse: {
            metadata: {
              ignored: false,
            },
          },
        },
      }),
    );

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
    expect(
      rootSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse`
      ],
    ).toBe(JSON.stringify({ metadata: { ignored: false } }));
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

  it("maps runtimeContext to observation metadata and prompt attributes", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });
    const runtimeContext = {
      requestId: "req-123",
      langfusePrompt: {
        name: "runtime/prompt",
        version: 3,
      },
    };

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext,
      }),
    );
    integration.onStepStart!(
      makeStepStartEvent({
        runtimeContext,
      }),
    );
    integration.onLanguageModelCallStart!(makeLanguageModelCallStartEvent());

    const modelCallSpan = tracer.spans[2];
    expect(
      modelCallSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.requestId`
      ],
    ).toBe("req-123");
    expect(
      modelCallSpan.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME
      ],
    ).toBe("runtime/prompt");
    expect(
      modelCallSpan.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfusePrompt`
      ],
    ).toBeUndefined();
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
        await Promise.resolve();
        activeSpanId = trace.getSpan(context.active())?.spanContext().spanId;
        return "ok";
      },
    });

    integration.onToolExecutionEnd!(makeToolExecutionEndEvent());

    expect(tracer.spans).toHaveLength(3);
    expect(activeSpanId).toBe(tracer.spans[2].spanContext().spanId);
    expect(tracer.spans[2].attributes["gen_ai.tool.name"]).toBe("weather");
    expect(tracer.spans[2].ended).toBe(true);
  });

  it("accepts stream chunk events through the upstream integration", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(makeOnStartEvent({ operationId: "ai.streamText" }));
    integration.onStepStart!(makeStepStartEvent());

    expect(tracer.spans[1].events).toEqual([]);
  });

  it("does not reuse runtime context metadata across calls", () => {
    const tracer = new MockTracer();
    const integration = new LangfuseVercelAiSdkIntegration({ tracer });

    integration.onStart!(
      makeOnStartEvent({
        runtimeContext: {
          call: "first",
        },
      }),
    );
    integration.onEnd!(makeFinishEvent());

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
