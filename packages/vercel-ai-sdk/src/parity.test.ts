import { OpenTelemetry } from "@ai-sdk/otel";
import { context } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MockTracer,
  TestContextManager,
  normalizeSpans,
  runStreamTextTelemetrySequence,
} from "./testUtils.js";

import { LangfuseVercelAiSdkIntegration } from "./index.js";

describe("@langfuse/vercel-ai-sdk parity", () => {
  const contextManager = new TestContextManager();

  beforeAll(() => {
    context.setGlobalContextManager(contextManager.enable());
  });

  afterAll(() => {
    contextManager.disable();
  });

  it("matches the upstream OpenTelemetry span shape for a streamed tool call flow", async () => {
    const referenceTracer = new MockTracer();
    const langfuseTracer = new MockTracer();

    const referenceIntegration = new OpenTelemetry({
      tracer: referenceTracer,
    });
    const langfuseIntegration = new LangfuseVercelAiSdkIntegration({
      tracer: langfuseTracer,
    });

    await runStreamTextTelemetrySequence(referenceIntegration);
    await runStreamTextTelemetrySequence(langfuseIntegration);

    expect(normalizeSpans(langfuseTracer.spans)).toEqual(
      normalizeSpans(referenceTracer.spans),
    );
  });
});
