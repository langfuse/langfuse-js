import {
  LangfuseMedia,
  LangfuseMediaReference,
  bytesToBase64,
  findMediaReferences,
  registerMediaReferenceOwner,
  releaseMediaReferences,
  resolveMediaReference,
  serializeWithMediaReferences,
} from "@langfuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("LangfuseMediaReference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const referenceString =
    "@@@langfuseMedia:type=image/png|id=media-id|source=bytes@@@";
  const baseParams = {
    mediaId: "media-id",
    contentType: "image/png",
    url: "https://example.com/image.png",
    referenceString,
  };

  it("exposes the provided metadata", () => {
    const ref = new LangfuseMediaReference({
      ...baseParams,
      urlExpiry: "2026-06-16T12:00:00.000Z",
      contentLength: 1234,
    });

    expect(ref.mediaId).toBe("media-id");
    expect(ref.contentType).toBe("image/png");
    expect(ref.url).toBe("https://example.com/image.png");
    expect(ref.urlExpiry).toBe("2026-06-16T12:00:00.000Z");
    expect(ref.contentLength).toBe(1234);
    expect(ref.referenceString).toBe(referenceString);
  });

  it("serializes back to its reference string via JSON.stringify", () => {
    const ref = new LangfuseMediaReference(baseParams);

    expect(ref.toJSON()).toBe(referenceString);
    expect(JSON.stringify({ image: ref })).toBe(
      JSON.stringify({ image: referenceString }),
    );
  });

  describe("isUrlExpired", () => {
    it("returns false when no expiry is set", () => {
      expect(new LangfuseMediaReference(baseParams).isUrlExpired()).toBe(false);
    });

    it("returns true when past expiry (incl. threshold)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));

      const ref = new LangfuseMediaReference({
        ...baseParams,
        urlExpiry: "2026-06-16T12:00:30.000Z", // 30s ahead, within 60s threshold
      });

      expect(ref.isUrlExpired()).toBe(true);
      expect(ref.isUrlExpired(10)).toBe(false);
    });

    it("returns false for a far-future, non-expired URL", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));

      const ref = new LangfuseMediaReference({
        ...baseParams,
        urlExpiry: "2026-06-16T13:00:00.000Z",
      });

      expect(ref.isUrlExpired()).toBe(false);
    });
  });

  describe("fetch helpers", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    function mockFetch(ok = true, status = 200): void {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok,
          status,
          arrayBuffer: async () => bytes.buffer,
        }),
      );
    }

    it("fetchBytes returns content from the signed URL", async () => {
      mockFetch();
      const ref = new LangfuseMediaReference(baseParams);

      expect(await ref.fetchBytes()).toEqual(bytes);
      expect(fetch).toHaveBeenCalledWith(baseParams.url, {
        method: "GET",
        headers: {},
      });
    });

    it("fetchBase64 returns raw base64 without data URI prefix", async () => {
      mockFetch();
      const ref = new LangfuseMediaReference(baseParams);

      expect(await ref.fetchBase64()).toBe(bytesToBase64(bytes));
    });

    it("fetchDataUri returns a data URI", async () => {
      mockFetch();
      const ref = new LangfuseMediaReference(baseParams);

      expect(await ref.fetchDataUri()).toBe(
        `data:image/png;base64,${bytesToBase64(bytes)}`,
      );
    });

    it("throws on non-ok responses", async () => {
      mockFetch(false, 403);
      const ref = new LangfuseMediaReference(baseParams);

      await expect(ref.fetchBytes()).rejects.toThrow(/HTTP 403/);
    });
  });
});

describe("LangfuseMedia tracing serialization", () => {
  it("keeps raw bytes out of tracing JSON while preserving public JSON behavior", () => {
    const span = {};
    registerMediaReferenceOwner(span);
    const media = new LangfuseMedia({
      source: "bytes",
      contentBytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/png",
    });

    const tracingValue = serializeWithMediaReferences(
      { image: media },
      { referenceOwner: span },
    );
    const references = findMediaReferences(tracingValue!);

    expect(tracingValue).not.toContain(media.base64DataUri);
    expect(references).toHaveLength(1);
    expect(resolveMediaReference(references[0]!)).toBe(media);

    releaseMediaReferences(references);

    expect(JSON.stringify({ image: media })).toContain(media.base64DataUri);
  });

  it("uses public JSON when media references are not enabled", () => {
    const media = new LangfuseMedia({
      source: "bytes",
      contentBytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/png",
    });

    const serialized = serializeWithMediaReferences({ image: media });

    expect(serialized).toContain(media.base64DataUri);
    expect(findMediaReferences(serialized!)).toHaveLength(0);
  });

  it("uses public JSON when the owner has a masking processor", () => {
    const owner = {};
    registerMediaReferenceOwner(owner, { useMediaReferences: false });
    const media = new LangfuseMedia({
      source: "bytes",
      contentBytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/png",
    });

    const serialized = serializeWithMediaReferences(
      { image: media },
      { referenceOwner: owner },
    );

    expect(serialized).toContain(media.base64DataUri);
    expect(findMediaReferences(serialized!)).toHaveLength(0);
  });
});
