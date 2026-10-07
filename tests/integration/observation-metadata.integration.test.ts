import {
  startObservation,
  startActiveObservation,
  updateActiveObservation,
  LangfuseOtelSpanAttributes,
} from "@langfuse/tracing";
import { MAX_OBSERVATION_METADATA_KEYS } from "@langfuse/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

function manyKeys(count: number, prefix = "key"): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i}`, i]),
  );
}

describe("Observation metadata", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  function exportedMetadata(spanName: string): unknown {
    const span = assertions.expectSpanWithName(spanName);
    const value =
      span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_METADATA];

    return typeof value === "string" ? JSON.parse(value) : value;
  }

  it("should write metadata as a single JSON attribute", async () => {
    const span = startObservation("blob-span", {
      metadata: {
        environment: "prod",
        retries: 3,
        database: { host: "localhost", port: 5432 },
      },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const attributeKeys = Object.keys(
      assertions.expectSpanWithName("blob-span").attributes,
    ).filter((key) =>
      key.startsWith(LangfuseOtelSpanAttributes.OBSERVATION_METADATA),
    );
    expect(attributeKeys).toEqual([
      LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
    ]);
    expect(exportedMetadata("blob-span")).toEqual({
      environment: "prod",
      retries: 3,
      database: { host: "localhost", port: 5432 },
    });
  });

  it("should merge metadata across updates", async () => {
    const span = startObservation("merge-span", {
      metadata: { a: 1, b: "first" },
    });
    span.update({ metadata: { b: "second", c: true } });
    span.update({ input: "no metadata in this update" });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("merge-span")).toEqual({
      a: 1,
      b: "second",
      c: true,
    });
  });

  it("should merge updateActiveObservation metadata with earlier metadata", async () => {
    await startActiveObservation("active-merge-span", async (span) => {
      span.update({ metadata: { origin: "wrapper" } });
      updateActiveObservation({ metadata: { step: 2 } });
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("active-merge-span")).toEqual({
      origin: "wrapper",
      step: 2,
    });
  });

  it("should keep earlier values for keys updated with null or undefined", async () => {
    const span = startObservation("null-span", {
      metadata: { a: 1, b: 2 },
    });
    span.update({ metadata: { a: null, b: undefined, c: 3 } });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("null-span")).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("should not write the attribute for empty metadata", async () => {
    const span = startObservation("empty-span", { metadata: {} });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("empty-span")).toBeUndefined();
  });

  it("should only replace values that fail to serialize", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const span = startObservation("circular-span", {
      metadata: { ok: "yes", circular },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("circular-span")).toEqual({
      ok: "yes",
      circular: "<failed to serialize>",
    });
  });

  it(`should accept exactly ${MAX_OBSERVATION_METADATA_KEYS} keys`, async () => {
    const span = startObservation("max-keys-span", {
      metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS),
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(
      Object.keys(exportedMetadata("max-keys-span") as object),
    ).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
  });

  it(`should throw when metadata exceeds ${MAX_OBSERVATION_METADATA_KEYS} keys`, () => {
    expect(() =>
      startObservation("too-many-keys-span", {
        metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS + 1),
      }),
    ).toThrow(/exceeds the maximum of 128/);
  });

  it("should throw when merged metadata exceeds the limit and keep the earlier metadata", async () => {
    const span = startObservation("merge-limit-span", {
      metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS, "first"),
    });

    expect(() => span.update({ metadata: { extra: 1 } })).toThrow(
      /exceeds the maximum of 128/,
    );

    // Overwriting an existing key does not add a key
    span.update({ metadata: { first0: "updated" } });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const metadata = exportedMetadata("merge-limit-span") as Record<
      string,
      unknown
    >;
    expect(Object.keys(metadata)).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(metadata.first0).toBe("updated");
    expect(metadata).not.toHaveProperty("extra");
  });
});
