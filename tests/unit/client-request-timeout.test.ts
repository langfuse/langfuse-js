import { LangfuseClient, ScoreManager } from "@langfuse/client";
import {
  getGlobalLogger,
  LangfuseAPIClient,
  resetGlobalLogger,
} from "@langfuse/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeClient(timeout?: number): LangfuseClient {
  return new LangfuseClient({
    publicKey: "pk-test",
    secretKey: "sk-test",
    baseUrl: "http://localhost:3000",
    timeout,
  });
}

describe("configured client timeout", () => {
  beforeEach(() => {
    resetGlobalLogger();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes the timeout to score ingestion requests", async () => {
    const client = makeClient(7);
    const batch = vi.fn().mockResolvedValue({ successes: [], errors: [] });
    client.api.ingestion.batch = batch;

    client.score.create({ name: "quality", value: 1, traceId: "t" });
    await client.score.flush();

    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0][1]).toEqual({ timeoutInSeconds: 7 });
  });

  it("defaults to 5 seconds and honors LANGFUSE_TIMEOUT", async () => {
    const defaultClient = makeClient();
    const defaultBatch = vi.fn().mockResolvedValue({ errors: [] });
    defaultClient.api.ingestion.batch = defaultBatch;
    defaultClient.score.create({ name: "quality", value: 1 });
    await defaultClient.score.flush();
    expect(defaultBatch.mock.calls[0][1]).toEqual({ timeoutInSeconds: 5 });

    vi.stubEnv("LANGFUSE_TIMEOUT", "12");
    const envClient = makeClient();
    const envBatch = vi.fn().mockResolvedValue({ errors: [] });
    envClient.api.ingestion.batch = envBatch;
    envClient.score.create({ name: "quality", value: 1 });
    await envClient.score.flush();
    expect(envBatch.mock.calls[0][1]).toEqual({ timeoutInSeconds: 12 });
  });

  it("falls back to 5 seconds for an invalid LANGFUSE_TIMEOUT", async () => {
    vi.stubEnv("LANGFUSE_TIMEOUT", "not-a-number");
    const client = makeClient();
    const batch = vi.fn().mockResolvedValue({ errors: [] });
    client.api.ingestion.batch = batch;

    client.score.create({ name: "quality", value: 1 });
    await client.score.flush();

    expect(batch.mock.calls[0][1]).toEqual({ timeoutInSeconds: 5 });
  });

  it("aborts a never-resolving score ingestion request near the timeout and retries it once", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(getGlobalLogger(), "error");
    const scoreManager = new ScoreManager({
      apiClient: new LangfuseAPIClient({
        baseUrl: "http://localhost:3000",
        environment: "",
        username: "pk-test",
        password: "sk-test",
      }),
      timeoutSeconds: 0.05,
    });

    scoreManager.create({ name: "quality", value: 1, traceId: "t" });
    const startedAt = Date.now();
    await scoreManager.shutdown();
    const elapsedMs = Date.now() - startedAt;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elapsedMs).toBeLessThan(2_000);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to export score batch:",
      expect.objectContaining({
        message: expect.stringContaining("Timeout exceeded"),
      }),
    );
  });

  it("passes the timeout to prompt create, update, and delete", async () => {
    const client = makeClient(3);
    const create = vi.fn().mockResolvedValue({
      name: "p",
      version: 1,
      type: "text",
      prompt: "hi",
      config: {},
      labels: [],
      tags: [],
    });
    const update = vi.fn().mockResolvedValue({});
    const remove = vi.fn().mockResolvedValue(undefined);
    client.api.prompts.create = create;
    client.api.promptVersion.update = update;
    client.api.prompts.delete = remove;

    await client.prompt.create({ name: "p", prompt: "hi" });
    await client.prompt.update({ name: "p", version: 1, newLabels: ["a"] });
    await client.prompt.delete("p");

    expect(create.mock.calls[0][1]).toEqual({ timeoutInSeconds: 3 });
    expect(update.mock.calls[0][3]).toEqual({ timeoutInSeconds: 3 });
    expect(remove.mock.calls[0][2]).toEqual({ timeoutInSeconds: 3 });
  });

  it("uses fetchTimeoutMs for prompt get when given, else the client timeout", async () => {
    const client = makeClient(3);
    const get = vi.fn().mockResolvedValue({
      name: "p",
      version: 1,
      type: "text",
      prompt: "hi",
      config: {},
      labels: [],
      tags: [],
    });
    client.api.prompts.get = get;

    await client.prompt.get("p");
    await client.prompt.get("q", { fetchTimeoutMs: 500 });

    expect(get.mock.calls[0][2]).toMatchObject({ timeoutInSeconds: 3 });
    expect(get.mock.calls[1][2]).toMatchObject({ timeoutInSeconds: 0.5 });
  });

  it("passes the timeout to media lookups when resolving references", async () => {
    const client = makeClient(4);
    const get = vi
      .fn()
      .mockResolvedValue({ url: "http://localhost:3000/media.png" });
    client.api.media.get = get;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    );

    await client.media.resolveReferences({
      obj: {
        image:
          "@@@langfuseMedia:type=image/png|id=media-id|source=base64_data_uri@@@",
      },
      resolveWith: "base64DataUri",
    });

    expect(get).toHaveBeenCalledWith("media-id", {}, { timeoutInSeconds: 4 });
  });

  it("aborts a stalled media download after the timeout", async () => {
    const client = makeClient(0.05);
    client.api.media.get = vi
      .fn()
      .mockResolvedValue({ url: "http://localhost:3000/media.png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
    const warnSpy = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => {});
    const reference =
      "@@@langfuseMedia:type=image/png|id=media-id|source=base64_data_uri@@@";

    const startedAt = Date.now();
    const resolved = await client.media.resolveReferences({
      obj: { image: reference },
      resolveWith: "base64DataUri",
    });

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(resolved).toEqual({ image: reference });
    expect(warnSpy).toHaveBeenCalledWith(
      "Error fetching media content for reference string",
      reference,
      expect.anything(),
    );
  });
});
