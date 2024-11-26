import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { Langfuse, type LangfuseOptions, type LangfusePromptRecord } from "langfuse";

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

    const userProvidedTraceId = this.parseTraceId(spans);
    const finalTraceId = userProvidedTraceId ?? traceId;
    const langfusePrompt = this.parseLangfusePromptTraceAttribute(spans);
    const updateParent = this.parseLangfuseUpdateParentTraceAttribute(spans);

    const traceParams = {
      userId: this.parseUserIdTraceAttribute(spans),
      sessionId: this.parseSessionIdTraceAttribute(spans),
      tags: this.parseTagsTraceAttribute(spans).length > 0 ? this.parseTagsTraceAttribute(spans) : undefined,
      name: this.parseTraceName(spans) ?? rootSpan?.name,
      input: this.parseInput(rootSpan),
      output: this.parseOutput(rootSpan),
      metadata: this.filterTraceAttributes(this.parseMetadataTraceAttribute(spans)),
    };

    const finalTraceParams = {
      id: finalTraceId,
      ...(updateParent ? traceParams : {}),
    };

    this.langfuse.trace(finalTraceParams);

    for (const span of spans) {
      if (this.isGenerationSpan(span)) {
        this.processSpanAsLangfuseGeneration(finalTraceId, span, this.isRootAiSdkSpan(span, spans), langfusePrompt);
      } else {
        this.processSpanAsLangfuseSpan(
          finalTraceId,
          span,
          this.isRootAiSdkSpan(span, spans),
          userProvidedTraceId ? this.parseTraceName(spans) : undefined
        );
      }
    }
  }

  private processSpanAsLangfuseSpan(
    traceId: string,
    span: ReadableSpan,
    isRootSpan: boolean,
    rootSpanName?: string
  ): void {
    const spanContext = span.spanContext();
    const attributes = span.attributes;

    this.langfuse.span({
      traceId,
      parentObservationId: isRootSpan ? undefined : span.parentSpanId,
      id: spanContext.spanId,
      name:
        isRootSpan && rootSpanName
          ? rootSpanName
          : "ai.toolCall.name" in attributes
            ? "ai.toolCall " + attributes["ai.toolCall.name"]?.toString()
            : span.name,
      startTime: this.hrTimeToDate(span.startTime),
      endTime: this.hrTimeToDate(span.endTime),

      input: this.parseInput(span),
      output: this.parseOutput(span),

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
          : "ai.response.msToFirstChunk" in attributes
            ? new Date(this.hrTimeToDate(span.startTime).getTime() + Number(attributes["ai.response.msToFirstChunk"]))
            : "ai.stream.msToFirstChunk" in attributes //  Legacy support for ai SDK versions < 4.0.0
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
        toolChoice: "ai.prompt.toolChoice" in attributes ? attributes["ai.prompt.toolChoice"]?.toString() : undefined,
        maxTokens:
          "gen_ai.request.max_tokens" in attributes ? attributes["gen_ai.request.max_tokens"]?.toString() : undefined,
        finishReason:
          "gai.response.finishReason" in attributes
            ? attributes["ai.response.finishReason"]?.toString()
            : "gen_ai.finishReason" in attributes //  Legacy support for ai SDK versions < 4.0.0
              ? attributes["gen_ai.finishReason"]?.toString()
              : undefined,
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
      input: this.parseInput(span),
      output: this.parseOutput(span),

      metadata: this.filterTraceAttributes(this.parseSpanMetadata(span)),
      prompt: langfusePrompt,
    });
  }

  private parseSpanMetadata(span: ReadableSpan): Record<string, (typeof span.attributes)[0]> {
    return Object.entries(span.attributes).reduce(
      (acc, [key, value]) => {
        const metadataPrefix = "ai.telemetry.metadata.";

        if (key.startsWith(metadataPrefix) && value != null) {
          const strippedKey = key.slice(metadataPrefix.length);

          acc[strippedKey] = value;
        }

        const spanKeysToAdd = ["ai.settings.maxToolRoundtrips", "ai.prompt.format", "ai.toolCall.id", "ai.schema"];

        if (spanKeysToAdd.includes(key) && value != null) {
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

  private parseInput(span: ReadableSpan): (typeof span.attributes)[0] | undefined {
    const attributes = span.attributes;
    const tools = "ai.prompt.tools" in attributes ? attributes["ai.prompt.tools"] : [];

    let chatMessages: any[] = [];
    if ("ai.prompt.messages" in attributes) {
      chatMessages = [attributes["ai.prompt.messages"]];
      try {
        chatMessages = JSON.parse(attributes["ai.prompt.messages"] as string);
      } catch (e) {
        console.error("Error parsing ai.prompt.messages", e);
      }
    }

    return "ai.prompt.messages" in attributes
      ? [...chatMessages, ...(Array.isArray(tools) ? tools : [])]
      : "ai.prompt" in attributes
        ? attributes["ai.prompt"]
        : "ai.toolCall.args" in attributes
          ? attributes["ai.toolCall.args"]
          : undefined;
  }

  private parseOutput(span: ReadableSpan): (typeof span.attributes)[0] | undefined {
    const attributes = span.attributes;

    return "ai.response.text" in attributes
      ? attributes["ai.response.text"]
      : "ai.result.text" in attributes // Legacy support for ai SDK versions < 4.0.0
        ? attributes["ai.result.text"]
        : "ai.toolCall.result" in attributes
          ? attributes["ai.toolCall.result"]
          : "ai.response.object" in attributes
            ? attributes["ai.response.object"]
            : "ai.result.object" in attributes // Legacy support for ai SDK versions < 4.0.0
              ? attributes["ai.result.object"]
              : "ai.response.toolCalls" in attributes
                ? attributes["ai.response.toolCalls"]
                : "ai.result.toolCalls" in attributes // Legacy support for ai SDK versions < 4.0.0
                  ? attributes["ai.result.toolCalls"]
                  : undefined;
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
          !(parsedPrompt["name"] && parsedPrompt["version"] && typeof parsedPrompt["isFallback"] === "boolean")
        ) {
          throw Error("Invalid langfusePrompt");
        }

        return parsedPrompt;
      }
    } catch (e) {
      return undefined;
    }
  }

  private parseLangfuseUpdateParentTraceAttribute(spans: ReadableSpan[]): boolean {
    return Boolean(
      spans.map((span) => this.parseSpanMetadata(span)["langfuseUpdateParent"]).find((val) => val != null) ?? true // default to true if no attribute is set
    );
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
    const langfuseTraceAttributes = [
      "userId",
      "sessionId",
      "tags",
      "langfuseTraceId",
      "langfusePrompt",
      "langfuseUpdateParent",
    ];

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
