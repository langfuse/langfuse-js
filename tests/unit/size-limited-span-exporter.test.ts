import { getGlobalLogger } from "@langfuse/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MAX_BATCH_SIZE_BYTES,
  SizeLimitedSpanExporter,
  getSerializedBatchSizeBytes,
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
    ["below", 1],
    ["at", 0],
  ])(
    "forwards a serialized batch %s the byte limit",
    (_position, extraBytes) => {
      const delegate = createDelegate();
      const spans = [createSpan("span-1", "héllo")];
      const serializedSize = getSerializedBatchSizeBytes(spans)!;
      const callback = vi.fn();
      const exporter = new SizeLimitedSpanExporter({
        delegate,
        maxBatchSizeBytes: serializedSize + extraBytes,
      });

      exporter.export(spans, callback);

      expect(delegate.export).toHaveBeenCalledOnce();
      expect(delegate.export).toHaveBeenCalledWith(spans, callback);
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    },
  );

  it("drops a combined oversized batch without splitting or delegating", () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => undefined);
    const delegate = createDelegate();
    const sensitivePayload = "payload-that-must-not-be-logged";
    const spans = [
      createSpan("span-1", sensitivePayload),
      createSpan("span-2", "two"),
    ];
    const individualSizes = spans.map(
      (span) => getSerializedBatchSizeBytes([span])!,
    );
    const combinedSize = getSerializedBatchSizeBytes(spans)!;
    const maxBatchSizeBytes = Math.max(...individualSizes);
    expect(combinedSize).toBeGreaterThan(maxBatchSizeBytes);
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
        serializedSizeBytes: combinedSize,
        spanCount: spans.length,
      },
    );
    expect(
      JSON.stringify(vi.mocked(getGlobalLogger().warn).mock.calls),
    ).not.toContain(sensitivePayload);
  });

  it.each(["undefined", "throw"])(
    "fails once without delegating when serialization returns %s",
    (failureMode) => {
      const delegate = createDelegate();
      const serializationError = new Error("serialization failed");
      const callback = vi.fn();
      const exporter = new SizeLimitedSpanExporter({
        delegate,
        maxBatchSizeBytes: DEFAULT_MAX_BATCH_SIZE_BYTES,
        serializeRequest: () => {
          if (failureMode === "throw") throw serializationError;
          return undefined;
        },
      });

      exporter.export([createSpan("span-1", "output")], callback);

      expect(delegate.export).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: ExportResultCode.FAILED }),
      );
    },
  );

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
    expect(resolveMaxBatchSizeBytes(undefined)).toBe(67_108_864);
    for (const invalidValue of [
      "",
      "   ",
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
    expect(warn).toHaveBeenCalledTimes(9);
  });

  it("accepts a trimmed positive decimal safe integer", () => {
    expect(resolveMaxBatchSizeBytes("  001024  ")).toBe(1024);
  });

  it("warns and falls back when the process environment value is empty", () => {
    process.env.LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES = "";
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => undefined);

    expect(resolveMaxBatchSizeBytesFromEnvironment()).toBe(
      DEFAULT_MAX_BATCH_SIZE_BYTES,
    );
    expect(warn).toHaveBeenCalledOnce();
  });
});
