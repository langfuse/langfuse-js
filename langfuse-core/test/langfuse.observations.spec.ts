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
    [
      {
        usage: {
          input: 1,
          output: 2,
          total: 3,
          unit: "CHARACTERS",
        },
        expectedOutput: {
          input: 1,
          output: 2,
          total: 3,
          unit: "CHARACTERS",
        },
      },
      {
        usage: {
          output: 2,
          unit: "CHARACTERS",
        },
        expectedOutput: {
          output: 2,
          unit: "CHARACTERS",
        },
      },
      {
        usage: {
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
        },
        expectedOutput: {
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
        },
      },
      {
        usage: {
          promptTokens: 1,
        },
        expectedOutput: {
          promptTokens: 1,
        },
      },
    ].forEach((usageConfig) => {
      it(`should create observations with different usage types correctly ${JSON.stringify(usageConfig)}`, async () => {
        jest.setSystemTime(new Date("2022-01-01"));

        const trace = langfuse.trace({
          name: "test-trace",
        });

        // explicit start/end
        trace.generation({
          name: "test-observation-1",
          startTime: new Date("2023-01-02"),
          endTime: new Date("2023-01-03"),
          usage: usageConfig.usage,
        });
        expect(mocks.fetch).toHaveBeenCalledTimes(2);
        expect(parseBody(mocks.fetch.mock.calls[1])).toMatchObject({
          batch: [
            {
              id: expect.any(String),
              timestamp: expect.any(String),
              type: "generation-create",
              body: {
                name: "test-observation-1",
                startTime: new Date("2023-01-02").toISOString(),
                endTime: new Date("2023-01-03").toISOString(),
                usage: usageConfig.expectedOutput,
              },
            },
          ],
        });
      });
    });
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
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "generation-create",
            body: {
              name: "test-observation-1",
              startTime: new Date("2023-01-02").toISOString(),
              endTime: new Date("2023-01-03").toISOString(),
            },
          },
        ],
      });

      // implicit start
      trace.span({
        name: "test-observation-2",
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      expect(parseBody(mocks.fetch.mock.calls[2])).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "span-create",
            body: {
              name: "test-observation-2",
              startTime: new Date().toISOString(),
            },
          },
        ],
      });

      // implicit start
      trace.event({
        name: "test-observation-3",
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(4);
      expect(parseBody(mocks.fetch.mock.calls[3])).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "event-create",
            body: {
              name: "test-observation-3",
              startTime: new Date().toISOString(),
            },
          },
        ],
      });
    });

    it("should allow overridding the id", async () => {
      langfuse.trace({
        id: "123456789",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toEqual({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              id: "123456789",
            },
          },
        ],
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
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              name: "test-trace",
              id: "123456789",
              metadata: {
                test: "test",
                mira: {
                  hello: "world",
                },
              },
              version: "1.0.0",
            },
          },
        ],
      });
    });
  });
});
