import { LANGFUSE_TRACER_NAME } from "@langfuse/core";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import {
  isDefaultExportSpan,
  isGenAISpan,
  isKnownLLMInstrumentor,
  isLangfuseSpan,
} from "./span-filter.js";

function createTestSpan(params?: {
  instrumentationScopeName?: string;
  attributes?: Record<string, unknown>;
}): ReadableSpan {
  return {
    name: "test-span",
    attributes: params?.attributes ?? {},
    instrumentationScope: {
      name: params?.instrumentationScopeName ?? "unknown.instrumentation",
      version: undefined,
      schemaUrl: undefined,
    },
  } as unknown as ReadableSpan;
}

describe("span-filter", () => {
  it("matches Langfuse spans", () => {
    const span = createTestSpan({
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });

    expect(isLangfuseSpan(span)).toBe(true);
    expect(isDefaultExportSpan(span)).toBe(true);
  });

  it("matches spans with gen_ai attributes", () => {
    const span = createTestSpan({
      instrumentationScopeName: "custom.instrumentation",
      attributes: {
        "gen_ai.request.model": "gpt-4.1",
      },
    });

    expect(isGenAISpan(span)).toBe(true);
    expect(isDefaultExportSpan(span)).toBe(true);
  });

  it("matches known exact instrumentation scopes", () => {
    const span = createTestSpan({
      instrumentationScopeName: "haystack",
    });

    expect(isKnownLLMInstrumentor(span)).toBe(true);
    expect(isDefaultExportSpan(span)).toBe(true);
  });

  it("matches known instrumentation scope prefixes with boundary-safe checks", () => {
    const span = createTestSpan({
      instrumentationScopeName: "openinference.instrumentation.agno.agent",
    });

    expect(isKnownLLMInstrumentor(span)).toBe(true);
    expect(isDefaultExportSpan(span)).toBe(true);
  });

  it("does not match prefix boundary false positives", () => {
    const span = createTestSpan({
      instrumentationScopeName: "openinference.instrumentation.agno2.agent",
    });

    expect(isKnownLLMInstrumentor(span)).toBe(false);
    expect(isDefaultExportSpan(span)).toBe(false);
  });

  it("keeps ai exact-only (does not match ai.*)", () => {
    const span = createTestSpan({
      instrumentationScopeName: "ai.something",
    });

    expect(isKnownLLMInstrumentor(span)).toBe(false);
    expect(isDefaultExportSpan(span)).toBe(false);
  });

  it("rejects unknown instrumentation scopes", () => {
    const span = createTestSpan({
      instrumentationScopeName: "unknown.instrumentation",
    });

    expect(isKnownLLMInstrumentor(span)).toBe(false);
    expect(isDefaultExportSpan(span)).toBe(false);
  });
});
