// @vitest-environment node

import { getEventListeners } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LangfuseAPIClient } from "@langfuse/core";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API request abort signal lifecycle", () => {
  it("removes the caller's abort listener after a successful request", async () => {
    const callerController = new AbortController();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = new LangfuseAPIClient({
      environment: "https://cloud.langfuse.com",
      username: "public-key",
      password: "secret-key",
    });

    await client.prompts.list(
      {},
      { abortSignal: callerController.signal, maxRetries: 0 },
    );

    expect(getEventListeners(callerController.signal, "abort")).toHaveLength(0);
  });

  it("removes the caller's abort listener when the request fails", async () => {
    const callerController = new AbortController();
    vi.stubGlobal("fetch", async () => {
      throw new Error("network failure");
    });
    const client = new LangfuseAPIClient({
      environment: "https://cloud.langfuse.com",
      username: "public-key",
      password: "secret-key",
    });

    await expect(
      client.prompts.list(
        {},
        { abortSignal: callerController.signal, maxRetries: 0 },
      ),
    ).rejects.toThrow("network failure");

    expect(getEventListeners(callerController.signal, "abort")).toHaveLength(0);
  });
});
