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
    it("should add a message to the queue", async () => {
      langfuse.trace({
        id: "123456789",
        name: "test-trace",
      });
      await jest.advanceTimersByTimeAsync(1);

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

  describe("processQueueItems", () => {
    it("should process multiple items that are within the size limit", () => {
      const queue: LangfuseQueueItem[] = [
        {
          id: "1",
          type: "observation-update",
          timestamp: "2022-01-01",
          body: { id: "123", name: "test1", type: "SPAN" },
          metadata: {},
        },
        {
          id: "2",
          type: "observation-update",
          timestamp: "2022-01-02",
          body: { id: "124", name: "test2", type: "SPAN" },
          metadata: {},
        },
        {
          id: "3",
          type: "observation-update",
          timestamp: "2022-01-03",
          body: { id: "125", name: "test3", type: "SPAN" },
          metadata: {},
        },
      ];
      const result = langfuse.processQueueItems(queue, 1000, 1000);
      expect(result.processedItems).toEqual(queue);
      expect(result.remainingItems.length).toBe(0);
    });

    it("should only drop the items that exceed the size limit", () => {
      const queue: LangfuseQueueItem[] = [
        {
          id: "1",
          type: "observation-update",
          timestamp: "2022-01-01",
          body: { id: "123", name: "test".repeat(1000), type: "SPAN" },
          metadata: {},
        },
        {
          id: "2",
          type: "observation-update",
          timestamp: "2022-01-02",
          body: { id: "124", name: "test", type: "SPAN" },
          metadata: {},
        },
      ];
      const result = langfuse.processQueueItems(queue, 2000, 1000);
      expect(result.processedItems.length).toBe(1);
      expect(result.processedItems[0].id).toBe("2");
      expect(result.remainingItems.length).toBe(0);
    });

    it("should drop items that exceed the size limit", () => {
      const queue: LangfuseQueueItem[] = [
        {
          id: "1",
          type: "observation-update",
          timestamp: "2022-01-01",
          body: { id: "123", name: "test".repeat(1000), type: "SPAN" },
          metadata: {},
        },
        {
          id: "2",
          type: "observation-update",
          timestamp: "2022-01-02",
          body: { id: "124", name: "test".repeat(1000), type: "SPAN" },
          metadata: {},
        },
      ];
      const result = langfuse.processQueueItems(queue, 2000, 1000);
      expect(result.processedItems.length).toBe(0);
      expect(result.remainingItems.length).toBe(0);
    });

    it("should process items up to the batch size limit and maintain ordering in remaining items", () => {
      const queue: LangfuseQueueItem[] = [
        {
          id: "1",
          type: "observation-update",
          timestamp: "2022-01-01",
          body: { id: "123", name: "test1", type: "SPAN" },
          metadata: {},
        },
        {
          id: "2",
          type: "observation-update",
          timestamp: "2022-01-02",
          body: { id: "124", name: "test2", type: "SPAN" },
          metadata: {},
        },
        {
          id: "3",
          type: "observation-update",
          timestamp: "2022-01-03",
          body: { id: "125", name: "test3", type: "SPAN" },
          metadata: {},
        },
      ];

      const MAX_MSG_SIZE = 1500;
      const BATCH_SIZE_LIMIT = 127;

      const result = langfuse.processQueueItems(queue, MAX_MSG_SIZE, BATCH_SIZE_LIMIT);

      expect(result.processedItems.length).toBe(1);
      expect(result.processedItems[0].id).toEqual("1");
      expect(result.remainingItems.length).toBe(2);

      const remainingIds = result.remainingItems.map((item) => item.id);
      expect(remainingIds.sort()).toEqual(["2", "3"]);
    });

    it("should process items up to the batch size limit and maintain ordering in remaining items if first one hits limit already", () => {
      const queue: LangfuseQueueItem[] = [
        {
          id: "1",
          type: "observation-update",
          timestamp: "2022-01-01",
          body: { id: "123", name: "test1", type: "SPAN" },
          metadata: {},
        },
        {
          id: "2",
          type: "observation-update",
          timestamp: "2022-01-02",
          body: { id: "124", name: "test2", type: "SPAN" },
          metadata: {},
        },
        {
          id: "3",
          type: "observation-update",
          timestamp: "2022-01-03",
          body: { id: "125", name: "test3", type: "SPAN" },
          metadata: {},
        },
      ];

      const MAX_MSG_SIZE = 1500;
      const BATCH_SIZE_LIMIT = 0;

      const result = langfuse.processQueueItems(queue, MAX_MSG_SIZE, BATCH_SIZE_LIMIT);

      expect(result.processedItems.length).toBe(0);
      expect(result.remainingItems.length).toBe(3);

      const remainingIds = result.remainingItems.map((item) => item.id);
      expect(remainingIds.sort()).toEqual(["1", "2", "3"]);
    });
  });
});
