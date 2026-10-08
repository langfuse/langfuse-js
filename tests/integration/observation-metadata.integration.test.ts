import { MAX_OBSERVATION_METADATA_KEYS } from "@langfuse/core";
import {
  startObservation,
  startActiveObservation,
  updateActiveObservation,
  LangfuseOtelSpanAttributes,
} from "@langfuse/tracing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const METADATA_PREFIX = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;

function manyKeys(count: number, prefix = "key"): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i}`, i]),
  );
}

describe("Observation metadata key limit", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await teardownTestEnvironment(testEnv);
  });

  function exportedMetadataKeys(spanName: string): string[] {
    return Object.keys(assertions.expectSpanWithName(spanName).attributes)
      .filter((key) => key.startsWith(METADATA_PREFIX))
      .map((key) => key.slice(METADATA_PREFIX.length));
  }

  it(`should accept exactly ${MAX_OBSERVATION_METADATA_KEYS} keys`, async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    startObservation("max-keys-span", {
      metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS),
    }).end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadataKeys("max-keys-span")).toHaveLength(
      MAX_OBSERVATION_METADATA_KEYS,
    );
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("observation metadata keys"),
    );
  });

  it(`should drop keys beyond ${MAX_OBSERVATION_METADATA_KEYS} and warn once`, async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    startObservation("too-many-keys-span", {
      metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS + 2),
    }).end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadataKeys("too-many-keys-span")).toEqual(
      Object.keys(manyKeys(MAX_OBSERVATION_METADATA_KEYS)),
    );
    const capWarnings = warn.mock.calls.filter((args) =>
      String(args[0]).includes("observation metadata keys"),
    );
    expect(capWarnings).toHaveLength(1);
    expect(capWarnings[0][0]).toContain(
      `Dropped 2 observation metadata keys: metadata can have at most ${MAX_OBSERVATION_METADATA_KEYS} top-level keys.`,
    );
  });

  it("should not count keys with function or null values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    startObservation("skipped-values-span", {
      metadata: {
        callback: () => "ignored",
        empty: null,
        missing: undefined,
        ...manyKeys(MAX_OBSERVATION_METADATA_KEYS),
      },
    }).end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const keys = exportedMetadataKeys("skipped-values-span");
    expect(keys).toEqual(Object.keys(manyKeys(MAX_OBSERVATION_METADATA_KEYS)));
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("observation metadata keys"),
    );
  });

  it("should enforce the limit across start and update", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const span = startObservation("merge-limit-span", {
      metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS - 1, "first"),
    });
    span.update({
      metadata: { first0: "updated", extra0: 1, extra1: 2, extra2: 3 },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const keys = exportedMetadataKeys("merge-limit-span");
    expect(keys).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(keys).toContain("extra0");
    expect(keys).not.toContain("extra1");
    expect(keys).not.toContain("extra2");
    expect(
      assertions.expectSpanWithName("merge-limit-span").attributes[
        `${METADATA_PREFIX}first0`
      ],
    ).toBe("updated");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Dropped 2 observation metadata keys"),
    );
  });

  it("should allow overwrites of existing keys when the limit is reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await startActiveObservation("active-limit-span", async (span) => {
      span.update({ metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS) });
      updateActiveObservation({ metadata: { key0: "updated", late: "x" } });
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    const attributes =
      assertions.expectSpanWithName("active-limit-span").attributes;
    expect(exportedMetadataKeys("active-limit-span")).toHaveLength(
      MAX_OBSERVATION_METADATA_KEYS,
    );
    expect(attributes[`${METADATA_PREFIX}key0`]).toBe("updated");
    expect(attributes[`${METADATA_PREFIX}late`]).toBeUndefined();
    expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE]).toBe(
      "span",
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Dropped 1 observation metadata keys"),
    );
  });

  it("should keep later output when metadata exceeds the OpenTelemetry attribute limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const span = startObservation("regression-span", {
      input: "in",
      metadata: manyKeys(150),
    });
    span.update({ output: "out", metadata: { late: "x" } });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const attributes =
      assertions.expectSpanWithName("regression-span").attributes;
    expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT]).toBe("in");
    expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]).toBe(
      "out",
    );
    expect(exportedMetadataKeys("regression-span")).toEqual(
      Object.keys(manyKeys(MAX_OBSERVATION_METADATA_KEYS)),
    );
  });
});
