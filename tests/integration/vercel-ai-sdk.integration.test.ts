import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { generateText, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanByName,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const REASONING_KEY = "gen_ai.usage.reasoning.output_tokens";

type MockUsage = {
  inputTokens: {
    total: number | undefined;
    noCache: number | undefined;
    cacheRead: number | undefined;
    cacheWrite: number | undefined;
  };
  outputTokens: {
    total: number | undefined;
    text: number | undefined;
    reasoning: number | undefined;
  };
};

function usage(params: {
  input: number;
  output: number;
  noCache?: number;
  cacheRead?: number;
  cacheWrite?: number;
  text?: number;
  reasoning?: number;
}): MockUsage {
  return {
    inputTokens: {
      total: params.input,
      noCache: params.noCache,
      cacheRead: params.cacheRead,
      cacheWrite: params.cacheWrite,
    },
    outputTokens: {
      total: params.output,
      text: params.text,
      reasoning: params.reasoning,
    },
  };
}

function generateModel(modelId: string, modelUsage: MockUsage) {
  return new MockLanguageModelV4({
    modelId,
    doGenerate: {
      content: [{ type: "text", text: "Hello" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: modelUsage,
      warnings: [],
    },
  });
}

function streamModel(modelId: string, modelUsage: MockUsage) {
  return new MockLanguageModelV4({
    modelId,
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Hello" },
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: modelUsage,
          },
        ],
      }),
    },
  });
}

function telemetry() {
  return {
    isEnabled: true,
    integrations: new LangfuseVercelAiSdkIntegration(),
  };
}

describe("Vercel AI SDK integration usage", () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  async function modelCallSpan(modelId: string): Promise<ReadableSpan> {
    await waitForSpanByName(testEnv.mockExporter, `chat ${modelId}`);
    const span = testEnv.mockExporter.getSpanByName(`chat ${modelId}`);
    if (!span) throw new Error(`span 'chat ${modelId}' was not exported`);
    return span;
  }

  it("records reasoning tokens on the model call span for generateText", async () => {
    await generateText({
      model: generateModel(
        "reasoning-model",
        usage({ input: 41, output: 149, noCache: 41, text: 7, reasoning: 142 }),
      ),
      prompt: "Hi",
      telemetry: telemetry(),
    });

    const span = await modelCallSpan("reasoning-model");
    expect(span.attributes["gen_ai.usage.input_tokens"]).toBe(41);
    // output stays the provider total, so cost does not move
    expect(span.attributes["gen_ai.usage.output_tokens"]).toBe(149);
    expect(span.attributes[REASONING_KEY]).toBe(142);
  });

  it("records reasoning tokens on the model call span for streamText", async () => {
    const result = streamText({
      model: streamModel(
        "reasoning-stream-model",
        usage({ input: 12, output: 50, noCache: 12, text: 20, reasoning: 30 }),
      ),
      prompt: "Hi",
      telemetry: telemetry(),
    });
    await result.consumeStream();

    const span = await modelCallSpan("reasoning-stream-model");
    expect(span.attributes["gen_ai.usage.output_tokens"]).toBe(50);
    expect(span.attributes[REASONING_KEY]).toBe(30);
  });

  it("leaves cached input attributes as written by @ai-sdk/otel", async () => {
    await generateText({
      model: generateModel(
        "cached-model",
        usage({
          input: 100,
          output: 10,
          noCache: 20,
          cacheRead: 70,
          cacheWrite: 10,
          text: 10,
          reasoning: 0,
        }),
      ),
      prompt: "Hi",
      telemetry: telemetry(),
    });

    const span = await modelCallSpan("cached-model");
    expect(span.attributes["gen_ai.usage.input_tokens"]).toBe(100);
    expect(span.attributes["gen_ai.usage.cache_read.input_tokens"]).toBe(70);
    expect(span.attributes["gen_ai.usage.cache_creation.input_tokens"]).toBe(
      10,
    );
    expect(span.attributes["gen_ai.usage.output_tokens"]).toBe(10);
    expect(span.attributes[REASONING_KEY]).toBe(0);
  });

  it("does not write a reasoning count when the provider reports none", async () => {
    await generateText({
      model: generateModel("plain-model", usage({ input: 5, output: 3 })),
      prompt: "Hi",
      telemetry: telemetry(),
    });

    const span = await modelCallSpan("plain-model");
    expect(span.attributes["gen_ai.usage.output_tokens"]).toBe(3);
    expect(span.attributes).not.toHaveProperty(REASONING_KEY);
  });

  it("only writes the reasoning count on the model call span", async () => {
    await generateText({
      model: generateModel(
        "single-span-model",
        usage({ input: 4, output: 9, text: 2, reasoning: 7 }),
      ),
      prompt: "Hi",
      telemetry: telemetry(),
    });

    await modelCallSpan("single-span-model");
    const withReasoning = testEnv.mockExporter.exportedSpans
      .filter((span) => REASONING_KEY in span.attributes)
      .map((span) => span.name);
    expect(withReasoning).toEqual(["chat single-span-model"]);
  });
});
