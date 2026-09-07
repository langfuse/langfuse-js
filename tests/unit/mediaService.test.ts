import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaService } from "../../packages/otel/src/MediaService";

function makeSpan(attributes: Record<string, unknown>): ReadableSpan {
  return {
    attributes,
    instrumentationScope: { name: "test" },
    spanContext: () => ({ traceId: "trace-1", spanId: "span-1" }),
  } as unknown as ReadableSpan;
}

function makeApiClient() {
  return {
    media: {
      // Echo back the SDK-computed media ID so uploadMedia's integrity check
      // (clientSideMediaId === server mediaId) passes.
      getUploadUrl: vi.fn().mockImplementation(({ sha256Hash }) => ({
        uploadUrl: "https://upload.example/put",
        mediaId: sha256Hash
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .slice(0, 22),
      })),
      patch: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

describe("MediaService.process", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts a well-formed base64 data URI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, text: async () => "" }),
    );

    const apiClient = makeApiClient();
    const service = new MediaService({ apiClient });

    const attributes = {
      [LangfuseOtelSpanAttributes.TRACE_INPUT]: JSON.stringify([
        {
          role: "user",
          content: [
            {
              type: "input_file",
              file: "data:application/pdf;base64,JVBERi0xLjQK",
            },
          ],
        },
      ]),
    };
    const span = makeSpan(attributes);

    await service.process(span);
    await service.flush();

    expect(apiClient.media.getUploadUrl).toHaveBeenCalledTimes(1);
    expect(apiClient.media.getUploadUrl.mock.calls[0][0].contentType).toBe(
      "application/pdf",
    );
    expect(attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]).not.toContain(
      ";base64,",
    );
  });

  // Regression test for "[Langfuse SDK] [ERROR] Error parsing base64 data URI
  // Error: Data is not base64 encoded": a plain-text "data:" mention earlier
  // in the payload used to be greedily glued to a later, real data URI by
  // the extraction regex, producing a bogus match that failed to parse.
  it("does not glue a plain-text 'data:' mention to a later real data URI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, text: async () => "" }),
    );

    const apiClient = makeApiClient();
    const service = new MediaService({ apiClient });

    const attributes = {
      [LangfuseOtelSpanAttributes.TRACE_INPUT]: JSON.stringify([
        {
          role: "user",
          content:
            "check data:image stuff, here is the file data:application/pdf;base64,JVBERi0xLjQK",
        },
      ]),
    };
    const span = makeSpan(attributes);

    await service.process(span);
    await service.flush();

    expect(apiClient.media.getUploadUrl).toHaveBeenCalledTimes(1);
    expect(apiClient.media.getUploadUrl.mock.calls[0][0].contentType).toBe(
      "application/pdf",
    );
    expect(attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]).not.toContain(
      ";base64,",
    );
    expect(attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]).toContain(
      "check data:image stuff, here is the file",
    );
  });

  it("skips attributes with no data URI without error", async () => {
    const apiClient = makeApiClient();
    const service = new MediaService({ apiClient });

    const attributes = {
      [LangfuseOtelSpanAttributes.TRACE_INPUT]: JSON.stringify([
        { role: "user", content: "hello data:image stuff, no file here" },
      ]),
    };
    const span = makeSpan(attributes);

    await service.process(span);
    await service.flush();

    expect(apiClient.media.getUploadUrl).not.toHaveBeenCalled();
  });
});
