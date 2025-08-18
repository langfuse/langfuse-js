import {
  getGlobalLogger,
  LANGFUSE_SDK_VERSION,
  LANGFUSE_TRACER_NAME,
} from "@langfuse/core";
import { TracerProvider, trace } from "@opentelemetry/api";

const LANGFUSE_GLOBAL_SYMBOL = Symbol.for("langfuse");

type LangfuseGlobalState = {
  isolatedTracerProvider: TracerProvider | null;
};

function createState(): LangfuseGlobalState {
  return {
    isolatedTracerProvider: null,
  };
}

interface GlobalThis {
  [LANGFUSE_GLOBAL_SYMBOL]?: LangfuseGlobalState;
}

function getGlobalState(): LangfuseGlobalState {
  const initialState = createState();

  try {
    const g = globalThis as typeof globalThis & GlobalThis;

    if (typeof g !== "object" || g === null) {
      getGlobalLogger().warn(
        "globalThis is not available, using fallback state",
      );
      return initialState;
    }

    if (!g[LANGFUSE_GLOBAL_SYMBOL]) {
      Object.defineProperty(g, LANGFUSE_GLOBAL_SYMBOL, {
        value: initialState,
        writable: false, // lock the slot (not the contents)
        configurable: false,
        enumerable: false,
      });
    }

    return g[LANGFUSE_GLOBAL_SYMBOL]!;
  } catch (err) {
    if (err instanceof Error) {
      getGlobalLogger().error(`Failed to access global state: ${err.message}`);
    } else {
      getGlobalLogger().error(`Failed to access global state: ${String(err)}`);
    }

    return initialState;
  }
}

/**
 * Sets an isolated TracerProvider for Langfuse tracing operations.
 *
 * This allows Langfuse to use its own TracerProvider instance, separate from
 * the global OpenTelemetry TracerProvider. This is useful for avoiding conflicts
 * with other OpenTelemetry instrumentation in the application.
 *
 * ⚠️  **Limitation: Span Context Sharing**
 *
 * While this function isolates span processing and export, it does NOT provide
 * complete trace isolation. OpenTelemetry context (trace IDs, parent spans) is
 * still shared between the global and isolated providers. This means:
 *
 * - Spans created with the isolated provider inherit trace IDs from global spans
 * - Spans created with the isolated provider inherit parent relationships from global spans
 * - This can result in spans from different providers being part of the same logical trace
 *
 * **Why this happens:**
 * OpenTelemetry uses a global context propagation mechanism that operates at the
 * JavaScript runtime level, independent of individual TracerProvider instances.
 * The context (containing trace ID, span ID) flows through async boundaries and
 * is inherited by all spans created within that context, regardless of which
 * TracerProvider creates them.
 *
 * @example
 * ```typescript
 * import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
 * import { LangfuseSpanProcessor } from '@langfuse/otel';
 * import { setLangfuseTracerProvider } from '@langfuse/tracing';
 *
 * // Create provider with span processors in constructor
 * const provider = new NodeTracerProvider({
 *   spanProcessors: [new LangfuseSpanProcessor()]
 * });
 *
 * setLangfuseTracerProvider(provider);
 *
 * // Note: Spans created with getLangfuseTracer() may still inherit
 * // context from spans created with the global tracer
 * ```
 *
 * @param provider - The TracerProvider instance to use, or null to clear the isolated provider
 * @public
 */
export function setLangfuseTracerProvider(provider: TracerProvider | null) {
  getGlobalState().isolatedTracerProvider = provider;
}

/**
 * Gets the TracerProvider for Langfuse tracing operations.
 *
 * Returns the isolated TracerProvider if one has been set via setLangfuseTracerProvider(),
 * otherwise falls back to the global OpenTelemetry TracerProvider.
 *
 * @example
 * ```typescript
 * import { getLangfuseTracerProvider } from '@langfuse/tracing';
 *
 * const provider = getLangfuseTracerProvider();
 * const tracer = provider.getTracer('my-tracer', '1.0.0');
 * ```
 *
 * @returns The TracerProvider instance to use for Langfuse tracing
 * @public
 */
export function getLangfuseTracerProvider(): TracerProvider {
  const { isolatedTracerProvider } = getGlobalState();

  if (isolatedTracerProvider) return isolatedTracerProvider;

  return trace.getTracerProvider();
}

/**
 * Gets the OpenTelemetry tracer instance for Langfuse.
 *
 * This function returns a tracer specifically configured for Langfuse
 * with the correct tracer name and version. Used internally by all
 * Langfuse tracing functions to ensure consistent trace creation.
 *
 * @returns The Langfuse OpenTelemetry tracer instance
 *
 * @example
 * ```typescript
 * import { getLangfuseTracer } from '@langfuse/tracing';
 *
 * const tracer = getLangfuseTracer();
 * const span = tracer.startSpan('my-operation');
 * ```
 *
 * @public
 */
export function getLangfuseTracer() {
  return getLangfuseTracerProvider().getTracer(
    LANGFUSE_TRACER_NAME,
    LANGFUSE_SDK_VERSION,
  );
}
