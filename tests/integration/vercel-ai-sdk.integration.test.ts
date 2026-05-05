import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { propagateAttributes } from "@langfuse/tracing";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { describe, expect, it } from "vitest";

import { generateText } from "../../packages/vercel-ai-sdk/node_modules/ai/dist/index.js";
import { MockLanguageModelV4 } from "../../packages/vercel-ai-sdk/node_modules/ai/dist/test/index.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
} from "./helpers/testSetup.js";

describe("@langfuse/vercel-ai-sdk integration", () => {
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
              langfuse: {
                metadata: {
                  feature: "propagation-test",
                },
              },
            },
            telemetry: {
              functionId: "test-ai-sdk-propagation",
              integrations: new LangfuseVercelAiSdkIntegration(),
            },
          });
        },
      );

      await env.spanProcessor.forceFlush();
      await waitForSpanExport(env.mockExporter, 2);

      const spans = env.mockExporter.exportedSpans.filter((span) =>
        span.name.startsWith("ai.generateText"),
      );

      expect(spans.map((span) => span.name).sort()).toEqual([
        "ai.generateText",
        "ai.generateText.doGenerate",
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
