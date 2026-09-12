import { getEnv, getGlobalLogger } from "@langfuse/core";
import { ExportResultCode } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

export const DEFAULT_MAX_BATCH_SIZE_BYTES = 64 * 1024 * 1024;

export function getSerializedBatchSizeBytes(
  spans: ReadableSpan[],
): number | undefined {
  return JsonTraceSerializer.serializeRequest(spans)?.byteLength;
}

export function resolveMaxBatchSizeBytes(rawValue: string | undefined): number {
  if (rawValue === undefined) return DEFAULT_MAX_BATCH_SIZE_BYTES;

  const normalizedValue = rawValue.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    getGlobalLogger().warn(
      "Invalid LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES. Using the default limit.",
      { defaultMaxBatchSizeBytes: DEFAULT_MAX_BATCH_SIZE_BYTES },
    );
    return DEFAULT_MAX_BATCH_SIZE_BYTES;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    getGlobalLogger().warn(
      "Invalid LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES. Using the default limit.",
      { defaultMaxBatchSizeBytes: DEFAULT_MAX_BATCH_SIZE_BYTES },
    );
    return DEFAULT_MAX_BATCH_SIZE_BYTES;
  }

  return parsedValue;
}

export function resolveMaxBatchSizeBytesFromEnvironment(): number {
  const processValue =
    typeof process !== "undefined"
      ? process.env.LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES
      : undefined;

  return resolveMaxBatchSizeBytes(
    processValue !== undefined
      ? processValue
      : getEnv("LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES"),
  );
}

export class SizeLimitedSpanExporter implements SpanExporter {
  private readonly delegate: SpanExporter;
  private readonly maxBatchSizeBytes: number;
  private readonly serializeRequest: (
    spans: ReadableSpan[],
  ) => { byteLength: number } | undefined;

  constructor(params: {
    delegate: SpanExporter;
    maxBatchSizeBytes: number;
    serializeRequest?: (
      spans: ReadableSpan[],
    ) => { byteLength: number } | undefined;
  }) {
    this.delegate = params.delegate;
    this.maxBatchSizeBytes = params.maxBatchSizeBytes;
    this.serializeRequest =
      params.serializeRequest ?? JsonTraceSerializer.serializeRequest;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    let serializedSizeBytes: number | undefined;

    try {
      serializedSizeBytes = this.serializeRequest(spans)?.byteLength;
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }

    if (serializedSizeBytes === undefined) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error("Failed to serialize OpenTelemetry span batch."),
      });
      return;
    }

    if (serializedSizeBytes > this.maxBatchSizeBytes) {
      getGlobalLogger().warn(
        "Dropping OpenTelemetry span batch because its serialized request exceeds the configured byte limit.",
        {
          maxBatchSizeBytes: this.maxBatchSizeBytes,
          serializedSizeBytes,
          spanCount: spans.length,
        },
      );
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error(
          `Serialized OpenTelemetry span batch size ${serializedSizeBytes} bytes exceeds the configured limit of ${this.maxBatchSizeBytes} bytes.`,
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
