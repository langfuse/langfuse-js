import { afterEach, describe, expect, it, vi } from "vitest";

import { LangfuseAPIClient } from "@langfuse/core";
import { LangfuseClient, ScoreManager } from "@langfuse/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleScore = {
  traceId: "trace-id",
  name: "quality",
  value: 0.9,
};

describe("ScoreManager ingestion timeout", () => {
  it("forwards the configured timeout as request option", async () => {
    const batch = vi.fn(async () => ({ responses: [], errors: [] }));
    const apiClient = {
      ingestion: { batch },
    } as unknown as LangfuseAPIClient;

    const manager = new ScoreManager({ apiClient, timeoutSeconds: 3 });
    manager.create(sampleScore);
    await manager.flush();

    expect(batch).toHaveBeenCalledOnce();
    const [, requestOptions] = batch.mock.calls[0];
    expect(requestOptions).toMatchObject({ timeoutInSeconds: 3 });
  });

  it("keeps the generated fallback when no timeout is configured", async () => {
    const batch = vi.fn(async () => ({ responses: [], errors: [] }));
    const apiClient = {
      ingestion: { batch },
    } as unknown as LangfuseAPIClient;

    const manager = new ScoreManager({ apiClient });
    manager.create(sampleScore);
    await manager.flush();

    expect(batch).toHaveBeenCalledOnce();
    const [, requestOptions] = batch.mock.calls[0];
    expect(requestOptions?.timeoutInSeconds).toBeUndefined();
  });

  it("aborts a hanging ingestion request after the configured client timeout", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            capturedSignal = init?.signal;
            capturedSignal?.addEventListener("abort", () =>
              reject(capturedSignal?.reason),
            );
          }),
      ),
    );

    const client = new LangfuseClient({
      publicKey: "public-key",
      secretKey: "secret-key",
      baseUrl: "https://example.com",
      timeout: 1,
    });

    client.score.create(sampleScore);

    const startedAt = Date.now();
    // The flush awaits the hung request; the abort is what lets it settle.
    await client.score.flush();
    const elapsed = Date.now() - startedAt;

    expect(capturedSignal).toBeDefined();
    expect(elapsed).toBeLessThan(5000);
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});
