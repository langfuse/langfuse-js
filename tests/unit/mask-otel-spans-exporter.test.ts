import { getGlobalLogger } from "@langfuse/core";
import type { Attributes } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaskOtelSpansExporter } from "../../packages/otel/src/mask-otel-spans-exporter.js";
import type {
  MaskOtelSpansFunction,
  OtelSpanPatch,
} from "../../packages/otel/src/span-processor.js";

const TRACE_ID = "0123456789abcdef0123456789abcdef";

function createSpan(spanId: string, attributes: Attributes): ReadableSpan {
  return {
    name: `span-${spanId}`,
    attributes,
    duration: [0, 1],
    startTime: [0, 0],
    endTime: [0, 1],
    ended: true,
    kind: 0,
    status: { code: 0 },
    spanContext: () => ({ traceId: TRACE_ID, spanId, traceFlags: 1 }),
    parentSpanContext: undefined,
    resource: { attributes: { "service.name": "test" } },
    instrumentationScope: { name: "ai", version: "7.0.0" },
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

function exportSpans(
  exporter: MaskOtelSpansExporter,
  spans: ReadableSpan[],
): Promise<ExportResult> {
  return new Promise((resolve) => exporter.export(spans, resolve));
}

describe("MaskOtelSpansExporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes read-only snapshots keyed by trace and span id", async () => {
    const maskOtelSpans = vi.fn<MaskOtelSpansFunction>(() => undefined);
    const exporter = new MaskOtelSpansExporter({
      delegate: createDelegate(),
      maskOtelSpans,
    });

    const original = createSpan("00000000000000a1", {
      "gen_ai.input.messages": "hi",
      "gen_ai.response.finish_reasons": ["stop"],
    });
    await exportSpans(exporter, [original]);

    const { spans } = maskOtelSpans.mock.calls[0][0];
    const span = spans.get(`${TRACE_ID}-00000000000000a1`);
    expect(span).toEqual({
      traceId: TRACE_ID,
      spanId: "00000000000000a1",
      parentSpanId: undefined,
      name: "span-00000000000000a1",
      instrumentationScopeName: "ai",
      instrumentationScopeVersion: "7.0.0",
      attributes: {
        "gen_ai.input.messages": "hi",
        "gen_ai.response.finish_reasons": ["stop"],
      },
      resourceAttributes: { "service.name": "test" },
    });
    expect(Object.isFrozen(span)).toBe(true);
    expect(Object.isFrozen(span?.attributes)).toBe(true);
    expect(
      Object.isFrozen(span?.attributes["gen_ai.response.finish_reasons"]),
    ).toBe(true);
    expect(span?.attributes["gen_ai.response.finish_reasons"]).not.toBe(
      original.attributes["gen_ai.response.finish_reasons"],
    );
  });

  it("exports patched copies and leaves unpatched and original spans unchanged", async () => {
    const delegate = createDelegate();
    const patched = createSpan("00000000000000a1", {
      "gen_ai.input.messages": "write to jane@acme.example",
      "gen_ai.output.messages": "sure, jane@acme.example",
      "gen_ai.request.model": "mock-model",
    });
    const unpatched = createSpan("00000000000000a2", {
      "gen_ai.input.messages": "no email here",
    });
    const exporter = new MaskOtelSpansExporter({
      delegate,
      maskOtelSpans: () => ({
        spanPatches: new Map<string, OtelSpanPatch>([
          [
            `${TRACE_ID}-00000000000000a1`,
            {
              deleteAttributes: [
                "gen_ai.input.messages",
                "gen_ai.output.messages",
              ],
              setAttributes: {
                "gen_ai.input.messages": "write to <email>",
                "app.masked": true,
              },
            },
          ],
        ]),
      }),
    });

    const result = await exportSpans(exporter, [patched, unpatched]);

    expect(result).toEqual({ code: ExportResultCode.SUCCESS });
    const [exported] = vi.mocked(delegate.export).mock.calls[0];
    expect(exported).toHaveLength(2);
    expect(exported[0].attributes).toEqual({
      "gen_ai.input.messages": "write to <email>",
      "gen_ai.request.model": "mock-model",
      "app.masked": true,
    });
    expect(exported[0].spanContext()).toEqual(patched.spanContext());
    expect(exported[0].name).toBe(patched.name);
    expect(exported[1]).toBe(unpatched);
    expect(patched.attributes["gen_ai.input.messages"]).toBe(
      "write to jane@acme.example",
    );
  });

  it("exports the batch unchanged when the function returns undefined", async () => {
    const delegate = createDelegate();
    const spans = [createSpan("00000000000000a1", { key: "value" })];
    const exporter = new MaskOtelSpansExporter({
      delegate,
      maskOtelSpans: async () => undefined,
    });

    await exportSpans(exporter, spans);

    expect(vi.mocked(delegate.export).mock.calls[0][0]).toEqual(spans);
  });

  it.each<[string, MaskOtelSpansFunction]>([
    [
      "throws",
      () => {
        throw new Error("mask failed");
      },
    ],
    [
      "rejects",
      async () => {
        throw new Error("mask failed");
      },
    ],
    [
      "patches an unknown span",
      () => ({
        spanPatches: new Map([
          [`${TRACE_ID}-ffffffffffffffff`, { deleteAttributes: ["key"] }],
        ]),
      }),
    ],
    [
      "returns deleteAttributes as a string",
      ({ spans }) => ({
        spanPatches: new Map(
          Array.from(spans.keys(), (key) => [
            key,
            { deleteAttributes: "key" as unknown as string[] },
          ]),
        ),
      }),
    ],
    [
      "returns setAttributes as an array",
      ({ spans }) => ({
        spanPatches: new Map(
          Array.from(spans.keys(), (key) => [
            key,
            { setAttributes: ["masked"] as unknown as Attributes },
          ]),
        ),
      }),
    ],
    [
      "returns a patch that is not an object",
      ({ spans }) => ({
        spanPatches: new Map(
          Array.from(spans.keys(), (key) => [
            key,
            true as unknown as OtelSpanPatch,
          ]),
        ),
      }),
    ],
  ])(
    "drops the whole batch when the function %s",
    async (_description, maskOtelSpans) => {
      vi.spyOn(getGlobalLogger(), "error").mockImplementation(() => undefined);
      const delegate = createDelegate();
      const exporter = new MaskOtelSpansExporter({ delegate, maskOtelSpans });

      const result = await exportSpans(exporter, [
        createSpan("00000000000000a1", { key: "jane@acme.example" }),
      ]);

      expect(result).toEqual({ code: ExportResultCode.SUCCESS });
      expect(delegate.export).not.toHaveBeenCalled();
      expect(
        vi.mocked(getGlobalLogger().error).mock.calls[0].slice(0, 2),
      ).toEqual([
        expect.stringContaining("Dropping the export batch"),
        { spanCount: 1 },
      ]);
    },
  );

  it("removes an attribute set to an invalid value without logging the value", async () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => undefined);
    const delegate = createDelegate();
    const exporter = new MaskOtelSpansExporter({
      delegate,
      maskOtelSpans: ({ spans }) => ({
        spanPatches: new Map(
          Array.from(spans.keys(), (key) => [
            key,
            {
              setAttributes: {
                "gen_ai.input.messages": {
                  email: "jane@acme.example",
                } as unknown as string,
                "app.masked": true,
              },
            },
          ]),
        ),
      }),
    });

    await exportSpans(exporter, [
      createSpan("00000000000000a1", {
        "gen_ai.input.messages": "jane@acme.example",
      }),
    ]);

    expect(vi.mocked(delegate.export).mock.calls[0][0][0].attributes).toEqual({
      "app.masked": true,
    });
    expect(getGlobalLogger().warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid attribute value"),
      {
        spanName: "span-00000000000000a1",
        attributeKey: "gen_ai.input.messages",
        valueType: "object",
      },
    );
    expect(
      JSON.stringify(vi.mocked(getGlobalLogger().warn).mock.calls),
    ).not.toContain("jane@acme.example");
  });

  it("reports a throwing delegate as a failed export", async () => {
    const error = new Error("exporter failed");
    const delegate = createDelegate();
    vi.mocked(delegate.export).mockImplementation(() => {
      throw error;
    });
    const exporter = new MaskOtelSpansExporter({
      delegate,
      maskOtelSpans: () => undefined,
    });

    const result = await exportSpans(exporter, [
      createSpan("00000000000000a1", { key: "value" }),
    ]);

    expect(result).toEqual({ code: ExportResultCode.FAILED, error });
  });

  it("delegates forceFlush and shutdown", async () => {
    const delegate = createDelegate();
    const exporter = new MaskOtelSpansExporter({
      delegate,
      maskOtelSpans: () => undefined,
    });

    await exporter.forceFlush();
    await exporter.shutdown();

    expect(delegate.forceFlush).toHaveBeenCalledOnce();
    expect(delegate.shutdown).toHaveBeenCalledOnce();
  });
});
