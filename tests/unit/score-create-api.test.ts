import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ScoreManager } from "@langfuse/client";
import {
  getGlobalLogger,
  LangfuseAPIClient,
  resetGlobalLogger,
} from "@langfuse/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request: Parameters<LangfuseAPIClient["scores"]["create"]>[0] = {
  traceId: "trace-id",
  name: "quality",
  value: 0.9,
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeApiClient(): LangfuseAPIClient {
  return new LangfuseAPIClient({
    environment: "https://cloud.langfuse.com",
    username: "public-key",
    password: "secret-key",
  });
}

beforeEach(() => {
  resetGlobalLogger();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("score create API", () => {
  it("sends a single score to POST /api/public/scores", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "score-id" }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeApiClient().scores.create(request);

    expect(response).toEqual({ id: "score-id" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://cloud.langfuse.com/api/public/scores");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify(request),
    });
  });

  it("deletes a score via DELETE /api/public/scores/{scoreId}", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = makeApiClient();
    await expect(client.scores.delete("score-id")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://cloud.langfuse.com/api/public/scores/score-id");
    expect(init).toMatchObject({ method: "DELETE" });
    expect("legacy" in client).toBe(false);
  });
});

describe("ScoreManager over POST /api/public/scores", () => {
  function setup(response: () => Response) {
    const fetchMock = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(getGlobalLogger(), "error");
    const scoreManager = new ScoreManager({
      apiClient: makeApiClient(),
      timeoutSeconds: 5,
    });

    return { fetchMock, errorSpy, scoreManager };
  }

  function sentBatches(fetchMock: ReturnType<typeof vi.fn>): unknown[][] {
    return fetchMock.mock.calls.map(([url, init]) => {
      expect(url).toBe("https://cloud.langfuse.com/api/public/scores");
      expect((init as RequestInit).method).toBe("POST");

      return JSON.parse((init as RequestInit).body as string);
    });
  }

  it("sends queued scores as one list and logs nothing on 202", async () => {
    const { fetchMock, errorSpy, scoreManager } = setup(() =>
      jsonResponse({ message: "Accepted" }, 202),
    );

    scoreManager.create({ id: "s1", name: "quality", value: 1 });
    scoreManager.create({ id: "s2", name: "label", value: "good" });
    await scoreManager.flush();

    const batches = sentBatches(fetchMock);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      { id: "s1", name: "quality", value: 1, timestamp: expect.any(String) },
      {
        id: "s2",
        name: "label",
        value: "good",
        timestamp: expect.any(String),
      },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("stamps each score with the time it was queued, not the flush time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T08:00:00.000Z"));
    const { fetchMock, scoreManager } = setup(() =>
      jsonResponse({ message: "Accepted" }, 202),
    );

    scoreManager.create({ name: "quality", value: 1 });
    vi.setSystemTime(new Date("2026-10-14T08:00:05.000Z"));
    await scoreManager.flush();
    vi.useRealTimers();

    expect(sentBatches(fetchMock)[0]).toEqual([
      expect.objectContaining({ timestamp: "2026-10-14T08:00:00.000Z" }),
    ]);
  });

  it("keeps a caller-supplied timestamp so an existing score can be updated", async () => {
    const { fetchMock, scoreManager } = setup(() =>
      jsonResponse({ message: "Accepted" }, 202),
    );

    scoreManager.create({
      id: "s1",
      name: "quality",
      value: 0.5,
      timestamp: "2026-10-01T12:00:00.000Z",
    });
    await scoreManager.flush();

    expect(sentBatches(fetchMock)[0]).toEqual([
      expect.objectContaining({
        id: "s1",
        timestamp: "2026-10-01T12:00:00.000Z",
      }),
    ]);
  });

  it("logs rejected scores on 207 without retrying the batch", async () => {
    const errors = [{ message: "Invalid score value for config" }];
    const { fetchMock, errorSpy, scoreManager } = setup(() =>
      jsonResponse({ accepted: 1, rejected: 1, errors }, 207),
    );

    scoreManager.create({ name: "quality", value: 1 });
    scoreManager.create({ name: "quality", value: 2 });
    await scoreManager.shutdown();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "Langfuse rejected 1 of 2 scores in batch:",
      errors,
    );
  });

  it("splits large flushes into batches of 100", async () => {
    vi.stubEnv("LANGFUSE_FLUSH_AT", "1000");
    const { fetchMock, scoreManager } = setup(() =>
      jsonResponse({ message: "Accepted" }, 202),
    );

    for (let i = 0; i < 150; i++) {
      scoreManager.create({ name: `score-${i}`, value: i });
    }
    await scoreManager.flush();

    expect(sentBatches(fetchMock).map((batch) => batch.length)).toEqual([
      100, 50,
    ]);
  });
});

describe("legacy ingestion guard", () => {
  const repoRoot = process.cwd();
  const generatedApiDir = join(repoRoot, "packages/core/src/api");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (path === generatedApiDir) return [];
      if (statSync(path).isDirectory()) return sourceFiles(path);

      return /\.(ts|tsx|js|mjs)$/.test(entry) ? [path] : [];
    });
  }

  it("keeps SDK packages off the legacy /api/public/ingestion endpoint", () => {
    const packagesDir = join(repoRoot, "packages");
    const offenders = readdirSync(packagesDir)
      .map((pkg) => join(packagesDir, pkg, "src"))
      .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
      .flatMap(sourceFiles)
      .filter((file) =>
        /\/api\/public\/ingestion|\.ingestion\.batch\(|["']score-create["']/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });
});
