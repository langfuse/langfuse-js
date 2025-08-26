import { LangfuseClient } from "@langfuse/client";
import { resetGlobalLogger } from "@langfuse/core";
import { startObservation } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { nanoid } from "nanoid";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";

import { ServerAssertions } from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

function createLangfuseClient(): LangfuseClient {
  return new LangfuseClient();
}

describe("LangfuseClient Score E2E Tests", () => {
  let testEnv: ServerTestEnvironment;
  let assertions: ServerAssertions;

  beforeAll(() => {
    resetGlobalLogger();
  });

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    assertions = new ServerAssertions();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
    resetGlobalLogger();
  });

  describe("Score Creation Flow Validation", () => {
    it("should successfully create and flush scores without errors", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();
      const scoreName = `e2e-flow-test-${Date.now()}`;

      // Create a score
      client.score.create({
        id: scoreId,
        traceId: nanoid(),
        name: scoreName,
        value: 0.85,
        comment: "E2E flow validation",
        metadata: { testType: "flow-validation" },
      });

      // Flush should complete without errors
      await expect(client.flush()).resolves.not.toThrow();

      // Give server time to process
      await waitForServerIngestion(1000);

      // Try to retrieve - if successful, validate; if not, at least the flow worked
      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);
      expect(retrievedScore.id).toBe(scoreId);
      expect(retrievedScore.name).toBe(scoreName);
      expect(retrievedScore.value).toBe(0.85);
      expect(retrievedScore.comment).toBe("E2E flow validation");
    });

    it("should handle multiple score types in batch", async () => {
      const client = createLangfuseClient();
      const baseTime = Date.now();

      const testScores = [
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `numeric-${baseTime}`,
          value: 0.75,
          dataType: "NUMERIC" as const,
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `boolean-${baseTime}`,
          value: 1,
          dataType: "BOOLEAN" as const,
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `categorical-${baseTime}`,
          value: "excellent",
          dataType: "CATEGORICAL" as const,
        },
      ];

      // Create all scores
      testScores.forEach((scoreData) => {
        client.score.create(scoreData as any);
      });

      // Flush should complete without errors
      await expect(client.flush()).resolves.not.toThrow();
      await waitForServerIngestion(3000);

      // Try to retrieve and validate if possible
      for (const originalScore of testScores) {
        const retrievedScore = await assertions.api.scoreV2.getById(
          originalScore.id,
        );
        expect(retrievedScore.id).toBe(originalScore.id);
        expect(retrievedScore.name).toBe(originalScore.name);
        if (originalScore.dataType === "CATEGORICAL") {
          expect((retrievedScore as any).stringValue).toBe(originalScore.value);
        } else {
          expect(retrievedScore.value).toBe(originalScore.value);
        }
        expect(retrievedScore.dataType).toBe(originalScore.dataType);
      }
    });

    it("should handle batch scoring scenarios", async () => {
      const client = createLangfuseClient();
      const batchSize = 25;
      const baseTime = Date.now();
      const scoreIds: string[] = [];

      // Create batch of scores
      for (let i = 0; i < batchSize; i++) {
        const scoreId = nanoid();
        scoreIds.push(scoreId);

        client.score.create({
          id: scoreId,
          traceId: nanoid(),
          name: `batch-score-${baseTime}-${i}`,
          value: (i + 1) / batchSize,
          comment: `Batch score ${i + 1} of ${batchSize}`,
          metadata: { batchIndex: i, batchSize, timestamp: baseTime },
        });
      }

      // Flush should handle batching correctly
      await expect(client.flush()).resolves.not.toThrow();
      await waitForServerIngestion(4000); // Longer wait for batch

      // Validate all scores were created and are retrievable
      const retrievedScores = await Promise.all(
        scoreIds.map((id) => assertions.api.scoreV2.getById(id)),
      );

      expect(retrievedScores).toHaveLength(batchSize);

      retrievedScores.forEach((score, index) => {
        expect(score.id).toBe(scoreIds[index]);
        expect(score.name).toBe(`batch-score-${baseTime}-${index}`);
        expect(score.value).toBeCloseTo((index + 1) / batchSize, 3);
        expect(score.comment).toBe(`Batch score ${index + 1} of ${batchSize}`);
        expect(score.metadata).toEqual({
          batchIndex: index,
          batchSize,
          timestamp: baseTime,
        });
      });
    });
  });

  describe("OpenTelemetry Integration", () => {
    it("should create spans and associate scores correctly", async () => {
      const client = createLangfuseClient();
      const spanName = `e2e-span-${Date.now()}`;

      // Create a span and verify its context
      const span = startObservation(spanName, {
        input: { query: "test span scoring" },
        metadata: { testType: "span-integration" },
      });

      const { spanId, traceId } = span.otelSpan.spanContext();

      // Score the observation
      const observationScoreId = nanoid();
      client.score.observation(span, {
        id: observationScoreId,
        name: `span-quality-${Date.now()}`,
        value: 0.92,
        comment: "Span integration test",
      });

      // Score the trace
      const traceScoreId = nanoid();
      client.score.trace(span, {
        id: traceScoreId,
        name: `trace-quality-${Date.now()}`,
        value: 0.88,
        comment: "Trace integration test",
      });

      span.end();

      // Flush both spans and scores
      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Validate scores were created and linked correctly
      const [observationScore, traceScore] = await Promise.all([
        assertions.api.scoreV2.getById(observationScoreId),
        assertions.api.scoreV2.getById(traceScoreId),
      ]);

      // Validate observation score
      expect(observationScore.traceId).toBe(traceId);
      expect(observationScore.observationId).toBe(spanId);
      expect(observationScore.value).toBe(0.92);
      expect(observationScore.comment).toBe("Span integration test");

      // Validate trace score
      expect(traceScore.traceId).toBe(traceId);
      expect(traceScore.observationId).toBeNull(); // Trace scores don't have observationId
      expect(traceScore.value).toBe(0.88);
      expect(traceScore.comment).toBe("Trace integration test");

      // Validate the trace exists and has scores attached
      const traceData = await assertions.fetchTrace(traceId);
      expect(traceData.id).toBe(traceId);

      // Check that the observation exists in the trace
      const observation = traceData.observations?.find(
        (obs) => obs.id === spanId,
      );
      expect(observation).toBeDefined();
      expect(observation?.name).toBe(spanName);
    });

    it("should handle active span context correctly", async () => {
      const client = createLangfuseClient();
      const parentSpanName = `e2e-parent-${Date.now()}`;
      const activeSpanName = `e2e-active-${Date.now()}`;

      const parentSpan = startObservation(parentSpanName);

      let activeSpanId: string = "";
      let activeTraceId: string = "";
      const observationScoreId = nanoid();
      const traceScoreId = nanoid();

      await trace
        .getTracer("test")
        .startActiveSpan(activeSpanName, async (activeSpan) => {
          const spanContext = activeSpan.spanContext();
          activeSpanId = spanContext.spanId;
          activeTraceId = spanContext.traceId;

          // Score using active context
          client.score.activeObservation({
            id: observationScoreId,
            name: `active-obs-${Date.now()}`,
            value: 0.95,
            comment: "Active observation test",
          });

          client.score.activeTrace({
            id: traceScoreId,
            name: `active-trace-${Date.now()}`,
            value: 0.87,
            comment: "Active trace test",
          });

          activeSpan.end();
        });

      parentSpan.end();

      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Validate scores were created using active context
      const [observationScore, traceScore] = await Promise.all([
        assertions.api.scoreV2.getById(observationScoreId),
        assertions.api.scoreV2.getById(traceScoreId),
      ]);

      // Validate observation score was linked to active span
      expect(observationScore.traceId).toBe(activeTraceId);
      expect(observationScore.observationId).toBe(activeSpanId);
      expect(observationScore.value).toBe(0.95);
      expect(observationScore.comment).toBe("Active observation test");

      // Validate trace score was linked to active trace
      expect(traceScore.traceId).toBe(activeTraceId);
      expect(traceScore.observationId).toBeNull();
      expect(traceScore.value).toBe(0.87);
      expect(traceScore.comment).toBe("Active trace test");
    });

    it("should handle missing active context gracefully", async () => {
      const client = createLangfuseClient();
      const loggerSpy = vi.spyOn(client.score.logger, "warn");

      // Try to score without active context
      client.score.activeObservation({
        name: "no-context-obs",
        value: 0.5,
      });

      client.score.activeTrace({
        name: "no-context-trace",
        value: 0.7,
      });

      // Should have logged warnings
      expect(loggerSpy).toHaveBeenCalledWith(
        "No active span in context to score.",
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        "No active span in context to score trace.",
      );

      // Flush should complete without errors
      await expect(client.flush()).resolves.not.toThrow();
    });
  });

  describe("Span-based Scoring", () => {
    it("should create observation scores linked to spans", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();
      const spanName = `e2e-observation-span-${Date.now()}`;

      // Create a span
      const span = startObservation(spanName, {
        input: { query: "test observation scoring" },
        metadata: { testType: "observation-scoring" },
      });

      const { spanId, traceId } = span.otelSpan.spanContext();

      // Score the observation
      client.score.observation(span, {
        id: scoreId,
        name: `observation-quality-${Date.now()}`,
        value: 0.92,
        comment: "High quality observation",
      });

      span.end();

      // Flush spans and scores
      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Try to retrieve and validate if possible
      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);
      expect(retrievedScore.traceId).toBe(traceId);
      expect(retrievedScore.observationId).toBe(spanId);
      expect(retrievedScore.name).toContain("observation-quality");
      expect(retrievedScore.value).toBe(0.92);
      expect(retrievedScore.comment).toBe("High quality observation");

      const traceData = await assertions.fetchTrace(traceId);
      expect(traceData.id).toBe(traceId);

      const observation = traceData.observations?.find(
        (obs) => obs.id === spanId,
      );
      expect(observation).toBeDefined();
      expect(observation?.name).toBe(spanName);
    });

    it("should create trace scores linked to spans", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();
      const spanName = `e2e-trace-span-${Date.now()}`;

      // Create a span
      const span = startObservation(spanName, {
        input: { query: "test trace scoring" },
        metadata: { testType: "trace-scoring" },
      });

      const { traceId } = span.otelSpan.spanContext();

      // Score the trace
      client.score.trace(span, {
        id: scoreId,
        name: `trace-completeness-${Date.now()}`,
        value: 0.88,
        comment: "Complete trace execution",
      });

      span.end();

      // Flush spans and scores
      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Retrieve the score
      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);

      // Validate score is linked to trace only (no observationId)
      expect(retrievedScore.traceId).toBe(traceId);
      expect(retrievedScore.observationId).toBeNull(); // API returns null, not undefined
      expect(retrievedScore.name).toContain("trace-completeness");
      expect(retrievedScore.value).toBe(0.88);
      expect(retrievedScore.comment).toBe("Complete trace execution");

      // Verify the trace exists
      const traceData = await assertions.fetchTrace(traceId);
      expect(traceData.id).toBe(traceId);
    });

    it("should score active spans in context", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();
      const parentSpanName = `e2e-parent-span-${Date.now()}`;
      const activeSpanName = `e2e-active-span-${Date.now()}`;

      const parentSpan = startObservation(parentSpanName);

      let activeSpanId: string = "";
      let activeTraceId: string = "";

      await trace
        .getTracer("test")
        .startActiveSpan(activeSpanName, async (activeSpan) => {
          const spanContext = activeSpan.spanContext();
          activeSpanId = spanContext.spanId;
          activeTraceId = spanContext.traceId;

          // Score the active observation
          client.score.activeObservation({
            id: scoreId,
            name: `active-observation-${Date.now()}`,
            value: 0.95,
            comment: "Scored from active context",
          });

          activeSpan.end();
        });

      parentSpan.end();

      // Flush spans and scores
      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Retrieve and validate the score
      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);

      expect(retrievedScore.traceId).toBe(activeTraceId);
      expect(retrievedScore.observationId).toBe(activeSpanId);
      expect(retrievedScore.value).toBe(0.95);
      expect(retrievedScore.comment).toBe("Scored from active context");
    });

    it("should score active trace in context", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();
      const parentSpanName = `e2e-parent-trace-${Date.now()}`;
      const activeSpanName = `e2e-active-trace-span-${Date.now()}`;

      const parentSpan = startObservation(parentSpanName);

      let activeTraceId: string = "";

      await trace
        .getTracer("test")
        .startActiveSpan(activeSpanName, async (activeSpan) => {
          const spanContext = activeSpan.spanContext();
          activeTraceId = spanContext.traceId;

          // Score the active trace
          client.score.activeTrace({
            id: scoreId,
            name: `active-trace-${Date.now()}`,
            value: 0.87,
            comment: "Scored trace from active context",
          });

          activeSpan.end();
        });

      parentSpan.end();

      // Flush spans and scores
      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Retrieve and validate the score
      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);

      expect(retrievedScore.traceId).toBe(activeTraceId);
      expect(retrievedScore.observationId).toBeNull(); // API returns null for trace scores
      expect(retrievedScore.value).toBe(0.87);
      expect(retrievedScore.comment).toBe("Scored trace from active context");
    });
  });

  describe("Generation Scoring", () => {
    it("should score LLM generations correctly", async () => {
      const client = createLangfuseClient();
      const generationName = `e2e-generation-${Date.now()}`;

      // Create a generation
      const generation = startObservation(
        generationName,
        {
          model: "gpt-4",
          input: { messages: [{ role: "user", content: "Test generation" }] },
          metadata: { testType: "generation-scoring" },
        },
        { asType: "generation" },
      );

      const { spanId, traceId } = generation.otelSpan.spanContext();

      // Verify generation context with proper validation
      expect(spanId).toBeDefined();
      expect(traceId).toBeDefined();
      expect(typeof spanId).toBe("string");
      expect(typeof traceId).toBe("string");
      expect(spanId.length).toBe(16);
      expect(traceId.length).toBe(32);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);

      // Update generation with completion
      generation.update({
        output: { content: "This is a test response" },
        usageDetails: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18,
        },
      });

      // Score the generation
      const generationScoreId = nanoid();
      client.score.observation(generation, {
        id: generationScoreId,
        name: `gen-quality-${Date.now()}`,
        value: 0.91,
        comment: "Generation quality test",
        metadata: { scoringModel: "automated", criteria: "relevance" },
      });

      generation.end();

      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Validate generation score was created and linked correctly
      const generationScore =
        await assertions.api.scoreV2.getById(generationScoreId);
      expect(generationScore.traceId).toBe(traceId);
      expect(generationScore.observationId).toBe(spanId);
      expect(generationScore.value).toBe(0.91);
      expect(generationScore.comment).toBe("Generation quality test");
      expect(generationScore.metadata).toEqual({
        scoringModel: "automated",
        criteria: "relevance",
      });

      // Validate the generation observation exists in the trace
      const traceData = await assertions.fetchTrace(traceId);
      expect(traceData.id).toBe(traceId);

      const observation = traceData.observations?.find(
        (obs) => obs.id === spanId,
      );
      expect(observation).toBeDefined();
      expect(observation?.type).toBe("GENERATION");
      expect(observation?.name).toBe(generationName);
    });
  });

  describe("Complex Scoring Scenarios", () => {
    it("should handle nested spans with multiple scores", async () => {
      const client = createLangfuseClient();
      const baseTime = Date.now();

      // Create nested span structure using proper parent-child relationships
      const rootSpan = startObservation(`root-span-${baseTime}`);
      const childSpan = rootSpan.startObservation(`child-span-${baseTime}`);
      const grandchildSpan = childSpan.startObservation(
        `grandchild-span-${baseTime}`,
      );

      // Validate proper parent-child relationships
      const rootContext = rootSpan.otelSpan.spanContext();
      const childContext = childSpan.otelSpan.spanContext();
      const grandchildContext = grandchildSpan.otelSpan.spanContext();

      // All spans should share the same trace ID
      expect(rootContext.traceId).toBe(childContext.traceId);
      expect(childContext.traceId).toBe(grandchildContext.traceId);

      // Each span should have a unique span ID
      expect(rootContext.spanId).not.toBe(childContext.spanId);
      expect(childContext.spanId).not.toBe(grandchildContext.spanId);
      expect(rootContext.spanId).not.toBe(grandchildContext.spanId);

      // Score each level
      const rootScoreId = nanoid();
      const childScoreId = nanoid();
      const grandchildScoreId = nanoid();
      const traceScoreId = nanoid();

      client.score.observation(rootSpan, {
        id: rootScoreId,
        name: `root-score-${baseTime}`,
        value: 0.8,
        comment: "Root span quality",
      });

      client.score.observation(childSpan, {
        id: childScoreId,
        name: `child-score-${baseTime}`,
        value: 0.9,
        comment: "Child span quality",
      });

      client.score.observation(grandchildSpan, {
        id: grandchildScoreId,
        name: `grandchild-score-${baseTime}`,
        value: 0.95,
        comment: "Grandchild span quality",
      });

      client.score.trace(rootSpan, {
        id: traceScoreId,
        name: `trace-overall-${baseTime}`,
        value: 0.85,
        comment: "Overall trace quality",
      });

      // End spans
      grandchildSpan.end();
      childSpan.end();
      rootSpan.end();

      // Flush and wait
      await testEnv.spanProcessor.forceFlush();
      await client.flush();
      await waitForServerIngestion(1000);

      // Try to retrieve and validate scores if possible
      const scores = await Promise.all([
        assertions.api.scoreV2.getById(rootScoreId),
        assertions.api.scoreV2.getById(childScoreId),
        assertions.api.scoreV2.getById(grandchildScoreId),
        assertions.api.scoreV2.getById(traceScoreId),
      ]);

      // Validate all scores belong to same trace
      const expectedTraceId = rootContext.traceId;
      scores.forEach((score) => {
        expect(score.traceId).toBe(expectedTraceId);
      });

      // Validate observation scores have observationId, trace score doesn't
      expect(scores[0].observationId).toBeDefined(); // root
      expect(scores[1].observationId).toBeDefined(); // child
      expect(scores[2].observationId).toBeDefined(); // grandchild
      expect(scores[3].observationId).toBeNull(); // trace - API returns null

      // Validate score values
      expect(scores[0].value).toBe(0.8);
      expect(scores[1].value).toBe(0.9);
      expect(scores[2].value).toBe(0.95);
      expect(scores[3].value).toBe(0.85);
    });

    it("should handle batch scoring with server validation", async () => {
      const client = createLangfuseClient();
      const batchSize = 15;
      const baseTime = Date.now();
      const scoreIds: string[] = [];

      // Create multiple scores in batch
      for (let i = 0; i < batchSize; i++) {
        const scoreId = nanoid();
        scoreIds.push(scoreId);

        client.score.create({
          id: scoreId,
          traceId: nanoid(),
          name: `batch-score-${baseTime}-${i}`,
          value: (i + 1) / batchSize, // 0.067, 0.133, etc.
          comment: `Batch score ${i + 1} of ${batchSize}`,
          metadata: { batchIndex: i, batchSize, timestamp: baseTime },
        });
      }

      // Flush and wait
      await client.flush();
      await waitForServerIngestion(3000);

      const retrievedScores = await Promise.all(
        scoreIds.map((id) => assertions.api.scoreV2.getById(id)),
      );

      expect(retrievedScores).toHaveLength(batchSize);

      retrievedScores.forEach((score, index) => {
        expect(score.id).toBe(scoreIds[index]);
        expect(score.name).toBe(`batch-score-${baseTime}-${index}`);
        expect(score.value).toBeCloseTo((index + 1) / batchSize, 3);
        expect(score.comment).toBe(`Batch score ${index + 1} of ${batchSize}`);
        expect(score.metadata).toEqual({
          batchIndex: index,
          batchSize,
          timestamp: baseTime,
        });
      });
    });

    it("should handle scores with environment and config references", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();
      const testEnvironment = `e2e-test-env-${Date.now()}`;

      const config = await client.api.scoreConfigs.create({
        name: nanoid(),
        dataType: "NUMERIC",
      });

      client.score.create({
        id: scoreId,
        traceId: nanoid(),
        name: `env-config-score-${Date.now()}`,
        value: 0.78,
        comment: "Score with environment and config",
        environment: testEnvironment,
        configId: config.id, // Reference to a score config
        dataType: "NUMERIC",
        metadata: {
          testType: "environment-config",
          configVersion: 1,
        },
      });

      await client.flush();
      await waitForServerIngestion(1000);

      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);
      expect(retrievedScore.id).toBe(scoreId);
      expect(retrievedScore.environment).toBe(testEnvironment);
      expect(retrievedScore.configId).toBe(config.id);
      expect(retrievedScore.dataType).toBe("NUMERIC");
      expect(retrievedScore.value).toBe(0.78);
      expect(retrievedScore.metadata).toEqual({
        testType: "environment-config",
        configVersion: 1,
      });
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle duplicate score IDs gracefully", async () => {
      const client = createLangfuseClient();
      const duplicateId = nanoid();
      const baseTime = Date.now();

      // Create first score
      client.score.create({
        id: duplicateId,
        traceId: nanoid(),
        name: `first-score-${baseTime}`,
        value: 0.5,
        comment: "First score with duplicate ID",
      });

      await client.flush();
      await waitForServerIngestion(4000);

      // Try to create second score with same ID
      client.score.create({
        id: duplicateId,
        traceId: nanoid(),
        name: `second-score-${baseTime}`,
        value: 0.8,
        comment: "Second score with duplicate ID",
      });

      // This should not throw, but the server might handle it differently
      await client.flush();
      await waitForServerIngestion(4000);

      const retrievedScore = await assertions.api.scoreV2.getById(duplicateId);
      expect(retrievedScore.id).toBe(duplicateId);
      // The server might keep the first or update to the second score
      expect([0.5, 0.8]).toContain(retrievedScore.value);
    });

    it("should handle extreme score values", async () => {
      const client = createLangfuseClient();
      const baseTime = Date.now();

      const extremeScores = [
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `zero-score-${baseTime}`,
          value: 0,
          comment: "Zero score value",
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `negative-score-${baseTime}`,
          value: -1.5,
          comment: "Negative score value",
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `large-score-${baseTime}`,
          value: 9999.99,
          comment: "Very large score value",
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `precise-score-${baseTime}`,
          value: 0.123456789,
          comment: "High precision score value",
        },
      ];

      extremeScores.forEach((scoreData) => {
        client.score.create(scoreData);
      });

      await client.flush();
      await waitForServerIngestion(1000);

      // Try to validate extreme scores if retrieval works
      for (const originalScore of extremeScores) {
        const retrievedScore = await assertions.api.scoreV2.getById(
          originalScore.id,
        );

        expect(retrievedScore.id).toBe(originalScore.id);
        expect(retrievedScore.value).toBe(originalScore.value);
        expect(retrievedScore.comment).toBe(originalScore.comment);
      }
    });

    it("should handle large metadata objects", async () => {
      const client = createLangfuseClient();
      const scoreId = nanoid();

      // Create large metadata object
      const largeMetadata = {
        testType: "large-metadata",
        timestamp: Date.now(),
        config: {
          model: {
            name: "gpt-4",
            version: "0613",
            temperature: 0.7,
            maxTokens: 2048,
            topP: 1.0,
            frequencyPenalty: 0.0,
            presencePenalty: 0.0,
          },
          evaluation: {
            criteria: ["accuracy", "relevance", "completeness", "clarity"],
            weights: {
              accuracy: 0.4,
              relevance: 0.3,
              completeness: 0.2,
              clarity: 0.1,
            },
            thresholds: { pass: 0.7, excellent: 0.9 },
          },
          context: {
            userQuery: "What is the capital of France?",
            expectedAnswer: "Paris",
            actualAnswer: "The capital of France is Paris.",
            reasoning: "The answer is factually correct and complete.",
          },
        },
        tags: ["e2e-test", "large-metadata", "comprehensive-eval"],
        notes:
          "This is a test with a large metadata object to verify server handling of complex data structures.",
      };

      client.score.create({
        id: scoreId,
        traceId: nanoid(),
        name: `large-metadata-score-${Date.now()}`,
        value: 0.89,
        comment: "Score with large metadata object",
        metadata: largeMetadata,
      });

      await client.flush();
      await waitForServerIngestion(1000);

      const retrievedScore = await assertions.api.scoreV2.getById(scoreId);
      expect(retrievedScore.id).toBe(scoreId);
      expect(retrievedScore.value).toBe(0.89);
      expect(retrievedScore.metadata).toEqual(largeMetadata);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle duplicate score IDs gracefully", async () => {
      const client = createLangfuseClient();
      const duplicateId = nanoid();
      const baseTime = Date.now();

      // Create first score
      client.score.create({
        id: duplicateId,
        traceId: nanoid(),
        name: `first-score-${baseTime}`,
        value: 0.5,
        comment: "First score with duplicate ID",
      });

      await client.flush();
      await waitForServerIngestion(4000);

      // Try to create second score with same ID
      client.score.create({
        id: duplicateId,
        traceId: nanoid(),
        name: `second-score-${baseTime}`,
        value: 0.8,
        comment: "Second score with duplicate ID",
      });

      // This should not throw, but the server might handle it differently
      await client.flush();
      await waitForServerIngestion(4000);

      const retrievedScore = await assertions.api.scoreV2.getById(duplicateId);
      expect(retrievedScore.id).toBe(duplicateId);
      // The server might keep the first or update to the second score
      expect([0.5, 0.8]).toContain(retrievedScore.value);
    });

    it("should handle extreme values gracefully", async () => {
      const client = createLangfuseClient();
      const baseTime = Date.now();

      const extremeScores = [
        {
          id: nanoid(),

          traceId: nanoid(),
          name: `zero-${baseTime}`,
          value: 0,
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `negative-${baseTime}`,
          value: -1.5,
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `large-${baseTime}`,
          value: 9999.99,
        },
        {
          id: nanoid(),
          traceId: nanoid(),
          name: `precise-${baseTime}`,
          value: 0.123456789,
        },
      ];

      extremeScores.forEach((scoreData) => {
        client.score.create(scoreData);
      });

      await expect(client.flush()).resolves.not.toThrow();
      await waitForServerIngestion(1000);

      // Validate all extreme scores were created and stored correctly
      for (const originalScore of extremeScores) {
        const retrievedScore = await assertions.api.scoreV2.getById(
          originalScore.id,
        );
        expect(retrievedScore.id).toBe(originalScore.id);
        expect(retrievedScore.name).toBe(originalScore.name);
        expect(retrievedScore.value).toBe(originalScore.value);
      }
    });

    it("should handle large metadata objects", async () => {
      const client = createLangfuseClient();

      const largeMetadata = {
        testType: "large-metadata-e2e",
        timestamp: Date.now(),
        config: {
          model: {
            name: "gpt-4",
            version: "0613",
            parameters: {
              temperature: 0.7,
              maxTokens: 2048,
              topP: 1.0,
              frequencyPenalty: 0.0,
              presencePenalty: 0.0,
            },
          },
          evaluation: {
            criteria: ["accuracy", "relevance", "completeness", "clarity"],
            weights: {
              accuracy: 0.4,
              relevance: 0.3,
              completeness: 0.2,
              clarity: 0.1,
            },
            thresholds: { pass: 0.7, excellent: 0.9 },
          },
        },
        tags: ["e2e-test", "large-metadata", "integration-test"],
        notes: "Testing large metadata object handling in E2E environment.",
      };

      const largeMetadataScoreId = nanoid();
      client.score.create({
        id: largeMetadataScoreId,
        traceId: nanoid(),
        name: `large-metadata-${Date.now()}`,
        value: 0.89,
        comment: "Large metadata test",
        metadata: largeMetadata,
      });

      await expect(client.flush()).resolves.not.toThrow();
      await waitForServerIngestion(1000);

      // Validate large metadata was stored correctly
      const retrievedScore =
        await assertions.api.scoreV2.getById(largeMetadataScoreId);
      expect(retrievedScore.id).toBe(largeMetadataScoreId);
      expect(retrievedScore.value).toBe(0.89);
      expect(retrievedScore.comment).toBe("Large metadata test");
      expect(retrievedScore.metadata).toEqual(largeMetadata);
    });
  });

  describe("Flush and Shutdown", () => {
    it("should handle shutdown correctly", async () => {
      const client = createLangfuseClient();

      // Add some scores
      client.score.create({
        id: nanoid(),
        traceId: nanoid(),
        name: `shutdown-test-${Date.now()}`,
        value: 0.75,
        comment: "Shutdown test score",
      });

      // Shutdown should flush and complete without errors
      await expect(client.shutdown()).resolves.not.toThrow();
    });

    it("should handle multiple flush calls", async () => {
      const client = createLangfuseClient();
      const scoreIds: string[] = [];

      // Add scores
      for (let i = 0; i < 5; i++) {
        const scoreId = nanoid();
        scoreIds.push(scoreId);

        client.score.create({
          id: scoreId,
          traceId: nanoid(),
          name: `multi-flush-${Date.now()}-${i}`,
          value: i * 0.2,
          comment: `Multi-flush test ${i}`,
        });
      }

      // Multiple flush calls should all succeed
      const flushPromises = [client.flush(), client.flush(), client.flush()];

      await expect(Promise.all(flushPromises)).resolves.not.toThrow();
      await waitForServerIngestion(1000);

      // Validate all scores were created despite multiple flush calls
      const retrievedScores = await Promise.all(
        scoreIds.map((id) => assertions.api.scoreV2.getById(id)),
      );

      expect(retrievedScores).toHaveLength(5);
      retrievedScores.forEach((score, index) => {
        expect(score.id).toBe(scoreIds[index]);
        expect(score.value).toBe(index * 0.2);
        expect(score.comment).toBe(`Multi-flush test ${index}`);
      });
    });
  });
});
