import { LangfuseClient } from "@langfuse/client";
import { getGlobalLogger } from "@langfuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("LangfuseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not expose the removed v3-compat aliases", () => {
    const client = new LangfuseClient({
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "http://localhost:3000",
    });

    const removedAliases = [
      "getPrompt",
      "createPrompt",
      "updatePrompt",
      "getDataset",
      "fetchTrace",
      "fetchTraces",
      "fetchObservation",
      "fetchObservations",
      "fetchSessions",
      "getDatasetRun",
      "getDatasetRuns",
      "createDataset",
      "getDatasetItem",
      "createDatasetItem",
      "fetchMedia",
      "resolveMediaReferences",
    ];

    for (const alias of removedAliases) {
      expect(alias in client, alias).toBe(false);
    }
  });

  it("reads the base URL from LANGFUSE_BASE_URL and ignores LANGFUSE_BASEURL", () => {
    vi.stubEnv("LANGFUSE_BASEURL", "http://legacy.example.com");
    vi.stubEnv("LANGFUSE_BASE_URL", "");
    const error = vi
      .spyOn(getGlobalLogger(), "error")
      .mockImplementation(() => {});

    const defaultClient = new LangfuseClient({
      publicKey: "pk-test",
      secretKey: "sk-test",
    });
    expect((defaultClient as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://cloud.langfuse.com",
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("LANGFUSE_BASEURL is no longer supported"),
    );
    error.mockClear();

    vi.stubEnv("LANGFUSE_BASE_URL", "http://current.example.com");

    const envClient = new LangfuseClient({
      publicKey: "pk-test",
      secretKey: "sk-test",
    });
    expect((envClient as unknown as { baseUrl: string }).baseUrl).toBe(
      "http://current.example.com",
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
