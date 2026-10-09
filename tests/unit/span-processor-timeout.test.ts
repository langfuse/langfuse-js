import { getGlobalLogger } from "@langfuse/core";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { afterEach, describe, expect, it, vi } from "vitest";

function mediaTimeoutOf(processor: LangfuseSpanProcessor): unknown {
  return (processor as unknown as { mediaService: { timeoutSeconds: unknown } })
    .mediaService.timeoutSeconds;
}

describe("LangfuseSpanProcessor timeout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("passes the configured timeout to media uploads", () => {
    const processor = new LangfuseSpanProcessor({
      publicKey: "pk-lf-test",
      secretKey: "sk-lf-test",
      timeout: 7,
    });

    expect(mediaTimeoutOf(processor)).toBe(7);
  });

  it.each(["", "5s", "-1"])(
    "falls back to 5 seconds for LANGFUSE_TIMEOUT=%j",
    (value) => {
      vi.stubEnv("LANGFUSE_TIMEOUT", value);
      const warn = vi
        .spyOn(getGlobalLogger(), "warn")
        .mockImplementation(() => {});

      const processor = new LangfuseSpanProcessor({
        publicKey: "pk-lf-test",
        secretKey: "sk-lf-test",
      });

      expect(mediaTimeoutOf(processor)).toBe(5);
      if (value !== "") {
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("Invalid timeout"),
        );
      }
    },
  );
});
