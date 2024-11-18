import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  describe("flush", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 5,
        fetchRetryCount: 3,
        fetchRetryDelay: 100,
      });
    });

    it("doesn't fail when queue is empty", async () => {
      jest.useRealTimers();
      await expect(langfuse.flushAsync()).resolves.not.toThrow();
    });

    it("flush messsages once called", async () => {
      langfuse.trace({ name: "test-trace-1" });
      langfuse.trace({ name: "test-trace-2" });
      langfuse.trace({ name: "test-trace-3" });
      expect(mocks.fetch).not.toHaveBeenCalled();
      await expect(langfuse.flushAsync()).resolves.toHaveLength(3);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    it("responds with an error after retries", async () => {
      langfuse.trace({ name: "test-trace-1" });
      mocks.fetch.mockImplementation(() => {
        return Promise.resolve({
          status: 400,
          text: async () => "err",
          json: async () => ({ status: "err" }),
        });
      });

      const time = Date.now();
      jest.useRealTimers();
      expect(await langfuse.flushAsync()).toBeUndefined();
      expect(mocks.fetch).toHaveBeenCalledTimes(4);
      expect(Date.now() - time).toBeGreaterThan(300);
      expect(Date.now() - time).toBeLessThan(500);
    });

    it("resolves without an error after retries 207", async () => {
      const trace = langfuse.trace({ name: "test-trace-1" });
      mocks.fetch.mockImplementation(() => {
        return Promise.resolve({
          status: 207,
          text: async () => "err",
          json: async () => ({ successes: [], errors: [{ id: trace.id, message: "Something failed" }] }),
        });
      });

      const time = Date.now();
      jest.useRealTimers();
      expect(await langfuse.flushAsync()).toBeUndefined();
      expect(mocks.fetch).toHaveBeenCalledTimes(4);
      expect(Date.now() - time).toBeGreaterThan(300);
      expect(Date.now() - time).toBeLessThan(500);
    });

    it("responds with an error after retries 207 and then continues after fail", async () => {
      let index = 0;
      // 5 events in one network request which fail
      for (let i = 0; i < 5; i++) {
        langfuse.trace({ name: `test-trace-failing-${i}` });
      }

      // 2 more events which succeed
      for (let i = 0; i < 2; i++) {
        langfuse.trace({ name: `test-trace-succeeding-${i}` });
      }
      await jest.advanceTimersByTimeAsync(1);

      mocks.fetch.mockImplementation(() => {
        if (index < 3) {
          index++;
          return Promise.resolve({
            status: 207,
            text: async () => "err",
            json: async () => ({ successes: [], errors: [{ id: "someId", message: "Something failed" }] }),
          });
        } else {
          index++;
          return Promise.resolve({
            status: 200,
            text: async () => "ok",
            json: async () => ({ successes: [], errors: [] }),
          });
        }
      });

      const time = Date.now();
      jest.useRealTimers();
      await langfuse.flushAsync();
      expect(index).toBe(4);
      expect(mocks.fetch).toHaveBeenCalledTimes(5);
      expect(Date.now() - time).toBeGreaterThan(300);
      expect(Date.now() - time).toBeLessThan(500);
    });

    it("expect number of calls to match the number of items", async () => {
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
      });

      langfuse.trace({ name: "test-trace-1" });
      await jest.advanceTimersByTimeAsync(1);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      langfuse.trace({ name: "test-trace-2" });
      langfuse.trace({ name: "test-trace-3" });
      langfuse.trace({ name: "test-trace-4" });
      langfuse.trace({ name: "test-trace-5" });
      await jest.advanceTimersByTimeAsync(1);

      expect(mocks.fetch).toHaveBeenCalledTimes(5);
    });

    it("expect number of calls to match the number of items (more scale)", async () => {
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushInterval: 200,
        flushAt: 5,
      });

      for (let i = 0; i < 20_004; i++) {
        langfuse.trace({ name: `test-trace-${i}` });
      }
      await jest.advanceTimersByTimeAsync(1);

      expect(mocks.fetch).toHaveBeenCalledTimes(4_000);

      // wait for the last flush
      await jest.advanceTimersByTimeAsync(200);

      expect(mocks.fetch).toHaveBeenCalledTimes(4_001);
    });

    it("no flush events after shutdownAync is awaited", async () => {
      jest.useRealTimers();
      [langfuse, mocks] = createTestClient(
        {
          publicKey: "pk-lf-111",
          secretKey: "sk-lf-111",
          flushInterval: 200,
          flushAt: 5,
        },
        ({ fetch }) => {
          fetch.mockImplementation(() => {
            return new Promise((resolve) => {
              // resolve fetch promise after 100ms
              setTimeout(() => {
                resolve({
                  status: 200,
                  text: async () => "ok",
                  json: async () => ({ status: "ok" }),
                });
              }, 500); // add delay to simulate network request
            });
          });
        }
      );

      // create jest callback which consumes the flush event
      const flushCallback = jest.fn();
      langfuse.on("flush", () => {
        flushCallback();
      });

      for (let i = 0; i < 20_004; i++) {
        langfuse.trace({ name: `test-trace-${i}` });
      }

      // before flush
      await jest.advanceTimersByTimeAsync(1);
      expect(mocks.fetch).toHaveBeenCalledTimes(4_000);

      // after flush
      await langfuse.shutdownAsync();
      expect(flushCallback).toHaveBeenCalledTimes(4_001);
      expect(mocks.fetch).toHaveBeenCalledTimes(4_001);
    });

    it("no exceptions if fetch timeouts", async () => {
      jest.useRealTimers();
      [langfuse, mocks] = createTestClient(
        {
          publicKey: "pk-lf-111",
          secretKey: "sk-lf-111",
          flushAt: 1,
          requestTimeout: 100,
          fetchRetryDelay: 1,
          fetchRetryCount: 2,
        },
        ({ fetch }) => {
          fetch.mockImplementation(() => {
            throw new Error("unspecified error");
          });
        }
      );

      for (let i = 0; i < 2; i++) {
        langfuse.trace({ name: `test-trace-${i}` });
      }

      // after flush
      await langfuse.shutdownAsync();
      expect(true).toBe(true);
    });

    it("expect number of calls to match when flushing at intervals", async () => {
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 5,
        flushInterval: 200,
      });

      langfuse.trace({ name: "test-trace-1" });
      langfuse.trace({ name: "test-trace-2" });
      langfuse.trace({ name: "test-trace-3" });
      expect(mocks.fetch).toHaveBeenCalledTimes(0);

      await jest.advanceTimersByTimeAsync(300);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
