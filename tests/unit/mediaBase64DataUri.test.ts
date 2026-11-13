import { LangfuseMedia, getGlobalLogger } from "@langfuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("LangfuseMedia base64 data URI parsing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes a valid base64 data URI", () => {
    const media = new LangfuseMedia({
      source: "base64_data_uri",
      base64DataUri: "data:text/plain;base64,aGVsbG8=",
    });

    expect(media.contentLength).toBe(5);
  });

  it.each([
    ["a length that is 1 mod 4", "iVBORw0KGgoAA"],
    ["padding that does not fit the length", "iVBORw0KGgoA="],
    ["too much padding", "iVBORw0KGgoAA=="],
  ])(
    "skips a payload with %s with one short warning and no error",
    async (_, payload) => {
      const errorSpy = vi
        .spyOn(getGlobalLogger(), "error")
        .mockImplementation(() => {});
      const warnSpy = vi
        .spyOn(getGlobalLogger(), "warn")
        .mockImplementation(() => {});

      const media = new LangfuseMedia({
        source: "base64_data_uri",
        base64DataUri: `data:image/png;base64,${payload}`,
      });

      expect(media.contentLength).toBeUndefined();
      expect(await media.getTag()).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const [message, ...rest] = warnSpy.mock.calls[0];
      expect(message).toMatch(
        /^Skipping base64 data URI that could not be parsed: /,
      );
      // Only the message is logged, never the raw error object.
      expect(rest).toEqual([]);
    },
  );

  it("logs the reason for a malformed data URI without the error object", () => {
    const warnSpy = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => {});

    new LangfuseMedia({
      source: "base64_data_uri",
      base64DataUri: "data:image/png,not-base64",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "Skipping base64 data URI that could not be parsed: Data is not base64 encoded",
    );
  });
});
