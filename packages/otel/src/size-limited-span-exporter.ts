import { getEnv, getGlobalLogger } from "@langfuse/core";
import type { Attributes } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

export const DEFAULT_MAX_BATCH_SIZE_BYTES = 64 * 1024 * 1024;

// Every UTF-16 code unit of a serialized string becomes at least one byte of
// the UTF-8 OTLP JSON body, so summing the lengths of strings that always
// appear in the request never exceeds the request size.
export function getBatchSizeLowerBoundBytes(spans: ReadableSpan[]): number {
  let bytes = 0;
  for (const span of spans) {
    bytes +=
      span.name.length +
      (span.status.message?.length ?? 0) +
      getAttributesLowerBoundBytes(span.attributes);
    for (const event of span.events) {
      bytes +=
        event.name.length + getAttributesLowerBoundBytes(event.attributes);
    }
    for (const link of span.links) {
      bytes += getAttributesLowerBoundBytes(link.attributes);
    }
  }
  return bytes;
}

function getAttributesLowerBoundBytes(attributes: Attributes = {}): number {
  let bytes = 0;
  for (const [key, value] of Object.entries(attributes)) {
    bytes += key.length;
    if (typeof value === "string") {
      bytes += value.length;
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") bytes += item.length;
      }
    }
  }
  return bytes;
}

export function resolveMaxBatchSizeBytes(rawValue: string | undefined): number {
  const normalizedValue = rawValue?.trim();
  if (!normalizedValue) return DEFAULT_MAX_BATCH_SIZE_BYTES;

  const parsedValue = /^\d+$/.test(normalizedValue)
    ? Number(normalizedValue)
    : Number.NaN;
  if (Number.isSafeInteger(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  getGlobalLogger().warn(
    "Invalid LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES. Using the default limit.",
    { defaultMaxBatchSizeBytes: DEFAULT_MAX_BATCH_SIZE_BYTES },
  );
  return DEFAULT_MAX_BATCH_SIZE_BYTES;
}

export function resolveMaxBatchSizeBytesFromEnvironment(): number {
  return resolveMaxBatchSizeBytes(getEnv("LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES"));
}

export class SizeLimitedSpanExporter implements SpanExporter {
  private readonly delegate: SpanExporter;
  private readonly maxBatchSizeBytes: number;

  constructor(params: { delegate: SpanExporter; maxBatchSizeBytes: number }) {
    this.delegate = params.delegate;
    this.maxBatchSizeBytes = params.maxBatchSizeBytes;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    const sizeLowerBoundBytes = getBatchSizeLowerBoundBytes(spans);

    if (sizeLowerBoundBytes > this.maxBatchSizeBytes) {
      getGlobalLogger().warn(
        "Dropping OpenTelemetry span batch because it exceeds the configured byte limit.",
        {
          maxBatchSizeBytes: this.maxBatchSizeBytes,
          sizeLowerBoundBytes,
          spanCount: spans.length,
        },
      );
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error(
          `OpenTelemetry span batch size of at least ${sizeLowerBoundBytes} bytes exceeds the configured limit of ${this.maxBatchSizeBytes} bytes.`,
        ),
      });
      return;
    }

    this.delegate.export(spans, resultCallback);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
