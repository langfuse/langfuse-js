import {
  LangfuseOtelSpanAttributes,
  MAX_OBSERVATION_METADATA_KEYS,
} from "@langfuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLangfuseObservationAttributes } from "../../packages/vercel-ai-sdk/src/utils.js";

const METADATA_PREFIX = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;

describe("createLangfuseObservationAttributes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should cap metadata keys and warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const runtimeContext = Object.fromEntries(
      Array.from({ length: MAX_OBSERVATION_METADATA_KEYS + 3 }, (_, i) => [
        `key${i}`,
        i,
      ]),
    );

    const attributes = createLangfuseObservationAttributes({
      runtimeContext: { skipped: null, ...runtimeContext },
      spanType: "languageModel",
    });

    const keys = Object.keys(attributes).filter((key) =>
      key.startsWith(METADATA_PREFIX),
    );
    expect(keys).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(keys[0]).toBe(`${METADATA_PREFIX}key0`);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Dropped 3 observation metadata keys"),
    );
  });
});
