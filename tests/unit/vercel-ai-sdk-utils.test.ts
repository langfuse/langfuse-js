import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import { describe, expect, it } from "vitest";

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
});
