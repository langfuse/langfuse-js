// import Langfuse from '../'
import Langfuse from "../src/langfuse-node";
jest.mock("../src/fetch");
import { fetch } from "../src/fetch";

const wait = async (t: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, t));
};

jest.mock("../package.json", () => ({ version: "1.2.3" }));

const mockedFetch = jest.mocked(fetch, { shallow: true });

describe("Langfuse Node.js", () => {
  let langfuse: Langfuse;

  jest.useFakeTimers();

  beforeEach(() => {
    langfuse = new Langfuse({
      publicKey: "pk",
      secretKey: "sk",
      baseUrl: "http://example.com",
      flushAt: 5,
    });

    mockedFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("ok"),
      json: () =>
        Promise.resolve({
          status: "ok",
        }),
    } as any);
  });

  afterEach(async () => {
    // ensure clean shutdown & no test interdependencies
    await langfuse.shutdownAsync();
  });

  describe("core methods", () => {
    it("should capture an event to shared queue", async () => {
      expect(mockedFetch).toHaveBeenCalledTimes(0);
      langfuse.trace({ id: "test-id", name: "trace-name" });
      expect(mockedFetch).toHaveBeenCalledTimes(0);

      await jest.runAllTimersAsync();
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      expect(mockedFetch).toHaveBeenCalledWith(
        "http://example.com/api/public/ingestion",
        expect.objectContaining({
          method: "POST",
          body: expect.stringMatching(/.*"id"\s*:\s*"test-id".*"name"\s*:\s*"trace-name".*/),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Basic " + Buffer.from("pk:sk").toString("base64"),
            "X-Langfuse-Public-Key": "pk",
          }),
        })
      );
    });

    describe("shutdown", () => {
      beforeEach(() => {
        langfuse = new Langfuse({
          publicKey: "pk",
          secretKey: "sk",
          fetchRetryCount: 0,
        });

        mockedFetch.mockImplementation(async () => {
          // simulate network delay
          await wait(500);

          return Promise.resolve({
            status: 200,
            text: () => Promise.resolve("ok"),
            json: () =>
              Promise.resolve({
                status: "ok",
              }),
          } as any);
        });
      });

      afterEach(() => {
        langfuse.debug(false);
      });

      it("should shutdown cleanly", async () => {
        langfuse = new Langfuse({
          publicKey: "pk",
          secretKey: "sk",
          baseUrl: "http://example.com",
          fetchRetryCount: 0,
          flushAt: 1,
        });

        const logSpy = jest.spyOn(global.console, "log").mockImplementation(() => {});
        jest.useRealTimers();
        // using debug mode to check console.log output
        // which tells us when the flush is complete
        langfuse.debug(true);
        for (let i = 0; i < 10; i++) {
          langfuse.trace({ name: "trace-name" });
          // requests come 100ms apart
          await wait(100);
        }

        // 10 capture calls to debug log
        // 6 flush calls to debug log
        expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(15);
        expect(10).toEqual(logSpy.mock.calls.filter((call) => call[1].includes("trace-create")).length);
        expect(logSpy.mock.calls.filter((call) => call[1].includes("flush")).length).toBeGreaterThanOrEqual(5);

        logSpy.mockClear();

        await langfuse.shutdownAsync();
        // remaining 4 flush calls to debug log
        // happen during shutdown
        expect(logSpy.mock.calls.filter((call) => call[1].includes("flush")).length).toBeGreaterThanOrEqual(4);
        jest.useFakeTimers();
        logSpy.mockRestore();
      });
    });
  });
});
