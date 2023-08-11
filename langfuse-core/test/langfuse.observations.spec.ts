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

  describe("observations", () => {
    it("should create each observation and handle dates correctly", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });

      // explicit start/end
      trace.generation({
        name: "test-observation-1",
        startTime: new Date("2023-01-02"),
        endTime: new Date("2023-01-03"),
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(parseBody(mocks.fetch.mock.calls[1])).toMatchObject({
        name: "test-observation-1",
        startTime: new Date("2023-01-02").toISOString(),
        endTime: new Date("2023-01-03").toISOString(),
      });

      // implicit start
      trace.span({
        name: "test-observation-2",
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      expect(parseBody(mocks.fetch.mock.calls[2])).toMatchObject({
        name: "test-observation-2",
        startTime: new Date().toISOString(),
      });

      // implicit start
      trace.event({
        name: "test-observation-3",
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(4);
      expect(parseBody(mocks.fetch.mock.calls[3])).toMatchObject({
        name: "test-observation-3",
        startTime: new Date().toISOString(),
      });
    });

    it("should allow overridding the id", async () => {
      langfuse.trace({
        id: "123456789",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toEqual({
        id: "123456789",
      });
    });

    it("test all params", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.trace({
        name: "test-trace",
        id: "123456789",
        metadata: {
          test: "test",
          mira: {
            hello: "world",
          },
        },
        version: "1.0.0",
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const body = parseBody(mocks.fetch.mock.calls[0]);
      expect(body).toMatchObject({
        name: "test-trace",
        id: "123456789",
        metadata: {
          test: "test",
          mira: {
            hello: "world",
          },
        },
        version: "1.0.0",
      });
    });
  });
});
