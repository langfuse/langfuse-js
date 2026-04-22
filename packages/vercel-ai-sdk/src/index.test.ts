import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { context, trace } from "@opentelemetry/api";
import type { OnStartEvent, Telemetry } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MockTracer,
  TestContextManager,
  makeChunkEvent,
  makeEmbedStartEvent,
  makeFinishEvent,
  makeObjectStartEvent,
  makeOnStartEvent,
  makeRerankStartEvent,
  makeStepFinishEvent,
  makeStepStartEvent,
  makeToolExecutionEndEvent,
  makeToolExecutionStartEvent,
} from "./testUtils.js";

import {
  LangfuseVercelAiSdkIntegration,
  createLangfuseTelemetry,
} from "./index.js";

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
