import type { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { Langfuse, type LangfusePromptRecord, type LangfuseOptions } from "langfuse";

import type { ExportResult, ExportResultCode } from "@opentelemetry/core";

type LangfuseExporterParams = {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  debug?: boolean;
} & LangfuseOptions;

export class LangfuseExporter implements SpanExporter {
  static langfuse: Langfuse | null = null; // Singleton instance
  private readonly debug: boolean;
  private readonly langfuse: Langfuse;

  constructor(params: LangfuseExporterParams = {}) {
    this.debug = params.debug ?? false;

    if (!LangfuseExporter.langfuse) {
      LangfuseExporter.langfuse = new Langfuse({
        ...params,
        persistence: "memory",
        sdkIntegration: "vercel-ai-sdk",
      });

      if (this.debug) {
        LangfuseExporter.langfuse.debug();
      }
    }

    this.langfuse = LangfuseExporter.langfuse; // store reference to singleton instance
  }

  export(allSpans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.logDebug("exporting spans", allSpans);

    try {
      const traceSpanMap = new Map<string, ReadableSpan[]>();

      for (const span of allSpans) {
        if (!this.isAiSdkSpan(span)) {
          this.logDebug("Ignoring non-AI SDK span", span.name);

          continue;
        }

        const traceId = span.spanContext().traceId;

        traceSpanMap.set(traceId, (traceSpanMap.get(traceId) ?? []).concat(span));
      }

      for (const [traceId, spans] of traceSpanMap) {
        this.processTraceSpans(traceId, spans);
      }

      const successCode: ExportResultCode.SUCCESS = 0; // Do not use enum directly to avoid adding a dependency on the enum

      resultCallback({ code: successCode });
    } catch (err) {
      const failureCode: ExportResultCode.FAILED = 1; // Do not use enum directly to avoid adding a dependency on the enum

      resultCallback({ code: failureCode, error: err instanceof Error ? err : new Error("Unknown error") });
    }
  }

  private processTraceSpans(traceId: string, spans: ReadableSpan[]): void {
    const rootSpan = spans.find((span) => this.isRootAiSdkSpan(span, spans));
    if (!rootSpan) {
      this.logDebug("No root span found with AI SDK spans, skipping trace");

      return;
    }

    const rootSpanAttributes = rootSpan.attributes;
    const userProvidedTraceId = this.parseTraceId(spans);
    const finalTraceId = userProvidedTraceId ?? traceId;

    this.langfuse.trace({
      id: finalTraceId,
      name: this.parseTraceName(spans) ?? rootSpan?.name,
      userId: this.parseUserIdTraceAttribute(spans),
      sessionId: this.parseSessionIdTraceAttribute(spans),
      tags: this.parseTagsTraceAttribute(spans).length > 0 ? this.parseTagsTraceAttribute(spans) : undefined,
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
      metadata: this.filterTraceAttributes(this.parseMetadataTraceAttribute(spans)),
    });

    for (const span of spans) {
      if (this.isGenerationSpan(span)) {
        this.processSpanAsLangfuseGeneration(
          finalTraceId,
          span,
          this.isRootAiSdkSpan(span, spans),
          this.parseLangfusePromptTraceAttribute(spans)
        );
      } else {
        this.processSpanAsLangfuseSpan(finalTraceId, span, this.isRootAiSdkSpan(span, spans));
      }
    }
  }

  private processSpanAsLangfuseSpan(traceId: string, span: ReadableSpan, isRootSpan: boolean): void {
    const spanContext = span.spanContext();
    const attributes = span.attributes;

    this.langfuse.span({
      traceId,
      parentObservationId: isRootSpan ? undefined : span.parentSpanId,
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

      metadata: this.filterTraceAttributes(this.parseSpanMetadata(span)),
    });
  }

  private processSpanAsLangfuseGeneration(
    traceId: string,
    span: ReadableSpan,
    isRootSpan: boolean,
    langfusePrompt: LangfusePromptRecord | undefined
  ): void {
    const spanContext = span.spanContext();
    const attributes = span.attributes;

    this.langfuse.generation({
      traceId,
      parentObservationId: isRootSpan ? undefined : span.parentSpanId,
      id: spanContext.spanId,
      name: span.name,
      startTime: this.hrTimeToDate(span.startTime),
      endTime: this.hrTimeToDate(span.endTime),
      completionStartTime:
        "ai.response.msToFirstChunk" in attributes
          ? new Date(this.hrTimeToDate(span.startTime).getTime() + Number(attributes["ai.response.msToFirstChunk"]))
          : "ai.stream.msToFirstChunk" in attributes
            ? new Date(this.hrTimeToDate(span.startTime).getTime() + Number(attributes["ai.stream.msToFirstChunk"]))
            : undefined,
      model:
        "ai.response.model" in attributes
          ? attributes["ai.response.model"]?.toString()
          : "gen_ai.request.model" in attributes
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
          "gen_ai.usage.prompt_tokens" in attributes // Backward compat, input_tokens used in latest ai SDK versions
            ? parseInt(attributes["gen_ai.usage.prompt_tokens"]?.toString() ?? "0")
            : "gen_ai.usage.input_tokens" in attributes
              ? parseInt(attributes["gen_ai.usage.input_tokens"]?.toString() ?? "0")
              : undefined,

        output:
          "gen_ai.usage.completion_tokens" in attributes // Backward compat, output_tokens used in latest ai SDK versions
            ? parseInt(attributes["gen_ai.usage.completion_tokens"]?.toString() ?? "0")
            : "gen_ai.usage.output_tokens" in attributes
              ? parseInt(attributes["gen_ai.usage.output_tokens"]?.toString() ?? "0")
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

      metadata: this.filterTraceAttributes(this.parseSpanMetadata(span)),
      prompt: langfusePrompt,
    });
  }

  private parseSpanMetadata(span: ReadableSpan): Record<string, (typeof span.attributes)[0]> {
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

  private isAiSdkSpan(span: ReadableSpan): boolean {
    return span.instrumentationLibrary.name === "ai";
  }

  /**
   * Checks if a given span is the root AI SDK span in a trace.
   * The root AI span is the span that has no parent span or its parent span is not part of the AI SDK.
   *
   * @param span - The span to check.
   * @param spans - The list of all spans in the trace.
   * @returns A boolean indicating whether the span is the root AI SDK span.
   */
  private isRootAiSdkSpan(span: ReadableSpan, spans: ReadableSpan[]): boolean {
    const spanIds = new Set(spans.map((span) => span.spanContext().spanId));

    return !span.parentSpanId || !spanIds.has(span.parentSpanId);
  }

  private logDebug(message: string, ...args: any[]): void {
    if (!this.debug) {
      return;
    }

    console.log(`[${new Date().toISOString()}] [LangfuseExporter] ${message}`, ...args);
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

  private parseTraceId(spans: ReadableSpan[]): string | undefined {
    return spans
      .map((span) => this.parseSpanMetadata(span)["langfuseTraceId"])
      .find((id) => Boolean(id))
      ?.toString();
  }

  private parseTraceName(spans: ReadableSpan[]): string | undefined {
    return spans
      .map((span) => span.attributes["resource.name"])
      .find((name) => Boolean(name))
      ?.toString();
  }

  private parseUserIdTraceAttribute(spans: ReadableSpan[]): string | undefined {
    return spans
      .map((span) => this.parseSpanMetadata(span)["userId"])
      .find((id) => Boolean(id))
      ?.toString();
  }

  private parseSessionIdTraceAttribute(spans: ReadableSpan[]): string | undefined {
    return spans
      .map((span) => this.parseSpanMetadata(span)["sessionId"])
      .find((id) => Boolean(id))
      ?.toString();
  }

  private parseLangfusePromptTraceAttribute(spans: ReadableSpan[]): LangfusePromptRecord | undefined {
    const jsonPrompt = spans
      .map((span) => this.parseSpanMetadata(span)["langfusePrompt"])
      .find((prompt) => Boolean(prompt));

    try {
      if (jsonPrompt) {
        const parsedPrompt = JSON.parse(jsonPrompt.toString());

        if (
          typeof parsedPrompt !== "object" ||
          !(parsedPrompt["name"] && parsedPrompt["version"] && parsedPrompt["isFallback"])
        ) {
          throw Error("Invalid langfusePrompt");
        }

        return parsedPrompt;
      }
    } catch (e) {
      return undefined;
    }
  }

  private parseTagsTraceAttribute(spans: ReadableSpan[]): string[] {
    return [
      ...new Set(
        spans
          .map((span) => this.parseSpanMetadata(span)["tags"])
          .filter((tags) => Array.isArray(tags) && tags.every((tag) => typeof tag === "string"))
          .reduce((acc, tags) => acc.concat(tags as string[]), [])
      ),
    ];
  }

  private parseMetadataTraceAttribute(spans: ReadableSpan[]): Record<string, any> {
    return spans.reduce(
      (acc, span) => {
        const metadata = this.parseSpanMetadata(span);

        for (const [key, value] of Object.entries(metadata)) {
          if (value) {
            acc[key] = value;
          }
        }

        return acc;
      },
      {} as Record<string, any>
    );
  }

  private filterTraceAttributes(obj: Record<string, any>): Record<string, any> {
    const langfuseTraceAttributes = ["userId", "sessionId", "tags", "langfuseTraceId", "langfusePrompt"];

    return Object.entries(obj).reduce(
      (acc, [key, value]) => {
        if (!langfuseTraceAttributes.includes(key)) {
          acc[key] = value;
        }

        return acc;
      },
      {} as Record<string, any>
    );
  }
}
