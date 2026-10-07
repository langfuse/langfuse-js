import {
  startObservation,
  startActiveObservation,
  updateActiveObservation,
  LangfuseOtelSpanAttributes,
} from "@langfuse/tracing";
import { MAX_OBSERVATION_METADATA_KEYS } from "@langfuse/core";
import { SpanStatusCode } from "@opentelemetry/api";
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

  it("should not pick up later changes to the caller's metadata object", async () => {
    const metadata = { database: { host: "first" } };
    const span = startObservation("alias-span", { metadata });

    metadata.database.host = "second";
    span.update({ metadata: { step: 2 } });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("alias-span")).toEqual({
      database: { host: "first" },
      step: 2,
    });
  });

  it("should merge with metadata written directly to the span attribute", async () => {
    // e.g. @langfuse/vercel-ai-sdk writes the attribute without the tracing SDK
    await startActiveObservation("direct-attribute-span", async (span) => {
      span.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
        JSON.stringify({ feature: "chat" }),
      );
      updateActiveObservation({ metadata: { step: 2 } });
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("direct-attribute-span")).toEqual({
      feature: "chat",
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

  it("should not count function-valued keys towards the limit", async () => {
    const span = startObservation("function-keys-span", {
      metadata: {
        ...manyKeys(MAX_OBSERVATION_METADATA_KEYS),
        callback: () => "ignored",
      },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const metadata = exportedMetadata("function-keys-span") as object;
    expect(Object.keys(metadata)).toHaveLength(MAX_OBSERVATION_METADATA_KEYS);
    expect(metadata).not.toHaveProperty("callback");
  });

  it(`should throw when metadata exceeds ${MAX_OBSERVATION_METADATA_KEYS} keys`, () => {
    expect(() =>
      startObservation("too-many-keys-span", {
        metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS + 1),
      }),
    ).toThrow(/exceeds the maximum of 128/);
  });

  it("should end the span when startObservation throws on too many keys", async () => {
    expect(() =>
      startObservation("too-many-keys-ended-span", {
        metadata: manyKeys(MAX_OBSERVATION_METADATA_KEYS + 1),
      }),
    ).toThrow(/exceeds the maximum of 128/);

    await waitForSpanExport(testEnv.mockExporter, 1);

    const span = assertions.expectSpanWithName("too-many-keys-ended-span");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
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
