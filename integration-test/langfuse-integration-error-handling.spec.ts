// uses the compiled fetch version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse";
import { CallbackHandler } from "../langfuse-langchain";

/* eslint-disable @typescript-eslint/no-var-requires */

import { FakeListLLM } from "langchain1/llms/fake";

import { LF_HOST, LF_PUBLIC_KEY, LF_SECRET_KEY } from "./integration-utils";

describe("No errors should be thrown by SDKs", () => {
  jest.useRealTimers();

  // beforeEach(() => {});
  // afterEach(async () => {});

  describe("langfuse-fetch", () => {
    it("incorrect host", async () => {
      global.console.error = jest.fn();
      const langfuse = new Langfuse({
        publicKey: LF_PUBLIC_KEY,
        secretKey: LF_SECRET_KEY,
        baseUrl: "https://incorrect-host",
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 3,
      });

      const trace = langfuse.trace({ name: "trace-name" });
      for (let i = 0; i < 10; i++) {
        trace.generation({ name: "generation-name" });
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await langfuse.shutdownAsync();

      // expect no errors to be thrown (would kill jest) and console.error to be called
      expect(true).toBe(true);
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);

    it("incorrect keys", async () => {
      global.console.error = jest.fn();
      const langfuse = new Langfuse({
        publicKey: LF_PUBLIC_KEY,
        secretKey: "incorrect_key",
        baseUrl: LF_HOST,
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 3,
      });

      const trace = langfuse.trace({ name: "trace-name" });
      for (let i = 0; i < 10; i++) {
        trace.generation({ name: "generation-name" });
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await langfuse.shutdownAsync();

      // expect no errors to be thrown (would kill jest) and console.error to be called
      expect(true).toBe(true);
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);
  });

  describe("langchain", () => {
    it("incorrect host", async () => {
      global.console.error = jest.fn();
      const fakeListLLM = new FakeListLLM({
        responses: ["I'll callback later.", "You 'console' them!"],
      });
      const handler = new CallbackHandler({
        publicKey: LF_PUBLIC_KEY,
        secretKey: LF_SECRET_KEY,
        baseUrl: "https://incorrect-host",
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 3,
      });

      for (let i = 0; i < 10; i++) {
        fakeListLLM.invoke("Hello world", { callbacks: [handler as any] });
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await handler.shutdownAsync();

      // expect no errors to be thrown (would kill jest)
      expect(true).toBe(true);
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);

    it("incorrect keys", async () => {
      global.console.error = jest.fn();
      const fakeListLLM = new FakeListLLM({
        responses: ["I'll callback later.", "You 'console' them!"],
      });
      const handler = new CallbackHandler({
        publicKey: LF_PUBLIC_KEY,
        secretKey: "incorrect_key",
        baseUrl: LF_HOST,
        flushAt: 2,
        fetchRetryDelay: 1,
        fetchRetryCount: 3,
      });

      for (let i = 0; i < 10; i++) {
        fakeListLLM.invoke("Hello world", { callbacks: [handler as any] }); // TODO fix typing of handler
      }

      await new Promise((resolve) => setTimeout(resolve, 4000));
      await handler.shutdownAsync();

      // expect no errors to be thrown (would kill jest)
      expect(true).toBe(true);
      expect(global.console.error).toHaveBeenCalledTimes(1);
    }, 10000);
  });
});
