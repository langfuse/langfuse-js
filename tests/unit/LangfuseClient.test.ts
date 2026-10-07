import { LangfuseClient } from "@langfuse/client";
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

  it("falls back to the legacy LANGFUSE_BASEURL after the option and LANGFUSE_BASE_URL", () => {
    const baseUrlOf = (client: LangfuseClient) =>
      (client as unknown as { baseUrl: string }).baseUrl;
    const keys = { publicKey: "pk-test", secretKey: "sk-test" };

    vi.stubEnv("LANGFUSE_BASE_URL", "");
    vi.stubEnv("LANGFUSE_BASEURL", "http://legacy.example.com");
    expect(baseUrlOf(new LangfuseClient(keys))).toBe(
      "http://legacy.example.com",
    );

    vi.stubEnv("LANGFUSE_BASE_URL", "http://current.example.com");
    expect(baseUrlOf(new LangfuseClient(keys))).toBe(
      "http://current.example.com",
    );

    expect(
      baseUrlOf(
        new LangfuseClient({ ...keys, baseUrl: "http://option.example.com" }),
      ),
    ).toBe("http://option.example.com");
  });
});
