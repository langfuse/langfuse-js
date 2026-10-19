import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import { LangfuseVercelAiSdkIntegration } from "../../packages/vercel-ai-sdk/src/LangfuseVercelAiSdkIntegration.js";

// The event types come through the integration: tests resolve the root's older `ai`, which predates them.
type DecideStart = Parameters<
  LangfuseVercelAiSdkIntegration["experimental_onDecideStart"]
>[0];

describe("vercel-ai-sdk experimental_decide telemetry", () => {
  it("should trace a decision as a span with its runtime context as Langfuse metadata", () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const integration = new LangfuseVercelAiSdkIntegration({
      tracer: provider.getTracer("test"),
    });

    const start: DecideStart = {
      callId: "call-1",
      operationId: "ai.decide",
      provider: "test-provider",
      modelId: "test-decider",
      state: { reply: "yes" },
      questions: { approved: { type: "boolean", instructions: "Approved?" } },
      maxRetries: 0,
      functionId: "approval-check",
      runtimeContext: { feature: "approvals" },
      headers: undefined,
      providerOptions: {},
    };
    integration.experimental_onDecideStart(start);
    integration.experimental_onDecideEnd({
      ...start,
      answers: { approved: { type: "boolean", probability: 0.97 } },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
      rounding: undefined,
      providerMetadata: undefined,
      response: { modelId: "test-decider", timestamp: new Date(0), id: "r1" },
    });

    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe("decide test-decider");
    expect(span?.attributes["gen_ai.operation.name"]).toBe("decide");
    expect(
      span?.attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.feature`
      ],
    ).toBe('"approvals"');
  });
});
