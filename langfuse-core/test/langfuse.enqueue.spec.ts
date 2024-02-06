import { LangfusePersistedProperty, type LangfuseQueueItem } from "../src";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  beforeEach(() => {
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 3,
    });
    jest.setSystemTime(new Date("2022-01-01"));
  });

  describe("enqueue", () => {
    it("should add a message to the queue", () => {
      langfuse.trace({
        id: "123456789",
        name: "test-trace",
      });

      expect(langfuse.getPersistedProperty(LangfusePersistedProperty.Queue)).toHaveLength(1);

      const item = langfuse.getPersistedProperty<LangfuseQueueItem[]>(LangfusePersistedProperty.Queue)?.pop();

      expect(item).toMatchObject({
        id: expect.any(String),
        type: "trace-create",
        timestamp: expect.any(String),
        body: { id: "123456789", name: "test-trace" },
      });

      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  });
});
