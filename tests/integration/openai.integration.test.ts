import { MAX_OBSERVATION_METADATA_KEYS } from "@langfuse/core";
import { observeOpenAI } from "@langfuse/openai";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const METADATA_PREFIX = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;

function manyKeys(count: number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`key${i}`, i]),
  );
}

function metadataKeys(span: ReadableSpan): string[] {
  return Object.keys(span.attributes)
    .filter((key) => key.startsWith(METADATA_PREFIX))
    .map((key) => key.slice(METADATA_PREFIX.length));
}

describe("OpenAI integration", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await teardownTestEnvironment(testEnv);
  });

  it("should return the response when response metadata exceeds the key limit", async () => {
    const response = {
      id: "resp_1",
      model: "gpt-test",
      status: "completed",
      output_text: "hello",
    };
    const client = {
      responses: {
        create: async (_params: unknown) => response,
      },
    };

    const traced = observeOpenAI(client, {
      generationName: "openai-metadata-limit",
      generationMetadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS),
    });

    await expect(
      traced.responses.create({ model: "gpt-test", input: "hi" }),
    ).resolves.toBe(response);

    await waitForSpanExport(testEnv.mockExporter, 1);

    const span = assertions.expectSpanWithName("openai-metadata-limit");
    const keys = metadataKeys(span);
    expect(keys).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(keys).not.toContain("status");
    expect(span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL]).toBe(
      "gpt-test",
    );
  });

  it("should keep the generation output when generationMetadata exceeds the key limit", async () => {
    const response = {
      id: "resp_2",
      model: "gpt-test-2024",
      status: "completed",
      output_text: "hello",
    };
    const client = {
      responses: {
        create: async (_params: unknown) => response,
      },
    };

    const traced = observeOpenAI(client, {
      generationName: "openai-config-metadata-limit",
      generationMetadata: manyKeys(150),
    });

    await expect(
      traced.responses.create({ model: "gpt-test", input: "hi" }),
    ).resolves.toBe(response);

    await waitForSpanExport(testEnv.mockExporter, 1);

    const span = assertions.expectSpanWithName("openai-config-metadata-limit");
    const keys = metadataKeys(span);
    expect(keys).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(keys).not.toContain("status");
    expect(
      span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT],
    ).toBeDefined();
    expect(span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL]).toBe(
      "gpt-test-2024",
    );
  });
});
