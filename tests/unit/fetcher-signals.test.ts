// @vitest-environment node

import { getEventListeners } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LangfuseAPIClient } from "@langfuse/core";
import { fetcher } from "../../packages/core/src/api/core/fetcher/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API request abort signal lifecycle", () => {
  it("keeps the caller's abort signal connected until a streaming response is cancelled", async () => {
    const callerController = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let responseBodyController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    let bodyAbortObserved = false;
    let bodyFinished = false;

    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        responseBodyController = controller;
      },
    });

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requestSignal = init.signal;
      requestSignal?.addEventListener("abort", () => {
        bodyAbortObserved = true;
        if (!bodyFinished) {
          bodyFinished = true;
          responseBodyController?.error(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        }
      });
      return new Response(responseBody, { status: 200 });
    });

    const result = await fetcher({
      url: "https://cloud.langfuse.com/api/test",
      method: "GET",
      responseType: "streaming",
      abortSignal: callerController.signal,
      maxRetries: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const reader = (result.body as ReadableStream<Uint8Array>).getReader();
    const readPromise = reader.read();

    try {
      expect(getEventListeners(callerController.signal, "abort")).toHaveLength(
        1,
      );
      callerController.abort();

      expect(requestSignal?.aborted).toBe(true);
      expect(bodyAbortObserved).toBe(true);
      await expect(readPromise).rejects.toThrow("aborted");
    } finally {
      if (!bodyFinished) {
        bodyFinished = true;
        responseBodyController?.error(
          new DOMException("The operation was aborted.", "AbortError"),
        );
      }
      await readPromise.catch(() => undefined);
      reader.releaseLock();
    }

    expect(getEventListeners(callerController.signal, "abort")).toHaveLength(0);
  });

  it("cleans up a binary response after its body is consumed", async () => {
    const callerController = new AbortController();
    vi.stubGlobal(
      "fetch",
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const result = await fetcher({
      url: "https://cloud.langfuse.com/api/test",
      method: "GET",
      responseType: "binary-response",
      abortSignal: callerController.signal,
      maxRetries: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(getEventListeners(callerController.signal, "abort")).toHaveLength(1);
    await expect(
      (
        result.body as { arrayBuffer: () => Promise<ArrayBuffer> }
      ).arrayBuffer(),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(getEventListeners(callerController.signal, "abort")).toHaveLength(0);
  });

  it("keeps the caller's abort signal connected while the response body is consumed", async () => {
    const callerController = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let responseBodyController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    let bodyAbortObserved = false;
    let bodyFinished = false;

    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        responseBodyController = controller;
      },
    });

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requestSignal = init.signal;
      requestSignal?.addEventListener("abort", () => {
        bodyAbortObserved = true;
        if (!bodyFinished) {
          bodyFinished = true;
          responseBodyController?.error(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        }
      });
      return new Response(responseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new LangfuseAPIClient({
      environment: "https://cloud.langfuse.com",
      username: "public-key",
      password: "secret-key",
    });

    const request = client.prompts.list(
      {},
      { abortSignal: callerController.signal, maxRetries: 0 },
    );

    try {
      await vi.waitFor(() => expect(requestSignal).toBeDefined());
      callerController.abort();

      expect(requestSignal?.aborted).toBe(true);
      expect(bodyAbortObserved).toBe(true);
      await expect(request).rejects.toBeDefined();
    } finally {
      if (!bodyFinished) {
        bodyFinished = true;
        responseBodyController?.error(
          new DOMException("The operation was aborted.", "AbortError"),
        );
      }
      await request.catch(() => undefined);
    }

    expect(getEventListeners(callerController.signal, "abort")).toHaveLength(0);
  });

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
