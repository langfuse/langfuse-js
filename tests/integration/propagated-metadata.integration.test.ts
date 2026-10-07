/**
 * Tests for serialization of non-string metadata values passed to
 * propagateAttributes.
 */

import {
  LangfuseOtelSpanAttributes,
  getGlobalLogger,
  getPropagatedAttributesFromContext,
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

  it("keeps strings unchanged and JSON-serializes all other values", async () => {
    const { parent, child } = await runWithMetadata({
      str: "plain",
      jsonLikeString: '{"already":"serialized"}',
      int: 3,
      float: 1.5,
      boolTrue: true,
      boolFalse: false,
      nullValue: null,
      list: [1, "a"],
      obj: { nested: { a: 1 } },
    });

    for (const span of [parent, child]) {
      expect(span.attributes[metadataKey("str")]).toBe("plain");
      expect(span.attributes[metadataKey("jsonLikeString")]).toBe(
        '{"already":"serialized"}',
      );
      expect(span.attributes[metadataKey("int")]).toBe("3");
      expect(span.attributes[metadataKey("float")]).toBe("1.5");
      expect(span.attributes[metadataKey("boolTrue")]).toBe("true");
      expect(span.attributes[metadataKey("boolFalse")]).toBe("false");
      expect(span.attributes[metadataKey("nullValue")]).toBe("null");
      expect(span.attributes[metadataKey("list")]).toBe('[1,"a"]');
      expect(span.attributes[metadataKey("obj")]).toBe('{"nested":{"a":1}}');
    }
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

  it("drops values that cannot be JSON-serialized without throwing", async () => {
    const warn = vi.spyOn(getGlobalLogger(), "warn");
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const { child } = await runWithMetadata({
      valid: 1,
      undefinedValue: undefined,
      fn: () => "x",
      symbol: Symbol("s"),
      circular,
      nan: Number.NaN,
      nestedInfinity: { score: Number.POSITIVE_INFINITY },
    });

    expect(child.attributes[metadataKey("valid")]).toBe("1");
    for (const key of [
      "undefinedValue",
      "fn",
      "symbol",
      "circular",
      "nan",
      "nestedInfinity",
    ]) {
      expect(child.attributes[metadataKey(key)]).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`'metadata.${key}' is not JSON-serializable`),
      );
    }
  });

  it("serializes BigInt values with their exact digits", async () => {
    const { child } = await runWithMetadata({
      big: 12345678901234567890n,
      nested: { ids: [9007199254740993n] },
    });

    expect(child.attributes[metadataKey("big")]).toBe("12345678901234567890");
    expect(child.attributes[metadataKey("nested")]).toBe(
      '{"ids":[9007199254740993]}',
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
      propagateAttributes({ metadata: { outer: 1, shared: "a" } }, () => {
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

    expect(child.attributes[metadataKey("outer")]).toBe("1");
    expect(child.attributes[metadataKey("inner")]).toBe("[true]");
    expect(child.attributes[metadataKey("shared")]).toBe("2");
  });

  it("propagates serialized metadata through W3C baggage", () => {
    const propagator = new W3CBaggagePropagator();
    const carrier: Record<string, string> = {};

    propagateAttributes(
      {
        metadata: { step: 2, triggers: ["a,b", "c=d"], obj: { k: "v w" } },
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
