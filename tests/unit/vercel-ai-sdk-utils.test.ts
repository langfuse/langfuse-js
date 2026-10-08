import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LangfuseVercelAiSdkIntegration } from "../../packages/vercel-ai-sdk/src/index.js";
import { createMetadataDeferringTracer } from "../../packages/vercel-ai-sdk/src/tracer.js";

const METADATA_PREFIX = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;

function manyMetadataAttributes(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${METADATA_PREFIX}key${i}`,
      `${i}`,
    ]),
  );
}

function setupTracer(attributeCountLimit: number) {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanLimits: { attributeCountLimit },
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  return { exporter, tracer: provider.getTracer("test") };
}

describe("vercel-ai-sdk metadata attribute limit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should write metadata last so later attributes are kept", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { exporter, tracer } = setupTracer(20);

    const span = createMetadataDeferringTracer(tracer).startSpan("ai-span", {
      attributes: { "ai.operationId": "op", ...manyMetadataAttributes(30) },
    });
    span.setAttributes({ "ai.response.text": "out", "ai.usage.tokens": 3 });
    span.end();

    const [exported] = exporter.getFinishedSpans();
    const metadataKeys = Object.keys(exported.attributes).filter((key) =>
      key.startsWith(METADATA_PREFIX),
    );
    expect(exported.droppedAttributesCount).toBe(0);
    expect(exported.attributes["ai.operationId"]).toBe("op");
    expect(exported.attributes["ai.response.text"]).toBe("out");
    expect(exported.attributes["ai.usage.tokens"]).toBe(3);
    expect(metadataKeys).toEqual(
      Object.keys(manyMetadataAttributes(metadataKeys.length)),
    );
    expect(metadataKeys).toHaveLength(17);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "Dropped 13 metadata key(s) from observation 'ai-span' to stay within the span attribute limit of 20",
      ),
    );
  });

  it("should keep the AI SDK attributes when runtime context metadata exceeds the limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { exporter, tracer } = setupTracer(40);

    const runtimeContext = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`key${i}`, i]),
    );

    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: "text", text: "hello" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        },
      }),
      prompt: "hi",
      runtimeContext,
      telemetry: {
        isEnabled: true,
        includeRuntimeContext: Object.fromEntries(
          Object.keys(runtimeContext).map((key) => [key, true]),
        ),
        integrations: new LangfuseVercelAiSdkIntegration({ tracer }),
      },
    });

    expect(result.text).toBe("hello");

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(span.droppedAttributesCount).toBe(0);
      expect(
        Object.keys(span.attributes).some((key) =>
          key.startsWith(METADATA_PREFIX),
        ),
      ).toBe(true);
    }
  });
});
