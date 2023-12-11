import { parseBody } from "./test-utils/test-utils";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  jest.useFakeTimers();

  beforeEach(() => {
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });
  });

  describe("update span", () => {
    it("should update a span", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      const span = trace.span({
        name: "test-span-1",
      });
      span.update({
        version: "1.0.0",
        name: "test-span-2",
      });

      await langfuse.shutdownAsync();

      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      const [url, options] = mocks.fetch.mock.calls[2];
      expect(url).toMatch("https://cloud.langfuse.com/api/public/ingestion");
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[2]);
      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "observation-update",
            body: {
              traceId: trace.id,
              spanId: span.id,
              version: "1.0.0",
              name: "test-span-2",
            },
          },
        ],
      });
    });

    it("should update a generation", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      const generation = trace.generation({
        name: "test-span-1",
      });
      generation.update({
        version: "1.0.0",
      });

      await langfuse.shutdownAsync();

      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      const [url, options] = mocks.fetch.mock.calls[2];
      expect(url).toMatch("https://cloud.langfuse.com/api/public/ingestion");
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[2]);
      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "observation-update",
            body: {
              traceId: trace.id,
              generationId: generation.id,
              version: "1.0.0",
            },
          },
        ],
      });
    });
  });
});
