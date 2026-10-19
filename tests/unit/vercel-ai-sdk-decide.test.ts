import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import { LangfuseVercelAiSdkIntegration } from "../../packages/vercel-ai-sdk/src/LangfuseVercelAiSdkIntegration.js";

type DecideStart = Parameters<
  LangfuseVercelAiSdkIntegration["experimental_onDecideStart"]
>[0];
type DecideEnd = Parameters<
  LangfuseVercelAiSdkIntegration["experimental_onDecideEnd"]
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

    integration.experimental_onDecideStart({
      callId: "call-1",
      operationId: "ai.decide",
      provider: "test-provider",
      modelId: "test-decider",
      state: { reply: "yes" },
      questions: { approved: { type: "boolean", instructions: "Approved?" } },
      maxRetries: 0,
      functionId: "approval-check",
      runtimeContext: { feature: "approvals" },
    } as unknown as DecideStart);
    integration.experimental_onDecideEnd({
      callId: "call-1",
      answers: { approved: { type: "boolean", probability: 0.97 } },
    } as unknown as DecideEnd);

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
