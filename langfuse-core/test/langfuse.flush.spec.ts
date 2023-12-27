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
      await expect(langfuse.flushAsync()).rejects.toHaveProperty("name", "LangfuseFetchHttpError");
      expect(mocks.fetch).toHaveBeenCalledTimes(4);
      expect(Date.now() - time).toBeGreaterThan(300);
      expect(Date.now() - time).toBeLessThan(500);
    });

    it("responds with an error after retries 207", async () => {
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
      await expect(langfuse.flushAsync()).rejects.toHaveProperty("name", "LangfuseFetchHttpError");
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
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      langfuse.trace({ name: "test-trace-2" });
      langfuse.trace({ name: "test-trace-3" });
      langfuse.trace({ name: "test-trace-4" });
      langfuse.trace({ name: "test-trace-5" });
      expect(mocks.fetch).toHaveBeenCalledTimes(5);
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

      jest.advanceTimersByTime(300);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
