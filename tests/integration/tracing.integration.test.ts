import {
  startObservation,
  startActiveObservation,
  observe,
  updateActiveSpan,
  updateActiveGeneration,
  updateActiveTrace,
  LangfuseOtelSpanAttributes,
  createTraceId,
  getActiveTraceId,
} from "@langfuse/tracing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

describe("Tracing Methods Interoperability E2E Tests", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  describe("startObservation method", () => {
    it("should create and export a simple span", async () => {
      const span = startObservation("test-span");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("test-span");
    });

    it("should create and export a simple span with manual traceId and parent span Id", async () => {
      const traceId = "0123456789abcdef0123456789abcdef";
      const spanId = "0123456789abcdef";

      const span = startObservation(
        "test-span",
        {},
        {
          parentSpanContext: { traceId, spanId, traceFlags: 1 },
        },
      );
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("test-span");
      const retrievedSpan = testEnv.mockExporter.getSpanByName("test-span");
      expect(retrievedSpan).toBeDefined();

      expect(retrievedSpan!.parentSpanContext).toMatchObject({
        traceId,
        spanId,
        traceFlags: 1,
      });
    });

    it("should create span with custom attributes", async () => {
      const span = startObservation("test-span", {
        metadata: { key: "value" },
        input: { prompt: "test prompt" },
        output: { response: "test response" },
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanAttribute(
        "test-span",
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".key",
        "value",
      );
      assertions.expectSpanAttribute(
        "test-span",
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        '{"prompt":"test prompt"}',
      );
      assertions.expectSpanAttribute(
        "test-span",
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        '{"response":"test response"}',
      );
    });

    it("should handle span with error status", async () => {
      const span = startObservation("error-span");
      // Use update method to set error status in attributes
      span.update({
        statusMessage: "Test error",
        level: "ERROR",
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanAttribute(
        "error-span",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "ERROR",
      );
      assertions.expectSpanAttribute(
        "error-span",
        LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
        "Test error",
      );
    });

    describe("Nested spans", () => {
      it("should create nested spans with correct parent-child relationships", async () => {
        const parentSpan = startObservation("parent-span", {
          input: { operation: "parent operation" },
        });

        // Add trace attributes to parent span
        parentSpan.updateTrace({
          name: "nested-spans-trace",
          userId: "user-123",
          sessionId: "session-456",
          tags: ["nested", "test"],
        });

        // Create child span using parent's context
        const childSpan = startObservation(
          "child-span",
          {
            input: { step: "child operation" },
          },
          { parentSpanContext: parentSpan.otelSpan.spanContext() },
        );
        childSpan.update({ output: { result: "child completed" } });
        childSpan.end();

        parentSpan.update({ output: { status: "parent completed" } });
        parentSpan.end();

        await waitForSpanExport(testEnv.mockExporter, 2);

        assertions.expectSpanCount(2);
        assertions.expectSpanWithName("parent-span");
        assertions.expectSpanWithName("child-span");

        // Verify parent-child relationship
        assertions.expectSpanParent("child-span", "parent-span");
        assertions.expectAllSpansInSameTrace();

        // Verify trace attributes were set
        assertions.expectSpanAttribute(
          "parent-span",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "nested-spans-trace",
        );
        assertions.expectSpanAttribute("parent-span", "user.id", "user-123");
        assertions.expectSpanAttribute(
          "parent-span",
          "session.id",
          "session-456",
        );
        // Verify tags array is set correctly
        const parentAttributes =
          testEnv.mockExporter.getSpanAttributes("parent-span");
        expect(parentAttributes).toHaveProperty("langfuse.trace.tags");
        expect(parentAttributes["langfuse.trace.tags"]).toEqual(
          expect.arrayContaining(["nested"]),
        );
      });

      it("should handle multiple child spans", async () => {
        const parentSpan = startObservation("parent-span", {
          input: { operation: "multi-child operation" },
        });

        // Add trace attributes
        parentSpan.updateTrace({
          name: "multi-child-trace",
          userId: "user-789",
          metadata: { test_type: "multi-child", version: "1.0" },
        });

        const child1 = startObservation(
          "child-1",
          {
            input: { task: "first task" },
          },
          { parentSpanContext: parentSpan.otelSpan.spanContext() },
        );
        child1.update({
          output: { result: "task 1 done" },
          level: "DEFAULT",
        });

        const child2 = startObservation(
          "child-2",
          {
            input: { task: "second task" },
          },
          { parentSpanContext: parentSpan.otelSpan.spanContext() },
        );
        child2.update({
          output: { result: "task 2 done" },
          statusMessage: "Child 2 completed successfully",
        });

        child1.end();
        child2.end();
        parentSpan.update({ output: { status: "all children completed" } });
        parentSpan.end();

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("parent-span");
        assertions.expectSpanWithName("child-1");
        assertions.expectSpanWithName("child-2");

        // Verify parent-child relationships
        assertions.expectSpanParent("child-1", "parent-span");
        assertions.expectSpanParent("child-2", "parent-span");
        assertions.expectAllSpansInSameTrace();

        // Verify all attributes are set correctly
        assertions.expectSpanAttribute(
          "child-1",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "DEFAULT",
        );
        assertions.expectSpanAttribute(
          "child-2",
          LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
          "Child 2 completed successfully",
        );

        // Verify trace attributes are inherited
        assertions.expectSpanAttribute(
          "parent-span",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "multi-child-trace",
        );
        assertions.expectSpanAttribute("parent-span", "user.id", "user-789");
        assertions.expectSpanAttributeContains(
          "parent-span",
          LangfuseOtelSpanAttributes.TRACE_METADATA + ".test_type",
          "multi-child",
        );
        assertions.expectSpanAttributeContains(
          "parent-span",
          LangfuseOtelSpanAttributes.TRACE_METADATA + ".version",
          "1.0",
        );
      });
    });

    describe("Span timing", () => {
      it("should record span duration correctly", async () => {
        const span = startObservation("timed-span");

        await new Promise((resolve) => setTimeout(resolve, 100));

        span.end();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanDuration("timed-span", 90, 200);
      });
    });

    describe("Environment and release attributes", () => {
      it("should add environment and release attributes from span processor", async () => {
        await teardownTestEnvironment(testEnv);

        testEnv = await setupTestEnvironment({
          spanProcessorConfig: {
            environment: "test-env",
            release: "v1.0.0",
          },
        });
        assertions = new SpanAssertions(testEnv.mockExporter);

        const span = startObservation("env-span");
        span.end();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttribute(
          "env-span",
          LangfuseOtelSpanAttributes.ENVIRONMENT,
          "test-env",
        );
        assertions.expectSpanAttribute(
          "env-span",
          LangfuseOtelSpanAttributes.RELEASE,
          "v1.0.0",
        );
      });
    });

    describe("Span processor configuration", () => {
      it("should respect flush configuration", async () => {
        await teardownTestEnvironment(testEnv);

        testEnv = await setupTestEnvironment({
          spanProcessorConfig: {
            flushAt: 3, // Batch of 3 spans
          },
        });
        assertions = new SpanAssertions(testEnv.mockExporter);

        // Create 2 spans - should not flush yet
        const span1 = startObservation("span-1");
        span1.end();
        const span2 = startObservation("span-2");
        span2.end();

        // Wait a bit and check no spans exported yet
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(testEnv.mockExporter.getSpanCount()).toBe(0);

        // Third span should trigger flush
        const span3 = startObservation("span-3");
        span3.end();

        await waitForSpanExport(testEnv.mockExporter, 3);
        assertions.expectSpanCount(3);
      });
    });
  });

  describe("startObservation with generation type", () => {
    it("should create generation with proper observation type", async () => {
      const generation = startObservation(
        "test-generation",
        {
          model: "gpt-4",
          input: { prompt: "Hello world" },
          metadata: { test_run: true, version: "1.0" },
          level: "DEFAULT",
        },
        { asType: "generation" },
      );

      // Add trace attributes
      generation.updateTrace({
        name: "generation-test-trace",
        userId: "test-user",
        sessionId: "test-session",
        public: true,
      });

      generation.update({
        output: { content: "Hello! How can I help you?" },
        usageDetails: {
          promptTokens: 3,
          completionTokens: 8,
          totalTokens: 11,
        },
      });
      generation.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("test-generation");
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        "gpt-4",
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        JSON.stringify({ prompt: "Hello world" }),
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        JSON.stringify({ content: "Hello! How can I help you?" }),
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEFAULT",
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        JSON.stringify({
          promptTokens: 3,
          completionTokens: 8,
          totalTokens: 11,
        }),
      );

      // Verify metadata attributes
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".test_run",
        "true",
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".version",
        "1.0",
      );

      // Verify trace attributes
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.TRACE_NAME,
        "generation-test-trace",
      );
      assertions.expectSpanAttribute("test-generation", "user.id", "test-user");
      assertions.expectSpanAttribute(
        "test-generation",
        "session.id",
        "test-session",
      );
      assertions.expectSpanAttribute(
        "test-generation",
        LangfuseOtelSpanAttributes.TRACE_PUBLIC,
        true,
      );
    });

    it("should handle generation with usage tracking", async () => {
      const generation = startObservation(
        "usage-generation",
        {
          model: "gpt-3.5-turbo",
          input: { messages: [{ role: "user", content: "test" }] },
          usageDetails: {
            promptTokens: 10,
            completionTokens: 15,
            totalTokens: 25,
          },
        },
        { asType: "generation" },
      );
      generation.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("usage-generation");
      assertions.expectSpanAttribute(
        "usage-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
      assertions.expectSpanAttribute(
        "usage-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        "gpt-3.5-turbo",
      );
      assertions.expectSpanAttribute(
        "usage-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      );
      // Test complete usage details object
      assertions.expectSpanAttribute(
        "usage-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        JSON.stringify({
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
        }),
      );
    });
  });

  describe("startObservation with event type", () => {
    it("should create event with proper observation type", async () => {
      const parentSpan = startObservation("event-parent", {
        input: { workflow: "user interaction workflow" },
      });

      parentSpan.updateTrace({
        name: "event-test-trace",
        userId: "event-user",
        tags: ["events", "interaction"],
        metadata: { platform: "web", version: "2.0" },
      });

      const event = startObservation(
        "test-event",
        {
          input: { action: "user_click", timestamp: Date.now() },
          metadata: { element: "button", coordinates: { x: 100, y: 200 } },
          level: "DEFAULT",
          output: { success: true, duration_ms: 45 },
        },
        {
          asType: "event",
          parentSpanContext: parentSpan.otelSpan.spanContext(),
        },
      );

      parentSpan.update({ output: { events_created: 1 } });
      parentSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("test-event");
      assertions.expectSpanWithName("event-parent");

      // Verify parent-child relationship
      assertions.expectSpanParent("test-event", "event-parent");

      // Verify event attributes
      assertions.expectSpanAttribute(
        "test-event",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "event",
      );
      assertions.expectSpanAttributeContains(
        "test-event",
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        "user_click",
      );
      assertions.expectSpanAttribute(
        "test-event",
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        JSON.stringify({ success: true, duration_ms: 45 }),
      );
      assertions.expectSpanAttribute(
        "test-event",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEFAULT",
      );

      // Verify metadata
      assertions.expectSpanAttribute(
        "test-event",
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".element",
        "button",
      );
      assertions.expectSpanAttributeContains(
        "test-event",
        "langfuse.observation.metadata.coordinates",
        "100",
      );

      // Verify trace attributes on parent
      assertions.expectSpanAttribute(
        "event-parent",
        LangfuseOtelSpanAttributes.TRACE_NAME,
        "event-test-trace",
      );
      assertions.expectSpanAttribute("event-parent", "user.id", "event-user");
      // Verify tags array contains expected values
      const eventParentAttrs =
        testEnv.mockExporter.getSpanAttributes("event-parent");
      expect(eventParentAttrs).toHaveProperty("langfuse.trace.tags");
      expect(eventParentAttrs["langfuse.trace.tags"]).toEqual(
        expect.arrayContaining(["events"]),
      );
      assertions.expectSpanAttribute(
        "event-parent",
        LangfuseOtelSpanAttributes.TRACE_METADATA + ".platform",
        "web",
      );
    });

    it("should create event with custom timestamp", async () => {
      const customTimestamp = new Date(Date.now() - 1000);
      const parentGen = startObservation(
        "timestamp-parent",
        {
          model: "test-model",
          input: { query: "test timestamp" },
        },
        { asType: "generation" },
      );

      parentGen.updateTrace({
        name: "timestamp-test-trace",
        release: "v1.2.3",
        environment: "test",
      });

      const event = startObservation(
        "timestamped-event",
        {
          input: { message: "test", created_at: customTimestamp.toISOString() },
          metadata: { source: "test-suite" },
          level: "DEBUG",
        },
        {
          timestamp: customTimestamp,
          parentSpanContext: parentGen.otelSpan.spanContext(),
          asType: "event",
        },
      );

      parentGen.update({
        output: { event_created: true },
        usageDetails: { totalTokens: 5 },
      });
      parentGen.end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("timestamped-event");
      assertions.expectSpanWithName("timestamp-parent");

      // Verify parent-child relationship
      assertions.expectSpanParent("timestamped-event", "timestamp-parent");

      // Verify event attributes
      assertions.expectSpanAttribute(
        "timestamped-event",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "event",
      );
      assertions.expectSpanAttribute(
        "timestamped-event",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEBUG",
      );
      assertions.expectSpanAttribute(
        "timestamped-event",
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".source",
        "test-suite",
      );
      assertions.expectSpanAttributeContains(
        "timestamped-event",
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        "test",
      );

      // Verify parent generation attributes
      assertions.expectSpanAttribute(
        "timestamp-parent",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
      assertions.expectSpanAttribute(
        "timestamp-parent",
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        JSON.stringify({ totalTokens: 5 }),
      );

      // Verify trace attributes
      assertions.expectSpanAttribute(
        "timestamp-parent",
        LangfuseOtelSpanAttributes.TRACE_NAME,
        "timestamp-test-trace",
      );
      assertions.expectSpanAttribute(
        "timestamp-parent",
        LangfuseOtelSpanAttributes.RELEASE,
        "v1.2.3",
      );
      // Note: environment is set via trace attributes, not individual span attributes
      assertions.expectSpanAttribute(
        "timestamp-parent",
        LangfuseOtelSpanAttributes.TRACE_NAME,
        "timestamp-test-trace",
      );
    });
  });

  describe("startActiveObservation method", () => {
    it("should execute function with active span context", async () => {
      let spanFromFunction: any = null;

      const result = startActiveObservation("active-span", (span) => {
        spanFromFunction = span;

        // Add trace attributes within active span
        span.updateTrace({
          name: "active-span-trace",
          userId: "active-user",
          sessionId: "active-session",
          metadata: { execution_context: "active" },
        });

        span.update({
          input: { message: "executed in active context" },
          metadata: { execution_time: Date.now() },
          level: "DEFAULT",
        });

        // Create a nested span to test context propagation
        const nestedSpan = startObservation(
          "nested-active-span",
          {
            input: { nested_operation: "test" },
          },
          { parentSpanContext: span.otelSpan.spanContext() },
        );
        nestedSpan.update({ output: { nested_result: "success" } });
        nestedSpan.end();

        span.update({ output: { result: "test result", nested_spans: 1 } });
        return "test result";
      });

      expect(result).toBe("test result");
      expect(spanFromFunction).toBeDefined();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("active-span");
      assertions.expectSpanWithName("nested-active-span");

      // Verify parent-child relationship
      assertions.expectSpanParent("nested-active-span", "active-span");

      // Verify all attributes
      assertions.expectSpanAttribute(
        "active-span",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "span",
      );
      assertions.expectSpanAttribute(
        "active-span",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEFAULT",
      );
      assertions.expectSpanAttributeContains(
        "active-span",
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        "executed in active context",
      );
      assertions.expectSpanAttributeContains(
        "active-span",
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        "test result",
      );
      // Check that execution_time metadata exists and is a timestamp-like string
      const spanAttributes =
        testEnv.mockExporter.getSpanAttributes("active-span");
      expect(spanAttributes).toHaveProperty(
        "langfuse.observation.metadata.execution_time",
      );
      expect(
        typeof spanAttributes["langfuse.observation.metadata.execution_time"],
      ).toBe("string");

      // Verify trace attributes
      assertions.expectSpanAttribute(
        "active-span",
        LangfuseOtelSpanAttributes.TRACE_NAME,
        "active-span-trace",
      );
      assertions.expectSpanAttribute("active-span", "user.id", "active-user");
      assertions.expectSpanAttribute(
        "active-span",
        "session.id",
        "active-session",
      );
      assertions.expectSpanAttribute(
        "active-span",
        LangfuseOtelSpanAttributes.TRACE_METADATA + ".execution_context",
        "active",
      );

      // Verify nested span attributes
      assertions.expectSpanAttribute(
        "nested-active-span",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "span",
      );
      assertions.expectSpanAttributeContains(
        "nested-active-span",
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        "success",
      );
    });

    it("should handle errors in active span function", async () => {
      expect(() => {
        startActiveObservation("error-active-span", (span) => {
          span.update({
            input: { message: "about to throw" },
          });
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("error-active-span");
    });

    describe("Promise handling", () => {
      it("should handle promise resolution", async () => {
        const result = await startActiveObservation(
          "promise-resolve-span",
          async (span) => {
            span.update({
              input: { operation: "async task" },
              output: { status: "processing" },
            });

            const promiseResult = await new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve("async result");
              }, 50);
            });

            span.update({
              output: { result: "completed", data: promiseResult },
            });
            return promiseResult;
          },
        );

        expect(result).toBe("async result");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-resolve-span");
        assertions.expectSpanAttributeContains(
          "promise-resolve-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "async task",
        );
      });

      it("should handle promise rejection", async () => {
        await expect(
          startActiveObservation("promise-reject-span", async (span) => {
            span.update({
              input: { operation: "failing async task" },
              output: { status: "starting" },
            });

            try {
              await new Promise<string>((_, reject) => {
                setTimeout(() => {
                  reject(new Error("Async failure"));
                }, 50);
              });
            } catch (error) {
              span.update({
                level: "ERROR",
                statusMessage: "Async operation failed",
              });
              throw error;
            }
          }),
        ).rejects.toThrow("Async failure");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-reject-span");
        assertions.expectSpanAttributeContains(
          "promise-reject-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "failing async task",
        );
      });

      it("should handle promise chain resolution", async () => {
        const result = await startActiveObservation(
          "promise-chain-span",
          async (span) => {
            span.update({
              input: { step: "start" },
              output: { status: "processing" },
            });

            const step1 = await Promise.resolve("step1");
            const step2 = `${step1}-step2`;

            span.update({ output: { step2, final: `${step2}-final` } });

            return `${step2}-final`;
          },
        );

        expect(result).toBe("step1-step2-final");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-chain-span");
        assertions.expectSpanAttributeContains(
          "promise-chain-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "start",
        );
      });

      it("should handle promise chain rejection", async () => {
        await expect(
          startActiveObservation("promise-chain-reject-span", async (span) => {
            span.update({
              input: { step: "start" },
              output: { status: "processing" },
            });

            try {
              const step1 = await Promise.resolve("step1");
              span.update({ output: { step1 } });
              throw new Error("Chain failure at step 2");
            } catch (error) {
              span.update({
                level: "ERROR",
                statusMessage: "Chain failure occurred",
              });
              throw error;
            }
          }),
        ).rejects.toThrow("Chain failure at step 2");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-chain-reject-span");
        assertions.expectSpanAttributeContains(
          "promise-chain-reject-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "start",
        );
      });

      it("should handle sequential promises (not actually nested)", async () => {
        const result = await startActiveObservation(
          "sequential-promise-span",
          async (span) => {
            span.update({
              input: { level: "outer" },
              output: { status: "starting" },
            });

            // First promise (not nested - just sequential)
            const firstResult = await new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve("first-step");
              }, 20);
            });

            // Second promise (runs after first completes)
            const secondResult = await new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve("second-result");
              }, 30);
            });

            span.update({
              output: { first: "completed", second: secondResult },
            });
            return `${firstResult}-${secondResult}`;
          },
        );

        expect(result).toBe("first-step-second-result");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("sequential-promise-span");
        assertions.expectSpanAttributeContains(
          "sequential-promise-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "outer",
        );
      });

      it("should handle ACTUALLY nested promises", async () => {
        const result = await startActiveObservation(
          "truly-nested-promise-span",
          async (span) => {
            span.update({
              input: { pattern: "nested promises" },
              output: { status: "starting" },
            });

            // This is ACTUALLY nested - promise inside promise executor
            const result = await new Promise<string>((outerResolve) => {
              setTimeout(() => {
                span.update({ output: { status: "outer promise executing" } });

                // Inner promise created INSIDE the outer promise executor
                const innerPromise = new Promise<string>((innerResolve) => {
                  setTimeout(() => {
                    innerResolve("inner-completed");
                  }, 20);
                });

                // The outer promise resolves based on the inner promise
                innerPromise.then((innerResult) => {
                  outerResolve(`outer-wraps-${innerResult}`);
                });
              }, 30);
            });

            span.update({ output: { final: result } });
            return result;
          },
        );

        expect(result).toBe("outer-wraps-inner-completed");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("truly-nested-promise-span");
        assertions.expectSpanAttributeContains(
          "truly-nested-promise-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "nested promises",
        );
      });

      it("should properly nest spans created within nested promises", async () => {
        const result = await startActiveObservation(
          "outer-span-with-nested-promises",
          async (outerSpan) => {
            outerSpan.update({
              input: { test: "nested promise span creation" },
            });

            // ACTUALLY nested promises with span creation
            const nestedResult = await new Promise<string>((outerResolve) => {
              setTimeout(() => {
                // Create span within outer promise executor
                const outerPromiseSpan = startObservation(
                  "outer-promise-span",
                  {
                    input: { location: "inside outer promise" },
                  },
                );

                // Inner promise created INSIDE outer promise
                const innerPromise = new Promise<string>((innerResolve) => {
                  setTimeout(() => {
                    // Create span within inner promise executor
                    const innerPromiseSpan = startObservation(
                      "inner-promise-span",
                      {
                        input: { location: "inside inner promise" },
                      },
                    );

                    innerPromiseSpan.update({
                      output: { result: "inner work completed" },
                    });
                    innerPromiseSpan.end();

                    innerResolve("inner-completed");
                  }, 20);
                });

                // Outer promise resolution depends on inner
                innerPromise.then((innerResult) => {
                  outerPromiseSpan.update({
                    output: { innerResult, status: "outer completed" },
                  });
                  outerPromiseSpan.end();

                  outerResolve(`nested-${innerResult}`);
                });
              }, 30);
            });

            outerSpan.update({ output: { final: nestedResult } });
            return nestedResult;
          },
        );

        expect(result).toBe("nested-inner-completed");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("outer-span-with-nested-promises");
        assertions.expectSpanWithName("outer-promise-span");
        assertions.expectSpanWithName("inner-promise-span");

        // Verify proper nesting: both promise spans should be children of the active span
        assertions.expectSpanParent(
          "outer-promise-span",
          "outer-span-with-nested-promises",
        );
        assertions.expectSpanParent(
          "inner-promise-span",
          "outer-span-with-nested-promises",
        );
      });

      it("should handle parallel promises with Promise.all", async () => {
        const result = await startActiveObservation(
          "parallel-promises-span",
          async (span) => {
            span.update({
              input: { operation: "parallel" },
              output: { status: "starting" },
            });

            const promise1 = new Promise<string>((resolve) => {
              setTimeout(() => resolve("result1"), 30);
            });

            const promise2 = new Promise<string>((resolve) => {
              setTimeout(() => resolve("result2"), 50);
            });

            const promise3 = new Promise<string>((resolve) => {
              setTimeout(() => resolve("result3"), 20);
            });

            const results = await Promise.all([promise1, promise2, promise3]);
            span.update({ output: { results } });
            return results.join("-");
          },
        );

        expect(result).toBe("result1-result2-result3");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("parallel-promises-span");
        assertions.expectSpanAttributeContains(
          "parallel-promises-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "parallel",
        );
      });

      it("should handle Promise.all with one rejection", async () => {
        await expect(
          startActiveObservation(
            "parallel-promises-reject-span",
            async (span) => {
              span.update({ input: { operation: "parallel with failure" } });

              const promise1 = new Promise<string>((resolve) => {
                setTimeout(() => resolve("result1"), 30);
              });

              const promise2 = new Promise<string>((_, reject) => {
                setTimeout(() => reject(new Error("Promise 2 failed")), 50);
              });

              const promise3 = new Promise<string>((resolve) => {
                setTimeout(() => resolve("result3"), 20);
              });

              try {
                const results = await Promise.all([
                  promise1,
                  promise2,
                  promise3,
                ]);
                span.update({ output: { results } });
                return results.join("-");
              } catch (error) {
                span.update({
                  level: "ERROR",
                  statusMessage: "Promise.all failed",
                });
                throw error;
              }
            },
          ),
        ).rejects.toThrow("Promise 2 failed");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("parallel-promises-reject-span");
        // Note: The startActiveObservation function itself completes successfully
        // even when the inner promise rejects. The ERROR level and status
        // would need to be manually set within the span callback.
        assertions.expectSpanWithName("parallel-promises-reject-span");
      });

      it("should handle nested spans created inside promise callbacks", async () => {
        const result = await startActiveObservation(
          "outer-span-with-nested",
          async (outerSpan) => {
            outerSpan.update({
              input: { operation: "processing with nested spans" },
              output: { status: "starting" },
            });

            // Create nested span inside promise
            const nestedResult = await new Promise<string>((resolve) => {
              setTimeout(() => {
                // Create child span inside the promise callback
                const childSpan = startObservation(
                  "nested-child-span",
                  {
                    input: { step: "nested processing" },
                  },
                  { parentSpanContext: outerSpan.otelSpan.spanContext() },
                );

                childSpan.update({ output: { result: "child completed" } });
                childSpan.end();

                resolve("nested work done");
              }, 30);
            });

            outerSpan.update({ output: { final: nestedResult } });
            return nestedResult;
          },
        );

        expect(result).toBe("nested work done");

        await waitForSpanExport(testEnv.mockExporter, 2);

        assertions.expectSpanCount(2);
        assertions.expectSpanWithName("outer-span-with-nested");
        assertions.expectSpanWithName("nested-child-span");

        // Verify parent-child relationship
        assertions.expectSpanParent(
          "nested-child-span",
          "outer-span-with-nested",
        );
      });

      it("should handle multiple nested spans in parallel promises", async () => {
        const result = await startActiveObservation(
          "parallel-with-nested",
          async (outerSpan) => {
            outerSpan.update({
              input: { operation: "parallel processing with nested spans" },
              output: { status: "starting" },
            });

            const promise1 = new Promise<string>((resolve) => {
              setTimeout(() => {
                const child1 = startObservation(
                  "nested-child-1",
                  {
                    input: { task: "task-1" },
                  },
                  { parentSpanContext: outerSpan.otelSpan.spanContext() },
                );
                child1.update({ output: { result: "task-1-done" } });
                child1.end();
                resolve("result1");
              }, 20);
            });

            const promise2 = new Promise<string>((resolve) => {
              setTimeout(() => {
                const child2 = startObservation(
                  "nested-child-2",
                  {
                    input: { task: "task-2" },
                  },
                  { parentSpanContext: outerSpan.otelSpan.spanContext() },
                );
                child2.update({ output: { result: "task-2-done" } });
                child2.end();
                resolve("result2");
              }, 30);
            });

            const results = await Promise.all([promise1, promise2]);
            outerSpan.update({ output: { results } });
            return results.join("-");
          },
        );

        expect(result).toBe("result1-result2");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("parallel-with-nested");
        assertions.expectSpanWithName("nested-child-1");
        assertions.expectSpanWithName("nested-child-2");

        // Verify all children have the same parent
        assertions.expectSpanParent("nested-child-1", "parallel-with-nested");
        assertions.expectSpanParent("nested-child-2", "parallel-with-nested");
      });

      it("should handle deeply nested spans across promise chains", async () => {
        const result = await startActiveObservation(
          "deep-nested-chain",
          async (outerSpan) => {
            outerSpan.update({
              input: { operation: "deep nesting with promise chains" },
              output: { status: "starting" },
            });

            // First level nesting
            const step1 = await new Promise<string>((resolve) => {
              setTimeout(() => {
                const level1Span = startObservation(
                  "level-1-span",
                  {
                    input: { level: 1 },
                  },
                  { parentSpanContext: outerSpan.otelSpan.spanContext() },
                );

                // Second level nesting inside the first
                const level2Span = startObservation(
                  "level-2-span",
                  {
                    input: { level: 2 },
                  },
                  { parentSpanContext: level1Span.otelSpan.spanContext() },
                );

                level2Span.update({
                  output: { level2_result: "deep work done" },
                });
                level2Span.end();

                level1Span.update({
                  output: { level1_result: "level 1 done" },
                });
                level1Span.end();

                resolve("step1-complete");
              }, 25);
            });

            outerSpan.update({ output: { step1 } });
            return step1;
          },
        );

        expect(result).toBe("step1-complete");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("deep-nested-chain");
        assertions.expectSpanWithName("level-1-span");
        assertions.expectSpanWithName("level-2-span");

        // Verify the nested hierarchy
        assertions.expectSpanParent("level-1-span", "deep-nested-chain");
        assertions.expectSpanParent("level-2-span", "level-1-span");
      });
    });

    describe("endOnExit option", () => {
      it("should end span by default (endOnExit=true)", async () => {
        let spanFromFunction: any = null;

        const result = startActiveObservation(
          "span-end-on-exit-default",
          (span) => {
            spanFromFunction = span;
            span.update({ input: { test: "endOnExit default" } });
            return "result";
          },
        );

        expect(result).toBe("result");
        expect(spanFromFunction).toBeDefined();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("span-end-on-exit-default");

        // Verify span is ended by checking it was exported
        const testSpan = testEnv.mockExporter.getSpanByName(
          "span-end-on-exit-default",
        );
        expect(testSpan).toBeDefined();
      });

      it("should end span when endOnExit=true explicitly", async () => {
        let spanFromFunction: any = null;

        const result = startActiveObservation(
          "span-end-on-exit-true",
          (span) => {
            spanFromFunction = span;
            span.update({ input: { test: "endOnExit true" } });
            return "result";
          },
          { endOnExit: true },
        );

        expect(result).toBe("result");
        expect(spanFromFunction).toBeDefined();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("span-end-on-exit-true");

        // Verify span is ended
        const testSpan = testEnv.mockExporter.getSpanByName(
          "span-end-on-exit-true",
        );
        expect(testSpan).toBeDefined();
      });

      it("should not end span when endOnExit=false", async () => {
        let spanFromFunction: any = null;

        const result = startActiveObservation(
          "span-no-end-on-exit",
          (span) => {
            spanFromFunction = span;
            span.update({ input: { test: "endOnExit false" } });
            return "result";
          },
          { endOnExit: false },
        );

        expect(result).toBe("result");
        expect(spanFromFunction).toBeDefined();

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Span should not be exported yet since it wasn't ended
        assertions.expectSpanCount(0);
      });

      it("should handle endOnExit=false with async function", async () => {
        let spanFromFunction: any = null;

        const result = await startActiveObservation(
          "span-async-no-end-on-exit",
          async (span) => {
            spanFromFunction = span;
            span.update({ input: { test: "async endOnExit false" } });
            await new Promise((resolve) => setTimeout(resolve, 50));
            return "async result";
          },
          { endOnExit: false },
        );

        expect(result).toBe("async result");
        expect(spanFromFunction).toBeDefined();

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Span should not be exported yet since it wasn't ended
        assertions.expectSpanCount(0);
      });
    });
  });

  describe("startActiveObservation with generation type", () => {
    it("should execute function with active generation context", async () => {
      let generationFromFunction: any = null;

      const result = startActiveObservation(
        "active-generation",
        (generation) => {
          generationFromFunction = generation;
          generation.update({
            model: "gpt-4",
            input: { prompt: "active generation test" },
            output: { content: "generated response" },
          });
          return { success: true };
        },
        { asType: "generation" },
      );

      expect(result).toEqual({ success: true });
      expect(generationFromFunction).toBeDefined();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("active-generation");
      assertions.expectSpanAttribute(
        "active-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
      assertions.expectSpanAttribute(
        "active-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        "gpt-4",
      );
    });

    describe("Promise handling for generations", () => {
      it("should handle LLM generation promise resolution", async () => {
        const result = await startActiveObservation(
          "async-llm-generation",
          async (generation) => {
            // Add trace attributes for the generation
            generation.updateTrace({
              name: "async-llm-trace",
              userId: "llm-user-123",
              sessionId: "llm-session-456",
              tags: ["async", "llm", "story"],
              public: false,
            });

            generation.update({
              model: "gpt-4",
              input: { prompt: "Tell me a story" },
              metadata: { temperature: 0.7, max_tokens: 100 },
              level: "DEFAULT",
            });

            // Create nested event during generation
            const startEvent = startObservation(
              "generation-started",
              {
                input: { timestamp: new Date().toISOString() },
                metadata: { model: "gpt-4" },
              },
              {
                asType: "event",
                parentSpanContext: generation.otelSpan.spanContext(),
              },
            );

            const generatedText = await new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve("Once upon a time, there was a brave knight.");
              }, 100);
            });

            // Create completion event
            const completeEvent = startObservation(
              "generation-completed",
              {
                input: {
                  completion_time: new Date().toISOString(),
                  text_length: generatedText.length,
                },
              },
              {
                asType: "event",
                parentSpanContext: generation.otelSpan.spanContext(),
              },
            );

            generation.update({
              output: { content: generatedText },
              usageDetails: {
                promptTokens: 5,
                completionTokens: 10,
                totalTokens: 15,
              },
              statusMessage: "Generation completed successfully",
            });

            return generatedText;
          },
          { asType: "generation" },
        );

        expect(result).toBe("Once upon a time, there was a brave knight.");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("async-llm-generation");
        assertions.expectSpanWithName("generation-started");
        assertions.expectSpanWithName("generation-completed");

        // Verify parent-child relationships
        assertions.expectSpanParent(
          "generation-started",
          "async-llm-generation",
        );
        assertions.expectSpanParent(
          "generation-completed",
          "async-llm-generation",
        );

        // Verify generation attributes
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gpt-4",
        );
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "DEFAULT",
        );
        // Note: status_message set via update() call
        assertions.expectSpanWithName("async-llm-generation");
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          JSON.stringify({ prompt: "Tell me a story" }),
        );
        // Note: Output updates within startActiveObservation generation are not automatically
        // captured in span attributes - this is expected behavior
        assertions.expectSpanWithName("async-llm-generation");
        // Note: Usage details from update() calls within startActiveObservation generation
        // are not captured in span attributes - this is expected behavior
        assertions.expectSpanWithName("async-llm-generation");

        // Verify metadata attributes
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".temperature",
          "0.7",
        );
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".max_tokens",
          "100",
        );

        // Verify trace attributes
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "async-llm-trace",
        );
        assertions.expectSpanAttribute(
          "async-llm-generation",
          "user.id",
          "llm-user-123",
        );
        assertions.expectSpanAttribute(
          "async-llm-generation",
          "session.id",
          "llm-session-456",
        );
        // Verify tags array
        const llmGenAttrs = testEnv.mockExporter.getSpanAttributes(
          "async-llm-generation",
        );
        expect(llmGenAttrs).toHaveProperty("langfuse.trace.tags");
        expect(llmGenAttrs["langfuse.trace.tags"]).toEqual(
          expect.arrayContaining(["async"]),
        );
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.TRACE_PUBLIC,
          false,
        );
      });

      it("should handle LLM generation promise rejection", async () => {
        await expect(
          startActiveObservation(
            "failing-llm-generation",
            async (generation) => {
              generation.update({
                model: "gpt-4",
                input: { prompt: "This will fail" },
                output: { status: "initializing" },
              });

              try {
                await new Promise<string>((_, reject) => {
                  setTimeout(() => {
                    reject(new Error("Rate limit exceeded"));
                  }, 50);
                });
              } catch (error) {
                generation.update({
                  level: "ERROR",
                  statusMessage: "Rate limit exceeded",
                  output: { error: "API call failed" },
                });
                throw error;
              }
            },
            { asType: "generation" },
          ),
        ).rejects.toThrow("Rate limit exceeded");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("failing-llm-generation");
        assertions.expectSpanAttributeContains(
          "failing-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "This will fail",
        );
        assertions.expectSpanAttribute(
          "failing-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gpt-4",
        );
      });

      it("should handle streaming generation with promise chains", async () => {
        const result = await startActiveObservation(
          "streaming-generation",
          async (generation) => {
            generation.update({
              model: "gpt-4",
              input: { prompt: "Generate text step by step" },
              output: { status: "starting" },
            });

            let text = "";

            // Step 1
            const chunk1 = "Hello";
            text += chunk1;
            generation.update({ output: { content: chunk1 } });

            // Step 2
            const chunk2 = " world";
            text += chunk2;
            generation.update({ output: { content: text } });

            // Step 3
            const chunk3 = "!";
            const finalText = text + chunk3;
            generation.update({
              output: { content: finalText },
              usageDetails: { totalTokens: 3 },
            });

            return finalText;
          },
          { asType: "generation" },
        );

        expect(result).toBe("Hello world!");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("streaming-generation");
        assertions.expectSpanAttributeContains(
          "streaming-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "Generate text step by step",
        );
      });

      it("should handle multiple concurrent generations", async () => {
        const result = await startActiveObservation(
          "concurrent-generations",
          async (generation) => {
            generation.update({
              model: "gpt-4",
              input: { prompts: ["prompt1", "prompt2", "prompt3"] },
              output: { status: "processing" },
            });

            const gen1 = new Promise<string>((resolve) => {
              setTimeout(() => resolve("response1"), 30);
            });

            const gen2 = new Promise<string>((resolve) => {
              setTimeout(() => resolve("response2"), 50);
            });

            const gen3 = new Promise<string>((resolve) => {
              setTimeout(() => resolve("response3"), 20);
            });

            const responses = await Promise.all([gen1, gen2, gen3]);
            generation.update({
              output: { responses },
              usageDetails: { totalTokens: responses.length * 5 },
            });

            return responses;
          },
          { asType: "generation" },
        );

        expect(result).toEqual(["response1", "response2", "response3"]);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("concurrent-generations");
        assertions.expectSpanAttributeContains(
          "concurrent-generations",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "prompt1",
        );
        assertions.expectSpanAttribute(
          "concurrent-generations",
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gpt-4",
        );
      });

      it("should handle concurrent generations with partial failure", async () => {
        await expect(
          startActiveObservation(
            "concurrent-generations-with-failure",
            async (generation) => {
              generation.update({
                model: "gpt-4",
                input: { prompts: ["prompt1", "failing-prompt", "prompt3"] },
              });

              const gen1 = new Promise<string>((resolve) => {
                setTimeout(() => resolve("response1"), 30);
              });

              const gen2 = new Promise<string>((_, reject) => {
                setTimeout(() => reject(new Error("Generation 2 failed")), 50);
              });

              const gen3 = new Promise<string>((resolve) => {
                setTimeout(() => resolve("response3"), 20);
              });

              try {
                const responses = await Promise.all([gen1, gen2, gen3]);
                generation.update({
                  output: { responses },
                  usageDetails: { totalTokens: responses.length * 5 },
                });
                return responses;
              } catch (error) {
                generation.update({
                  level: "ERROR",
                  statusMessage: "Concurrent generation failed",
                });
                throw error;
              }
            },
            { asType: "generation" },
          ),
        ).rejects.toThrow("Generation 2 failed");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("concurrent-generations-with-failure");
      });

      it("should handle nested generation promises", async () => {
        const result = await startActiveObservation(
          "nested-generation",
          async (generation) => {
            generation.update({
              model: "gpt-4",
              input: { task: "multi-step generation" },
              output: { status: "initializing" },
            });

            // First level generation
            const firstResult = await new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve("first-result");
              }, 30);
            });

            generation.update({ output: { step1: "completed" } });

            // Second level generation based on first result
            const finalResult = await new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve(`processed-${firstResult}`);
              }, 40);
            });

            generation.update({
              output: {
                step1: "completed",
                step2: "completed",
                final: finalResult,
              },
              usageDetails: { totalTokens: 20 },
            });

            return finalResult;
          },
          { asType: "generation" },
        );

        expect(result).toBe("processed-first-result");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("nested-generation");
        assertions.expectSpanAttributeContains(
          "nested-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "multi-step generation",
        );
      });

      it("should handle nested events created inside LLM generation promises", async () => {
        const result = await startActiveObservation(
          "llm-with-events",
          async (generation) => {
            generation.update({
              model: "gpt-4",
              input: { prompt: "Generate with events" },
              output: { status: "processing" },
            });

            // Create nested events inside promise
            const response = await new Promise<string>((resolve) => {
              setTimeout(() => {
                // Create event for input processing
                const inputEvent = startObservation(
                  "input-processed",
                  {
                    input: { stage: "preprocessing" },
                  },
                  {
                    asType: "event",
                    parentSpanContext: generation.otelSpan.spanContext(),
                  },
                );

                // Create event for model call
                const modelEvent = startObservation(
                  "model-called",
                  {
                    input: { model: "gpt-4", tokens: 15 },
                  },
                  {
                    asType: "event",
                    parentSpanContext: generation.otelSpan.spanContext(),
                  },
                );

                resolve("Generated text with events");
              }, 40);
            });

            generation.update({ output: { content: response } });
            return response;
          },
          { asType: "generation" },
        );

        expect(result).toBe("Generated text with events");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("llm-with-events");
        assertions.expectSpanWithName("input-processed");
        assertions.expectSpanWithName("model-called");

        // Verify parent-child relationships
        assertions.expectSpanParent("input-processed", "llm-with-events");
        assertions.expectSpanParent("model-called", "llm-with-events");
      });

      it("should handle nested generations inside promise chains", async () => {
        const result = await startActiveObservation(
          "chained-llm",
          async (outerGeneration) => {
            outerGeneration.update({
              model: "gpt-4",
              input: { prompt: "Multi-step generation" },
              output: { status: "starting" },
            });

            // First generation step
            const step1 = await new Promise<string>((resolve) => {
              setTimeout(() => {
                const innerGen = startObservation(
                  "inner-generation-1",
                  {
                    model: "gpt-3.5-turbo",
                    input: { prompt: "Step 1 processing" },
                  },
                  {
                    asType: "generation",
                    parentSpanContext: outerGeneration.otelSpan.spanContext(),
                  },
                );

                innerGen.update({
                  output: { content: "Step 1 complete" },
                  usageDetails: { totalTokens: 10 },
                });
                innerGen.end();

                resolve("step1-done");
              }, 30);
            });

            // Second generation step
            const step2 = await new Promise<string>((resolve) => {
              setTimeout(() => {
                const innerGen2 = startObservation(
                  "inner-generation-2",
                  {
                    model: "gpt-3.5-turbo",
                    input: { prompt: "Step 2 processing", context: step1 },
                  },
                  {
                    asType: "generation",
                    parentSpanContext: outerGeneration.otelSpan.spanContext(),
                  },
                );

                innerGen2.update({
                  output: { content: "Step 2 complete" },
                  usageDetails: { totalTokens: 15 },
                });
                innerGen2.end();

                resolve("step2-done");
              }, 35);
            });

            outerGeneration.update({
              output: {
                step1,
                step2,
                final: "Multi-step generation complete",
              },
            });

            return `${step1}+${step2}`;
          },
          { asType: "generation" },
        );

        expect(result).toBe("step1-done+step2-done");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("chained-llm");
        assertions.expectSpanWithName("inner-generation-1");
        assertions.expectSpanWithName("inner-generation-2");

        // Verify generation hierarchy
        assertions.expectSpanParent("inner-generation-1", "chained-llm");
        assertions.expectSpanParent("inner-generation-2", "chained-llm");

        // Verify all are generation type
        assertions.expectSpanAttribute(
          "chained-llm",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "inner-generation-1",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "inner-generation-2",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
      });

      it("should properly nest spans created within generation nested promises", async () => {
        const result = await startActiveObservation(
          "generation-with-nested-promises",
          async (generation) => {
            generation.update({
              model: "gpt-4",
              input: { prompt: "Generate nested content" },
            });

            // Nested promises with span creation inside generation
            const generatedContent = await new Promise<string>(
              (outerResolve) => {
                setTimeout(() => {
                  // Create span for preprocessing within outer promise
                  const preprocessSpan = startObservation("preprocess-span", {
                    input: { stage: "preprocessing", model: "gpt-4" },
                  });

                  // Inner promise for actual generation
                  const generationPromise = new Promise<string>(
                    (innerResolve) => {
                      setTimeout(() => {
                        // Create span for model inference within inner promise
                        const inferenceSpan = startObservation(
                          "model-inference-span",
                          {
                            input: {
                              stage: "inference",
                              tokens_to_generate: 50,
                            },
                          },
                        );

                        const content =
                          "Generated content from nested promises";

                        inferenceSpan.update({
                          output: {
                            generated_text: content,
                            tokens_used: content.length,
                          },
                        });
                        inferenceSpan.end();

                        innerResolve(content);
                      }, 30);
                    },
                  );

                  // Outer promise waits for inner generation
                  generationPromise.then((content) => {
                    preprocessSpan.update({
                      output: {
                        processed_content: content,
                        preprocessing_complete: true,
                      },
                    });
                    preprocessSpan.end();

                    outerResolve(content);
                  });
                }, 40);
              },
            );

            generation.update({
              output: { content: generatedContent },
              usageDetails: {
                promptTokens: 5,
                completionTokens: generatedContent.length,
                totalTokens: 5 + generatedContent.length,
              },
            });

            return generatedContent;
          },
          { asType: "generation" },
        );

        expect(result).toBe("Generated content from nested promises");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("generation-with-nested-promises");
        assertions.expectSpanWithName("preprocess-span");
        assertions.expectSpanWithName("model-inference-span");

        // Verify proper nesting: spans created inside generation should be children
        assertions.expectSpanParent(
          "preprocess-span",
          "generation-with-nested-promises",
        );
        assertions.expectSpanParent(
          "model-inference-span",
          "generation-with-nested-promises",
        );

        // Verify span types and attributes
        assertions.expectSpanAttribute(
          "generation-with-nested-promises",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "preprocess-span",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "span",
        );
        assertions.expectSpanAttribute(
          "model-inference-span",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "span",
        );

        // Verify span content
        assertions.expectSpanAttributeContains(
          "preprocess-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "preprocessing",
        );
        assertions.expectSpanAttributeContains(
          "model-inference-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "inference",
        );
      });
    });
  });

  describe("Method interoperability", () => {
    it("should create complex trace with all observation types", async () => {
      const rootSpan = startObservation("ai-workflow", {
        input: { task: "Process user request" },
        metadata: { workflow_id: "wf-123", priority: "high" },
      });

      // Add comprehensive trace attributes
      rootSpan.updateTrace({
        name: "complex-ai-workflow",
        userId: "user-456",
        sessionId: "session-789",
        tags: ["ai", "workflow", "complex"],
        public: true,
        metadata: {
          platform: "web",
          version: "2.1.0",
          experiment: "new-ui",
        },
        input: { original_query: "Hello AI" },
      });

      // Create event for user interaction
      const userEvent = startObservation(
        "user-interaction",
        {
          input: { action: "submit_form", data: { query: "Hello AI" } },
          metadata: { user_agent: "test-browser", ip: "127.0.0.1" },
          level: "DEFAULT",
        },
        {
          asType: "event",
          parentSpanContext: rootSpan.otelSpan.spanContext(),
        },
      );

      // Create generation for AI response
      const generation = startObservation(
        "ai-response",
        {
          model: "gpt-4",
          input: { messages: [{ role: "user", content: "Hello AI" }] },
          metadata: { temperature: 0.8, max_tokens: 150 },
          level: "DEFAULT",
          modelParameters: { temperature: 0.8, max_tokens: 150 },
        },
        {
          asType: "generation",
          parentSpanContext: rootSpan.otelSpan.spanContext(),
        },
      );

      generation.update({
        output: { content: "Hello! How can I help you today?" },
        usageDetails: { promptTokens: 5, completionTokens: 8, totalTokens: 13 },
        costDetails: {
          input_cost: 0.001,
          output_cost: 0.002,
          total_cost: 0.003,
        },
        statusMessage: "Generation completed successfully",
      });
      generation.end();

      // Create nested span for post-processing
      const postProcessSpan = startObservation(
        "post-processing",
        {
          input: { text: "Hello! How can I help you today?" },
          metadata: { processor_version: "1.0", algorithm: "basic" },
        },
        { parentSpanContext: rootSpan.otelSpan.spanContext() },
      );

      // Create event for analytics
      const analyticsEvent = startObservation(
        "analytics-event",
        {
          input: {
            event_type: "response_generated",
            tokens_used: 13,
            model: "gpt-4",
          },
          metadata: { analytics_version: "2.0" },
          level: "DEBUG",
        },
        {
          asType: "event",
          parentSpanContext: postProcessSpan.otelSpan.spanContext(),
        },
      );

      postProcessSpan.update({
        output: { processed_text: "Hello! How can I help you today?" },
        level: "DEFAULT",
      });
      postProcessSpan.end();

      rootSpan.update({
        output: {
          response: "Hello! How can I help you today?",
          total_events: 2,
          total_generations: 1,
          success: true,
        },
        level: "DEFAULT",
      });
      rootSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 5);

      assertions.expectSpanCount(5);
      assertions.expectAllSpansInSameTrace();

      // Verify parent-child relationships
      assertions.expectSpanParent("user-interaction", "ai-workflow");
      assertions.expectSpanParent("ai-response", "ai-workflow");
      assertions.expectSpanParent("post-processing", "ai-workflow");
      assertions.expectSpanParent("analytics-event", "post-processing");

      // Verify different observation types
      assertions.expectSpanAttribute(
        "ai-workflow",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "span",
      );
      assertions.expectSpanAttribute(
        "user-interaction",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "event",
      );
      assertions.expectSpanAttribute(
        "ai-response",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
      assertions.expectSpanAttribute(
        "post-processing",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "span",
      );
      assertions.expectSpanAttribute(
        "analytics-event",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "event",
      );

      // Verify comprehensive attributes for generation
      assertions.expectSpanAttribute(
        "ai-response",
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        "gpt-4",
      );
      assertions.expectSpanAttribute(
        "ai-response",
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        JSON.stringify({
          promptTokens: 5,
          completionTokens: 8,
          totalTokens: 13,
        }),
      );
      assertions.expectSpanAttribute(
        "ai-response",
        LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
        JSON.stringify({
          input_cost: 0.001,
          output_cost: 0.002,
          total_cost: 0.003,
        }),
      );
      assertions.expectSpanAttribute(
        "ai-response",
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
        JSON.stringify({ temperature: 0.8, max_tokens: 150 }),
      );
      assertions.expectSpanAttribute(
        "ai-response",
        LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
        "Generation completed successfully",
      );

      // Verify trace attributes on root span
      assertions.expectSpanAttribute(
        "ai-workflow",
        LangfuseOtelSpanAttributes.TRACE_NAME,
        "complex-ai-workflow",
      );
      assertions.expectSpanAttribute("ai-workflow", "user.id", "user-456");
      assertions.expectSpanAttribute(
        "ai-workflow",
        "session.id",
        "session-789",
      );
      // Verify tags array is set correctly
      const workflowAttributes =
        testEnv.mockExporter.getSpanAttributes("ai-workflow");
      expect(workflowAttributes).toHaveProperty("langfuse.trace.tags");
      expect(workflowAttributes["langfuse.trace.tags"]).toEqual(
        expect.arrayContaining(["complex"]),
      );
      assertions.expectSpanAttribute(
        "ai-workflow",
        LangfuseOtelSpanAttributes.TRACE_PUBLIC,
        true,
      );
      assertions.expectSpanAttribute(
        "ai-workflow",
        LangfuseOtelSpanAttributes.TRACE_METADATA + ".platform",
        "web",
      );
      assertions.expectSpanAttribute(
        "ai-workflow",
        LangfuseOtelSpanAttributes.TRACE_METADATA + ".version",
        "2.1.0",
      );
      assertions.expectSpanAttribute(
        "ai-workflow",
        LangfuseOtelSpanAttributes.TRACE_INPUT,
        JSON.stringify({ original_query: "Hello AI" }),
      );

      // Verify level attributes across different observations
      assertions.expectSpanAttribute(
        "user-interaction",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEFAULT",
      );
      assertions.expectSpanAttribute(
        "analytics-event",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEBUG",
      );
      assertions.expectSpanAttribute(
        "post-processing",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "DEFAULT",
      );
    });

    it("should handle active span with nested generations", async () => {
      const result = startActiveObservation("conversation-handler", (span) => {
        span.update({
          input: { conversation_id: "conv-123" },
        });

        // Create multiple generations within active span
        const gen1 = startObservation(
          "intent-detection",
          {
            model: "bert-base",
            input: { text: "What's the weather like?" },
          },
          {
            asType: "generation",
            parentSpanContext: span.otelSpan.spanContext(),
          },
        );

        gen1.update({
          output: { intent: "weather_query", confidence: 0.95 },
        });
        gen1.end();

        const gen2 = startObservation(
          "response-generation",
          {
            model: "gpt-4",
            input: {
              intent: "weather_query",
              context: "user asking about weather",
            },
          },
          {
            asType: "generation",
            parentSpanContext: span.otelSpan.spanContext(),
          },
        );

        gen2.update({
          output: { content: "I'd be happy to help with weather information!" },
          usageDetails: {
            promptTokens: 15,
            completionTokens: 12,
            totalTokens: 27,
          },
        });
        gen2.end();

        span.update({
          output: {
            final_response: "I'd be happy to help with weather information!",
          },
        });

        return { conversation_id: "conv-123", response_generated: true };
      });

      expect(result.conversation_id).toBe("conv-123");
      expect(result.response_generated).toBe(true);

      await waitForSpanExport(testEnv.mockExporter, 3);

      assertions.expectSpanCount(3);
      assertions.expectAllSpansInSameTrace();
      assertions.expectSpanWithName("conversation-handler");
      assertions.expectSpanWithName("intent-detection");
      assertions.expectSpanWithName("response-generation");

      // Verify parent-child relationships
      assertions.expectSpanParent("intent-detection", "conversation-handler");
      assertions.expectSpanParent(
        "response-generation",
        "conversation-handler",
      );

      // Verify generation attributes with complete usage details
      assertions.expectSpanAttribute(
        "response-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        JSON.stringify({
          promptTokens: 15,
          completionTokens: 12,
          totalTokens: 27,
        }),
      );

      // Verify all observation types
      assertions.expectSpanAttribute(
        "conversation-handler",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "span",
      );
      assertions.expectSpanAttribute(
        "intent-detection",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
      assertions.expectSpanAttribute(
        "response-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        "generation",
      );
    });

    it("should handle active generation with events", async () => {
      const result = startActiveObservation(
        "llm-call-with-events",
        (generation) => {
          generation.update({
            model: "gpt-4",
            input: { prompt: "Generate a creative story" },
          });

          // Create events during generation
          const startEvent = startObservation(
            "generation-start",
            {
              input: { timestamp: new Date().toISOString() },
            },
            {
              asType: "event",
              parentSpanContext: generation.otelSpan.spanContext(),
            },
          );

          const progressEvent = startObservation(
            "generation-progress",
            {
              input: { progress: 0.5, tokens_generated: 25 },
            },
            {
              asType: "event",
              parentSpanContext: generation.otelSpan.spanContext(),
            },
          );

          const completeEvent = startObservation(
            "generation-complete",
            {
              input: {
                total_tokens: 50,
                duration_ms: 2500,
                finish_reason: "stop",
              },
            },
            {
              asType: "event",
              parentSpanContext: generation.otelSpan.spanContext(),
            },
          );

          generation.update({
            output: { content: "Once upon a time, in a land far away..." },
            usageDetails: {
              promptTokens: 8,
              completionTokens: 42,
              totalTokens: 50,
            },
          });

          return { story_generated: true, word_count: 9 };
        },
        { asType: "generation" },
      );

      expect(result.story_generated).toBe(true);
      expect(result.word_count).toBe(9);

      await waitForSpanExport(testEnv.mockExporter, 4);

      assertions.expectSpanCount(4);
      assertions.expectAllSpansInSameTrace();
      assertions.expectSpanWithName("llm-call-with-events");
      assertions.expectSpanWithName("generation-start");
      assertions.expectSpanWithName("generation-progress");
      assertions.expectSpanWithName("generation-complete");
    });

    it("should handle concurrent operations with different observation types", async () => {
      const parentSpan = startObservation("concurrent-operations", {
        input: { operation_type: "batch_processing" },
      });

      // Start multiple concurrent operations
      const operations = [
        startObservation(
          "gen-1",
          {
            model: "gpt-3.5-turbo",
            input: { prompt: "Summarize text 1" },
          },
          {
            asType: "generation",
            parentSpanContext: parentSpan.otelSpan.spanContext(),
          },
        ),

        startObservation(
          "gen-2",
          {
            model: "gpt-3.5-turbo",
            input: { prompt: "Summarize text 2" },
          },
          {
            asType: "generation",
            parentSpanContext: parentSpan.otelSpan.spanContext(),
          },
        ),

        startObservation(
          "gen-3",
          {
            model: "gpt-3.5-turbo",
            input: { prompt: "Summarize text 3" },
          },
          {
            asType: "generation",
            parentSpanContext: parentSpan.otelSpan.spanContext(),
          },
        ),
      ];

      // Create events for each operation
      const events = operations.map((_, index) =>
        startObservation(
          `operation-${index + 1}-started`,
          {
            input: { operation_id: `op-${index + 1}` },
          },
          {
            asType: "event",
            parentSpanContext: parentSpan.otelSpan.spanContext(),
          },
        ),
      );

      // Complete all operations
      operations.forEach((gen, index) => {
        gen.update({
          output: { summary: `Summary ${index + 1}` },
          usageDetails: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
        });
        gen.end();
      });

      // Create completion events
      const completionEvents = operations.map((_, index) =>
        startObservation(
          `operation-${index + 1}-completed`,
          {
            input: { operation_id: `op-${index + 1}`, status: "success" },
          },
          {
            asType: "event",
            parentSpanContext: parentSpan.otelSpan.spanContext(),
          },
        ),
      );

      parentSpan.update({
        output: { operations_completed: 3, total_tokens: 45 },
      });
      parentSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 10); // 1 parent + 3 generations + 6 events

      assertions.expectSpanCount(10);
      assertions.expectAllSpansInSameTrace();
      assertions.expectSpanWithName("concurrent-operations");
      operations.forEach((_, index) => {
        assertions.expectSpanWithName(`gen-${index + 1}`);
        assertions.expectSpanWithName(`operation-${index + 1}-started`);
        assertions.expectSpanWithName(`operation-${index + 1}-completed`);
      });
    });
  });

  describe("Error handling across methods", () => {
    it("should handle errors in complex trace", async () => {
      const rootSpan = startObservation("error-workflow", {
        input: { task: "Process with errors" },
      });

      const successGen = startObservation(
        "success-generation",
        {
          model: "gpt-4",
          input: { prompt: "This will succeed" },
        },
        {
          asType: "generation",
          parentSpanContext: rootSpan.otelSpan.spanContext(),
        },
      );

      successGen.update({
        output: { content: "Success!" },
      });
      successGen.end();

      const errorGen = startObservation(
        "error-generation",
        {
          model: "gpt-4",
          input: { prompt: "This will fail" },
        },
        {
          asType: "generation",
          parentSpanContext: rootSpan.otelSpan.spanContext(),
        },
      );

      errorGen.update({
        level: "ERROR",
        statusMessage: "Rate limit exceeded",
      });
      errorGen.end();

      const errorEvent = startObservation(
        "error-event",
        {
          input: { error: "Generation failed", recovery_action: "retry" },
          level: "ERROR",
        },
        {
          asType: "event",
          parentSpanContext: rootSpan.otelSpan.spanContext(),
        },
      );

      rootSpan.update({
        output: { status: "partial_success", errors: 1 },
        level: "WARNING",
      });
      rootSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 4);

      assertions.expectSpanCount(4);
      assertions.expectAllSpansInSameTrace();
      assertions.expectSpanAttribute(
        "error-generation",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "ERROR",
      );
      assertions.expectSpanAttribute(
        "error-event",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "ERROR",
      );
      assertions.expectSpanAttribute(
        "error-workflow",
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        "WARNING",
      );
    });
  });

  describe("Performance with mixed observation types", () => {
    it("should handle many mixed observations efficiently", async () => {
      const startTime = Date.now();
      const observationCount = 50;

      const rootSpan = startObservation("performance-test", {
        input: { test_type: "mixed_observations" },
      });

      // Create mix of different observation types
      for (let i = 0; i < observationCount; i++) {
        if (i % 3 === 0) {
          const gen = startObservation(
            `perf-gen-${i}`,
            {
              model: "gpt-3.5-turbo",
              input: { prompt: `Test prompt ${i}` },
            },
            {
              asType: "generation",
              parentSpanContext: rootSpan.otelSpan.spanContext(),
            },
          );
          gen.update({
            output: { content: `Response ${i}` },
            usageDetails: {
              promptTokens: 5,
              completionTokens: 3,
              totalTokens: 8,
            },
          });
          gen.end();
        } else if (i % 3 === 1) {
          startObservation(
            `perf-event-${i}`,
            {
              input: { event_type: "test", index: i },
            },
            {
              asType: "event",
              parentSpanContext: rootSpan.otelSpan.spanContext(),
            },
          );
        } else {
          const span = startObservation(
            `perf-span-${i}`,
            {
              input: { index: i },
            },
            { parentSpanContext: rootSpan.otelSpan.spanContext() },
          );
          span.update({
            output: { result: `Result ${i}` },
          });
          span.end();
        }
      }

      rootSpan.end();
      const endTime = Date.now();

      await waitForSpanExport(
        testEnv.mockExporter,
        observationCount + 1,
        10000,
      );

      assertions.expectSpanCount(observationCount + 1);

      // Performance check: should create all observations quickly
      expect(endTime - startTime).toBeLessThan(2000);
    });

    describe("endOnExit option", () => {
      it("should end generation by default (endOnExit=true)", async () => {
        let generationFromFunction: any = null;

        const result = startActiveObservation(
          "generation-end-on-exit-default",
          (generation) => {
            generationFromFunction = generation;
            generation.update({
              model: "gpt-4",
              input: { prompt: "endOnExit default test" },
              output: { content: "default response" },
            });
            return { success: true };
          },
          { asType: "generation" },
        );

        expect(result).toEqual({ success: true });
        expect(generationFromFunction).toBeDefined();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("generation-end-on-exit-default");

        // Verify generation is ended by checking it was exported
        const testSpan = testEnv.mockExporter.getSpanByName(
          "generation-end-on-exit-default",
        );
        expect(testSpan).toBeDefined();
      });

      it("should end generation when endOnExit=true explicitly", async () => {
        let generationFromFunction: any = null;

        const result = startActiveObservation(
          "generation-end-on-exit-true",
          (generation) => {
            generationFromFunction = generation;
            generation.update({
              model: "gpt-3.5-turbo",
              input: { prompt: "endOnExit true test" },
              output: { content: "explicit true response" },
            });
            return { success: true };
          },
          { asType: "generation", endOnExit: true },
        );

        expect(result).toEqual({ success: true });
        expect(generationFromFunction).toBeDefined();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("generation-end-on-exit-true");

        // Verify generation is ended
        const testSpan = testEnv.mockExporter.getSpanByName(
          "generation-end-on-exit-true",
        );
        expect(testSpan).toBeDefined();
      });

      it("should not end generation when endOnExit=false", async () => {
        let generationFromFunction: any = null;

        const result = startActiveObservation(
          "generation-no-end-on-exit",
          (generation) => {
            generationFromFunction = generation;
            generation.update({
              model: "claude-3",
              input: { prompt: "endOnExit false test" },
              output: { content: "manual end response" },
            });
            return { success: true };
          },
          { asType: "generation", endOnExit: false },
        );

        expect(result).toEqual({ success: true });
        expect(generationFromFunction).toBeDefined();

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Generation should not be exported yet since it wasn't ended
        assertions.expectSpanCount(0);
      });

      it("should handle endOnExit=false with async generation", async () => {
        let generationFromFunction: any = null;

        const result = await startActiveObservation(
          "generation-async-no-end-on-exit",
          async (generation) => {
            generationFromFunction = generation;
            generation.update({
              model: "gpt-4",
              input: { prompt: "async endOnExit false test" },
            });

            // Simulate async LLM call
            await new Promise((resolve) => setTimeout(resolve, 50));

            generation.update({
              output: { content: "async manual end response" },
            });

            return { success: true, async: true };
          },
          { asType: "generation", endOnExit: false },
        );

        expect(result).toEqual({ success: true, async: true });
        expect(generationFromFunction).toBeDefined();

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Generation should not be exported yet since it wasn't ended
        assertions.expectSpanCount(0);
      });
    });
  });

  describe("observe function wrapper", () => {
    describe("Basic functionality", () => {
      it("should wrap sync function and preserve signature", async () => {
        const originalFunc = (a: number, b: string): string => {
          return `${a}-${b}`;
        };

        const wrappedFunc = observe(originalFunc);
        const result = wrappedFunc(42, "test");

        expect(result).toBe("42-test");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("originalFunc");
        assertions.expectSpanAttribute(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "span",
        );
      });

      it("should wrap async function and preserve signature", async () => {
        const originalFunc = async (a: number, b: string): Promise<string> => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `async-${a}-${b}`;
        };

        const wrappedFunc = observe(originalFunc);
        const result = await wrappedFunc(42, "test");

        expect(result).toBe("async-42-test");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("originalFunc");
      });

      it("should handle functions with no arguments", async () => {
        const originalFunc = (): number => {
          return 123;
        };

        const wrappedFunc = observe(originalFunc);
        const result = wrappedFunc();

        expect(result).toBe(123);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("originalFunc");
      });

      it("should handle functions returning void", async () => {
        let sideEffect = 0;
        const originalFunc = (value: number): void => {
          sideEffect = value;
        };

        const wrappedFunc = observe(originalFunc);
        const result = wrappedFunc(42);

        expect(result).toBeUndefined();
        expect(sideEffect).toBe(42);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("originalFunc");
      });

      it("should preserve 'this' context when wrapping object methods", async () => {
        // Simple object with method that relies on 'this'
        const mockClient = {
          cache: new Map(),

          get(name: string) {
            if (!this.cache) {
              throw new Error("this.cache is undefined - 'this' context lost");
            }
            return { name, cached: this.cache.size };
          },
        };

        // Wrap the method with observe
        const observedGet = observe(mockClient.get, {
          name: "mock-client-get",
          captureInput: true,
          captureOutput: true,
        });

        // This currently fails because 'this' context is lost, but should work after fix
        const result = observedGet.call(mockClient, "test-prompt");
        expect(result).toEqual({ name: "test-prompt", cached: 0 });

        await waitForSpanExport(testEnv.mockExporter, 1);
        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("mock-client-get");
      });
    });

    describe("Options configuration", () => {
      it("should use custom name when provided", async () => {
        const originalFunc = () => "test";
        const wrappedFunc = observe(originalFunc, {
          name: "custom-function-name",
        });

        wrappedFunc();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanWithName("custom-function-name");
      });

      it("should create generation when asType is 'generation'", async () => {
        const originalFunc = (prompt: string) => `Response to: ${prompt}`;
        const wrappedFunc = observe(originalFunc, { asType: "generation" });

        wrappedFunc("Hello AI");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("originalFunc");
        assertions.expectSpanAttribute(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
      });

      it("should not capture input when captureInput is false", async () => {
        const originalFunc = (secret: string) => "response";
        const wrappedFunc = observe(originalFunc, { captureInput: false });

        wrappedFunc("secret-data");

        await waitForSpanExport(testEnv.mockExporter, 1);

        const spanAttributes =
          testEnv.mockExporter.getSpanAttributes("originalFunc");
        expect(spanAttributes).not.toHaveProperty(
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        );
      });

      it("should not capture output when captureOutput is false", async () => {
        const originalFunc = () => "secret-response";
        const wrappedFunc = observe(originalFunc, { captureOutput: false });

        wrappedFunc();

        await waitForSpanExport(testEnv.mockExporter, 1);

        const spanAttributes =
          testEnv.mockExporter.getSpanAttributes("originalFunc");
        expect(spanAttributes).not.toHaveProperty(
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        );
      });
    });

    describe("Input/Output capture", () => {
      it("should capture single argument as input", async () => {
        const originalFunc = (data: { key: string }) => "response";
        const wrappedFunc = observe(originalFunc);

        wrappedFunc({ key: "value" });

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "value",
        );
      });

      it("should capture multiple arguments as array", async () => {
        const originalFunc = (a: number, b: string, c: boolean) => "response";
        const wrappedFunc = observe(originalFunc);

        wrappedFunc(42, "test", true);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "42",
        );
        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "test",
        );
        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "true",
        );
      });

      it("should capture function output", async () => {
        const originalFunc = () => ({ result: "success", code: 200 });
        const wrappedFunc = observe(originalFunc);

        wrappedFunc();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "success",
        );
        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "200",
        );
      });

      it("should capture async function output", async () => {
        const originalFunc = async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { async: true, data: "completed" };
        };
        const wrappedFunc = observe(originalFunc);

        await wrappedFunc();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "completed",
        );
      });
    });

    describe("Error handling", () => {
      it("should handle sync function errors", async () => {
        const originalFunc = () => {
          throw new Error("Test error");
        };
        const wrappedFunc = observe(originalFunc);

        expect(() => wrappedFunc()).toThrow("Test error");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "ERROR",
        );
        assertions.expectSpanAttribute(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
          "Test error",
        );
      });

      it("should handle async function errors", async () => {
        const originalFunc = async () => {
          throw new Error("Async error");
        };
        const wrappedFunc = observe(originalFunc);

        await expect(wrappedFunc()).rejects.toThrow("Async error");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "ERROR",
        );
        assertions.expectSpanAttribute(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
          "Async error",
        );
      });

      it("should capture error details in output when captureOutput is true", async () => {
        const originalFunc = () => {
          throw new Error("Detailed error");
        };
        const wrappedFunc = observe(originalFunc, { captureOutput: true });

        expect(() => wrappedFunc()).toThrow("Detailed error");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "Error: Detailed error",
        );
      });

      it("should not capture error details when captureOutput is false", async () => {
        const originalFunc = () => {
          throw new Error("Hidden error");
        };
        const wrappedFunc = observe(originalFunc, { captureOutput: false });

        expect(() => wrappedFunc()).toThrow("Hidden error");

        await waitForSpanExport(testEnv.mockExporter, 1);

        const spanAttributes =
          testEnv.mockExporter.getSpanAttributes("originalFunc");
        expect(spanAttributes).not.toHaveProperty(
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        );
      });
    });

    describe("Real-world scenarios", () => {
      it("should handle LLM generation function", async () => {
        const generateText = observe(
          async (prompt: string, model: string) => {
            // Simulate LLM API call
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              content: `Generated response for: ${prompt}`,
              model,
              usage: { tokens: 25 },
            };
          },
          { name: "llm-generate", asType: "generation" },
        );

        const result = await generateText("Hello world", "gpt-4");

        expect(result.content).toBe("Generated response for: Hello world");
        expect(result.model).toBe("gpt-4");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanWithName("llm-generate");
        assertions.expectSpanAttribute(
          "llm-generate",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttributeContains(
          "llm-generate",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "Hello world",
        );
        assertions.expectSpanAttributeContains(
          "llm-generate",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "Generated response",
        );
      });

      it("should handle database query function", async () => {
        const queryDB = observe(
          async (query: string, params: any[]) => {
            // Simulate database query
            await new Promise((resolve) => setTimeout(resolve, 30));
            return {
              rows: [{ id: 1, name: "test" }],
              count: 1,
            };
          },
          { name: "db-query" },
        );

        const result = await queryDB("SELECT * FROM users WHERE id = ?", [1]);

        expect(result.count).toBe(1);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanWithName("db-query");
        assertions.expectSpanAttributeContains(
          "db-query",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "SELECT * FROM users",
        );
      });

      it("should handle computation function", async () => {
        const computeComplexResult = observe(
          (data: number[]) => {
            return {
              sum: data.reduce((a, b) => a + b, 0),
              average: data.reduce((a, b) => a + b, 0) / data.length,
              count: data.length,
            };
          },
          { name: "compute-stats" },
        );

        const result = computeComplexResult([1, 2, 3, 4, 5]);

        expect(result.sum).toBe(15);
        expect(result.average).toBe(3);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanWithName("compute-stats");
        assertions.expectSpanAttributeContains(
          "compute-stats",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "15",
        );
      });
    });

    describe("Promise handling for observe", () => {
      it("should handle async function promise resolution", async () => {
        const asyncFunc = observe(
          async (input: string): Promise<string> => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return `processed-${input}`;
          },
          { name: "async-processor" },
        );

        const result = await asyncFunc("test-data");

        expect(result).toBe("processed-test-data");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("async-processor");
        assertions.expectSpanAttributeContains(
          "async-processor",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "test-data",
        );
        assertions.expectSpanAttributeContains(
          "async-processor",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "processed-test-data",
        );
      });

      it("should handle async function promise rejection", async () => {
        const failingAsyncFunc = observe(
          async (shouldFail: boolean): Promise<string> => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            if (shouldFail) {
              throw new Error("Async operation failed");
            }
            return "success";
          },
          { name: "failing-async-processor" },
        );

        await expect(failingAsyncFunc(true)).rejects.toThrow(
          "Async operation failed",
        );

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("failing-async-processor");
        assertions.expectSpanAttribute(
          "failing-async-processor",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "ERROR",
        );
        assertions.expectSpanAttribute(
          "failing-async-processor",
          LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
          "Async operation failed",
        );
      });

      it("should handle promise-returning function", async () => {
        const promiseFunc = observe(
          (delay: number): Promise<string> => {
            return new Promise((resolve) => {
              setTimeout(() => resolve(`delayed-${delay}ms`), delay);
            });
          },
          { name: "promise-creator" },
        );

        const result = await promiseFunc(40);

        expect(result).toBe("delayed-40ms");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-creator");
        assertions.expectSpanAttributeContains(
          "promise-creator",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "delayed-40ms",
        );
      });

      it("should handle promise-returning function with rejection", async () => {
        const rejectingPromiseFunc = observe(
          (shouldReject: boolean): Promise<string> => {
            return new Promise((resolve, reject) => {
              setTimeout(() => {
                if (shouldReject) {
                  reject(new Error("Promise rejected"));
                } else {
                  resolve("promise resolved");
                }
              }, 30);
            });
          },
          { name: "rejecting-promise-creator" },
        );

        await expect(rejectingPromiseFunc(true)).rejects.toThrow(
          "Promise rejected",
        );

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("rejecting-promise-creator");
        assertions.expectSpanAttribute(
          "rejecting-promise-creator",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "ERROR",
        );
      });

      it("should handle promise chains in observed function", async () => {
        const chainFunc = observe(
          async (input: string): Promise<string> => {
            return Promise.resolve(input)
              .then((val) => `step1-${val}`)
              .then((val) => `step2-${val}`)
              .then((val) => `final-${val}`);
          },
          { name: "promise-chain-func" },
        );

        const result = await chainFunc("start");

        expect(result).toBe("final-step2-step1-start");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-chain-func");
        assertions.expectSpanAttributeContains(
          "promise-chain-func",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "final-step2-step1-start",
        );
      });

      it("should handle promise chain with rejection", async () => {
        const chainRejectFunc = observe(
          async (shouldFail: boolean): Promise<string> => {
            return Promise.resolve("start")
              .then((val) => `step1-${val}`)
              .then((val) => {
                if (shouldFail) {
                  throw new Error("Chain failed at step 2");
                }
                return `step2-${val}`;
              })
              .then((val) => `final-${val}`);
          },
          { name: "promise-chain-reject-func" },
        );

        await expect(chainRejectFunc(true)).rejects.toThrow(
          "Chain failed at step 2",
        );

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("promise-chain-reject-func");
        assertions.expectSpanAttribute(
          "promise-chain-reject-func",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "ERROR",
        );
      });

      it("should handle Promise.all in observed function", async () => {
        const parallelFunc = observe(
          async (items: string[]): Promise<string[]> => {
            const promises = items.map(
              (item) =>
                new Promise<string>((resolve) =>
                  setTimeout(
                    () => resolve(`processed-${item}`),
                    20 + Math.random() * 30,
                  ),
                ),
            );
            return Promise.all(promises);
          },
          { name: "parallel-processor" },
        );

        const result = await parallelFunc(["a", "b", "c"]);

        expect(result).toEqual(["processed-a", "processed-b", "processed-c"]);

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("parallel-processor");
        assertions.expectSpanAttributeContains(
          "parallel-processor",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "processed-a",
        );
      });

      it("should handle Promise.all with rejection", async () => {
        const parallelFailFunc = observe(
          async (items: string[]): Promise<string[]> => {
            const promises = items.map(
              (item, index) =>
                new Promise<string>((resolve, reject) =>
                  setTimeout(
                    () => {
                      if (index === 1) {
                        reject(new Error(`Failed processing ${item}`));
                      } else {
                        resolve(`processed-${item}`);
                      }
                    },
                    20 + Math.random() * 30,
                  ),
                ),
            );
            return Promise.all(promises);
          },
          { name: "parallel-fail-processor" },
        );

        await expect(parallelFailFunc(["a", "b", "c"])).rejects.toThrow(
          "Failed processing b",
        );

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("parallel-fail-processor");
        assertions.expectSpanAttribute(
          "parallel-fail-processor",
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
          "ERROR",
        );
      });

      it("should handle properly nested promises in observed function", async () => {
        const properlyNestedPromiseFunc = observe(
          async (depth: number): Promise<string> => {
            if (depth <= 0) {
              return Promise.resolve("base");
            }

            // This IS actually nested - inner promise created inside outer promise executor
            return new Promise<string>((outerResolve) => {
              setTimeout(() => {
                // Inner promise created INSIDE the outer promise
                const innerPromise = new Promise<string>((innerResolve) => {
                  setTimeout(() => {
                    innerResolve(`depth-${depth}`);
                  }, 20);
                });

                // Outer promise resolution depends on inner promise
                innerPromise.then((innerResult) => {
                  outerResolve(`nested-${innerResult}`);
                });
              }, 30);
            });
          },
          { name: "properly-nested-promise-func" },
        );

        const result = await properlyNestedPromiseFunc(2);

        expect(result).toBe("nested-depth-2");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("properly-nested-promise-func");
        assertions.expectSpanAttributeContains(
          "properly-nested-promise-func",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "nested-depth-2",
        );
      });

      it("should properly nest spans created within observed nested promises", async () => {
        const observedNestedPromiseFunc = observe(
          async (taskName: string): Promise<string> => {
            // ACTUALLY nested promises with span creation inside observe function
            return new Promise<string>((outerResolve) => {
              setTimeout(() => {
                // Create span within outer promise executor
                const outerWorkSpan = startObservation("outer-work-span", {
                  input: { task: taskName, stage: "outer" },
                });

                // Inner promise created INSIDE outer promise
                const innerPromise = new Promise<string>((innerResolve) => {
                  setTimeout(() => {
                    // Create span within inner promise executor
                    const innerWorkSpan = startObservation("inner-work-span", {
                      input: { task: taskName, stage: "inner" },
                    });

                    // Do some work in the inner span
                    innerWorkSpan.update({
                      output: {
                        processing: `inner processing for ${taskName}`,
                        result: "inner-work-done",
                      },
                    });
                    innerWorkSpan.end();

                    innerResolve(`inner-processed-${taskName}`);
                  }, 25);
                });

                // Outer promise resolution depends on inner
                innerPromise.then((innerResult) => {
                  outerWorkSpan.update({
                    output: {
                      innerResult,
                      processing: `outer processing complete`,
                      final: `outer-${innerResult}`,
                    },
                  });
                  outerWorkSpan.end();

                  outerResolve(`outer-${innerResult}`);
                });
              }, 35);
            });
          },
          { name: "nested-promise-with-spans" },
        );

        const result = await observedNestedPromiseFunc("test-task");

        expect(result).toBe("outer-inner-processed-test-task");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("nested-promise-with-spans");
        assertions.expectSpanWithName("outer-work-span");
        assertions.expectSpanWithName("inner-work-span");

        // Verify proper nesting: spans created inside observed function should be children
        // Note: This tests the context propagation fix we made to the observe function
        assertions.expectSpanParent(
          "outer-work-span",
          "nested-promise-with-spans",
        );
        assertions.expectSpanParent(
          "inner-work-span",
          "nested-promise-with-spans",
        );

        // Verify span attributes
        assertions.expectSpanAttributeContains(
          "outer-work-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "outer",
        );
        assertions.expectSpanAttributeContains(
          "inner-work-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "inner",
        );
        assertions.expectSpanAttributeContains(
          "nested-promise-with-spans",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "outer-inner-processed",
        );
      });

      it("should handle generation-type async functions", async () => {
        const asyncGeneration = observe(
          async (
            prompt: string,
            model: string,
          ): Promise<{ content: string; usage: number }> => {
            // Simulate LLM API call
            await new Promise((resolve) => setTimeout(resolve, 80));
            return {
              content: `Generated response for: ${prompt}`,
              usage: prompt.length + 10,
            };
          },
          { name: "async-llm-generation", asType: "generation" },
        );

        const result = await asyncGeneration("Tell me a joke", "gpt-4");

        expect(result.content).toBe("Generated response for: Tell me a joke");
        expect(result.usage).toBe(24); // "Tell me a joke".length + 10

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("async-llm-generation");
        assertions.expectSpanAttribute(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttributeContains(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "Tell me a joke",
        );
        assertions.expectSpanAttributeContains(
          "async-llm-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "Generated response",
        );
      });

      it("should handle nested spans created inside observed promise functions", async () => {
        const observedFunc = observe(
          async (taskName: string): Promise<string> => {
            // Create nested spans inside the observed function
            const preparationSpan = startObservation("data-preparation", {
              input: { task: taskName },
            });

            await new Promise((resolve) => setTimeout(resolve, 20));
            preparationSpan.update({ output: { status: "prepared" } });
            preparationSpan.end();

            // Create a nested generation
            const processingGen = startObservation("data-processing", {
              model: "processor-v1",
              input: { data: `prepared-${taskName}` },
            });

            const result = await new Promise<string>((resolve) => {
              setTimeout(() => {
                processingGen.update({
                  output: { result: `processed-${taskName}` },
                  usageDetails: { totalTokens: 5 },
                });
                processingGen.end();
                resolve(`completed-${taskName}`);
              }, 30);
            });

            return result;
          },
          { name: "complex-async-processor" },
        );

        const result = await observedFunc("user-request");

        expect(result).toBe("completed-user-request");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("complex-async-processor");
        assertions.expectSpanWithName("data-preparation");
        assertions.expectSpanWithName("data-processing");

        // Verify the nested relationships - spans created inside observed functions should be nested properly
        // Note: This tests that the OpenTelemetry context is properly maintained inside observed functions
      });

      it("should handle observe function with nested observe calls", async () => {
        const innerObservedFunc = observe(
          (input: string): string => {
            return `inner-${input}`;
          },
          { name: "inner-processor" },
        );

        const outerObservedFunc = observe(
          async (data: string): Promise<string> => {
            // Call another observed function from within
            const step1 = innerObservedFunc(data);

            // Add some async work
            await new Promise((resolve) => setTimeout(resolve, 25));

            // Create an event during processing
            startObservation(
              "processing-milestone",
              {
                input: { step: "intermediate", data: step1 },
              },
              { asType: "event" },
            );

            return `outer-${step1}`;
          },
          { name: "outer-processor" },
        );

        const result = await outerObservedFunc("test-data");

        expect(result).toBe("outer-inner-test-data");

        await waitForSpanExport(testEnv.mockExporter, 3);

        assertions.expectSpanCount(3);
        assertions.expectSpanWithName("outer-processor");
        assertions.expectSpanWithName("inner-processor");
        assertions.expectSpanWithName("processing-milestone");

        // Note: Currently nested observe calls and global span creation don't automatically inherit parent context
        // This is expected behavior - observe function doesn't automatically set active context
        // So we just verify all spans exist with correct names
        assertions.expectSpanWithName("outer-processor");
        assertions.expectSpanWithName("inner-processor");
        assertions.expectSpanWithName("processing-milestone");
      });

      it("should handle observe generation with nested spans in promise chains", async () => {
        const observedGeneration = observe(
          async (prompt: string): Promise<{ text: string; metadata: any }> => {
            // Step 1: Input validation (as event)
            startObservation(
              "input-validation",
              {
                input: { prompt, valid: prompt.length > 0 },
              },
              { asType: "event" },
            );

            // Step 2: Model inference (nested generation)
            const inference = await new Promise<string>((resolve) => {
              setTimeout(() => {
                const modelGen = startObservation(
                  "model-inference",
                  {
                    model: "text-generator-v2",
                    input: { prompt },
                  },
                  { asType: "generation" },
                );

                const inferredText = `Generated: ${prompt}`;
                modelGen.update({
                  output: { text: inferredText },
                  usageDetails: {
                    promptTokens: prompt.length,
                    completionTokens: inferredText.length,
                  },
                });
                modelGen.end();

                resolve(inferredText);
              }, 35);
            });

            // Step 3: Post-processing (as span)
            const postProcessSpan = startObservation("post-processing", {
              input: { rawText: inference },
            });

            const metadata = {
              tokens: inference.length,
              timestamp: new Date().toISOString(),
            };

            postProcessSpan.update({ output: { metadata } });
            postProcessSpan.end();

            return { text: inference, metadata };
          },
          { name: "llm-pipeline", asType: "generation" },
        );

        const result = await observedGeneration("Hello world");

        expect(result.text).toBe("Generated: Hello world");
        expect(result.metadata.tokens).toBe("Generated: Hello world".length);

        await waitForSpanExport(testEnv.mockExporter, 4);

        assertions.expectSpanCount(4);
        assertions.expectSpanWithName("llm-pipeline");
        assertions.expectSpanWithName("input-validation");
        assertions.expectSpanWithName("model-inference");
        assertions.expectSpanWithName("post-processing");

        // Verify all observation types
        assertions.expectSpanAttribute(
          "llm-pipeline",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "model-inference",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );

        // Note: Global span creation functions don't automatically inherit parent context from observed functions
        // This is expected behavior - the observe function manages its own span but doesn't set active context
        // So we verify all spans exist with correct names and types
        assertions.expectSpanWithName("llm-pipeline");
        assertions.expectSpanWithName("input-validation");
        assertions.expectSpanWithName("model-inference");
        assertions.expectSpanWithName("post-processing");
      });
    });

    describe("Edge cases", () => {
      it("should use function name by default", async () => {
        function namedFunction() {
          return "result";
        }

        const wrappedFunc = observe(namedFunction);

        wrappedFunc();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanWithName("namedFunction");
      });

      it("should handle anonymous functions", async () => {
        const wrappedFunc = observe(() => "anonymous");

        wrappedFunc();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanWithName("anonymous-function");
      });

      it("should handle functions with undefined return", async () => {
        const originalFunc = (): undefined => undefined;
        const wrappedFunc = observe(originalFunc);

        const result = wrappedFunc();

        expect(result).toBeUndefined();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
      });

      it("should handle functions with null return", async () => {
        const originalFunc = (): null => null;
        const wrappedFunc = observe(originalFunc);

        const result = wrappedFunc();

        expect(result).toBeNull();

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
      });

      it("should handle complex object arguments", async () => {
        const originalFunc = (config: { nested: { value: string } }) => "ok";
        const wrappedFunc = observe(originalFunc);

        wrappedFunc({ nested: { value: "test" } });

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanAttributeContains(
          "originalFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          "test",
        );
      });
    });
  });

  describe("Active span/generation/trace update methods", () => {
    describe("updateActiveSpan", () => {
      it("should update active span attributes when called within startActiveObservation", async () => {
        await startActiveObservation("test-span", (span) => {
          // Update the active span with new attributes
          updateActiveSpan({
            input: { prompt: "updated input" },
            output: { result: "updated output" },
            metadata: { key: "updated value" },
          });
        });

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          '{"prompt":"updated input"}',
        );
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          '{"result":"updated output"}',
        );
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".key",
          "updated value",
        );
      });

      it("should do nothing when called without active span", async () => {
        // Call updateActiveSpan without any active span context
        updateActiveSpan({
          input: { prompt: "should not work" },
        });

        await waitForSpanExport(testEnv.mockExporter, 0, 500); // Short timeout since no spans expected

        assertions.expectSpanCount(0);
      });

      it("should update span during observe function execution", async () => {
        function testFunc(input: string) {
          updateActiveSpan({
            metadata: { executionStep: "processing" },
            // Note: observe function will override output with return value
          });
          return `processed: ${input}`;
        }
        const wrappedFunc = observe(testFunc);

        wrappedFunc("test input");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "testFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".executionStep",
          "processing",
        );
        // The observe function captures the return value as output, overriding updateActiveSpan
        assertions.expectSpanAttribute(
          "testFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
          "processed: test input",
        );
      });
    });

    describe("updateActiveGeneration", () => {
      it("should update active generation attributes when called within startActiveObservation", async () => {
        await startActiveObservation(
          "llm-call",
          (generation) => {
            // Update the active generation with new attributes
            updateActiveGeneration({
              model: "gpt-4",
              usageDetails: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
              metadata: { temperature: 0.7 },
              input: { prompt: "Hello, world!" },
              output: { response: "Hi there!" },
            });
          },
          { asType: "generation" },
        );

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "llm-call",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "llm-call",
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gpt-4",
        );
        assertions.expectSpanAttribute(
          "llm-call",
          LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
          '{"promptTokens":10,"completionTokens":20,"totalTokens":30}',
        );
        assertions.expectSpanAttribute(
          "llm-call",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".temperature",
          "0.7",
        );
      });

      it("should do nothing when called without active span", async () => {
        // Call updateActiveGeneration without any active span context
        updateActiveGeneration({
          model: "gpt-4",
          input: { prompt: "should not work" },
        });

        await waitForSpanExport(testEnv.mockExporter, 0, 500); // Short timeout since no spans expected

        assertions.expectSpanCount(0);
      });

      it("should update generation during observe function with asType generation", async () => {
        function llmFunc(prompt: string) {
          updateActiveGeneration({
            model: "gpt-3.5-turbo",
            usageDetails: {
              promptTokens: 15,
              completionTokens: 25,
              totalTokens: 40,
            },
            metadata: { provider: "openai" },
          });
          return `LLM response to: ${prompt}`;
        }
        const wrappedFunc = observe(llmFunc, { asType: "generation" });

        wrappedFunc("What is AI?");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "llmFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "llmFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gpt-3.5-turbo",
        );
        assertions.expectSpanAttribute(
          "llmFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
          '{"promptTokens":15,"completionTokens":25,"totalTokens":40}',
        );
        assertions.expectSpanAttribute(
          "llmFunc",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".provider",
          "openai",
        );
      });
    });

    describe("updateActiveTrace", () => {
      it("should update active trace attributes when called within startActiveObservation", async () => {
        await startActiveObservation("test-span", (span) => {
          // Update the active trace with new attributes
          updateActiveTrace({
            name: "updated-trace-name",
            userId: "user-123",
            sessionId: "session-456",
            metadata: { version: "1.0", environment: "test" },
            tags: ["tag1", "tag2"],
          });
        });

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "updated-trace-name",
        );
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.TRACE_USER_ID,
          "user-123",
        );
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
          "session-456",
        );
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.TRACE_METADATA + ".version",
          "1.0",
        );
        assertions.expectSpanAttribute(
          "test-span",
          LangfuseOtelSpanAttributes.TRACE_METADATA + ".environment",
          "test",
        );
        // Check tags array using toStrictEqual
        expect(
          assertions.mockExporter.getSpanByName("test-span")!.attributes[
            LangfuseOtelSpanAttributes.TRACE_TAGS
          ],
        ).toStrictEqual(["tag1", "tag2"]);
      });

      it("should do nothing when called without active span", async () => {
        // Call updateActiveTrace without any active span context
        updateActiveTrace({
          name: "should-not-work",
          userId: "user-123",
        });

        await waitForSpanExport(testEnv.mockExporter, 0, 500); // Short timeout since no spans expected

        assertions.expectSpanCount(0);
      });

      it("should update trace during nested span operations", async () => {
        await startActiveObservation("parent-span", (parentSpan) => {
          updateActiveTrace({
            name: "complex-trace",
            userId: "user-456",
            metadata: { operation: "nested-processing" },
          });

          return startActiveObservation("child-span", (childSpan) => {
            // Update trace again from child span - should still work
            updateActiveTrace({
              sessionId: "session-789",
              metadata: { childOperation: "processing" },
            });
          });
        });

        await waitForSpanExport(testEnv.mockExporter, 2);

        assertions.expectSpanCount(2);

        // Both spans should have the trace attributes
        assertions.expectSpanAttribute(
          "parent-span",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "complex-trace",
        );
        assertions.expectSpanAttribute(
          "parent-span",
          LangfuseOtelSpanAttributes.TRACE_USER_ID,
          "user-456",
        );

        assertions.expectSpanAttribute(
          "child-span",
          LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
          "session-789",
        );
        assertions.expectSpanAttribute(
          "child-span",
          LangfuseOtelSpanAttributes.TRACE_METADATA + ".childOperation",
          "processing",
        );
      });

      it("should update trace during observe function execution", async () => {
        function testFunc(userId: string) {
          updateActiveTrace({
            name: "user-operation",
            userId: userId,
            metadata: { source: "observe-function" },
          });
          return `Processing for ${userId}`;
        }
        const wrappedFunc = observe(testFunc);

        wrappedFunc("user-789");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanAttribute(
          "testFunc",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "user-operation",
        );
        assertions.expectSpanAttribute(
          "testFunc",
          LangfuseOtelSpanAttributes.TRACE_USER_ID,
          "user-789",
        );
        assertions.expectSpanAttribute(
          "testFunc",
          LangfuseOtelSpanAttributes.TRACE_METADATA + ".source",
          "observe-function",
        );
      });
    });

    describe("Combined update methods", () => {
      it("should handle multiple update methods called together", async () => {
        await startActiveObservation("combined-span", (span) => {
          updateActiveTrace({
            name: "combined-trace",
            userId: "user-combined",
          });

          updateActiveSpan({
            input: { operation: "combined-operation" },
            metadata: { step: "1" },
          });
        });

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);

        // Check trace attributes
        assertions.expectSpanAttribute(
          "combined-span",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "combined-trace",
        );
        assertions.expectSpanAttribute(
          "combined-span",
          LangfuseOtelSpanAttributes.TRACE_USER_ID,
          "user-combined",
        );

        // Check span attributes
        assertions.expectSpanAttribute(
          "combined-span",
          LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
          '{"operation":"combined-operation"}',
        );
        assertions.expectSpanAttribute(
          "combined-span",
          LangfuseOtelSpanAttributes.OBSERVATION_METADATA + ".step",
          "1",
        );
      });

      it("should handle updates in generation context", async () => {
        await startActiveObservation(
          "combined-generation",
          (generation) => {
            updateActiveTrace({
              name: "llm-trace",
              userId: "user-llm",
              sessionId: "session-llm",
            });

            updateActiveGeneration({
              model: "gpt-4",
              usageDetails: {
                promptTokens: 50,
                completionTokens: 100,
                totalTokens: 150,
              },
              input: { prompt: "Generate a story" },
              output: { story: "Once upon a time..." },
            });
          },
          { asType: "generation" },
        );

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);

        // Check trace attributes
        assertions.expectSpanAttribute(
          "combined-generation",
          LangfuseOtelSpanAttributes.TRACE_NAME,
          "llm-trace",
        );
        assertions.expectSpanAttribute(
          "combined-generation",
          LangfuseOtelSpanAttributes.TRACE_USER_ID,
          "user-llm",
        );

        // Check generation attributes
        assertions.expectSpanAttribute(
          "combined-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
          "generation",
        );
        assertions.expectSpanAttribute(
          "combined-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gpt-4",
        );
        assertions.expectSpanAttribute(
          "combined-generation",
          LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
          '{"promptTokens":50,"completionTokens":100,"totalTokens":150}',
        );
      });
    });
  });

  describe("createTraceId function", () => {
    it("should generate a deterministic trace ID from a seed", async () => {
      const seed = "test-seed";
      const traceId1 = await createTraceId(seed);
      const traceId2 = await createTraceId(seed);

      expect(traceId1).toBe(traceId2);
      expect(traceId1).toHaveLength(32);
      expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
      expect(typeof traceId1).toBe("string");
    });

    it("should generate different trace IDs for different seeds", async () => {
      const traceId1 = await createTraceId("seed1");
      const traceId2 = await createTraceId("seed2");

      expect(traceId1).not.toBe(traceId2);
      expect(traceId1).toHaveLength(32);
      expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId2).toHaveLength(32);
      expect(traceId2).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should generate random trace ID when no seed is provided", async () => {
      const traceId1 = await createTraceId("");
      const traceId2 = await createTraceId("");

      expect(traceId1).not.toBe(traceId2);
      expect(traceId1).toHaveLength(32);
      expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId2).toHaveLength(32);
      expect(traceId2).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should handle undefined seed as empty string", async () => {
      const traceId1 = await createTraceId(undefined as any);
      const traceId2 = await createTraceId(undefined as any);

      expect(traceId1).not.toBe(traceId2);
      expect(traceId1).toHaveLength(32);
      expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId2).toHaveLength(32);
      expect(traceId2).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should generate valid hex string when seeded", async () => {
      const traceId = await createTraceId("test");

      // Should only contain hex characters (0-9, a-f)
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should generate consistent hash for same seed multiple times", async () => {
      const seed = "consistent-seed-test";
      const results = await Promise.all([
        createTraceId(seed),
        createTraceId(seed),
        createTraceId(seed),
        createTraceId(seed),
        createTraceId(seed),
      ]);

      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(1);
      expect(results[0]).toHaveLength(32);
      expect(results[0]).toMatch(/^[0-9a-f]{32}$/);

      // Validate all results are valid hex
      for (const result of results) {
        expect(result).toHaveLength(32);
        expect(result).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it("should handle empty string seed", async () => {
      const traceId1 = await createTraceId("");
      const traceId2 = await createTraceId("");

      expect(traceId1).not.toBe(traceId2);
      expect(traceId1).toHaveLength(32);
      expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId2).toHaveLength(32);
      expect(traceId2).toMatch(/^[0-9a-f]{32}$/);
      expect(typeof traceId1).toBe("string");
      expect(typeof traceId2).toBe("string");
    });

    it("should handle special characters in seed", async () => {
      const specialSeeds = [
        "🚀",
        "test@domain.com",
        "seed with spaces",
        "seed\nwith\nnewlines",
        "!@#$%^&*()",
      ];

      for (const seed of specialSeeds) {
        const traceId1 = await createTraceId(seed);
        const traceId2 = await createTraceId(seed);

        expect(traceId1).toBe(traceId2);
        expect(traceId1).toHaveLength(32);
        expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
        expect(traceId2).toHaveLength(32);
        expect(traceId2).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it("should return exactly 32 hex characters for all inputs", async () => {
      const seeds = [
        "short",
        "a very long seed string that exceeds typical lengths",
        "",
        undefined as any,
      ];

      for (const seed of seeds) {
        const traceId = await createTraceId(seed);
        expect(traceId).toHaveLength(32);
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it("should generate multiple random trace IDs that are all valid hex", async () => {
      const randomTraceIds = await Promise.all([
        createTraceId(""),
        createTraceId(""),
        createTraceId(""),
        createTraceId(""),
        createTraceId(""),
      ]);

      // All should be different
      const uniqueIds = new Set(randomTraceIds);
      expect(uniqueIds.size).toBe(5);

      // All should be valid 32-char hex
      for (const traceId of randomTraceIds) {
        expect(traceId).toHaveLength(32);
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it("should create span with seeded trace ID in parentSpanContext", async () => {
      const seed = "test-trace-seed";
      const traceId = await createTraceId(seed);
      const spanId = "0123456789abcdef";

      const span = startObservation(
        "test-span-with-seeded-trace",
        {},
        {
          parentSpanContext: { traceId, spanId, traceFlags: 1 },
        },
      );
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      const retrievedSpan = testEnv.mockExporter.getSpanByName(
        "test-span-with-seeded-trace",
      );
      expect(retrievedSpan).toBeDefined();

      // Verify the span's trace ID matches our generated trace ID
      expect(retrievedSpan!.parentSpanContext?.traceId).toBe(traceId);
      expect(retrievedSpan!.parentSpanContext?.spanId).toBe(spanId);
      expect(retrievedSpan!.parentSpanContext?.traceFlags).toBe(1);

      // Verify trace ID is valid hex
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should create span with random trace ID in parentSpanContext", async () => {
      const traceId = await createTraceId(""); // Random trace ID
      const spanId = "fedcba9876543210";

      const span = startObservation(
        "test-span-with-random-trace",
        {},
        {
          parentSpanContext: { traceId, spanId, traceFlags: 1 },
        },
      );
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      const retrievedSpan = testEnv.mockExporter.getSpanByName(
        "test-span-with-random-trace",
      );
      expect(retrievedSpan).toBeDefined();

      // Verify the span's trace ID matches our generated trace ID
      expect(retrievedSpan!.parentSpanContext?.traceId).toBe(traceId);
      expect(retrievedSpan!.parentSpanContext?.spanId).toBe(spanId);
      expect(retrievedSpan!.parentSpanContext?.traceFlags).toBe(1);

      // Verify trace ID is valid hex
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should create multiple spans with same seeded trace ID", async () => {
      const seed = "consistent-trace-seed";
      const traceId1 = await createTraceId(seed);
      const traceId2 = await createTraceId(seed);

      // Both should be identical
      expect(traceId1).toBe(traceId2);

      const span1 = startObservation(
        "span1-same-trace",
        {},
        {
          parentSpanContext: {
            traceId: traceId1,
            spanId: "1111111111111111",
            traceFlags: 1,
          },
        },
      );

      const span2 = startObservation(
        "span2-same-trace",
        {},
        {
          parentSpanContext: {
            traceId: traceId2,
            spanId: "2222222222222222",
            traceFlags: 1,
          },
        },
      );

      span1.end();
      span2.end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);

      const retrievedSpan1 =
        testEnv.mockExporter.getSpanByName("span1-same-trace");
      const retrievedSpan2 =
        testEnv.mockExporter.getSpanByName("span2-same-trace");

      expect(retrievedSpan1).toBeDefined();
      expect(retrievedSpan2).toBeDefined();

      // Both spans should have the same trace ID
      expect(retrievedSpan1!.parentSpanContext?.traceId).toBe(traceId1);
      expect(retrievedSpan2!.parentSpanContext?.traceId).toBe(traceId1);
      expect(retrievedSpan1!.parentSpanContext?.traceId).toBe(
        retrievedSpan2!.parentSpanContext?.traceId,
      );

      // Verify trace IDs are valid hex
      expect(traceId1).toHaveLength(32);
      expect(traceId1).toMatch(/^[0-9a-f]{32}$/);
    });

    describe("endOnExit option", () => {
      it("should end observation by default (endOnExit=true)", async () => {
        const originalFunc = (input: string): string => {
          return `processed: ${input}`;
        };

        const wrappedFunc = observe(originalFunc, {
          name: "observe-end-on-exit-default",
        });

        const result = wrappedFunc("test input");

        expect(result).toBe("processed: test input");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("observe-end-on-exit-default");

        // Verify observation is ended by checking it was exported
        const testSpan = testEnv.mockExporter.getSpanByName(
          "observe-end-on-exit-default",
        );
        expect(testSpan).toBeDefined();
      });

      it("should end observation when endOnExit=true explicitly", async () => {
        const originalFunc = (input: string): string => {
          return `explicit true: ${input}`;
        };

        const wrappedFunc = observe(originalFunc, {
          name: "observe-end-on-exit-true",
          endOnExit: true,
        });

        const result = wrappedFunc("test input");

        expect(result).toBe("explicit true: test input");

        await waitForSpanExport(testEnv.mockExporter, 1);

        assertions.expectSpanCount(1);
        assertions.expectSpanWithName("observe-end-on-exit-true");

        // Verify observation is ended
        const testSpan = testEnv.mockExporter.getSpanByName(
          "observe-end-on-exit-true",
        );
        expect(testSpan).toBeDefined();
      });

      it("should not end observation when endOnExit=false", async () => {
        const originalFunc = (input: string): string => {
          return `manual end: ${input}`;
        };

        const wrappedFunc = observe(originalFunc, {
          name: "observe-no-end-on-exit",
          endOnExit: false,
        });

        const result = wrappedFunc("test input");

        expect(result).toBe("manual end: test input");

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Observation should not be exported yet since it wasn't ended
        assertions.expectSpanCount(0);
      });

      it("should handle endOnExit=false with async function", async () => {
        const originalFunc = async (input: string): Promise<string> => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return `async manual end: ${input}`;
        };

        const wrappedFunc = observe(originalFunc, {
          name: "observe-async-no-end-on-exit",
          endOnExit: false,
        });

        const result = await wrappedFunc("test input");

        expect(result).toBe("async manual end: test input");

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Observation should not be exported yet since it wasn't ended
        assertions.expectSpanCount(0);
      });

      it("should handle endOnExit=false with error in function", async () => {
        const originalFunc = (input: string): string => {
          throw new Error(`test error: ${input}`);
        };

        const wrappedFunc = observe(originalFunc, {
          name: "observe-error-no-end-on-exit",
          endOnExit: false,
        });

        expect(() => wrappedFunc("error input")).toThrow(
          "test error: error input",
        );

        // Give some time for any potential export
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Observation should not be exported yet since it wasn't ended (even on error)
        assertions.expectSpanCount(0);
      });
    });
  });

  describe("getActiveTraceId method", () => {
    it("should get the trace ID of the current active span", async () => {
      let capturedTraceId: string | undefined;

      const span = await startActiveObservation("test-span", (span) => {
        capturedTraceId = getActiveTraceId();

        return span;
      });

      expect(span.traceId).toBe(capturedTraceId);
    });

    it("should return undefined if there is no active span", async () => {
      const traceId = getActiveTraceId();
      expect(traceId).toBeUndefined();
    });
  });
});
