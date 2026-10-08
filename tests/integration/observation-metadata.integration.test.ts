import {
  propagateAttributes,
  startObservation,
  startActiveObservation,
  updateActiveObservation,
  LangfuseOtelSpanAttributes,
} from "@langfuse/tracing";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const PREFIX = LangfuseOtelSpanAttributes.OBSERVATION_METADATA;
const METADATA_PREFIX = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;

function manyKeys(count: number, prefix = "key"): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i}`, i]),
  );
}

function metadataKeys(span: ReadableSpan): string[] {
  return Object.keys(span.attributes)
    .filter((key) => key.startsWith(METADATA_PREFIX))
    .map((key) => key.slice(METADATA_PREFIX.length));
}

function limitWarnings(warn: ReturnType<typeof vi.spyOn>): string[] {
  return warn.mock.calls
    .map((args) => args.map(String).join(" "))
    .filter((message) => message.includes("span attribute limit"));
}

describe("Observation metadata span attribute limit", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;
  let warn: ReturnType<typeof vi.spyOn>;

  async function setup(attributeCountLimit?: number) {
    testEnv = await setupTestEnvironment(
      attributeCountLimit ? { spanLimits: { attributeCountLimit } } : {},
    );
    assertions = new SpanAssertions(testEnv.mockExporter);
  }

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await teardownTestEnvironment(testEnv);
  });

  describe("with the default limit of 128 attributes", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should keep all metadata keys under the limit", async () => {
      const span = startObservation("small-span", {
        input: "in",
        metadata: manyKeys(50),
      });
      span.update({ metadata: { extra: "value" } });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("small-span");
      expect(metadataKeys(exported)).toEqual([
        ...Object.keys(manyKeys(50)),
        "extra",
      ]);
      expect(exported.droppedAttributesCount).toBe(0);
      expect(limitWarnings(warn)).toEqual([]);
    });

    it("should drop metadata over the limit, keep core attributes and warn once", async () => {
      startObservation(
        "big-generation",
        {
          input: "in",
          model: "gpt-4o",
          version: "v1",
          metadata: manyKeys(150),
        },
        { asType: "generation" },
      ).end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("big-generation");
      const attributes = exported.attributes;
      expect(exported.droppedAttributesCount).toBe(0);
      expect(Object.keys(attributes).length).toBeLessThanOrEqual(128);
      expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE]).toBe(
        "generation",
      );
      expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT]).toBe(
        "in",
      );
      expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL]).toBe(
        "gpt-4o",
      );
      expect(attributes[LangfuseOtelSpanAttributes.VERSION]).toBe("v1");

      // Kept keys are the first ones in insertion order
      const kept = metadataKeys(exported);
      expect(kept.length).toBeGreaterThan(0);
      expect(kept).toEqual(Object.keys(manyKeys(kept.length)));

      const warnings = limitWarnings(warn);
      expect(warnings).toHaveLength(1);
      const droppedNames = Array.from(
        { length: 5 },
        (_, i) => `key${kept.length + i}`,
      ).join(", ");
      expect(warnings[0]).toContain(
        `Dropped ${150 - kept.length} metadata key(s) from observation 'big-generation' to stay within the span attribute limit of 128`,
      );
      expect(warnings[0]).toContain(`Dropped keys include: ${droppedNames}`);
      expect(warnings[0]).not.toContain(`key${kept.length + 5}`);
    });

    it("should keep later output when metadata exceeds the limit", async () => {
      const span = startObservation("regression-span", {
        input: "in",
        metadata: manyKeys(150),
      });
      span.update({ output: "out", metadata: { late: "x" } });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("regression-span");
      expect(exported.droppedAttributesCount).toBe(0);
      expect(
        exported.attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT],
      ).toBe("in");
      expect(
        exported.attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT],
      ).toBe("out");
      expect(metadataKeys(exported)).not.toContain("late");
    });

    it("should not count keys with function or null values", async () => {
      startObservation("plain-span", { metadata: manyKeys(150) }).end();
      startObservation("skipped-values-span", {
        metadata: {
          callback: () => "ignored",
          empty: null,
          missing: undefined,
          ...manyKeys(150),
        },
      }).end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      expect(
        metadataKeys(assertions.expectSpanWithName("skipped-values-span")),
      ).toEqual(metadataKeys(assertions.expectSpanWithName("plain-span")));
    });

    it("should enforce the limit across start and update", async () => {
      const span = startObservation("merge-limit-span", {
        metadata: manyKeys(150, "first"),
      });
      span.update({
        metadata: { first0: "updated", extra0: 1, extra1: 2 },
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("merge-limit-span");
      const keys = metadataKeys(exported);
      expect(exported.droppedAttributesCount).toBe(0);
      expect(keys).not.toContain("extra0");
      expect(keys).not.toContain("extra1");
      expect(exported.attributes[`${METADATA_PREFIX}first0`]).toBe('"updated"');

      const warnings = limitWarnings(warn);
      expect(warnings).toHaveLength(2);
      expect(warnings[1]).toContain("Dropped 2 metadata key(s)");
      expect(warnings[1]).toContain("Dropped keys include: extra0, extra1");
    });

    it("should always keep overwrites of existing keys when the span is full", async () => {
      await startActiveObservation("active-limit-span", async (span) => {
        span.update({ metadata: manyKeys(150) });
        warn.mockClear();
        updateActiveObservation({ metadata: { key0: "updated", late: "x" } });
      });

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("active-limit-span");
      expect(exported.droppedAttributesCount).toBe(0);
      expect(exported.attributes[`${METADATA_PREFIX}key0`]).toBe('"updated"');
      expect(exported.attributes[`${METADATA_PREFIX}late`]).toBeUndefined();
      expect(
        exported.attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE],
      ).toBe("span");

      const warnings = limitWarnings(warn);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Dropped 1 metadata key(s)");
      expect(warnings[0]).toContain("Dropped keys include: late");
    });
  });

  describe("with a custom attribute count limit", () => {
    beforeEach(async () => {
      await setup(40);
    });

    it("should respect the configured limit", async () => {
      const span = startObservation("small-limit-span", {
        input: "in",
        metadata: manyKeys(50),
      });
      span.update({ output: "out" });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("small-limit-span");
      expect(exported.droppedAttributesCount).toBe(0);
      expect(Object.keys(exported.attributes).length).toBeLessThanOrEqual(40);
      expect(
        exported.attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT],
      ).toBe("in");
      expect(
        exported.attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT],
      ).toBe("out");
      expect(metadataKeys(exported).length).toBeGreaterThan(0);

      const warnings = limitWarnings(warn);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("span attribute limit of 40");
    });

    it("should reserve generation attributes only for generation-like types", async () => {
      startObservation("limit-span", { metadata: manyKeys(50) }).end();
      startObservation(
        "limit-generation",
        { metadata: manyKeys(50) },
        { asType: "generation" },
      ).end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      const spanKeys = metadataKeys(
        assertions.expectSpanWithName("limit-span"),
      );
      const generationKeys = metadataKeys(
        assertions.expectSpanWithName("limit-generation"),
      );
      // Model, usage, cost, completion start, model parameters and prompt
      // name/version are only reserved for generations
      expect(spanKeys.length).toBe(generationKeys.length + 7);
    });

    it("should keep room for generation attributes when the type is omitted", async () => {
      await startActiveObservation(
        "active-limit-generation",
        async (generation) => {
          updateActiveObservation({ metadata: manyKeys(50) });
          generation.update({
            model: "gpt-4o",
            usageDetails: { input: 1, output: 2 },
            costDetails: { total: 0.1 },
            completionStartTime: new Date(),
            modelParameters: { temperature: 0 },
            prompt: { name: "prompt", version: 1, isFallback: false },
          });
        },
        { asType: "generation" },
      );

      await waitForSpanExport(testEnv.mockExporter, 1);

      const exported = assertions.expectSpanWithName("active-limit-generation");
      expect(exported.droppedAttributesCount).toBe(0);
      expect(
        exported.attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE],
      ).toBe("generation");
      for (const key of [
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME,
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME,
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION,
      ]) {
        expect(exported.attributes[key]).toBeDefined();
      }
    });

    it("should count propagated trace attributes toward the limit", async () => {
      const traceMetadata = { t0: "0", t1: "1", t2: "2", t3: "3", t4: "4" };

      startObservation("unpropagated-span", { metadata: manyKeys(50) }).end();
      await propagateAttributes(
        {
          userId: "user-1",
          sessionId: "session-1",
          metadata: traceMetadata,
        },
        async () => {
          const span = startObservation("propagated-span", {
            input: "in",
            metadata: manyKeys(50),
          });
          span.update({ output: "out" });
          span.end();
        },
      );

      await waitForSpanExport(testEnv.mockExporter, 2);

      const withoutPropagation = metadataKeys(
        assertions.expectSpanWithName("unpropagated-span"),
      ).length;
      const exported = assertions.expectSpanWithName("propagated-span");
      const attributes = exported.attributes;
      expect(exported.droppedAttributesCount).toBe(0);
      expect(attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user-1",
      );
      expect(attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID]).toBe(
        "session-1",
      );
      for (const key of Object.keys(traceMetadata)) {
        expect(
          attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`],
        ).toBe(traceMetadata[key as keyof typeof traceMetadata]);
      }
      expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT]).toBe(
        "in",
      );
      expect(attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]).toBe(
        "out",
      );
      // The 7 propagated attributes use up part of the budget
      expect(metadataKeys(exported).length).toBe(withoutPropagation - 7);
    });
  });
});

describe("Observation metadata attributes", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  function exportedMetadata(spanName: string): Record<string, unknown> {
    const span = assertions.expectSpanWithName(spanName);

    return Object.fromEntries(
      Object.entries(span.attributes).filter(
        ([key]) => key === PREFIX || key.startsWith(`${PREFIX}.`),
      ),
    );
  }

  it("should write one JSON-encoded attribute per key", async () => {
    const metadata = {
      n: 3,
      s: "3",
      b: true,
      empty: "",
      json: '{"a":1}',
      nested: { host: "localhost", port: 5432 },
      list: [1, "a", true],
    };
    const span = startObservation("json-span", {
      metadata: {
        ...metadata,
        nothing: null,
        missing: undefined,
        callback: () => "ignored",
      },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    const exported = exportedMetadata("json-span");
    expect(exported).toStrictEqual({
      [`${PREFIX}.n`]: "3",
      [`${PREFIX}.s`]: '"3"',
      [`${PREFIX}.b`]: "true",
      [`${PREFIX}.empty`]: '""',
      [`${PREFIX}.json`]: '"{\\"a\\":1}"',
      [`${PREFIX}.nested`]: '{"host":"localhost","port":5432}',
      [`${PREFIX}.list`]: '[1,"a",true]',
    });

    for (const [key, value] of Object.entries(metadata)) {
      expect(JSON.parse(exported[`${PREFIX}.${key}`] as string)).toStrictEqual(
        value,
      );
    }
  });

  it("should JSON-encode non-object metadata to the bare metadata key", async () => {
    const span = startObservation("string-metadata-span", {
      metadata: "foo" as unknown as Record<string, unknown>,
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("string-metadata-span")).toStrictEqual({
      [PREFIX]: '"foo"',
    });
  });

  it("should only replace values that fail to serialize", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const span = startObservation("circular-span", {
      metadata: { ok: "yes", count: 1, circular },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("circular-span")).toStrictEqual({
      [`${PREFIX}.ok`]: '"yes"',
      [`${PREFIX}.count`]: "1",
      [`${PREFIX}.circular`]: '"<failed to serialize>"',
    });
  });

  it("should keep earlier values for keys updated with null or undefined", async () => {
    const span = startObservation("null-span", {
      metadata: { a: 1, b: 2 },
    });
    span.update({ metadata: { a: null, b: undefined, c: 3 } });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("null-span")).toStrictEqual({
      [`${PREFIX}.a`]: "1",
      [`${PREFIX}.b`]: "2",
      [`${PREFIX}.c`]: "3",
    });
  });

  it("should keep earlier values for keys updated with function values", async () => {
    const span = startObservation("function-update-span", {
      metadata: { cb: { x: 1 } },
    });
    span.update({ metadata: { cb: () => "ignored", other: "a" } });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("function-update-span")).toStrictEqual({
      [`${PREFIX}.cb`]: '{"x":1}',
      [`${PREFIX}.other`]: '"a"',
    });
  });

  it("should JSON-encode updateActiveObservation metadata", async () => {
    await startActiveObservation("active-span", async () => {
      updateActiveObservation({ metadata: { step: 2, done: false, tag: "" } });
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("active-span")).toStrictEqual({
      [`${PREFIX}.step`]: "2",
      [`${PREFIX}.done`]: "false",
      [`${PREFIX}.tag`]: '""',
    });
  });

  it("should not write any attribute for empty metadata", async () => {
    const span = startObservation("empty-span", { metadata: {} });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);

    expect(exportedMetadata("empty-span")).toStrictEqual({});
  });
});
