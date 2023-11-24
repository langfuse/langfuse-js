import { parseBody } from "./test-utils/test-utils";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";
import { type LangfuseObjectClient } from "../src";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  jest.useFakeTimers();

  beforeEach(() => {
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1000,
    });
  });

  describe("multiple spans", () => {
    it("should create a trace", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      const trace = langfuse.trace({
        name: "test-trace",
      });
      trace.span({
        name: "test-span-1",
      });
      const span2 = trace.span({
        name: "test-span-2",
      });
      const event = span2.event({
        name: "test-event-1",
      });
      event.score({
        name: "test-score-1",
        value: 0.5,
      });

      await langfuse.shutdownAsync();

      const checks = [
        {
          url: "https://cloud.langfuse.com/api/public/traces",
          object: { name: "test-trace" },
        },
        {
          url: "https://cloud.langfuse.com/api/public/spans",
          object: { name: "test-span-1", traceId: trace.id },
        },
        {
          url: "https://cloud.langfuse.com/api/public/spans",
          object: { name: "test-span-2", traceId: trace.id },
        },
        {
          url: "https://cloud.langfuse.com/api/public/events",
          object: {
            name: "test-event-1",
            traceId: trace.id,
            parentObservationId: span2.id,
          },
        },
        {
          url: "https://cloud.langfuse.com/api/public/scores",
          object: {
            name: "test-score-1",
            traceId: trace.id,
            observationId: event.id,
            value: 0.5,
          },
        },
      ];
      expect(mocks.fetch).toHaveBeenCalledTimes(5);
      checks.forEach((check, i) => {
        const [url, options] = mocks.fetch.mock.calls[i];
        expect(url).toMatch(check.url);
        expect(options.method).toBe("POST");
        const body = parseBody(mocks.fetch.mock.calls[i]);
        expect(body).toMatchObject(check.object);
      });
    });

    it("it should not break when nesting deeply", async () => {
      const trace = langfuse.trace({
        name: "test-trace",
      });

      let client: LangfuseObjectClient = trace.span({
        name: "test-span-1",
      });

      for (let i = 0; i < 100; i++) {
        let nextClient: LangfuseObjectClient;
        const rand = Math.random();
        if (rand < 0.33) {
          nextClient = client.span({
            name: `test-span-${i}`,
          });
          await langfuse.flushAsync();
          expect(parseBody(mocks.fetch.mock.calls.pop())).toMatchObject({
            traceId: trace.id,
            parentObservationId: client.id,
            id: nextClient.id,
            name: `test-span-${i}`,
          });
        } else if (rand < 0.66) {
          nextClient = client.event({
            name: `test-event-${i}`,
          });
          await langfuse.flushAsync();
          expect(parseBody(mocks.fetch.mock.calls.pop())).toMatchObject({
            traceId: trace.id,
            parentObservationId: client.id,
            id: nextClient.id,
            name: `test-event-${i}`,
          });
        } else {
          nextClient = client.generation({
            name: `test-generation-${i}`,
          });
          await langfuse.flushAsync();
          expect(parseBody(mocks.fetch.mock.calls.pop())).toMatchObject({
            traceId: trace.id,
            parentObservationId: client.id,
            id: nextClient.id,
            name: `test-generation-${i}`,
          });
        }
        client = nextClient;
      }
    });
  });
});
