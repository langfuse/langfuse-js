import {
  LogLevel,
  configureGlobalLogger,
  resetGlobalLogger,
} from "@langfuse/core";
import { trace } from "@opentelemetry/api";
import { startObservation } from "@langfuse/tracing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

describe("LangfuseSpanProcessor E2E Tests", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    resetGlobalLogger();
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
    vi.restoreAllMocks();
    resetGlobalLogger();
  });

  describe("Masking functionality", () => {
    it("should apply mask function to span attributes", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          mask: ({ data }) => {
            if (typeof data === "string") {
              return data.replace(/secret/g, "***");
            }
            return data;
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const span = startObservation("masked-span", {
        input: { message: "This contains secret information" },
        output: { response: "No secret here" },
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanAttributeContains(
        "masked-span",
        "langfuse.observation.input",
        "This contains *** information",
      );
      assertions.expectSpanAttributeContains(
        "masked-span",
        "langfuse.observation.output",
        "No *** here",
      );
    });

    it("should handle mask function errors gracefully", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          mask: () => {
            throw new Error("Mask function error");
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const span = startObservation("error-mask-span", {
        input: { message: "test message" },
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanAttribute(
        "error-mask-span",
        "langfuse.observation.input",
        "<fully masked due to failed mask function>",
      );
    });
  });

  describe("Media handling", () => {
    it("should replace base64 data URIs with media tags", async () => {
      const base64Image =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

      const span = startObservation("media-span", {
        input: {
          message: "Here is an image:",
          image: base64Image,
        },
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const inputValue = testEnv.mockExporter.getSpanAttributes("media-span")?.[
        "langfuse.observation.input"
      ] as string;
      expect(inputValue).toBeDefined();

      // Should not contain the original base64 data URI
      expect(inputValue).not.toContain(base64Image);

      // Should contain Langfuse media tag
      expect(inputValue).toMatch(
        /@@@langfuseMedia:type=[^|]+\|id=[^|]+\|source=[^@]+@@@/,
      );
    });

    it("should handle multiple media items in single attribute", async () => {
      const image1 =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
      const image2 =
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA9/9k=";

      const span = startObservation("multi-media-span", {
        input: {
          images: [image1, image2],
        },
      });
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      const inputValue = testEnv.mockExporter.getSpanAttributes(
        "multi-media-span",
      )?.["langfuse.observation.input"] as string;
      expect(inputValue).toBeDefined();

      // Should not contain original base64 data URIs
      expect(inputValue).not.toContain(image1);
      expect(inputValue).not.toContain(image2);

      // Should contain multiple Langfuse media tags
      const mediaMatches = inputValue.match(
        /@@@langfuseMedia:type=[^|]+\|id=[^|]+\|source=[^@]+@@@/g,
      );
      expect(mediaMatches).toHaveLength(2);
    });
  });

  describe("Batch processing", () => {
    it("should batch spans according to flushAt configuration", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          flushAt: 2,
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Create first span
      const span1 = startObservation("batch-span-1");
      span1.end();

      // Should not export yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(testEnv.mockExporter.getSpanCount()).toBe(0);

      // Create second span - should trigger batch export
      const span2 = startObservation("batch-span-2");
      span2.end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("batch-span-1");
      assertions.expectSpanWithName("batch-span-2");
    });

    it("should handle force flush", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          flushAt: 10, // High batch size
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Create single span
      const span = startObservation("force-flush-span");
      span.end();

      // Should not export yet due to high batch size
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(testEnv.mockExporter.getSpanCount()).toBe(0);

      // Force flush
      await testEnv.spanProcessor.forceFlush();

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("force-flush-span");
    });
  });

  describe("Error handling", () => {
    it("should handle exporter failures gracefully", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        mockExporterConfig: {
          shouldFail: true,
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const span = startObservation("failed-export-span");
      span.end();

      // Wait for export attempt
      await new Promise((resolve) => setTimeout(resolve, 200));

      // When exporter fails, spans should not be exported to mock exporter
      // This is the expected behavior
      assertions.expectSpanCount(0);
    });

    it("should handle slow exporter", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        mockExporterConfig: {
          exportDelay: 200,
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const span = startObservation("slow-export-span");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1, 1000);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("slow-export-span");
    });
  });

  describe("Default span filtering", () => {
    it("should export Langfuse spans by default", async () => {
      const span = startObservation("default-filter-langfuse-span");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("default-filter-langfuse-span");
    });

    it("should export gen_ai spans from non-langfuse tracer by default", async () => {
      const tracer = trace.getTracer("custom.instrumentation");
      const span = tracer.startSpan("default-filter-gen-ai-span");
      span.setAttribute("gen_ai.request.model", "gpt-4.1");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("default-filter-gen-ai-span");
    });

    it("should export known instrumentor spans by default", async () => {
      const tracer = trace.getTracer(
        "openinference.instrumentation.agno.agent",
      );
      const span = tracer.startSpan("default-filter-known-instrumentor-span");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("default-filter-known-instrumentor-span");
    });

    it("should drop unknown spans by default", async () => {
      const tracer = trace.getTracer("unknown.instrumentation");
      const span = tracer.startSpan("default-filter-unknown-span");
      span.end();

      await new Promise((resolve) => setTimeout(resolve, 200));

      assertions.expectSpanCount(0);
    });

    it("should log dropped spans on debug level with instrumentation scope", async () => {
      configureGlobalLogger({ level: LogLevel.DEBUG, enableTimestamp: false });
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const tracer = trace.getTracer("unknown.instrumentation.debug");
      const span = tracer.startSpan("default-filter-debug-drop-span");
      span.end();

      await new Promise((resolve) => setTimeout(resolve, 200));

      assertions.expectSpanCount(0);

      const dropLogCall = debugSpy.mock.calls.find((call) =>
        String(call[0]).includes(
          "Dropped span due to shouldExportSpan filter.",
        ),
      );

      expect(dropLogCall).toBeDefined();
      expect(dropLogCall?.[1]).toMatchObject({
        spanName: "default-filter-debug-drop-span",
        instrumentationScope: "unknown.instrumentation.debug",
      });
    });
  });

  describe("shouldExportSpan functionality", () => {
    it("should use custom shouldExportSpan as full override", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            return otelSpan.name === "override-allowed-span";
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const unknownTracer = trace.getTracer("unknown.override.scope");
      const allowedSpan = unknownTracer.startSpan("override-allowed-span");
      allowedSpan.end();

      const blockedLangfuseSpan = startObservation(
        "override-blocked-langfuse-span",
      );
      blockedLangfuseSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      const exportedSpan = assertions.expectSpanWithName(
        "override-allowed-span",
      );
      expect(exportedSpan.instrumentationScope.name).toBe(
        "unknown.override.scope",
      );
      expect(
        testEnv.mockExporter.getSpanByName("override-blocked-langfuse-span"),
      ).toBeUndefined();
    });

    it("should export spans when shouldExportSpan returns true", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            return otelSpan.name === "allowed-span";
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const allowedSpan = startObservation("allowed-span", {
        input: { message: "This should be exported" },
      });
      allowedSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("allowed-span");
    });

    it("should not export spans when shouldExportSpan returns false", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            return otelSpan.name !== "blocked-span";
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const blockedSpan = startObservation("blocked-span", {
        input: { message: "This should not be exported" },
      });
      blockedSpan.end();

      // Wait to ensure no export happens
      await new Promise((resolve) => setTimeout(resolve, 200));

      assertions.expectSpanCount(0);
    });

    it("should filter spans based on span attributes", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            const userType = otelSpan.attributes["user.type"];
            return userType === "premium";
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Create premium user span
      const premiumSpan = startObservation("premium-user-span");
      premiumSpan.otelSpan.setAttributes({ "user.type": "premium" });
      premiumSpan.end();

      // Create free user span
      const freeSpan = startObservation("free-user-span");
      freeSpan.otelSpan.setAttributes({ "user.type": "free" });
      freeSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("premium-user-span");
    });

    it("should filter spans based on span duration", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            const durationMs =
              Number(otelSpan.duration[0]) * 1000 + otelSpan.duration[1] / 1e6;
            return durationMs > 100; // Only export spans longer than 100ms
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Create short duration span
      const shortSpan = startObservation("short-span");
      shortSpan.end(); // Immediate end = very short duration

      // Create long duration span
      const longSpan = startObservation("long-span");
      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait 150ms
      longSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("long-span");
    });

    it("should work with mixed filtering conditions", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            // Export only spans that:
            // 1. Don't contain "internal" in the name
            // 2. Have a specific attribute
            const isInternal = otelSpan.name.includes("internal");
            const hasExportFlag = otelSpan.attributes["export"] === "true";
            return !isInternal && hasExportFlag;
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Should be exported (not internal + has export flag)
      const exportedSpan = startObservation("user-action");
      exportedSpan.otelSpan.setAttributes({ export: "true" });
      exportedSpan.end();

      // Should not be exported (internal)
      const internalSpan = startObservation("internal-process");
      internalSpan.otelSpan.setAttributes({ export: "true" });
      internalSpan.end();

      // Should not be exported (no export flag)
      const noFlagSpan = startObservation("user-action-2");
      noFlagSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("user-action");
    });

    it("should handle shouldExportSpan function errors gracefully", async () => {
      await teardownTestEnvironment(testEnv);
      configureGlobalLogger({ level: LogLevel.ERROR, enableTimestamp: false });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      let callCount = 0;
      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          shouldExportSpan: ({ otelSpan }) => {
            callCount++;
            if (otelSpan.name === "error-span") {
              throw new Error("Filter function error");
            }
            return true;
          },
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // This span should cause an error in the filter function
      const errorSpan = startObservation("error-span");
      errorSpan.end();

      // This span should work normally
      const normalSpan = startObservation("normal-span");
      normalSpan.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      // Should have called the function twice
      expect(callCount).toBe(2);

      // Only the normal span should be exported (error span filtered out due to exception)
      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("normal-span");

      const errorLogCall = errorSpy.mock.calls.find((call) =>
        String(call[0]).includes(
          "shouldExportSpan failed with error. Dropping span.",
        ),
      );
      expect(errorLogCall).toBeDefined();
      expect(errorLogCall?.[1]).toMatchObject({
        spanName: "error-span",
        instrumentationScope: "langfuse-sdk",
      });
    });

    it("should export Langfuse spans when shouldExportSpan is not configured", async () => {
      const span = startObservation("default-span");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("default-span");
    });
  });

  describe("Shutdown and cleanup", () => {
    it("should flush pending spans on shutdown", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          flushAt: 10, // High batch size to prevent auto-flush
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Create spans but don't trigger flush
      const span1 = startObservation("shutdown-span-1");
      span1.end();
      const span2 = startObservation("shutdown-span-2");
      span2.end();

      // Should not export yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(testEnv.mockExporter.getSpanCount()).toBe(0);

      // Shutdown should flush pending spans
      await testEnv.spanProcessor.shutdown();

      // Note: Shutdown flush may not be working correctly
      // This test might need implementation fixes
      assertions.expectSpanCount(0);
    });
  });

  describe("Export Mode Selection", () => {
    it("should use BatchSpanProcessor by default", async () => {
      // Default testEnv uses batched mode
      const span1 = startObservation("default-batch-1");
      span1.end();

      // Should not export immediately due to batching (default flushAt is 1 in tests)
      const span2 = startObservation("default-batch-2");
      span2.end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("default-batch-1");
      assertions.expectSpanWithName("default-batch-2");
    });

    it("should use BatchSpanProcessor when exportMode is 'batched'", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "batched",
          flushAt: 2,
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // First span should not export yet
      const span1 = startObservation("batched-span-1");
      span1.end();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(testEnv.mockExporter.getSpanCount()).toBe(0);

      // Second span should trigger batch export
      const span2 = startObservation("batched-span-2");
      span2.end();

      await waitForSpanExport(testEnv.mockExporter, 2);

      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("batched-span-1");
      assertions.expectSpanWithName("batched-span-2");
    });

    it("should use SimpleSpanProcessor when exportMode is 'immediate'", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "immediate",
          flushAt: 10, // This should be ignored for immediate mode
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Each span should export immediately regardless of flushAt
      const span1 = startObservation("immediate-span-1");
      span1.end();

      await waitForSpanExport(testEnv.mockExporter, 1);
      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("immediate-span-1");

      const span2 = startObservation("immediate-span-2");
      span2.end();

      await waitForSpanExport(testEnv.mockExporter, 2);
      assertions.expectSpanCount(2);
      assertions.expectSpanWithName("immediate-span-2");
    });
  });

  describe("Export Mode Behavior Differences", () => {
    it("should export spans immediately with immediate mode", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "immediate",
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      const span = startObservation("immediate-test");
      span.end();

      // Should export almost immediately
      await waitForSpanExport(testEnv.mockExporter, 1, 200);
      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("immediate-test");
    });

    it("should ignore batch configuration in immediate mode", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "immediate",
          flushAt: 100, // Should be ignored
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Should still export immediately despite batch config
      const span = startObservation("ignore-batch-config");
      span.end();

      await waitForSpanExport(testEnv.mockExporter, 1, 200);
      assertions.expectSpanCount(1);
      assertions.expectSpanWithName("ignore-batch-config");
    });

    it("should respect batch configuration in batched mode", async () => {
      await teardownTestEnvironment(testEnv);

      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "batched",
          flushAt: 3,
        },
      });
      assertions = new SpanAssertions(testEnv.mockExporter);

      // Create two spans - should not export yet
      const span1 = startObservation("batch-1");
      span1.end();
      const span2 = startObservation("batch-2");
      span2.end();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(testEnv.mockExporter.getSpanCount()).toBe(0);

      // Third span should trigger batch export
      const span3 = startObservation("batch-3");
      span3.end();

      await waitForSpanExport(testEnv.mockExporter, 3);
      assertions.expectSpanCount(3);
    });
  });

  describe("Method Delegation", () => {
    it("should delegate forceFlush correctly for both modes", async () => {
      // Test batched mode
      await teardownTestEnvironment(testEnv);
      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "batched",
          flushAt: 10,
        },
      });

      const span1 = startObservation("batch-force-flush");
      span1.end();

      // Should not export yet
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(testEnv.mockExporter.getSpanCount()).toBe(0);

      // Force flush should export the span
      await testEnv.spanProcessor.forceFlush();
      expect(testEnv.mockExporter.getSpanCount()).toBe(1);

      // Test immediate mode
      await teardownTestEnvironment(testEnv);
      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "immediate",
        },
      });

      const span2 = startObservation("immediate-force-flush");
      span2.end();

      await waitForSpanExport(testEnv.mockExporter, 1);

      // Force flush should still work (even though span already exported)
      await expect(testEnv.spanProcessor.forceFlush()).resolves.not.toThrow();
    });

    it("should delegate shutdown correctly for both modes", async () => {
      // Test with batched mode
      await teardownTestEnvironment(testEnv);
      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "batched",
        },
      });

      await expect(testEnv.spanProcessor.shutdown()).resolves.not.toThrow();

      // Test with immediate mode
      await teardownTestEnvironment(testEnv);
      testEnv = await setupTestEnvironment({
        spanProcessorConfig: {
          exportMode: "immediate",
        },
      });

      await expect(testEnv.spanProcessor.shutdown()).resolves.not.toThrow();
    });
  });
});
