import { getGlobalLogger } from "@langfuse/core";
import type { AttributeValue, Attributes } from "@opentelemetry/api";
import { ExportResultCode, isAttributeValue } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

import type {
  MaskOtelSpansFunction,
  OtelSpanAttributes,
  OtelSpanData,
  OtelSpanPatch,
} from "./span-processor.js";

export class MaskOtelSpansExporter implements SpanExporter {
  private readonly delegate: SpanExporter;
  private readonly maskOtelSpans: MaskOtelSpansFunction;

  constructor(params: {
    delegate: SpanExporter;
    maskOtelSpans: MaskOtelSpansFunction;
  }) {
    this.delegate = params.delegate;
    this.maskOtelSpans = params.maskOtelSpans;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    void this.maskSpans(spans)
      .then((maskedSpans) => {
        if (maskedSpans.length === 0) {
          resultCallback({ code: ExportResultCode.SUCCESS });
          return;
        }

        this.delegate.export(maskedSpans, resultCallback);
      })
      .catch((error) => {
        resultCallback({ code: ExportResultCode.FAILED, error });
      });
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  private async maskSpans(spans: ReadableSpan[]): Promise<ReadableSpan[]> {
    const spansByKey = new Map<string, ReadableSpan>();
    const spanData = new Map<string, OtelSpanData>();

    for (const span of spans) {
      const { traceId, spanId } = span.spanContext();
      const key = `${traceId}-${spanId}`;

      spansByKey.set(key, span);
      spanData.set(
        key,
        Object.freeze({
          traceId,
          spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          name: span.name,
          instrumentationScopeName: span.instrumentationScope.name,
          instrumentationScopeVersion: span.instrumentationScope.version,
          attributes: freezeAttributes(span.attributes),
          resourceAttributes: freezeAttributes(span.resource.attributes),
        }),
      );
    }

    const maskedSpans: ReadableSpan[] = [];

    try {
      const result = await this.maskOtelSpans({ spans: spanData });

      if (result === undefined) return Array.from(spansByKey.values());

      for (const key of result.spanPatches.keys()) {
        if (!spansByKey.has(key)) {
          getGlobalLogger().error(
            "maskOtelSpans returned a patch for a span that is not in the batch. Dropping the export batch.",
            { spanCount: spans.length },
          );
          return [];
        }
      }

      for (const [key, span] of spansByKey) {
        const patch = result.spanPatches.get(key);

        maskedSpans.push(
          patch === undefined ? span : applyOtelSpanPatch(span, patch),
        );
      }
    } catch (err) {
      getGlobalLogger().error(
        "maskOtelSpans failed. Dropping the export batch.",
        { spanCount: spans.length },
        err,
      );
      return [];
    }

    return maskedSpans;
  }
}

function freezeAttributes(attributes: Attributes): OtelSpanAttributes {
  const frozen: Record<string, Readonly<AttributeValue> | undefined> = {};

  for (const [key, value] of Object.entries(attributes)) {
    frozen[key] = Array.isArray(value) ? Object.freeze(value.slice()) : value;
  }

  return Object.freeze(frozen);
}

function applyOtelSpanPatch(
  span: ReadableSpan,
  patch: OtelSpanPatch,
): ReadableSpan {
  const deleteAttributes = patch.deleteAttributes ?? [];
  const setAttributes = patch.setAttributes ?? {};

  // Untyped callers can return any shape, and a wrong one must not export unmasked data
  if (
    typeof patch !== "object" ||
    !Array.isArray(deleteAttributes) ||
    typeof setAttributes !== "object" ||
    Array.isArray(setAttributes)
  ) {
    throw new TypeError("maskOtelSpans returned a malformed span patch");
  }

  const attributes: Attributes = { ...span.attributes };

  for (const key of deleteAttributes) {
    delete attributes[key];
  }

  for (const [key, value] of Object.entries(setAttributes)) {
    if (value === undefined || value === null || !isAttributeValue(value)) {
      delete attributes[key];
      getGlobalLogger().warn(
        "maskOtelSpans set an invalid attribute value. Dropping the attribute from the export.",
        { spanName: span.name, attributeKey: key, valueType: typeof value },
      );
      continue;
    }

    attributes[key] = value;
  }

  // Other span processors may hold the same span, so export a copy
  return {
    name: span.name,
    kind: span.kind,
    spanContext: () => span.spanContext(),
    parentSpanContext: span.parentSpanContext,
    startTime: span.startTime,
    endTime: span.endTime,
    status: span.status,
    attributes,
    links: span.links,
    events: span.events,
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}
