import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { TracerProvider, trace, ProxyTracerProvider } from "@opentelemetry/api";

import { LANGFUSE_VERSION } from "./constants";

export type MaskFunction = (params: { data: any }) => any;
export type LangfuseInitOptions = {
  publicKey?: string;
  secretKey?: string;
  host?: string; // renamed from baseUrl
  tracerProvider?: TracerProvider;
  debug?: boolean;

  // Flushing
  //flushAt?: number;
  //flushInterval?: number;

  // Fetching
  //additionalHeaders?: Record<string, string>;
  //fetchRetryCount?: number;
  //fetchRetryDelay?: number;
  //requestTimeout?: number;

  // Attributes
  //release?: string;
  //environment?: string;

  // Config
  //tracingEnabled?: boolean;
  //mask?: MaskFunction;
  //sampleRate?: number;

  // Prompt Experiments
  //_projectId?: string;
  //_isLocalEventExportEnabled?: boolean;
};

export class Langfuse {
  constructor() {}

  private get tracer() {
    return trace
      .getTracerProvider()
      .getTracer("langfuse-sdk", LANGFUSE_VERSION);
  }

  public startSpan() {
    this.tracer.startActiveSpan("parent", (span) => {
      span.setAttribute("key", "value");

      this.tracer.startSpan("test").end();

      span.end();
    });
  }

  public async flush() {
    // See https://github.com/open-telemetry/opentelemetry-js/issues/3310#issuecomment-1273477289
    const tracerProvider = trace.getTracerProvider();

    if (tracerProvider instanceof NodeTracerProvider) {
      return tracerProvider.forceFlush();
    } else if (tracerProvider instanceof ProxyTracerProvider) {
      const delegateProvider = tracerProvider.getDelegate();

      if (delegateProvider instanceof NodeTracerProvider) {
        return delegateProvider.forceFlush();
      }
    }

    console.warn(
      "[Langfuse] Flush not supported as OTEL SDK is not correctly initialized."
    );
  }

  public async shutdown() {
    // See https://github.com/open-telemetry/opentelemetry-js/issues/3310#issuecomment-1273477289
    const tracerProvider = trace.getTracerProvider();

    if (tracerProvider instanceof NodeTracerProvider) {
      return tracerProvider.shutdown();
    } else if (tracerProvider instanceof ProxyTracerProvider) {
      const delegateProvider = tracerProvider.getDelegate();

      if (delegateProvider instanceof NodeTracerProvider) {
        return delegateProvider.shutdown();
      }
    }

    console.warn(
      "[Langfuse] Shutdown not supported as OTEL SDK is not correctly initialized."
    );
  }
}
