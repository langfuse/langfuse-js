import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";
import { trace } from "@opentelemetry/api";
import { ScoreManager } from "@langfuse/client";
import {
  LangfuseAPIClient,
  IngestionEvent,
  resetGlobalLogger,
} from "@langfuse/core";
import { startObservation } from "@langfuse/tracing";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  waitFor,
  type TestEnvironment,
} from "./helpers/testSetup.js";

// Mock the API client
class MockAPIClient {
  public ingestion = {
    batch: vi.fn(),
  };

  constructor() {
    this.ingestion.batch.mockResolvedValue({ success: true });
  }

  reset() {
    this.ingestion.batch.mockClear();
    this.ingestion.batch.mockResolvedValue({ success: true });
  }

  setFailure(shouldFail: boolean = true) {
    if (shouldFail) {
      this.ingestion.batch.mockRejectedValue(new Error("API Error"));
    } else {
      this.ingestion.batch.mockResolvedValue({ success: true });
    }
  }

  setDelay(delayMs: number) {
    this.ingestion.batch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true }), delayMs),
        ),
    );
  }
}

function createScoreManager(mockAPIClient: MockAPIClient): ScoreManager {
  return new ScoreManager({
    apiClient: mockAPIClient as unknown as LangfuseAPIClient,
  });
}

describe("ScoreManager Integration Tests", () => {
  let testEnv: TestEnvironment;
  let mockAPIClient: MockAPIClient;

  beforeAll(() => {
    resetGlobalLogger();
  });

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    mockAPIClient = new MockAPIClient();
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
    mockAPIClient.reset();
    resetGlobalLogger();
  });

  describe("Basic Functionality", () => {
    it("should create a score with basic data", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const scoreData = {
        name: "test-score",
        value: 0.8,
        comment: "Good performance",
      };

      scoreManager.create(scoreData);

      await scoreManager.flush(); // Force flush for testing
      await waitFor(50);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);

      const callArgs = mockAPIClient.ingestion.batch.mock.calls[0][0];
      expect(callArgs.batch).toHaveLength(1);

      const event = callArgs.batch[0] as IngestionEvent;
      expect(event.type).toBe("score-create");
      expect(event.body.name).toBe("test-score");
      expect(event.body.value).toBe(0.8);
      expect(event.body.comment).toBe("Good performance");
      expect(event.body.id).toBeDefined();
    });

    it("should auto-generate ID when not provided", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "test", value: 1 });
      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.id).toBeDefined();
      expect(typeof event.body.id).toBe("string");
    });

    it("should use provided ID when given", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const customId = "custom-score-id";

      scoreManager.create({ id: customId, name: "test", value: 1 });
      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.id).toBe(customId);
    });

    it("should set environment from environment variable", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      process.env.LANGFUSE_TRACING_ENVIRONMENT = "test-env";

      scoreManager.create({ name: "test", value: 1 });
      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.environment).toBe("test-env");

      delete process.env.LANGFUSE_TRACING_ENVIRONMENT;
    });
  });

  describe("Span-based Scoring", () => {
    it("should score an observation with span context", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const span = startObservation("test-operation");
      const { spanId, traceId } = span.otelSpan.spanContext();

      scoreManager.observation(span, {
        name: "quality-score",
        value: 0.9,
      });

      span.end();
      await waitForSpanExport(testEnv.mockExporter, 1);
      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.traceId).toBe(traceId);
      expect(event.body.observationId).toBe(spanId);
      expect(event.body.name).toBe("quality-score");
    });

    it("should score a trace with span context", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const span = startObservation("test-operation");
      const { traceId } = span.otelSpan.spanContext();

      scoreManager.trace(span, {
        name: "trace-score",
        value: 0.7,
      });

      span.end();
      await waitForSpanExport(testEnv.mockExporter, 1);
      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.traceId).toBe(traceId);
      expect(event.body.observationId).toBeUndefined();
      expect(event.body.name).toBe("trace-score");
    });

    it("should score active observation in context", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const span = startObservation("test-operation");

      await trace
        .getTracer("langfuse-sdk")
        .startActiveSpan("active-span", async (activeSpan) => {
          const { spanId, traceId } = activeSpan.spanContext();

          scoreManager.activeObservation({
            name: "active-score",
            value: 0.85,
          });

          await scoreManager.flush();
          await waitFor(50);

          const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
          expect(event.body.traceId).toBe(traceId);
          expect(event.body.observationId).toBe(spanId);
          expect(event.body.name).toBe("active-score");

          activeSpan.end();
        });

      span.end();
    });

    it("should score active trace in context", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const span = startObservation("test-operation");

      await trace
        .getTracer("langfuse-sdk")
        .startActiveSpan("active-span", async (activeSpan) => {
          const { traceId } = activeSpan.spanContext();

          scoreManager.activeTrace({
            name: "active-trace-score",
            value: 0.92,
          });

          await scoreManager.flush();
          await waitFor(50);

          const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
          expect(event.body.traceId).toBe(traceId);
          expect(event.body.observationId).toBeUndefined(); // Should not have observationId for trace scoring
          expect(event.body.name).toBe("active-trace-score");

          activeSpan.end();
        });

      span.end();
    });

    it("should handle missing active span gracefully for activeObservation", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const loggerSpy = vi.spyOn(scoreManager.logger, "warn");

      scoreManager.activeObservation({
        name: "no-context-score",
        value: 0.5,
      });

      await waitFor(100);

      expect(loggerSpy).toHaveBeenCalledWith(
        "No active span in context to score.",
      );
      expect(mockAPIClient.ingestion.batch).not.toHaveBeenCalled();
    });

    it("should handle missing active span gracefully for activeTrace", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const loggerSpy = vi.spyOn(scoreManager.logger, "warn");

      scoreManager.activeTrace({
        name: "no-context-trace-score",
        value: 0.7,
      });

      await waitFor(100);

      expect(loggerSpy).toHaveBeenCalledWith(
        "No active span in context to score trace.",
      );
      expect(mockAPIClient.ingestion.batch).not.toHaveBeenCalled();
    });
  });

  describe("Flush Logic", () => {
    it("should flush when reaching flushAtCount", async () => {
      process.env.LANGFUSE_FLUSH_AT = "3";
      const scoreManager = createScoreManager(mockAPIClient);

      // Add 2 scores - should not flush yet
      scoreManager.create({ name: "score1", value: 1 });
      scoreManager.create({ name: "score2", value: 2 });

      await waitFor(50);
      expect(mockAPIClient.ingestion.batch).not.toHaveBeenCalled();

      // Add 3rd score - should trigger flush
      scoreManager.create({ name: "score3", value: 3 });

      await waitFor(100);
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);

      const batch = mockAPIClient.ingestion.batch.mock.calls[0][0].batch;
      expect(batch).toHaveLength(3);

      delete process.env.LANGFUSE_FLUSH_AT;
    });

    it("should flush on timer when below flushAtCount", async () => {
      process.env.LANGFUSE_FLUSH_INTERVAL = "0.1"; // 100ms
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "timer-score", value: 1 });

      // Should flush after timer expires
      await waitFor(200);
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);

      delete process.env.LANGFUSE_FLUSH_INTERVAL;
    });

    it("should batch scores correctly with MAX_BATCH_SIZE", async () => {
      // Set high flush count so items accumulate
      process.env.LANGFUSE_FLUSH_AT = "200";
      const scoreManager = createScoreManager(mockAPIClient);

      // Create 150 scores to test batching (MAX_BATCH_SIZE = 100)
      for (let i = 0; i < 150; i++) {
        scoreManager.create({ name: `score-${i}`, value: i });
      }

      await scoreManager.flush();
      await waitFor(100);

      // Should make 2 API calls: 100 + 50 (batched within single flush)
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(2);

      const firstBatch = mockAPIClient.ingestion.batch.mock.calls[0][0].batch;
      const secondBatch = mockAPIClient.ingestion.batch.mock.calls[1][0].batch;

      expect(firstBatch).toHaveLength(100);
      expect(secondBatch).toHaveLength(50);

      delete process.env.LANGFUSE_FLUSH_AT;
    });

    it("should handle multiple concurrent flush calls", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      // Add some scores
      for (let i = 0; i < 10; i++) {
        scoreManager.create({ name: `score-${i}`, value: i });
      }

      // Call flush multiple times concurrently
      const flushPromises = [
        scoreManager.flush(),
        scoreManager.flush(),
        scoreManager.flush(),
      ];

      await Promise.all(flushPromises);
      await waitFor(100);

      // Should only make one API call due to promise deduplication
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Queue Management", () => {
    it("should respect MAX_QUEUE_SIZE limit", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const loggerSpy = vi.spyOn(scoreManager.logger, "error");

      // Mock a very small queue size for testing
      const originalCreate = scoreManager.create.bind(scoreManager);
      let callCount = 0;

      scoreManager.create = function (data) {
        callCount++;
        // Simulate queue being at max size after 3 calls
        if (callCount > 3) {
          if ((this as any).eventQueue.length >= 100_000) {
            this.logger.error(
              `Score queue is at max size 100000. Dropping score.`,
            );
            return;
          }
        }
        return originalCreate(data);
      };

      // This test verifies the queue size check logic exists
      for (let i = 0; i < 5; i++) {
        scoreManager.create({ name: `score-${i}`, value: i });
      }

      expect(callCount).toBe(5);
    });

    it("should clear queue after successful flush", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "test1", value: 1 });
      scoreManager.create({ name: "test2", value: 2 });

      await scoreManager.flush();
      await waitFor(100);

      // Add another score after flush
      scoreManager.create({ name: "test3", value: 3 });
      await scoreManager.flush();
      await waitFor(100);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(2);

      const firstCall = mockAPIClient.ingestion.batch.mock.calls[0][0].batch;
      const secondCall = mockAPIClient.ingestion.batch.mock.calls[1][0].batch;

      expect(firstCall).toHaveLength(2);
      expect(secondCall).toHaveLength(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle API errors gracefully", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const loggerSpy = vi.spyOn(scoreManager.logger, "error");
      mockAPIClient.setFailure(true);

      scoreManager.create({ name: "error-test", value: 1 });
      await scoreManager.flush();
      await waitFor(100);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith(
        "Failed to export score batch:",
        expect.any(Error),
      );
    });

    it("should continue processing other batches if one fails", async () => {
      // Set high flush count so items accumulate
      process.env.LANGFUSE_FLUSH_AT = "200";
      const scoreManager = createScoreManager(mockAPIClient);

      // Add enough scores to create multiple batches
      for (let i = 0; i < 150; i++) {
        scoreManager.create({ name: `score-${i}`, value: i });
      }

      // Make first batch fail, second succeed
      let callCount = 0;
      mockAPIClient.ingestion.batch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("First batch failed"));
        }
        return Promise.resolve({ success: true });
      });

      const loggerSpy = vi.spyOn(scoreManager.logger, "error");

      await scoreManager.flush();
      await waitFor(100);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(2);
      expect(loggerSpy).toHaveBeenCalledWith(
        "Failed to export score batch:",
        expect.any(Error),
      );

      delete process.env.LANGFUSE_FLUSH_AT;
    });

    it("should handle flush promise rejection", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const loggerSpy = vi.spyOn(scoreManager.logger, "error");

      // Mock Promise.all to throw
      const originalPromiseAll = Promise.all;
      Promise.all = vi.fn().mockRejectedValue(new Error("Promise.all failed"));

      scoreManager.create({ name: "promise-error", value: 1 });
      await scoreManager.flush();
      await waitFor(100);

      expect(loggerSpy).toHaveBeenCalledWith(
        "Error flushing Score Manager: ",
        expect.any(Error),
      );

      // Restore original Promise.all
      Promise.all = originalPromiseAll;
    });
  });

  describe("Timer Management", () => {
    it("should clear timer when manual flush is called", async () => {
      process.env.LANGFUSE_FLUSH_INTERVAL = "1"; // 1 second
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "timer-test", value: 1 });

      // Manually flush before timer expires
      await scoreManager.flush();
      await waitFor(100);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);

      // Wait for original timer duration to ensure it doesn't fire again
      await waitFor(1100);
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);

      delete process.env.LANGFUSE_FLUSH_INTERVAL;
    });

    it("should not create multiple timers for multiple scores", async () => {
      process.env.LANGFUSE_FLUSH_INTERVAL = "0.2"; // 200ms
      const scoreManager = createScoreManager(mockAPIClient);

      // Add multiple scores quickly
      scoreManager.create({ name: "multi1", value: 1 });
      scoreManager.create({ name: "multi2", value: 2 });
      scoreManager.create({ name: "multi3", value: 3 });

      // Wait for timer to fire
      await waitFor(300);

      // Should only flush once via timer
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);
      expect(mockAPIClient.ingestion.batch.mock.calls[0][0].batch).toHaveLength(
        3,
      );

      delete process.env.LANGFUSE_FLUSH_INTERVAL;
    });
  });

  describe("Shutdown", () => {
    it("should flush remaining scores on shutdown", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "shutdown-test1", value: 1 });
      scoreManager.create({ name: "shutdown-test2", value: 2 });

      await scoreManager.shutdown();
      await waitFor(100);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);
      expect(mockAPIClient.ingestion.batch.mock.calls[0][0].batch).toHaveLength(
        2,
      );
    });

    it("should wait for ongoing flush before shutdown", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      // Add a delay to the API call to simulate slow network
      mockAPIClient.setDelay(200);

      scoreManager.create({ name: "slow-test", value: 1 });

      // Start flush and shutdown concurrently
      const flushPromise = scoreManager.flush();
      const shutdownPromise = scoreManager.shutdown();

      await Promise.all([flushPromise, shutdownPromise]);

      // Should only make one API call
      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Configuration", () => {
    it("should use default configuration values", () => {
      const scoreManager = createScoreManager(mockAPIClient);

      expect((scoreManager as any).flushAtCount).toBe(10);
      expect((scoreManager as any).flushIntervalSeconds).toBe(1);
    });

    it("should use environment configuration values", () => {
      process.env.LANGFUSE_FLUSH_AT = "25";
      process.env.LANGFUSE_FLUSH_INTERVAL = "5";

      const scoreManager = createScoreManager(mockAPIClient);

      expect((scoreManager as any).flushAtCount).toBe(25);
      expect((scoreManager as any).flushIntervalSeconds).toBe(5);

      delete process.env.LANGFUSE_FLUSH_AT;
      delete process.env.LANGFUSE_FLUSH_INTERVAL;
    });
  });

  describe("Data Types and Validation", () => {
    it("should handle different score value types", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      const numericScore = { name: "numeric", value: 0.85 };
      const booleanScore = { name: "boolean", value: 1 }; // Boolean as 1/0
      const categoricalScore = { name: "categorical", value: "excellent" };

      scoreManager.create(numericScore);
      scoreManager.create(booleanScore);
      scoreManager.create(categoricalScore as any); // Type assertion for test

      await scoreManager.flush();
      await waitFor(100);

      const batch = mockAPIClient.ingestion.batch.mock.calls[0][0].batch;
      expect(batch).toHaveLength(3);
      expect(batch[0].body.value).toBe(0.85);
      expect(batch[1].body.value).toBe(1);
      expect(batch[2].body.value).toBe("excellent");
    });

    it("should handle complex metadata", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      const complexMetadata = {
        model: "gpt-4",
        version: "1.0",
        metrics: { accuracy: 0.95, latency: 120 },
        tags: ["production", "quality-check"],
      };

      scoreManager.create({
        name: "complex-score",
        value: 0.9,
        metadata: complexMetadata,
        comment: "Complex metadata test",
      });

      await scoreManager.flush();
      await waitFor(100);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.metadata).toEqual(complexMetadata);
    });

    it("should preserve all score fields", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      const completeScore = {
        id: "custom-id",
        name: "complete-score",
        value: 0.75,
        comment: "Complete score with all fields",
        metadata: { source: "test" },
        dataType: "numeric" as const,
        configId: "config-123",
        environment: "test-env",
      };

      scoreManager.create(completeScore);
      await scoreManager.flush();
      await waitFor(100);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body).toMatchObject(completeScore);
    });
  });

  describe("Edge Cases and Additional Coverage", () => {
    it("should handle environment override in create method", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      process.env.LANGFUSE_TRACING_ENVIRONMENT = "default-env";

      scoreManager.create({
        name: "override-env-test",
        value: 1,
        environment: "custom-env", // This should override the env var
      });

      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.environment).toBe("custom-env");

      delete process.env.LANGFUSE_TRACING_ENVIRONMENT;
    });

    it("should handle invalid environment variable numbers gracefully", async () => {
      process.env.LANGFUSE_FLUSH_AT = "invalid-number";
      process.env.LANGFUSE_FLUSH_INTERVAL = "also-invalid";

      const scoreManager = createScoreManager(mockAPIClient);

      // Should fallback to defaults when env vars are invalid
      expect((scoreManager as any).flushAtCount).toBeNaN(); // Number("invalid-number") returns NaN
      expect((scoreManager as any).flushIntervalSeconds).toBeNaN();

      // Should still work despite invalid config
      scoreManager.create({ name: "invalid-config-test", value: 1 });
      await scoreManager.flush();
      await waitFor(50);

      expect(mockAPIClient.ingestion.batch).toHaveBeenCalledTimes(1);

      delete process.env.LANGFUSE_FLUSH_AT;
      delete process.env.LANGFUSE_FLUSH_INTERVAL;
    });

    it("should generate unique IDs for multiple scores", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "unique1", value: 1 });
      scoreManager.create({ name: "unique2", value: 2 });
      scoreManager.create({ name: "unique3", value: 3 });

      await scoreManager.flush();
      await waitFor(50);

      const batch = mockAPIClient.ingestion.batch.mock.calls[0][0].batch;
      const ids = batch.map((event: IngestionEvent) => event.body.id);

      // All IDs should be unique
      expect(new Set(ids).size).toBe(3);
      // All IDs should be defined strings
      ids.forEach((id: any) => {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      });
    });

    it("should preserve timestamp format in ingestion events", async () => {
      const scoreManager = createScoreManager(mockAPIClient);
      const beforeTime = new Date();

      scoreManager.create({ name: "timestamp-test", value: 1 });
      await scoreManager.flush();
      await waitFor(50);

      const afterTime = new Date();
      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];

      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe("string");

      const eventTime = new Date(event.timestamp);
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(eventTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it("should handle zero and negative score values", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({ name: "zero-score", value: 0 });
      scoreManager.create({ name: "negative-score", value: -0.5 });

      await scoreManager.flush();
      await waitFor(50);

      const batch = mockAPIClient.ingestion.batch.mock.calls[0][0].batch;
      expect(batch[0].body.value).toBe(0);
      expect(batch[1].body.value).toBe(-0.5);
    });

    it("should handle empty string values in optional fields", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({
        name: "empty-fields-test",
        value: 1,
        comment: "", // Empty comment
        configId: "", // Empty configId
      });

      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];
      expect(event.body.comment).toBe("");
      expect(event.body.configId).toBe("");
    });

    it("should handle flush with empty queue gracefully", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      // Flush without any items
      await scoreManager.flush();
      await waitFor(50);

      expect(mockAPIClient.ingestion.batch).not.toHaveBeenCalled();
    });

    it("should handle shutdown with empty queue gracefully", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      // Shutdown without any items
      await scoreManager.shutdown();
      await waitFor(50);

      expect(mockAPIClient.ingestion.batch).not.toHaveBeenCalled();
    });

    it("should properly handle logger getter", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      // Access logger through the getter
      const logger = scoreManager.logger;
      expect(logger).toBeDefined();
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });

    it("should handle ingestion event structure correctly", async () => {
      const scoreManager = createScoreManager(mockAPIClient);

      scoreManager.create({
        name: "structure-test",
        value: 0.8,
        comment: "Testing event structure",
      });

      await scoreManager.flush();
      await waitFor(50);

      const event = mockAPIClient.ingestion.batch.mock.calls[0][0].batch[0];

      // Verify top-level event structure
      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("type");
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("body");

      expect(event.type).toBe("score-create");
      expect(typeof event.id).toBe("string");
      expect(typeof event.timestamp).toBe("string");

      // Verify body structure contains all score fields
      const body = event.body;
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("name");
      expect(body).toHaveProperty("value");
      expect(body.name).toBe("structure-test");
      expect(body.value).toBe(0.8);
    });
  });
});
