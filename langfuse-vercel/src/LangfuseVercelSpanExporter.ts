import type { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { Langfuse, type LangfuseOptions } from "langfuse";

import { type ExportResult, ExportResultCode } from "@opentelemetry/core";

type LangfuseVercelSpanExporterParams = {
  publicKey?: string;
  secretKey?: string;
  debug?: boolean;
} & LangfuseOptions;

export class LangfuseVercelSpanExporter implements SpanExporter {
  static langfuse: Langfuse | null = null; // Singleton instance
  private readonly debug: boolean;
  private readonly langfuse: Langfuse;

  constructor(params: LangfuseVercelSpanExporterParams = {}) {
    this.debug = params.debug ?? false;

    if (!LangfuseVercelSpanExporter.langfuse) {
      LangfuseVercelSpanExporter.langfuse = new Langfuse({
        ...params,
        persistence: "memory",
        sdkIntegration: "vercel-ai-sdk",
      });
    }

    this.langfuse = LangfuseVercelSpanExporter.langfuse; // store reference to singleton instance
  }

  export(allSpans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.logDebug("exporting spans", allSpans);

    try {
      const traceSpanMap = new Map<string, ReadableSpan[]>();

      for (const span of allSpans) {
        const traceId = span.spanContext().traceId;

        traceSpanMap.set(traceId, (traceSpanMap.get(traceId) ?? []).concat(span));
      }

      for (const [traceId, spans] of traceSpanMap) {
        this.processTraceSpans(traceId, spans);
      }

      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      resultCallback({ code: ExportResultCode.FAILED, error: err instanceof Error ? err : new Error("Unknown error") });
    }
  }

  private processTraceSpans(traceId: string, spans: ReadableSpan[]): void {
    const rootSpan = spans.find((span) => !span.parentSpanId);
    if (!rootSpan) {
      throw Error("Root span not found");
    }

    const rootSpanAttributes = rootSpan.attributes;
    const parsedMetadata = this.parseMetadata(rootSpan);
    const finalTraceId =
      "langfuseTraceId" in parsedMetadata ? parsedMetadata["langfuseTraceId"]?.toString() ?? traceId : traceId;

    this.langfuse.trace({
      id: finalTraceId,
      name: "resource.name" in rootSpanAttributes ? rootSpanAttributes["resource.name"]?.toString() : rootSpan?.name,
      userId: "userId" in parsedMetadata ? parsedMetadata["userId"]?.toString() : undefined,
      sessionId: "sessionId" in parsedMetadata ? parsedMetadata["sessionId"]?.toString() : undefined,
      tags: ("tags" in parsedMetadata && Array.isArray(parsedMetadata["tags"])
        ? parsedMetadata["tags"]
        : []) as string[],
      input:
        "ai.prompt.messages" in rootSpanAttributes
          ? rootSpanAttributes["ai.prompt.messages"]
          : "ai.prompt" in rootSpanAttributes
            ? rootSpanAttributes["ai.prompt"]
            : "ai.toolCall.args" in rootSpanAttributes
              ? rootSpanAttributes["ai.toolCall.args"]
              : undefined,
      output:
        "ai.result.text" in rootSpanAttributes
          ? rootSpanAttributes["ai.result.text"]
          : "ai.toolCall.result" in rootSpanAttributes
            ? rootSpanAttributes["ai.toolCall.result"]
            : "ai.result.object" in rootSpanAttributes
              ? rootSpanAttributes["ai.result.object"]
              : "ai.result.toolCalls" in rootSpanAttributes
                ? rootSpanAttributes["ai.result.toolCalls"]
                : undefined,
      metadata: parsedMetadata,
    });

    for (const span of spans) {
      if (this.shouldIgnoreSpan(span)) {
        continue;
      }

      if (this.isGenerationSpan(span)) {
        this.processSpanAsLangfuseGeneration(finalTraceId, span);
      } else {
        this.processSpanAsLangfuseSpan(finalTraceId, span);
      }
    }
  }

  private processSpanAsLangfuseSpan(traceId: string, span: ReadableSpan): void {
    const spanContext = span.spanContext();
    const attributes = span.attributes;

    this.langfuse.span({
      traceId,
      parentObservationId: span.parentSpanId,
      id: spanContext.spanId,
      name: "ai.toolCall.name" in attributes ? "ai.toolCall " + attributes["ai.toolCall.name"]?.toString() : span.name,
      startTime: this.hrTimeToDate(span.startTime),
      endTime: this.hrTimeToDate(span.endTime),

      input:
        "ai.prompt.messages" in attributes
          ? attributes["ai.prompt.messages"]
          : "ai.prompt" in attributes
            ? attributes["ai.prompt"]
            : "ai.toolCall.args" in attributes
              ? attributes["ai.toolCall.args"]
              : undefined,
      output:
        "ai.result.text" in attributes
          ? attributes["ai.result.text"]
          : "ai.toolCall.result" in attributes
            ? attributes["ai.toolCall.result"]
            : "ai.result.object" in attributes
              ? attributes["ai.result.object"]
              : "ai.result.toolCalls" in attributes
                ? attributes["ai.result.toolCalls"]
                : undefined,

      metadata: this.parseMetadata(span),
    });
  }

  private processSpanAsLangfuseGeneration(traceId: string, span: ReadableSpan): void {
    const spanContext = span.spanContext();
    const attributes = span.attributes;

    this.langfuse.generation({
      traceId,
      parentObservationId: span.parentSpanId,
      id: spanContext.spanId,
      name: span.name,
      startTime: this.hrTimeToDate(span.startTime),
      endTime: this.hrTimeToDate(span.endTime),

      model:
        "gen_ai.request.model" in attributes
          ? attributes["gen_ai.request.model"]?.toString()
          : "ai.model.id" in attributes
            ? attributes["ai.model.id"]?.toString()
            : undefined,
      modelParameters: {
        maxTokens:
          "gen_ai.request.max_tokens" in attributes ? attributes["gen_ai.request.max_tokens"]?.toString() : undefined,
        finishReason: "gen_ai.system" in attributes ? attributes["gen_ai.finishReason"]?.toString() : undefined,
        system:
          "gen_ai.system" in attributes
            ? attributes["gen_ai.system"]?.toString()
            : "ai.model.provider" in attributes
              ? attributes["ai.model.provider"]?.toString()
              : undefined,
        maxRetries:
          "ai.settings.maxRetries" in attributes ? attributes["ai.settings.maxRetries"]?.toString() : undefined,
        mode: "ai.settings.mode" in attributes ? attributes["ai.settings.mode"]?.toString() : undefined,
      },
      usage: {
        input:
          "gen_ai.usage.prompt_tokens" in attributes
            ? parseInt(attributes["gen_ai.usage.prompt_tokens"]?.toString() ?? "0")
            : undefined,

        output:
          "gen_ai.usage.completion_tokens" in attributes
            ? parseInt(attributes["gen_ai.usage.completion_tokens"]?.toString() ?? "0")
            : undefined,
        total: "ai.usage.tokens" in attributes ? parseInt(attributes["ai.usage.tokens"]?.toString() ?? "0") : undefined,
      },
      input:
        "ai.prompt.messages" in attributes
          ? attributes["ai.prompt.messages"]
          : "ai.prompt" in attributes
            ? attributes["ai.prompt"]
            : "ai.toolCall.args" in attributes
              ? attributes["ai.toolCall.args"]
              : undefined,
      output:
        "ai.result.text" in attributes
          ? attributes["ai.result.text"]
          : "ai.toolCall.result" in attributes
            ? attributes["ai.toolCall.result"]
            : "ai.result.object" in attributes
              ? attributes["ai.result.object"]
              : "ai.result.toolCalls" in attributes
                ? attributes["ai.result.toolCalls"]
                : undefined,

      metadata: this.parseMetadata(span),
    });
  }

  private parseMetadata(span: ReadableSpan): Record<string, (typeof span.attributes)[0]> {
    return Object.entries(span.attributes).reduce(
      (acc, [key, value]) => {
        const metadataPrefix = "ai.telemetry.metadata.";

        if (key.startsWith(metadataPrefix) && value) {
          const strippedKey = key.slice(metadataPrefix.length);

          acc[strippedKey] = value;
        }

        const spanKeysToAdd = ["ai.settings.maxToolRoundtrips", "ai.prompt.format", "ai.toolCall.id", "ai.schema"];

        if (spanKeysToAdd.includes(key) && value) {
          acc[key] = value;
        }

        return acc;
      },
      {} as Record<string, (typeof span.attributes)[0]>
    );
  }

  private isGenerationSpan(span: ReadableSpan): boolean {
    const generationSpanNameParts = ["doGenerate", "doStream", "doEmbed"];

    return generationSpanNameParts.some((part) => span.name.includes(part));
  }

  private shouldIgnoreSpan(span: ReadableSpan): boolean {
    return Object.keys(span.attributes).some((key) => key.startsWith("http.")); // Ignore spans that are HTTP requests
  }

  private logInfo(message: string, ...args: any[]): void {
    console.log(`[${new Date().toISOString()}] [LangfuseVercelSpanExporter] ${message}`, ...args);
  }

  private logDebug(message: string, ...args: any[]): void {
    if (!this.debug) {
      return;
    }

    console.log(`[${new Date().toISOString()}] [LangfuseVercelSpanExporter] ${message}`, ...args);
  }

  private hrTimeToDate(hrtime: [number, number]): Date {
    const nanoSeconds = hrtime[0] * 1e9 + hrtime[1];
    const milliSeconds = nanoSeconds / 1e6;

    return new Date(milliSeconds);
  }

  async forceFlush(): Promise<void> {
    this.logDebug("Force flushing Langfuse...");

    await this.langfuse.flushAsync();
  }

  async shutdown(): Promise<void> {
    this.logDebug("Shutting down Langfuse...");

    await this.langfuse.shutdownAsync();
  }
}
