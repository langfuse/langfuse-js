// @vitest-environment node

import { createServer, type Server } from "node:http";

import { LangfuseAPIClient, LangfuseAPITimeoutError } from "@langfuse/core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { fetcherImpl } from "../../packages/core/src/api/core/fetcher/Fetcher.js";

describe("native fetch request timeouts", () => {
  let server: Server;
  let baseUrl: string;
  let requests = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests++;
      if (req.url === "/ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }
      // Other routes deliberately never send response headers.
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture address");
    baseUrl = `http://127.0.0.1:${address.port}`;
    await (await fetch(`${baseUrl}/ok`)).text();
  });

  beforeEach(() => {
    requests = 0;
  });
  afterEach(() => {
    server.closeAllConnections();
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("classifies a native fetch timeout instead of the string abort reason", async () => {
    const result = await fetcherImpl({
      url: `${baseUrl}/slow`,
      method: "GET",
      timeoutMs: 100,
      maxRetries: 0,
    });
    expect(requests).toBe(1);
    expect(result).toMatchObject({ ok: false, error: { reason: "timeout" } });
  });

  it("throws the public typed timeout error with endpoint context", async () => {
    const client = new LangfuseAPIClient({
      baseUrl,
      username: "pk-test",
      password: "sk-test",
    });
    const request = client.prompts.get(
      "timeout-fixture",
      {},
      { timeoutInSeconds: 0.1, maxRetries: 0 },
    );
    const error = await request.catch((error: unknown) => error);
    expect(error).toBeInstanceOf(LangfuseAPITimeoutError);
    expect(error).toMatchObject({
      message: expect.stringContaining("Timeout exceeded when calling GET"),
    });
    expect(requests).toBe(1);
  });

  it("keeps caller cancellation distinct from the request timeout", async () => {
    const controller = new AbortController();
    const abortId = setTimeout(() => controller.abort("caller cancelled"), 100);
    try {
      const result = await fetcherImpl({
        url: `${baseUrl}/slow`,
        method: "GET",
        timeoutMs: 5_000,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
      expect(requests).toBe(1);
      expect(result).toMatchObject({
        ok: false,
        error: {
          reason: "unknown",
          errorMessage: "The user aborted a request",
        },
      });
    } finally {
      clearTimeout(abortId);
    }
  });

  it("returns a successful response before its timeout", async () => {
    const result = await fetcherImpl({
      url: `${baseUrl}/ok`,
      method: "GET",
      timeoutMs: 5_000,
      maxRetries: 0,
    });
    expect(requests).toBe(1);
    expect(result).toMatchObject({ ok: true, body: { ok: true } });
  });
});
