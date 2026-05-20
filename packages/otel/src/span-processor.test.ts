import {
  LANGFUSE_TRACER_NAME,
  LANGFUSE_TRACE_ID_BAGGAGE_KEY,
  LangfuseOtelSpanAttributes,
} from "@langfuse/core";
import { propagation, ROOT_CONTEXT, type Context } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import type {
  ReadableSpan,
  Span,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { beforeEach, describe, expect, it } from "vitest";

import { LangfuseSpanProcessor } from "./span-processor.js";

const noopExporter: SpanExporter = {
  export: (_spans, cb) => cb({ code: ExportResultCode.SUCCESS }),
  shutdown: async () => undefined,
};

type TestSpan = Span &
  ReadableSpan & {
    setAttribute: (key: string, value: unknown) => TestSpan;
    setAttributes: (kv: Record<string, unknown>) => TestSpan;
  };

let spanIdCounter = 0;
const nextSpanId = () => (++spanIdCounter).toString(16).padStart(16, "0");

function createTestSpan(opts: {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  instrumentationScopeName?: string;
  name?: string;
  initialAttributes?: Record<string, unknown>;
}): TestSpan {
  const attributes: Record<string, unknown> = {
    ...(opts.initialAttributes ?? {}),
  };
  const spanId = opts.spanId ?? nextSpanId();

  const span = {
    name: opts.name ?? "test-span",
    attributes,
    instrumentationScope: {
      name: opts.instrumentationScopeName ?? "unknown.instrumentation",
      version: undefined,
      schemaUrl: undefined,
    },
    parentSpanContext: opts.parentSpanId
      ? { traceId: opts.traceId, spanId: opts.parentSpanId, traceFlags: 1 }
      : undefined,
    spanContext: () => ({
      traceId: opts.traceId,
      spanId,
      traceFlags: 1,
    }),
    setAttribute(key: string, value: unknown) {
      attributes[key] = value;
      return span;
    },
    setAttributes(kv: Record<string, unknown>) {
      Object.assign(attributes, kv);
      return span;
    },
    // Stubbed ReadableSpan surface used by the export pipeline.
    duration: [0, 0],
    startTime: [0, 0],
    endTime: [0, 0],
    kind: 0,
    status: { code: 0 },
    resource: { attributes: {} },
    events: [],
    links: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ended: false,
  } as unknown as TestSpan;

  return span;
}

function contextWithBaggageClaim(
  traceId: string,
  base: Context = ROOT_CONTEXT,
): Context {
  const baggage = propagation
    .createBaggage()
    .setEntry(LANGFUSE_TRACE_ID_BAGGAGE_KEY, { value: traceId });

  return propagation.setBaggage(base, baggage);
}

const TRACE_ID = "0123456789abcdef0123456789abcdef";

describe("LangfuseSpanProcessor app-root marking", () => {
  let processor: LangfuseSpanProcessor;

  beforeEach(() => {
    spanIdCounter = 0;
    processor = new LangfuseSpanProcessor({ exporter: noopExporter });
  });

  it("marks an exported child whose immediate parent is filtered", () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: "unknown.instrumentation",
    });
    processor.onStart(parent, ROOT_CONTEXT);

    const child = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(child, ROOT_CONTEXT);

    expect(
      parent.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT],
    ).toBeUndefined();
    expect(child.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);
  });

  it("marks all exported siblings under a filtered parent", () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: "unknown.instrumentation",
    });
    processor.onStart(parent, ROOT_CONTEXT);

    const childA = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    const childB = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(childA, ROOT_CONTEXT);
    processor.onStart(childB, ROOT_CONTEXT);

    expect(childA.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(
      true,
    );
    expect(childB.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(
      true,
    );
  });

  it("only considers the immediate parent's export status", () => {
    const grandparent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(grandparent, ROOT_CONTEXT);

    const parent = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: grandparent.spanContext().spanId,
      instrumentationScopeName: "unknown.instrumentation",
    });
    processor.onStart(parent, ROOT_CONTEXT);

    const child = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(child, ROOT_CONTEXT);

    expect(grandparent.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(
      true,
    );
    expect(
      parent.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT],
    ).toBeUndefined();
    expect(child.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);
  });

  it("marks only the parent when both parent and child export", () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(parent, ROOT_CONTEXT);

    const child = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(child, ROOT_CONTEXT);

    expect(parent.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(
      true,
    );
    expect(
      child.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT],
    ).toBeUndefined();
  });

  it("never marks spans rejected by a custom shouldExportSpan filter", () => {
    const rejectAll = new LangfuseSpanProcessor({
      exporter: noopExporter,
      shouldExportSpan: () => false,
    });

    const span = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    rejectAll.onStart(span, ROOT_CONTEXT);

    expect(
      span.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT],
    ).toBeUndefined();
  });

  it("marks known GenAI instrumentation scopes before gen_ai attributes are set", () => {
    const span = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: "opentelemetry.instrumentation.openai",
    });
    processor.onStart(span, ROOT_CONTEXT);

    expect(span.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);
  });

  it("suppresses local marking when matching baggage claim exists and no local parent", () => {
    const span = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(span, contextWithBaggageClaim(TRACE_ID));

    expect(
      span.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT],
    ).toBeUndefined();
  });

  it("does not suppress when baggage claim is for a different trace", () => {
    const otherTrace = "ffffffffffffffffffffffffffffffff";
    const span = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(span, contextWithBaggageClaim(otherTrace));

    expect(span.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);
  });

  it("suppresses local children when matching baggage claim exists", () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: "unknown.instrumentation",
    });
    processor.onStart(parent, contextWithBaggageClaim(TRACE_ID));

    const child = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(child, contextWithBaggageClaim(TRACE_ID));

    expect(
      child.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT],
    ).toBeUndefined();
  });

  it("releases local span state after all tracked spans end", async () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(parent, ROOT_CONTEXT);

    const child = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(child, ROOT_CONTEXT);

    processor.onEnd(child);
    processor.onEnd(parent);
    await processor.forceFlush();

    const internalSpans = (
      processor as unknown as {
        spanExportExpectationById: Map<string, unknown>;
      }
    ).spanExportExpectationById;
    expect(internalSpans.size).toBe(0);
  });

  it("marks a child started after its parent ended as an app root", async () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(parent, ROOT_CONTEXT);

    expect(parent.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(
      true,
    );

    processor.onEnd(parent);

    const child = createTestSpan({
      traceId: TRACE_ID,
      parentSpanId: parent.spanContext().spanId,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(child, ROOT_CONTEXT);

    expect(child.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);

    processor.onEnd(child);
    await processor.forceFlush();
  });

  it("retains state for never-ended spans (documented best-effort gap)", () => {
    const parent = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: LANGFUSE_TRACER_NAME,
    });
    processor.onStart(parent, ROOT_CONTEXT);

    const internalSpans = (
      processor as unknown as {
        spanExportExpectationById: Map<string, unknown>;
      }
    ).spanExportExpectationById;
    expect(internalSpans.has(parent.spanContext().spanId)).toBe(true);
  });

  it("keeps the start-time marker even when the end-time filter rejects the span", async () => {
    let calls = 0;
    const flipFilter = new LangfuseSpanProcessor({
      exporter: noopExporter,
      shouldExportSpan: () => {
        calls += 1;
        return calls === 1; // accept on start, reject on end
      },
    });

    const span = createTestSpan({
      traceId: TRACE_ID,
      instrumentationScopeName: "unknown.instrumentation",
    });
    flipFilter.onStart(span, ROOT_CONTEXT);

    expect(span.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);

    flipFilter.onEnd(span);
    await flipFilter.forceFlush();

    // V1 does not repair: the marker remains, but the span will not be exported.
    expect(span.attributes[LangfuseOtelSpanAttributes.IS_APP_ROOT]).toBe(true);
  });
});

describe("propagation: internal app-root baggage", () => {
  it("does not surface the internal trace-id baggage as user metadata", async () => {
    const { getPropagatedAttributesFromContext } = await import(
      "@langfuse/core"
    );

    const ctx = contextWithBaggageClaim(TRACE_ID);
    const propagated = getPropagatedAttributesFromContext(ctx);

    for (const key of Object.keys(propagated)) {
      expect(key).not.toContain("langfuse_trace_id");
    }
  });
});
