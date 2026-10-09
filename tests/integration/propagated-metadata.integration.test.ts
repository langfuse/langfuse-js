/**
 * Tests for the JSON encoding of metadata values passed to
 * propagateAttributes.
 */

import {
  LangfuseOtelSpanAttributes,
  getGlobalLogger,
  getPropagatedAttributesFromContext,
  serializeMetadataValue,
} from "@langfuse/core";
import { propagateAttributes, startObservation } from "@langfuse/tracing";
import {
  context as otelContext,
  defaultTextMapGetter,
  defaultTextMapSetter,
  propagation,
  ROOT_CONTEXT,
  trace as otelTrace,
} from "@opentelemetry/api";
import { W3CBaggagePropagator } from "@opentelemetry/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const metadataKey = (key: string) =>
  `${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`;

describe("propagateAttributes metadata serialization", () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await teardownTestEnvironment(testEnv);
  });

  async function runWithMetadata(metadata: Record<string, unknown>) {
    const tracer = otelTrace.getTracer("langfuse-sdk");

    await tracer.startActiveSpan("parent", async (parentSpan) => {
      propagateAttributes({ metadata }, () => {
        const child = startObservation("child");
        child.end();
      });
      parentSpan.end();
    });

    await waitForSpanExport(testEnv.mockExporter, 2);
    const spans = testEnv.mockExporter.exportedSpans;

    return {
      parent: spans.find((s) => s.name === "parent")!,
      child: spans.find((s) => s.name === "child")!,
    };
  }

  it("JSON-encodes every value, strings included", async () => {
    const { parent, child } = await runWithMetadata({
      str: "plain",
      numericString: "123",
      boolString: "true",
      nullString: "null",
      emptyString: "",
      jsonLikeString: '{"already":"serialized"}',
      int: 3,
      float: 1.5,
      boolTrue: true,
      boolFalse: false,
      list: [1, "a"],
      obj: { nested: { a: 1 } },
    });

    for (const span of [parent, child]) {
      expect(span.attributes[metadataKey("str")]).toBe('"plain"');
      expect(span.attributes[metadataKey("numericString")]).toBe('"123"');
      expect(span.attributes[metadataKey("boolString")]).toBe('"true"');
      expect(span.attributes[metadataKey("nullString")]).toBe('"null"');
      expect(span.attributes[metadataKey("emptyString")]).toBe('""');
      expect(span.attributes[metadataKey("jsonLikeString")]).toBe(
        JSON.stringify('{"already":"serialized"}'),
      );
      expect(span.attributes[metadataKey("int")]).toBe("3");
      expect(span.attributes[metadataKey("float")]).toBe("1.5");
      expect(span.attributes[metadataKey("boolTrue")]).toBe("true");
      expect(span.attributes[metadataKey("boolFalse")]).toBe("false");
      expect(span.attributes[metadataKey("list")]).toBe('[1,"a"]');
      expect(span.attributes[metadataKey("obj")]).toBe('{"nested":{"a":1}}');
    }
  });

  it("encodes values the same way as observation metadata", async () => {
    const values: Record<string, unknown> = {
      str: "123",
      nan: Number.NaN,
      nestedInfinity: { score: Number.POSITIVE_INFINITY },
      safeBig: 10n,
      big: 2n ** 60n,
    };

    const { child } = await runWithMetadata(values);

    for (const [key, value] of Object.entries(values)) {
      expect(child.attributes[metadataKey(key)]).toBe(
        serializeMetadataValue(value),
      );
    }
    expect(child.attributes[metadataKey("nan")]).toBe('"NaN"');
    expect(child.attributes[metadataKey("big")]).toBe('"1152921504606846976"');
  });

  it("keeps LangGraph-style step and trigger metadata", async () => {
    const { child } = await runWithMetadata({
      langgraph_step: 2,
      langgraph_triggers: ["branch:to:agent"],
    });

    expect(child.attributes[metadataKey("langgraph_step")]).toBe("2");
    expect(child.attributes[metadataKey("langgraph_triggers")]).toBe(
      '["branch:to:agent"]',
    );
  });

  it("drops values without a JSON encoding without throwing", async () => {
    const warn = vi.spyOn(getGlobalLogger(), "warn");

    const { child } = await runWithMetadata({
      valid: 1,
      nullValue: null,
      undefinedValue: undefined,
      fn: () => "x",
      symbol: Symbol("s"),
    });

    expect(child.attributes[metadataKey("valid")]).toBe("1");
    for (const key of ["nullValue", "undefinedValue", "fn", "symbol"]) {
      expect(child.attributes[metadataKey(key)]).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`'metadata.${key}' is`),
      );
    }
  });

  it("replaces circular values with a placeholder", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const { child } = await runWithMetadata({ circular });

    expect(child.attributes[metadataKey("circular")]).toBe(
      '"<failed to serialize>"',
    );
  });

  it("applies the 200 character limit to strings after encoding", async () => {
    const warn = vi.spyOn(getGlobalLogger(), "warn");
    // 198 chars plus 2 quotes = 200, 199 chars plus 2 quotes = 201
    const fits = "a".repeat(198);
    const tooLong = "a".repeat(199);

    const { child } = await runWithMetadata({ fits, tooLong });

    expect(child.attributes[metadataKey("fits")]).toBe(`"${fits}"`);
    expect(child.attributes[metadataKey("tooLong")]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("'metadata.tooLong' value is over 200"),
    );
  });

  it("applies the 200 character limit after serialization", async () => {
    const warn = vi.spyOn(getGlobalLogger(), "warn");
    // 66 entries of "1," plus brackets: 66 * 2 - 1 + 2 = 133 chars
    const fits = Array.from({ length: 66 }, () => 1);
    // 100 entries: 100 * 2 - 1 + 2 = 201 chars
    const tooLong = Array.from({ length: 100 }, () => 1);

    const { child } = await runWithMetadata({ fits, tooLong });

    expect(child.attributes[metadataKey("fits")]).toBe(JSON.stringify(fits));
    expect(child.attributes[metadataKey("tooLong")]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("'metadata.tooLong' value is over 200"),
    );
  });

  it("merges serialized metadata from nested propagateAttributes calls", async () => {
    const tracer = otelTrace.getTracer("langfuse-sdk");

    await tracer.startActiveSpan("parent", async (parentSpan) => {
      propagateAttributes({ metadata: { outer: "x", shared: "a" } }, () => {
        propagateAttributes({ metadata: { inner: [true], shared: 2 } }, () => {
          const child = startObservation("child");
          child.end();
        });
      });
      parentSpan.end();
    });

    await waitForSpanExport(testEnv.mockExporter, 2);
    const child = testEnv.mockExporter.exportedSpans.find(
      (s) => s.name === "child",
    )!;

    expect(child.attributes[metadataKey("outer")]).toBe('"x"');
    expect(child.attributes[metadataKey("inner")]).toBe("[true]");
    expect(child.attributes[metadataKey("shared")]).toBe("2");
  });

  it("propagates serialized metadata through W3C baggage", () => {
    const propagator = new W3CBaggagePropagator();
    const carrier: Record<string, string> = {};

    propagateAttributes(
      {
        metadata: {
          step: 2,
          name: "a b",
          triggers: ["a,b", "c=d"],
          obj: { k: "v w" },
        },
        asBaggage: true,
      },
      () => {
        const baggage = propagation.getBaggage(otelContext.active());
        expect(baggage?.getEntry("langfuse_metadata_step")?.value).toBe("2");
        expect(baggage?.getEntry("langfuse_metadata_triggers")?.value).toBe(
          '["a,b","c=d"]',
        );

        propagator.inject(otelContext.active(), carrier, defaultTextMapSetter);
      },
    );

    expect(carrier.baggage).toBeDefined();

    const extracted = propagator.extract(
      ROOT_CONTEXT,
      carrier,
      defaultTextMapGetter,
    );
    const attributes = getPropagatedAttributesFromContext(extracted);

    expect(attributes[metadataKey("step")]).toBe("2");
    expect(attributes[metadataKey("name")]).toBe('"a b"');
    expect(attributes[metadataKey("triggers")]).toBe('["a,b","c=d"]');
    expect(attributes[metadataKey("obj")]).toBe('{"k":"v w"}');
  });

  it("still drops non-string values for other propagated attributes", async () => {
    const tracer = otelTrace.getTracer("langfuse-sdk");

    await tracer.startActiveSpan("parent", async (parentSpan) => {
      propagateAttributes(
        {
          userId: 123 as unknown as string,
          sessionId: { id: 1 } as unknown as string,
          version: 2 as unknown as string,
          traceName: true as unknown as string,
          tags: [1 as unknown as string, "ok"],
        },
        () => {
          const child = startObservation("child");
          child.end();
        },
      );
      parentSpan.end();
    });

    await waitForSpanExport(testEnv.mockExporter, 2);
    const child = testEnv.mockExporter.exportedSpans.find(
      (s) => s.name === "child",
    )!;

    expect(
      child.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID],
    ).toBeUndefined();
    expect(
      child.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
    ).toBeUndefined();
    expect(
      child.attributes[LangfuseOtelSpanAttributes.VERSION],
    ).toBeUndefined();
    expect(
      child.attributes[LangfuseOtelSpanAttributes.TRACE_NAME],
    ).toBeUndefined();
    expect(child.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
      "ok",
    ]);
  });
});
