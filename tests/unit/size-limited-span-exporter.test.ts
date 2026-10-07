import { getGlobalLogger } from "@langfuse/core";
import { ExportResultCode } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MAX_BATCH_SIZE_BYTES,
  SizeLimitedSpanExporter,
  getBatchSizeLowerBoundBytes,
  resolveMaxBatchSizeBytes,
  resolveMaxBatchSizeBytesFromEnvironment,
} from "../../packages/otel/src/size-limited-span-exporter.js";

function createSpan(name: string, output: string): ReadableSpan {
  return {
    name,
    attributes: { "langfuse.observation.output": output },
    duration: [0, 1],
    startTime: [0, 0],
    endTime: [0, 1],
    kind: 0,
    status: { code: 0 },
    spanContext: () => ({
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: name.padEnd(16, "0").slice(0, 16),
      traceFlags: 1,
    }),
    parentSpanContext: undefined,
    resource: { attributes: {} },
    instrumentationScope: { name: "@langfuse/test" },
    events: [],
    links: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as ReadableSpan;
}

function createDelegate(): SpanExporter {
  return {
    export: vi.fn((_spans, callback) =>
      callback({ code: ExportResultCode.SUCCESS }),
    ),
    shutdown: vi.fn(async () => undefined),
    forceFlush: vi.fn(async () => undefined),
  };
}

describe("SizeLimitedSpanExporter", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES;
    vi.restoreAllMocks();
  });

  it.each([
    ["drops", "below", -1],
    ["forwards", "at", 0],
    ["forwards", "above", 1],
  ])(
    "%s a batch when the byte limit is %s its size lower bound",
    (action, _position, extraBytes) => {
      vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => undefined);
      const delegate = createDelegate();
      const spans = [createSpan("span-1", "héllo")];
      const callback = vi.fn();
      const exporter = new SizeLimitedSpanExporter({
        delegate,
        maxBatchSizeBytes: getBatchSizeLowerBoundBytes(spans) + extraBytes,
      });

      exporter.export(spans, callback);

      const forwarded = action === "forwards";
      expect(vi.mocked(delegate.export).mock.calls).toEqual(
        forwarded ? [[spans, callback]] : [],
      );
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: forwarded ? ExportResultCode.SUCCESS : ExportResultCode.FAILED,
        }),
      );
    },
  );

  it("drops a combined oversized batch without splitting or delegating", () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => undefined);
    const delegate = createDelegate();
    const sensitivePayload = "x".repeat(1_000);
    const spans = [
      createSpan("span-1", sensitivePayload),
      createSpan("span-2", sensitivePayload),
    ];
    // Each span fits alone; together they exceed the limit.
    const maxBatchSizeBytes = 1_500;
    const callback = vi.fn();
    const exporter = new SizeLimitedSpanExporter({
      delegate,
      maxBatchSizeBytes,
    });

    exporter.export(spans, callback);

    expect(delegate.export).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: ExportResultCode.FAILED }),
    );
    expect(getGlobalLogger().warn).toHaveBeenCalledWith(
      expect.stringContaining("Dropping OpenTelemetry span batch"),
      {
        maxBatchSizeBytes,
        sizeLowerBoundBytes: getBatchSizeLowerBoundBytes(spans),
        spanCount: spans.length,
      },
    );
    expect(
      JSON.stringify(vi.mocked(getGlobalLogger().warn).mock.calls),
    ).not.toContain(sensitivePayload);
  });

  it("keeps the size lower bound within the serialized OTLP JSON request size and close to it for ASCII", () => {
    const samples = [
      "plain ascii text",
      JSON.stringify({
        role: "assistant",
        content: JSON.stringify({ quote: '"', backslash: "\\" }),
      }),
      "\u0000\u0001\b\t\n\f\r\u001f\u007f",
      "汉字かな한글",
      "😀👍🏽",
      "\ud800",
      "\udfff",
    ];
    const spans = samples.map((sample, index) => {
      const text = sample.repeat(10_000);
      const span = createSpan(`span-${index}`, text);
      return {
        ...span,
        name: text,
        attributes: {
          ...span.attributes,
          [text]: text,
          array: [text, null, undefined, text],
          // Each serializes as `{}`, so counting them as text exceeds the request.
          nulls: Array(10_000).fill(null),
          missing: undefined,
          number: 1,
        },
        status: { code: 2, message: text },
        events: [
          { name: text, time: [0, 0], attributes: { [text]: [text] } },
          { name: text, time: [0, 0] },
        ],
        links: [{ context: span.spanContext(), attributes: { [text]: text } }],
      } as ReadableSpan;
    });

    const serializedBytes = (span: ReadableSpan) =>
      JsonTraceSerializer.serializeRequest([span])!.byteLength;

    for (const span of spans) {
      expect(getBatchSizeLowerBoundBytes([span])).toBeLessThanOrEqual(
        serializedBytes(span),
      );
    }
    // ASCII serializes one byte per character, so the bound is nearly exact,
    // and skipping any counted field drops it below 95%.
    const asciiSpan = spans[0];
    expect(getBatchSizeLowerBoundBytes([asciiSpan])).toBeGreaterThan(
      0.95 * serializedBytes(asciiSpan),
    );
  });

  it("delegates forceFlush and shutdown", async () => {
    const delegate = createDelegate();
    const exporter = new SizeLimitedSpanExporter({
      delegate,
      maxBatchSizeBytes: DEFAULT_MAX_BATCH_SIZE_BYTES,
    });

    await exporter.forceFlush();
    await exporter.shutdown();

    expect(delegate.forceFlush).toHaveBeenCalledOnce();
    expect(delegate.shutdown).toHaveBeenCalledOnce();
  });

  it("resolves the default for missing or invalid environment values", () => {
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => undefined);

    expect(DEFAULT_MAX_BATCH_SIZE_BYTES).toBe(67_108_864);
    for (const unsetValue of [undefined, "", "   "]) {
      expect(resolveMaxBatchSizeBytes(unsetValue)).toBe(67_108_864);
    }
    expect(warn).not.toHaveBeenCalled();

    for (const invalidValue of [
      "0",
      "-1",
      "+1",
      "1.5",
      "1e3",
      "not-a-number",
      `${Number.MAX_SAFE_INTEGER}0`,
    ]) {
      expect(resolveMaxBatchSizeBytes(invalidValue)).toBe(
        DEFAULT_MAX_BATCH_SIZE_BYTES,
      );
    }
    expect(warn).toHaveBeenCalledTimes(7);
  });

  it("accepts a trimmed positive decimal safe integer", () => {
    expect(resolveMaxBatchSizeBytes("  001024  ")).toBe(1024);
  });

  it("treats an empty process environment value as unset", () => {
    process.env.LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES = "";
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => undefined);

    expect(resolveMaxBatchSizeBytesFromEnvironment()).toBe(
      DEFAULT_MAX_BATCH_SIZE_BYTES,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
