import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from "@langfuse/otel";
import { MockSpanExporter } from "./MockSpanExporter.js";
import { trace } from "@opentelemetry/api";

export interface TestEnvironment {
  sdk: NodeSDK;
  spanProcessor: LangfuseSpanProcessor;
  mockExporter: MockSpanExporter;
  shutdown: () => Promise<void>;
  serviceName: string;
  traceId?: string;
}

export interface TestSetupOptions {
  serviceName?: string;
  serviceVersion?: string;
  spanProcessorConfig?: Partial<LangfuseSpanProcessorParams>;
  mockExporterConfig?: {
    shouldFail?: boolean;
    exportDelay?: number;
  };
  enableInstrumentation?: boolean;
  timeout?: number;
}

/**
 * Set up an isolated OpenTelemetry test environment with a mock exporter
 */
export async function setupTestEnvironment(
  options: TestSetupOptions = {},
): Promise<TestEnvironment> {
  const mockExporter = new MockSpanExporter();

  // Configure mock exporter behavior
  if (options.mockExporterConfig?.shouldFail) {
    mockExporter.shouldFail = true;
  }

  if (options.mockExporterConfig?.exportDelay) {
    mockExporter.exportDelay = options.mockExporterConfig.exportDelay;
  }

  // Create span processor with test configuration
  const spanProcessor = new LangfuseSpanProcessor({
    exporter: mockExporter,
    flushAt: 1, // Flush immediately for testing
    flushInterval: 0, // No scheduled flush
    timeout: options.timeout || 1000, // Short timeout for tests
    ...options.spanProcessorConfig,
  });

  const serviceName = options.serviceName || `test-service-${Date.now()}`;

  const sdk = new NodeSDK({
    spanProcessor,
    instrumentations: options.enableInstrumentation ? undefined : [], // No auto-instrumentation by default
  });

  const shutdown = async (): Promise<void> => {
    try {
      await sdk.shutdown();
      await mockExporter.shutdown();
    } catch (error) {
      console.warn("Error during test environment shutdown:", error);
    }

    // Clear any global tracer state
    trace.disable();
  };

  sdk.start();

  return {
    sdk,
    spanProcessor,
    mockExporter,
    shutdown,
    serviceName,
  };
}

/**
 * Clean up the test environment
 */
export async function teardownTestEnvironment(
  env: TestEnvironment,
): Promise<void> {
  try {
    await env.shutdown();
    env.mockExporter.reset();
  } catch (error) {
    console.warn("Error during test environment teardown:", error);
  }
}

/**
 * Helper to wait for spans to be exported with better error reporting
 */
export async function waitForSpanExport(
  mockExporter: MockSpanExporter,
  expectedCount: number,
  timeoutMs: number = 5000,
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 10;

  while (mockExporter.getSpanCount() < expectedCount) {
    if (Date.now() - startTime > timeoutMs) {
      const stats = mockExporter.getExportStats();
      const spanNames = mockExporter.exportedSpans.map((s) => s.name);

      throw new Error(
        `Timeout waiting for ${expectedCount} spans after ${timeoutMs}ms. ` +
          `Got ${mockExporter.getSpanCount()} spans: [${spanNames.join(", ")}]. ` +
          `Export stats: ${JSON.stringify(stats)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

/**
 * Helper to wait for a specific span to be exported
 */
export async function waitForSpanByName(
  mockExporter: MockSpanExporter,
  spanName: string,
  timeoutMs: number = 5000,
): Promise<void> {
  const startTime = Date.now();

  while (!mockExporter.getSpanByName(spanName)) {
    if (Date.now() - startTime > timeoutMs) {
      const availableSpans = mockExporter.exportedSpans.map((s) => s.name);
      throw new Error(
        `Timeout waiting for span '${spanName}' after ${timeoutMs}ms. ` +
          `Available spans: [${availableSpans.join(", ")}]`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Helper to wait for all spans in a trace to be exported
 */
export async function waitForTrace(
  mockExporter: MockSpanExporter,
  expectedSpanCount: number,
  timeoutMs: number = 5000,
): Promise<void> {
  await waitForSpanExport(mockExporter, expectedSpanCount, timeoutMs);

  // Verify all spans are in the same trace
  const spans = mockExporter.exportedSpans;
  if (spans.length === 0) return;

  const traceIds = new Set(spans.map((s) => s.spanContext().traceId));
  if (traceIds.size > 1) {
    throw new Error(
      `Expected all spans to be in the same trace, but found ${traceIds.size} traces: ` +
        `[${Array.from(traceIds).join(", ")}]`,
    );
  }
}

/**
 * Helper to wait for async operations to complete in tests
 */
export async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
