// uses the compiled fetch version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse";
import { CallbackHandler } from "../langfuse-langchain";

import { FakeListLLM } from "langchain/llms/fake";

import { LANGFUSE_BASEURL, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } from "./integration-utils";

describe("No errors should be thrown by SDKs", () => {
  jest.useRealTimers();

  // beforeEach(() => {});
  // afterEach(async () => {});

  describe("langfuse-fetch", () => {
    it("incorrect host", async () => {
      global.console.error = jest.fn();
      const langfuse = new Langfuse({
        publicKey: LANGFUSE_PUBLIC_KEY,
        secretKey: LANGFUSE_SECRET_KEY,
        baseUrl: "https://incorrect-host",
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 2,
      });

      const trace = langfuse.trace({ name: "trace-name" });
      for (let i = 0; i < 10; i++) {
        trace.generation({ name: "generation-name" });
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await langfuse.shutdownAsync();

      // expect no errors to be thrown (would kill jest) and console.error to be called
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);

    it("incorrect keys", async () => {
      global.console.error = jest.fn();
      const langfuse = new Langfuse({
        publicKey: LANGFUSE_PUBLIC_KEY,
        secretKey: "incorrect_key",
        baseUrl: LANGFUSE_BASEURL,
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 2,
      });

      const trace = langfuse.trace({ name: "trace-name" });
      for (let i = 0; i < 10; i++) {
        trace.generation({ name: "generation-name" });
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await langfuse.shutdownAsync();

      // expect no errors to be thrown (would kill jest) and console.error to be called
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);
  });

  describe("langchain", () => {
    it("incorrect host", async () => {
      global.console.error = jest.fn();
      const fakeListLLM = new FakeListLLM({
        responses: ["I'll callback later.", "You 'console' them!"],
        sleep: 100,
      });
      const handler = new CallbackHandler({
        publicKey: LANGFUSE_PUBLIC_KEY,
        secretKey: LANGFUSE_SECRET_KEY,
        baseUrl: "https://incorrect-host",
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 2,
      });

      for (let i = 0; i < 10; i++) {
        fakeListLLM.invoke("Hello world", { callbacks: [handler as any] });
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await handler.shutdownAsync();

      // expect no errors to be thrown (would kill jest)
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);

    it("incorrect keys", async () => {
      global.console.error = jest.fn();
      const fakeListLLM = new FakeListLLM({
        responses: ["I'll callback later.", "You 'console' them!"],
      });
      const handler = new CallbackHandler({
        publicKey: LANGFUSE_PUBLIC_KEY,
        secretKey: "incorrect_key",
        baseUrl: LANGFUSE_BASEURL,
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 2,
      });

      for (let i = 0; i < 10; i++) {
        fakeListLLM.invoke("Hello world", { callbacks: [handler as any] }); // TODO fix typing of handler
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await handler.shutdownAsync();

      // expect no errors to be thrown (would kill jest)
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);
  });
});

describe("shutdown async behavior", () => {
  jest.useRealTimers();

  // beforeEach(() => {});
  // afterEach(async () => {});

  it("langfuse - no events after shutdownAync is awaited", async () => {
    const langfuse = new Langfuse({
      publicKey: LANGFUSE_PUBLIC_KEY,
      secretKey: LANGFUSE_SECRET_KEY,
      baseUrl: LANGFUSE_BASEURL,
      flushAt: 2,
      fetchRetryDelay: 1,
      fetchRetryCount: 2,
    });

    // create jest callback which consumes the flush event
    const flushCallback = jest.fn();
    const anyCallback = jest.fn();

    langfuse.on("flush", () => {
      flushCallback();
    });
    langfuse.on("*", () => {
      anyCallback();
    });

    for (let i = 0; i < 101; i++) {
      langfuse.trace({ name: `test-trace-${i}` });
    }

    await langfuse.shutdownAsync();
    expect(flushCallback).toHaveBeenCalledTimes(51);

    const anyCallbackCount = anyCallback.mock.calls.length;

    // expect no events to be emitted after shutdownAsync
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(anyCallback).toHaveBeenCalledTimes(anyCallbackCount);
  });

  it("langchain - no events after shutdownAync is awaited", async () => {
    const fakeListLLM = new FakeListLLM({
      responses: ["I'll callback later.", "You 'console' them!"],
      sleep: 100,
    });
    const handler = new CallbackHandler({
      publicKey: LANGFUSE_PUBLIC_KEY,
      secretKey: LANGFUSE_SECRET_KEY,
      baseUrl: LANGFUSE_BASEURL,
      flushAt: 3,
      fetchRetryDelay: 1,
      fetchRetryCount: 2,
    });

    // create jest callback which consumes the flush event
    const flushCallback = jest.fn();
    const anyCallback = jest.fn();

    handler.langfuse.on("flush", () => {
      flushCallback();
    });
    handler.langfuse.on("*", () => {
      anyCallback();
    });

    for (let i = 0; i < 11; i++) {
      await fakeListLLM.invoke("Hello world", { callbacks: [handler as any] }); // TODO fix typing of handler
    }

    await handler.shutdownAsync();
    expect(flushCallback).toHaveBeenCalledTimes(15);

    const anyCallbackCount = anyCallback.mock.calls.length;

    // expect no events to be emitted after shutdownAsync
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(anyCallback).toHaveBeenCalledTimes(anyCallbackCount);
  });
});
