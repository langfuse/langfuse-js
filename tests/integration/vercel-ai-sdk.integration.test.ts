import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { propagateAttributes } from "@langfuse/tracing";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { describe, expect, it } from "vitest";
import z from "zod";

import {
  generateObject,
  generateText,
} from "../../packages/vercel-ai-sdk/node_modules/ai/dist/index.js";
import { MockLanguageModelV4 } from "../../packages/vercel-ai-sdk/node_modules/ai/dist/test/index.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
} from "./helpers/testSetup.js";

describe("@langfuse/vercel-ai-sdk integration", () => {
  it("emits the object generation model span", async () => {
    const env = await setupTestEnvironment({
      spanProcessorConfig: {
        shouldExportSpan: () => true,
      },
    });

    try {
      const result = await generateObject({
        model: new MockLanguageModelV4({
          provider: "mock-provider",
          modelId: "mock-model",
          doGenerate: async () => ({
            content: [{ type: "text", text: '{"answer":"ok"}' }],
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 4,
                noCache: 4,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 6,
                text: 6,
                reasoning: undefined,
              },
            },
            warnings: [],
          }),
        }),
        schema: z.object({
          answer: z.string(),
        }),
        prompt: "Generate a JSON object",
        telemetry: {
          integrations: new LangfuseVercelAiSdkIntegration(),
        },
      });

      expect(result.object).toEqual({ answer: "ok" });

      await env.spanProcessor.forceFlush();
      await waitForSpanExport(env.mockExporter, 2);

      const rootSpan = env.mockExporter.getSpanByName(
        "invoke_agent mock-model",
      );
      const modelSpan = env.mockExporter.getSpanByName("chat mock-model");

      expect(rootSpan).toBeDefined();
      expect(modelSpan).toBeDefined();
      expect(modelSpan?.attributes).toMatchObject({
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "mock-model",
        "gen_ai.output.type": "json",
        "gen_ai.response.model": "mock-model",
        "gen_ai.usage.input_tokens": 4,
        "gen_ai.usage.output_tokens": 6,
      });
      expect(modelSpan?.attributes["gen_ai.input.messages"]).toContain(
        "Generate a JSON object",
      );
      expect(modelSpan?.attributes["gen_ai.output.messages"]).toContain(
        "answer",
      );
    } finally {
      await teardownTestEnvironment(env);
    }
  });

  it("propagates trace attributes onto AI SDK v7 telemetry spans", async () => {
    const env = await setupTestEnvironment({
      spanProcessorConfig: {
        shouldExportSpan: () => true,
      },
    });

    try {
      await propagateAttributes(
        {
          userId: "user-ai-sdk",
          sessionId: "session-ai-sdk",
          traceName: "ai-sdk-v7-trace",
          tags: ["ai-sdk", "v7"],
          metadata: {
            route: "chat",
          },
        },
        async () => {
          await generateText({
            model: new MockLanguageModelV4({
              provider: "mock-provider",
              modelId: "mock-model",
              doGenerate: async () => ({
                content: [{ type: "text", text: "Hello from v7 telemetry" }],
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 20,
                    text: 20,
                    reasoning: undefined,
                  },
                },
                warnings: [],
              }),
            }),
            prompt: "Hello",
            runtimeContext: {
              feature: "propagation-test",
            },
            telemetry: {
              functionId: "test-ai-sdk-propagation",
              includeRuntimeContext: {
                feature: true,
              },
              integrations: new LangfuseVercelAiSdkIntegration(),
            },
          });
        },
      );

      await env.spanProcessor.forceFlush();
      await waitForSpanExport(env.mockExporter, 3);

      const spans = env.mockExporter.exportedSpans.filter((span) =>
        ["invoke_agent mock-model", "step 1", "chat mock-model"].includes(
          span.name,
        ),
      );

      expect(spans.map((span) => span.name).sort()).toEqual([
        "chat mock-model",
        "invoke_agent mock-model",
        "step 1",
      ]);

      for (const span of spans) {
        expect(span.attributes).toMatchObject({
          [LangfuseOtelSpanAttributes.TRACE_USER_ID]: "user-ai-sdk",
          [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: "session-ai-sdk",
          [LangfuseOtelSpanAttributes.TRACE_NAME]: "ai-sdk-v7-trace",
          [`${LangfuseOtelSpanAttributes.TRACE_METADATA}.route`]: "chat",
          [`${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.feature`]:
            "propagation-test",
        });
        expect(span.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
          "ai-sdk",
          "v7",
        ]);
      }
    } finally {
      await teardownTestEnvironment(env);
    }
  });
});
