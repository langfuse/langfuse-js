import { LangfuseMedia } from "@langfuse/client";
import { describe, expect, it } from "vitest";

describe("LangfuseMedia Base64 data URIs", () => {
  it.each([
    ["-w==", "+w==", [251]],
    ["_w==", "/w==", [255]],
    ["-_8=", "+/8=", [251, 255]],
    ["+/8=", "+/8=", [251, 255]],
  ])("decodes %s to the original bytes", async (encoded, standard, bytes) => {
    const media = new LangfuseMedia({
      source: "base64_data_uri",
      base64DataUri: `data:image/png;base64,${encoded}`,
    });
    const expected = new LangfuseMedia({
      source: "bytes",
      contentType: "image/png",
      contentBytes: new Uint8Array(bytes),
    });

    expect(media._contentBytes).toEqual(new Uint8Array(bytes));
    expect(media.base64DataUri).toBe(`data:image/png;base64,${standard}`);
    expect(await media.getId()).toBe(await expected.getId());
  });

  it.each(["!w==", "A", "-_8==="])(
    "keeps invalid Base64 %s invalid",
    async (encoded) => {
      const media = new LangfuseMedia({
        source: "base64_data_uri",
        base64DataUri: `data:image/png;base64,${encoded}`,
      });

      expect(media._contentBytes).toBeUndefined();
      expect(media.base64DataUri).toBeNull();
      expect(await media.getId()).toBeNull();
    },
  );
});
