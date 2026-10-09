import { getGlobalLogger, LangfuseOtelSpanAttributes } from "@langfuse/core";
import { describe, expect, it, vi } from "vitest";

// Internal helper (not part of the public API)
import { createLangfuseObservationAttributes } from "../../packages/vercel-ai-sdk/src/utils.js";

const PREFIX = LangfuseOtelSpanAttributes.OBSERVATION_METADATA;

describe("vercel-ai-sdk createLangfuseObservationAttributes", () => {
  it("should JSON-encode every metadata value like the tracing SDK", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const attributes = createLangfuseObservationAttributes({
      spanType: "languageModel",
      runtimeContext: {
        n: 3,
        s: "3",
        b: true,
        empty: "",
        nested: { a: 1 },
        list: [1, 2],
        nothing: null,
        callback: () => "ignored",
        circular,
      },
    });

    expect(attributes).toStrictEqual({
      [`${PREFIX}.n`]: "3",
      [`${PREFIX}.s`]: '"3"',
      [`${PREFIX}.b`]: "true",
      [`${PREFIX}.empty`]: '""',
      [`${PREFIX}.nested`]: '{"a":1}',
      [`${PREFIX}.list`]: "[1,2]",
      [`${PREFIX}.circular`]: '"<failed to serialize>"',
    });
  });

  it("should debug-log metadata keys that are not written", () => {
    const debug = vi.spyOn(getGlobalLogger(), "debug");

    try {
      createLangfuseObservationAttributes({
        spanType: "languageModel",
        runtimeContext: { nothing: null, kept: 1 },
      });

      const messages = debug.mock.calls.map(([message]) => message);
      expect(messages).toContain(
        'Observation metadata key "nothing" was not written because its value is null',
      );
      expect(messages.some((m) => String(m).includes('key "kept"'))).toBe(
        false,
      );
    } finally {
      debug.mockRestore();
    }
  });
});
