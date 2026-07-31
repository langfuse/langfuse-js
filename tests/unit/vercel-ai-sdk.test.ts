import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { generateText, streamText } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";

import { LangfuseVercelAiSdkIntegration } from "../../packages/vercel-ai-sdk/src/LangfuseVercelAiSdkIntegration.js";

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: 0,
  },
};

describe("LangfuseVercelAiSdkIntegration", () => {
  const providers: BasicTracerProvider[] = [];

  afterEach(async () => {
    await Promise.all(
      providers.splice(0).map((provider) => provider.shutdown()),
    );
  });

  it.each([
    {
      name: "generateText",
      run: async (integration: LangfuseVercelAiSdkIntegration) => {
        await generateText({
          model: new MockLanguageModelV4({
            modelId: "primary-model",
            doGenerate: {
              content: [{ type: "text", text: "fallback response" }],
              finishReason: { unified: "stop", raw: "stop" },
              usage,
              warnings: [],
              response: { modelId: "fallback-model" },
            },
          }),
          prompt: "test prompt",
          telemetry: { isEnabled: true, integrations: integration },
        });
      },
    },
    {
      name: "streamText",
      run: async (integration: LangfuseVercelAiSdkIntegration) => {
        const result = streamText({
          model: new MockLanguageModelV4({
            modelId: "primary-model",
            doStream: {
              stream: simulateReadableStream({
                chunks: [
                  { type: "stream-start", warnings: [] },
                  {
                    type: "response-metadata",
                    id: "response-id",
                    modelId: "fallback-model",
                  },
                  { type: "text-start", id: "text-1" },
                  {
                    type: "text-delta",
                    id: "text-1",
                    delta: "fallback response",
                  },
                  { type: "text-end", id: "text-1" },
                  {
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage,
                  },
                ],
              }),
            },
          }),
          prompt: "test prompt",
          telemetry: { isEnabled: true, integrations: integration },
        });

        await result.text;
      },
    },
  ])("records the resolved response model for $name", async ({ run }) => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    providers.push(provider);

    await run(
      new LangfuseVercelAiSdkIntegration({
        tracer: provider.getTracer("langfuse-vercel-ai-sdk-test"),
      }),
    );
    await provider.forceFlush();

    const modelCallSpan = exporter
      .getFinishedSpans()
      .find((span) => span.attributes["gen_ai.operation.name"] === "chat");

    expect(modelCallSpan).toBeDefined();
    expect(modelCallSpan?.attributes["gen_ai.request.model"]).toBe(
      "primary-model",
    );
    expect(modelCallSpan?.attributes["gen_ai.response.model"]).toBe(
      "fallback-model",
    );
  });
});
