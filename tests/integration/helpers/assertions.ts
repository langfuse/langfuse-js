import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";
import { MockSpanExporter } from "./MockSpanExporter.js";
import { expect } from "vitest";

/**
 * Enhanced assertion helpers for OpenTelemetry span testing
 */
export class SpanAssertions {
  constructor(private mockExporter: MockSpanExporter) {}

  /**
   * Assert the total number of exported spans
   */
  expectSpanCount(count: number): void {
    const actual = this.mockExporter.getSpanCount();
    expect(actual, `Expected ${count} spans, but got ${actual}`).toBe(count);
  }

  /**
   * Assert a span with the given name exists and return it
   */
  expectSpanWithName(name: string): ReadableSpan {
    const span = this.mockExporter.getSpanByName(name);
    expect(span, `Expected span with name '${name}' to exist`).toBeDefined();
    return span!;
  }

  /**
   * Assert multiple spans with the given name exist
   */
  expectSpansWithName(name: string, count: number): ReadableSpan[] {
    const spans = this.mockExporter.getSpansByName(name);
    expect(
      spans,
      `Expected ${count} spans with name '${name}', but got ${spans.length}`,
    ).toHaveLength(count);
    return spans;
  }

  /**
   * Assert a span has a specific attribute value
   */
  expectSpanAttribute(
    spanName: string,
    attributeKey: string,
    expectedValue?: any,
  ): void {
    const span = this.expectSpanWithName(spanName);
    expect(
      span.attributes,
      `Expected span '${spanName}' to have attribute '${attributeKey}'`,
    ).toHaveProperty(attributeKey);

    if (expectedValue !== undefined) {
      expect(
        span.attributes[attributeKey],
        `Expected attribute '${attributeKey}' to equal '${expectedValue}'`,
      ).toBe(expectedValue);
    }
  }

  /**
   * Assert a span attribute contains a substring
   */
  expectSpanAttributeContains(
    spanName: string,
    attributeKey: string,
    expectedSubstring: string,
  ): void {
    const span = this.expectSpanWithName(spanName);
    const attributeValue = span.attributes[attributeKey];
    expect(
      typeof attributeValue,
      `Expected attribute '${attributeKey}' to be a string`,
    ).toBe("string");
    expect(
      attributeValue as string,
      `Expected attribute '${attributeKey}' to contain '${expectedSubstring}'`,
    ).toContain(expectedSubstring);
  }

  /**
   * Assert a span attribute matches a regex pattern
   */
  expectSpanAttributeMatches(
    spanName: string,
    attributeKey: string,
    regex: RegExp,
  ): void {
    const span = this.expectSpanWithName(spanName);
    const attributeValue = span.attributes[attributeKey];
    expect(
      typeof attributeValue,
      `Expected attribute '${attributeKey}' to be a string`,
    ).toBe("string");
    expect(
      attributeValue as string,
      `Expected attribute '${attributeKey}' to match ${regex}`,
    ).toMatch(regex);
  }

  /**
   * Assert a span has a specific status code
   */
  expectSpanStatus(spanName: string, expectedCode: SpanStatusCode): void {
    const span = this.expectSpanWithName(spanName);
    expect(
      span.status.code,
      `Expected span '${spanName}' to have status code ${expectedCode}`,
    ).toBe(expectedCode);
  }

  /**
   * Assert a span duration is within expected range
   */
  expectSpanDuration(spanName: string, minMs: number, maxMs?: number): void {
    const span = this.expectSpanWithName(spanName);
    const durationMs =
      (span.endTime[0] - span.startTime[0]) * 1000 +
      (span.endTime[1] - span.startTime[1]) / 1_000_000;

    expect(
      durationMs,
      `Expected span '${spanName}' duration to be >= ${minMs}ms`,
    ).toBeGreaterThanOrEqual(minMs);
    if (maxMs !== undefined) {
      expect(
        durationMs,
        `Expected span '${spanName}' duration to be <= ${maxMs}ms`,
      ).toBeLessThanOrEqual(maxMs);
    }
  }

  /**
   * Assert a span has a specific parent
   */
  expectSpanParent(spanName: string, parentSpanName: string): void {
    const span = this.expectSpanWithName(spanName);
    const parentSpan = this.expectSpanWithName(parentSpanName);

    expect(
      span.parentSpanContext?.spanId,
      `Expected span '${spanName}' to have parent '${parentSpanName}'`,
    ).toBe(parentSpan.spanContext().spanId);
    expect(
      span.spanContext().traceId,
      `Expected span '${spanName}' to be in same trace as parent '${parentSpanName}'`,
    ).toBe(parentSpan.spanContext().traceId);
  }

  /**
   * Assert all spans are in the same trace
   */
  expectAllSpansInSameTrace(): void {
    const spans = this.mockExporter.exportedSpans;
    if (spans.length <= 1) return;

    const firstTraceId = spans[0].spanContext().traceId;
    spans.forEach((span, index) => {
      expect(
        span.spanContext().traceId,
        `Expected span ${index} ('${span.name}') to be in same trace`,
      ).toBe(firstTraceId);
    });
  }

  /**
   * Assert a span has no parent (is root span)
   */
  expectSpanHasNoParent(spanName: string): void {
    const span = this.expectSpanWithName(spanName);
    expect(
      span.parentSpanContext?.spanId,
      `Expected span '${spanName}' to have no parent`,
    ).toBeUndefined();
  }

  /**
   * Assert an attribute has been masked
   */
  expectMaskedAttribute(spanName: string, attributeKey: string): void {
    const span = this.expectSpanWithName(spanName);
    const attributeValue = span.attributes[attributeKey];

    const isMasked =
      typeof attributeValue === "string" &&
      (attributeValue.includes("***") ||
        attributeValue.includes("<masked>") ||
        attributeValue.includes("<fully masked"));

    expect(
      isMasked,
      `Expected attribute '${attributeKey}' in span '${spanName}' to be masked`,
    ).toBe(true);
  }

  /**
   * Assert media content has been replaced with tags
   */
  expectMediaReplaced(spanName: string, attributeKey: string): void {
    const span = this.expectSpanWithName(spanName);
    const attributeValue = span.attributes[attributeKey];

    expect(
      typeof attributeValue,
      `Expected attribute '${attributeKey}' to be a string`,
    ).toBe("string");
    const stringValue = attributeValue as string;

    // Should not contain base64 data URIs
    expect(
      stringValue,
      `Expected attribute '${attributeKey}' to not contain base64 data URIs`,
    ).not.toMatch(/data:[^;]+;base64,[A-Za-z0-9+/]+=*/);

    // Should contain Langfuse media tags
    expect(
      stringValue,
      `Expected attribute '${attributeKey}' to contain Langfuse media tags`,
    ).toMatch(/@@@langfuse-media:[a-f0-9-]+@@@/);
  }

  /**
   * Assert span has specific child spans
   */
  expectSpanChildren(parentSpanName: string, childSpanNames: string[]): void {
    const parentSpan = this.expectSpanWithName(parentSpanName);
    const childSpans = this.mockExporter.getChildSpans(
      parentSpan.spanContext().spanId,
    );

    expect(
      childSpans,
      `Expected parent span '${parentSpanName}' to have ${childSpanNames.length} children`,
    ).toHaveLength(childSpanNames.length);

    childSpanNames.forEach((childName) => {
      const childSpan = childSpans.find((s) => s.name === childName);
      expect(
        childSpan,
        `Expected child span '${childName}' to exist`,
      ).toBeDefined();
    });
  }

  /**
   * Assert export statistics match expectations
   */
  expectExportStats(expected: {
    totalExports?: number;
    successfulExports?: number;
    failedExports?: number;
    totalSpansExported?: number;
  }): void {
    const stats = this.mockExporter.getExportStats();

    if (expected.totalExports !== undefined) {
      expect(
        stats.totalExports,
        `Expected ${expected.totalExports} total exports`,
      ).toBe(expected.totalExports);
    }
    if (expected.successfulExports !== undefined) {
      expect(
        stats.successfulExports,
        `Expected ${expected.successfulExports} successful exports`,
      ).toBe(expected.successfulExports);
    }
    if (expected.failedExports !== undefined) {
      expect(
        stats.failedExports,
        `Expected ${expected.failedExports} failed exports`,
      ).toBe(expected.failedExports);
    }
    if (expected.totalSpansExported !== undefined) {
      expect(
        stats.totalSpansExported,
        `Expected ${expected.totalSpansExported} total spans exported`,
      ).toBe(expected.totalSpansExported);
    }
  }

  /**
   * Assert span has been ended (has endTime)
   */
  expectSpanEnded(spanName: string): void {
    const span = this.expectSpanWithName(spanName);
    expect(
      span.endTime,
      `Expected span '${spanName}' to be ended`,
    ).toBeDefined();
    expect(
      span.endTime[0],
      `Expected span '${spanName}' to have valid end time`,
    ).toBeGreaterThan(0);
  }

  /**
   * Assert span order by start time
   */
  expectSpanOrder(spanNames: string[]): void {
    const spans = spanNames.map((name) => this.expectSpanWithName(name));

    for (let i = 1; i < spans.length; i++) {
      const prevSpan = spans[i - 1];
      const currentSpan = spans[i];

      const prevStartTime = prevSpan.startTime[0] * 1e9 + prevSpan.startTime[1];
      const currentStartTime =
        currentSpan.startTime[0] * 1e9 + currentSpan.startTime[1];

      expect(
        currentStartTime,
        `Expected span '${spanNames[i]}' to start after '${spanNames[i - 1]}'`,
      ).toBeGreaterThanOrEqual(prevStartTime);
    }
  }
}
