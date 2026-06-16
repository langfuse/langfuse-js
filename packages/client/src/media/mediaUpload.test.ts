import { LangfuseMedia, uploadMedia } from "@langfuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("uploadMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(uploadStatus: number) {
    const media = new LangfuseMedia({
      source: "bytes",
      contentBytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/png",
    });
    const mediaId = await media.getId();

    const uploadUrl = "https://upload.example/put";
    const apiClient = {
      media: {
        getUploadUrl: vi.fn().mockResolvedValue({ uploadUrl, mediaId }),
        patch: vi.fn().mockResolvedValue(undefined),
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: uploadStatus,
        text: async () => "",
      }),
    );

    return { media, apiClient };
  }

  it("reports completion and resolves on a 2xx upload", async () => {
    const { media, apiClient } = await setup(200);

    await expect(
      uploadMedia({ apiClient: apiClient as never, media, maxRetries: 0 }),
    ).resolves.toBeUndefined();
    expect(apiClient.media.patch).toHaveBeenCalledOnce();
  });

  it("reports the status then throws when the final attempt is non-2xx", async () => {
    const { media, apiClient } = await setup(500);

    await expect(
      uploadMedia({ apiClient: apiClient as never, media, maxRetries: 0 }),
    ).rejects.toThrow(/HTTP 500/);
    // The failure is still reported to the server before throwing.
    expect(apiClient.media.patch).toHaveBeenCalledOnce();
  });

  it("skips re-upload when the media is already uploaded (no upload URL)", async () => {
    const { media, apiClient } = await setup(200);
    apiClient.media.getUploadUrl.mockResolvedValue({
      uploadUrl: undefined,
      mediaId: await media.getId(),
    });

    await expect(
      uploadMedia({ apiClient: apiClient as never, media, maxRetries: 0 }),
    ).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(apiClient.media.patch).not.toHaveBeenCalled();
  });
});
