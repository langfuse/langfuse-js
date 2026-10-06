import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from "@langfuse/otel";
import { trace } from "@opentelemetry/api";

export interface ServerTestEnvironment {
  sdk: NodeSDK;
  spanProcessor: LangfuseSpanProcessor;
  shutdown: () => Promise<void>;
  serviceName: string;
}

export interface ServerTestSetupOptions {
  serviceName?: string;
  serviceVersion?: string;
  spanProcessorConfig?: Partial<LangfuseSpanProcessorParams>;
  enableInstrumentation?: boolean;
  timeout?: number;
}

/**
 * Set up an E2E test environment with real Langfuse server connection
 */
export async function setupServerTestEnvironment(
  options: ServerTestSetupOptions = {},
): Promise<ServerTestEnvironment> {
  // Create span processor with real Langfuse server configuration
  const spanProcessor = new LangfuseSpanProcessor({
    ...options.spanProcessorConfig,
  });

  const serviceName = options.serviceName || `e2e-test-service-${Date.now()}`;

  const sdk = new NodeSDK({
    spanProcessor,
    instrumentations: options.enableInstrumentation ? undefined : [], // No auto-instrumentation by default
  });

  const shutdown = async (): Promise<void> => {
    try {
      await sdk.shutdown();
    } catch (error) {
      console.warn("Error during E2E test environment shutdown:", error);
    }

    // Clear any global tracer state
    trace.disable();
  };

  sdk.start();

  return {
    sdk,
    spanProcessor,
    shutdown,
    serviceName,
  };
}

/**
 * Clean up the E2E test environment
 */
export async function teardownServerTestEnvironment(
  env: ServerTestEnvironment,
): Promise<void> {
  try {
    // Force flush to ensure all spans are sent
    await env.spanProcessor.forceFlush();
    await env.shutdown();
  } catch (error) {
    console.warn("Error during E2E test environment teardown:", error);
  }
}
