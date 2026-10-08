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
      expect(exported.attributes[`${METADATA_PREFIX}first0`]).toBe("updated");

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
      expect(exported.attributes[`${METADATA_PREFIX}key0`]).toBe("updated");
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
