import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreManager } from "@langfuse/client";
import type { LangfuseAPIClient } from "@langfuse/core";

type Batch = Parameters<LangfuseAPIClient["ingestion"]["batch"]>[0];

function createMockApiClient(options?: {
  /** Resolves when the first batch request is allowed to complete. */
  firstBatchGate?: Promise<void>;
  failWith?: "reject" | "throw";
}) {
  const sentNames: string[] = [];
  let calls = 0;

  const batch = vi.fn((request: Batch) => {
    const callIndex = calls++;

    if (options?.failWith === "throw") {
      throw new Error("synchronous ingestion failure");
    }

    return (async () => {
      if (callIndex === 0 && options?.firstBatchGate) {
        await options.firstBatchGate;
      }
      if (options?.failWith === "reject") {
        throw new Error("ingestion failure");
      }
      for (const event of request.batch) {
        sentNames.push((event.body as { name: string }).name);
      }
      return { successes: [], errors: [] };
    })();
  });

  const apiClient = { ingestion: { batch } } as unknown as LangfuseAPIClient;

  return { apiClient, batch, sentNames };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createScores(manager: ScoreManager, count: number) {
  for (let i = 0; i < count; i++) {
    manager.create({ name: `score-${i}`, value: 1 });
  }
}

describe("ScoreManager flush while a background flush is in flight", () => {
  beforeEach(() => {
    vi.stubEnv("LANGFUSE_FLUSH_AT", "10");
    vi.stubEnv("LANGFUSE_FLUSH_INTERVAL", "1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["flush", "shutdown"] as const)(
    "%s() sends scores created while the threshold flush is still running",
    async (method) => {
      const gate = deferred();
      const { apiClient, batch, sentNames } = createMockApiClient({
        firstBatchGate: gate.promise,
      });
      const manager = new ScoreManager({ apiClient });

      // The 10th score reaches the default threshold and starts a background
      // flush. The remaining 5 are queued while that request is in flight.
      createScores(manager, 15);
      expect(batch).toHaveBeenCalledTimes(1);

      let settled = false;
      const pending = manager[method]().then(() => {
        settled = true;
      });

      // The in-flight request has not completed, so neither may resolve yet.
      await Promise.resolve();
      expect(settled).toBe(false);

      gate.resolve();
      await pending;

      expect(sentNames).toHaveLength(15);
      expect(new Set(sentNames).size).toBe(15);
      expect(batch).toHaveBeenCalledTimes(2);
    },
  );

  it("drains scores that are created while flush() is already waiting", async () => {
    const gate = deferred();
    const { apiClient, sentNames } = createMockApiClient({
      firstBatchGate: gate.promise,
    });
    const manager = new ScoreManager({ apiClient });

    createScores(manager, 10);
    const pending = manager.flush();
    manager.create({ name: "late-score", value: 1 });

    gate.resolve();
    await pending;

    expect(sentNames).toContain("late-score");
    expect(sentNames).toHaveLength(11);
  });

  it("flush() is a no-op when nothing is queued", async () => {
    const { apiClient, batch } = createMockApiClient();
    const manager = new ScoreManager({ apiClient });

    await manager.flush();

    expect(batch).not.toHaveBeenCalled();
  });

  it.each(["reject", "throw"] as const)(
    "flush() resolves and stays usable when the ingestion request fails by %s",
    async (failWith) => {
      // The manager logs the failure; keep the test output quiet.
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { apiClient, batch } = createMockApiClient({ failWith });
      const manager = new ScoreManager({ apiClient });

      createScores(manager, 12);
      await expect(manager.flush()).resolves.toBeUndefined();

      // A failed flush must not leave the manager wedged on a stale promise.
      manager.create({ name: "after-failure", value: 1 });
      await expect(manager.flush()).resolves.toBeUndefined();
      expect(batch.mock.calls.length).toBeGreaterThanOrEqual(2);
    },
  );
});
