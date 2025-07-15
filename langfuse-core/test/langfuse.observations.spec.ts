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

  describe("generations", () => {
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
        await jest.advanceTimersByTimeAsync(1);
        expect(mocks.fetch).toHaveBeenCalledTimes(2);
        expect(parseBody(mocks.fetch.mock.calls[1])).toMatchObject({
          batch: [
            {
              id: expect.any(String),
              timestamp: expect.any(String),
              type: "generation-create",
              body: {
                name: "test-observation-1",
                startTime: expect.stringContaining(new Date("2023-01-02").toISOString().slice(0, 18)),
                endTime: expect.stringContaining(new Date("2023-01-03").toISOString().slice(0, 18)),
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
      await jest.advanceTimersByTimeAsync(1);

      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(parseBody(mocks.fetch.mock.calls[1])).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "generation-create",
            body: {
              name: "test-observation-1",
              startTime: expect.stringContaining(new Date("2023-01-02").toISOString().slice(0, 18)),
              endTime: expect.stringContaining(new Date("2023-01-03").toISOString().slice(0, 18)),
            },
          },
        ],
      });

      // implicit start
      trace.span({
        name: "test-observation-2",
      });
      await jest.advanceTimersByTimeAsync(1);

      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      expect(parseBody(mocks.fetch.mock.calls[2])).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "span-create",
            body: {
              name: "test-observation-2",
              startTime: expect.stringContaining(new Date("2022-01-01").toISOString().slice(0, 18)),
            },
          },
        ],
      });

      // implicit start
      trace.event({
        name: "test-observation-3",
      });
      await jest.advanceTimersByTimeAsync(1);

      expect(mocks.fetch).toHaveBeenCalledTimes(4);
      expect(parseBody(mocks.fetch.mock.calls[3])).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "event-create",
            body: {
              name: "test-observation-3",
              startTime: expect.stringContaining(new Date("2022-01-01").toISOString().slice(0, 18)),
            },
          },
        ],
      });
    });

    it("should allow overridding the id", async () => {
      langfuse.trace({
        id: "123456789",
      });
      await jest.advanceTimersByTimeAsync(1);

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toEqual({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              id: "123456789",
              timestamp: expect.any(String),
            },
          },
        ],
        metadata: {
          batch_size: 1,
          public_key: "pk-lf-111",
          sdk_integration: "DEFAULT",
          sdk_name: "langfuse-js",
          sdk_variant: "langfuse-core-tests",
          sdk_version: "2.0.0-alpha.2",
        },
      });
    });

    it("test all params", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.generation({
        name: "test-trace",
        id: "123456789",
        metadata: {
          test: "test",
          mira: {
            hello: "world",
          },
        },
        version: "1.0.0",
        input: { key: "input" },
        output: { key: "output" },
        completionStartTime: new Date("2023-01-01"),
        model: "test-model",
        modelParameters: { temperature: 0.5, stop: ["user-1", "user-2"] },
        usage: {
          input: 1,
          output: 2,
          total: 3,
          unit: "CHARACTERS",
          inputCost: 100,
          outputCost: 200,
          totalCost: 300,
        },
        endTime: new Date("2023-01-03"),
        startTime: new Date("2023-01-02"),
        level: "DEFAULT",
        statusMessage: "test-status",
      });
      await jest.advanceTimersByTimeAsync(1);

      expect(mocks.fetch).toHaveBeenCalledTimes(2); // two times as the generation will also create a trace
      const body = parseBody(mocks.fetch.mock.calls[1]);
      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "generation-create",
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
              input: { key: "input" },
              output: { key: "output" },
              completionStartTime: "2023-01-01T00:00:00.000Z",
              model: "test-model",
              modelParameters: { temperature: 0.5, stop: ["user-1", "user-2"] },
              usage: {
                input: 1,
                output: 2,
                total: 3,
                unit: "CHARACTERS",
                inputCost: 100,
                outputCost: 200,
                totalCost: 300,
              },
              endTime: "2023-01-03T00:00:00.000Z",
              startTime: "2023-01-02T00:00:00.000Z",
              level: "DEFAULT",
              statusMessage: "test-status",
            },
          },
        ],
      });
    });
  });
});
