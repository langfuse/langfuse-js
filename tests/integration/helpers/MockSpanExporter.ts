import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";

/**
 * Mock span exporter that captures exported spans in memory for testing.
 * Provides utilities for simulating export failures and delays.
 */
export class MockSpanExporter implements SpanExporter {
  private _exportedSpans: ReadableSpan[] = [];
  private _exportResults: ExportResult[] = [];
  private _shouldFail: boolean = false;
  private _exportDelay: number = 0;
  private _isShutdown: boolean = false;

  get exportedSpans(): ReadableSpan[] {
    return [...this._exportedSpans];
  }

  get exportResults(): ExportResult[] {
    return [...this._exportResults];
  }

  get shouldFail(): boolean {
    return this._shouldFail;
  }

  set shouldFail(value: boolean) {
    this._shouldFail = value;
  }

  get exportDelay(): number {
    return this._exportDelay;
  }

  set exportDelay(value: number) {
    this._exportDelay = Math.max(0, value);
  }

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    if (this._isShutdown) {
      const result: ExportResult = {
        code: ExportResultCode.FAILED,
        error: new Error("Exporter is shutdown"),
      };
      this._exportResults.push(result);
      resultCallback(result);
      return;
    }

    if (this._exportDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._exportDelay));
    }

    // Simulate export failure if configured
    if (this._shouldFail) {
      const result: ExportResult = {
        code: ExportResultCode.FAILED,
        error: new Error("Mock export failure"),
      };
      this._exportResults.push(result);
      resultCallback(result);
      return;
    }

    // Successfully export spans
    this._exportedSpans.push(...spans);

    const result: ExportResult = {
      code: ExportResultCode.SUCCESS,
    };

    this._exportResults.push(result);
    resultCallback(result);
  }

  async shutdown(): Promise<void> {
    this._isShutdown = true;
    this._exportedSpans = [];
    this._exportResults = [];
  }

  async forceFlush(): Promise<void> {
    // No-op for mock - spans are immediately available
  }

  // Helper methods for testing
  clear(): void {
    if (this._isShutdown) {
      throw new Error("Cannot clear spans on shutdown exporter");
    }
    this._exportedSpans = [];
    this._exportResults = [];
  }

  getSpanByName(name: string): ReadableSpan | undefined {
    return this._exportedSpans.find((span) => span.name === name);
  }

  getSpansByName(name: string): ReadableSpan[] {
    return this._exportedSpans.filter((span) => span.name === name);
  }

  getSpanCount(): number {
    return this._exportedSpans.length;
  }

  getSpanAttributes(spanName: string): Record<string, any> | undefined {
    const span = this.getSpanByName(spanName);
    return span ? span.attributes : undefined;
  }

  hasSpanWithAttribute(attributeKey: string, attributeValue?: any): boolean {
    return this._exportedSpans.some((span) => {
      const hasKey = attributeKey in span.attributes;
      if (attributeValue === undefined) return hasKey;
      return hasKey && span.attributes[attributeKey] === attributeValue;
    });
  }

  /**
   * Get spans by their parent relationship
   */
  getChildSpans(parentSpanId: string): ReadableSpan[] {
    return this._exportedSpans.filter(
      (span) => span.parentSpanContext?.spanId === parentSpanId,
    );
  }

  /**
   * Get the root span (span without parent)
   */
  getRootSpan(): ReadableSpan | undefined {
    return this._exportedSpans.find((span) => !span.parentSpanContext?.spanId);
  }

  /**
   * Get all spans in the same trace
   */
  getSpansInTrace(traceId: string): ReadableSpan[] {
    return this._exportedSpans.filter(
      (span) => span.spanContext().traceId === traceId,
    );
  }

  /**
   * Get export statistics
   */
  getExportStats(): {
    totalExports: number;
    successfulExports: number;
    failedExports: number;
    totalSpansExported: number;
  } {
    const successful = this._exportResults.filter(
      (r) => r.code === ExportResultCode.SUCCESS,
    ).length;
    const failed = this._exportResults.filter(
      (r) => r.code === ExportResultCode.FAILED,
    ).length;

    return {
      totalExports: this._exportResults.length,
      successfulExports: successful,
      failedExports: failed,
      totalSpansExported: this._exportedSpans.length,
    };
  }

  /**
   * Reset the exporter to initial state
   */
  reset(): void {
    this._exportedSpans = [];
    this._exportResults = [];
    this._shouldFail = false;
    this._exportDelay = 0;
    this._isShutdown = false;
  }
}
