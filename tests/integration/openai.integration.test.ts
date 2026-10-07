import { MAX_OBSERVATION_METADATA_KEYS } from "@langfuse/core";
import { observeOpenAI } from "@langfuse/openai";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

describe("OpenAI integration", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
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

    const generationMetadata = Object.fromEntries(
      Array.from({ length: MAX_OBSERVATION_METADATA_KEYS }, (_, i) => [
        `key${i}`,
        i,
      ]),
    );

    const traced = observeOpenAI(client, {
      generationName: "openai-metadata-limit",
      generationMetadata,
    });

    await expect(
      traced.responses.create({ model: "gpt-test", input: "hi" }),
    ).resolves.toBe(response);

    await waitForSpanExport(testEnv.mockExporter, 1);

    const span = assertions.expectSpanWithName("openai-metadata-limit");
    const metadata = JSON.parse(
      span.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA
      ] as string,
    );
    expect(Object.keys(metadata)).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(metadata).not.toHaveProperty("status");
    expect(span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL]).toBe(
      "gpt-test",
    );
  });
});
