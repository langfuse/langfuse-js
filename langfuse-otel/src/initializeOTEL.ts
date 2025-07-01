import {
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
  SpanProcessor,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-node";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";

import {
  LangfuseSpanProcessor,
  LangfuseSpanProcessorParams,
} from "./LangfuseSpanProcessor";
import { LangfuseOtelSpanAttributes } from "./LangfuseOtelSpanAttributes";

export type InitializeOTELOptions = LangfuseSpanProcessorParams & {
  release?: string;
  environment?: string;
  sampleRate?: number;
};

export function initializeOTEL(options: InitializeOTELOptions) {
  const { debug, sampleRate, environment, release } = options;

  const spanProcessors: SpanProcessor[] = [new LangfuseSpanProcessor(options)];
  if (debug) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  const sampler =
    sampleRate != null && sampleRate <= 1
      ? new TraceIdRatioBasedSampler(sampleRate)
      : undefined;

  const resource =
    environment != null || release != null
      ? defaultResource().merge(
          resourceFromAttributes({
            [LangfuseOtelSpanAttributes.ENVIRONMENT]: environment,
            [LangfuseOtelSpanAttributes.RELEASE]: release,
          })
        )
      : undefined;

  const tracerProvider = new NodeTracerProvider({
    spanProcessors,
    sampler,
    resource,
  });

  tracerProvider.register();
}
