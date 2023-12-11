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

  describe("end a span", () => {
    it("should end a span", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      const span = trace.span({
        name: "test-span-1",
      });
      span.end({
        output: { text: "test-output" },
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
            type: "observation-update",
            timestamp: expect.any(String),
            body: {
              traceId: trace.id,
              spanId: span.id,
              output: { text: "test-output" },
              endTime: "2022-01-01T00:00:00.000Z",
            },
          },
        ],
      });
    });

    it("should end a span (without body)", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      const span = trace.span({
        name: "test-span-1",
      });
      span.end();

      await langfuse.shutdownAsync();

      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      const [url, options] = mocks.fetch.mock.calls[2];
      expect(url).toMatch("https://cloud.langfuse.com/api/public/ingestion");
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[2]);
      expect(body).toEqual({
        batch: [
          {
            id: expect.any(String),
            type: "observation-update",
            timestamp: expect.any(String),
            body: {
              traceId: trace.id,
              spanId: span.id,
              endTime: "2022-01-01T00:00:00.000Z",
            },
          },
        ],
      });
    });
  });

  describe("end a generation", () => {
    it("should end a generation", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      const generation = trace.generation({
        name: "test-span-1",
      });
      generation.end({
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
            type: "observation-update",
            timestamp: expect.any(String),
            body: {
              traceId: trace.id,
              generationId: generation.id,
              version: "1.0.0",
              endTime: "2022-01-01T00:00:00.000Z",
            },
          },
        ],
      });
    });

    it("should end a generation (without body)", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      const generation = trace.generation({
        name: "test-span-1",
      });
      generation.end();

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
            type: "observation-update",
            timestamp: expect.any(String),
            body: {
              traceId: trace.id,
              generationId: generation.id,
              endTime: "2022-01-01T00:00:00.000Z",
            },
          },
        ],
      });
    });
  });
});
