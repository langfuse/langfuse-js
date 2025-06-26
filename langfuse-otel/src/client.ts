import { ConsoleSpanExporter, BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { TracerProvider, trace } from "@opentelemetry/api";
import { LANGFUSE_VERSION } from "./constants";
import { LangfuseSpanProcessor } from "./LangfuseSpanProcessor";

export type LangfuseInitOptions = {
  publicKey?: string;
  secretKey?: string;
  host?: string;
  tracerProvider?: TracerProvider;
};

export class Langfuse {
  private tracerProvider: NodeTracerProvider | null;
  private publicKey: string | null;

  constructor() {
    this.tracerProvider = null;
    this.publicKey = null;
  }

  public init(options: LangfuseInitOptions) {
    const { tracerProvider: providedTracerProvider, publicKey: providedPublicKey } = options;
    this.publicKey = providedPublicKey ?? process.env["LANGFUSE_PUBLIC_KEY"] ?? null;

    if (!providedTracerProvider) {
      const tracerProvider = new NodeTracerProvider({
        spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter()), new LangfuseSpanProcessor({})],
      });
      tracerProvider.register();

      this.tracerProvider = tracerProvider;
    }
  }

  get tracer() {
    return trace.getTracerProvider().getTracer("langfuse-sdk", LANGFUSE_VERSION); // TODO: fix missing public_key in tracer attributes
  }

  async startSpan() {
    this.tracer.startActiveSpan("parent", (span) => {
      span.setAttribute("key", "value");

      this.tracer.startSpan("test").end();

      span.end();
    });
  }

  async flush() {
    if (!this.tracerProvider) {
      console.warn(
        "Manually flushing is only supported if Langfuse is managing the underlying OpenTelemetry TracerProvider. Skipping."
      );

      return;
    }
    await this.tracerProvider?.forceFlush();
  }

  async shutdown() {
    if (!this.tracerProvider) {
      console.warn(
        "Manual shutdown is only supported if Langfuse is managing the underlying OpenTelemetry TracerProvider. Skipping."
      );

      return;
    }

    await this.tracerProvider.shutdown();
  }
}
