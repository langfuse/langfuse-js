import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { startObservation } from "@langfuse/tracing";
import { afterEach, describe, expect, it } from "vitest";

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

describe("Trace-level input/output attributes", () => {
  let testEnv: TestEnvironment | undefined;

  afterEach(async () => {
    if (testEnv) await teardownTestEnvironment(testEnv);
    testEnv = undefined;
  });

  it("masks raw trace input/output attributes set directly on a span", async () => {
    testEnv = await setupTestEnvironment({
      spanProcessorConfig: {
        mask: ({ data }) =>
          typeof data === "string" ? data.replace(/secret/g, "***") : data,
      },
    });

    const span = startObservation("root", {
      input: "observation secret input",
      output: "observation secret output",
    });
    span.otelSpan.setAttributes({
      [LangfuseOtelSpanAttributes.TRACE_INPUT]: "trace secret input",
      [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: "trace secret output",
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const attributes = testEnv.mockExporter.getSpanAttributes("root");
    expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT]).toBe(
      "observation *** input",
    );
    expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]).toBe(
      "observation *** output",
    );
    expect(attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]).toBe(
      "trace *** input",
    );
    expect(attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT]).toBe(
      "trace *** output",
    );
  });
});
