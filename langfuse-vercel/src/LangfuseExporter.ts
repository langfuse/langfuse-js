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

  async export(allSpans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
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

      // Schedule a flush. Necessary to ensure event delivery in Vercel Cloud Functions with streaming responses
      await this.langfuse.flushAsync();

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
      parentObservationId: isRootSpan ? undefined : this.getParentSpanId(span),
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
      parentObservationId: isRootSpan ? undefined : this.getParentSpanId(span),
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
        toolChoice:
          "ai.prompt.toolChoice" in attributes ? attributes["ai.prompt.toolChoice"]?.toString() ?? null : null,
        maxTokens:
          "gen_ai.request.max_tokens" in attributes
            ? attributes["gen_ai.request.max_tokens"]?.toString() ?? null
            : null,
        finishReason:
          "gen_ai.response.finish_reasons" in attributes
            ? attributes["gen_ai.response.finish_reasons"]?.toString() ?? null
            : "gen_ai.finishReason" in attributes //  Legacy support for ai SDK versions < 4.0.0
              ? attributes["gen_ai.finishReason"]?.toString() ?? null
              : null,
        system:
          "gen_ai.system" in attributes
            ? attributes["gen_ai.system"]?.toString() ?? null
            : "ai.model.provider" in attributes
              ? attributes["ai.model.provider"]?.toString() ?? null
              : null,
        maxRetries:
          "ai.settings.maxRetries" in attributes ? attributes["ai.settings.maxRetries"]?.toString() ?? null : null,
        mode: "ai.settings.mode" in attributes ? attributes["ai.settings.mode"]?.toString() ?? null : null,
        temperature:
          "gen_ai.request.temperature" in attributes
            ? attributes["gen_ai.request.temperature"]?.toString() ?? null
            : null,
      },
      usage: this.parseUsageDetails(attributes),
      usageDetails: this.parseUsageDetails(attributes),
      input: this.parseInput(span),
      output: this.parseOutput(span),

      metadata: this.filterTraceAttributes(this.parseSpanMetadata(span)),
      prompt: langfusePrompt,
    });
  }

  private parseUsageDetails(attributes: Record<string, any>): Record<string, any> {
    return {
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
    };
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
    // compat with OTEL SDKs v1 and v2
    // https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.0.0
    const instrumentationScopeName =
      (span as any).instrumentationLibrary?.name ?? (span as any).instrumentationScope?.name;
    return instrumentationScopeName === "ai";
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
    const parentSpanId = this.getParentSpanId(span);

    return !parentSpanId || !spanIds.has(parentSpanId);
  }

  private logDebug(message: string, ...args: any[]): void {
    if (!this.debug) {
      return;
    }

    console.log(`[${new Date().toISOString()}] [LangfuseExporter] ${message}`, ...args);
  }

  private getParentSpanId(span: ReadableSpan): string | null | undefined {
    // Typecast necessary for OTEL v1 v2 compat
    // https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.0.0
    return (span as any).parentSpanId ?? (span as any).parentSpanContext?.spanId;
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


  // Helper function to transform Vercel AI SDK messages to a more common/OpenAI-like format
  private transformMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) {
      this.logDebug("transformMessages received non-array input, returning as is:", messages);
      return messages;
    }

    return messages.map(message => {
      if (typeof message !== 'object' || message === null || !message.role) {
        return message; // Not a standard message object
      }

      const newMessage: any = { role: message.role };
      let textContentForAssistant: string | null = null; // For assistant role, text content

      if (Array.isArray(message.content)) {
        // Vercel AI SDK often puts content in an array of typed objects (MessageContentPart[])
        const contentParts = message.content as any[];

        if (message.role === "assistant") {
          const toolCallParts = contentParts.filter(part => part.type === "tool-call");
          const textParts = contentParts.filter(part => part.type === "text");

          if (textParts.length > 0) {
            textContentForAssistant = textParts.map(p => p.text).join("\n"); // Concatenate if multiple text parts
          }

          if (toolCallParts.length > 0) {
            newMessage.tool_calls = toolCallParts.map(tc => ({
              id: tc.toolCallId,
              type: "function", // Assuming 'function'
              function: {
                name: tc.toolName,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
              },
            }));
            newMessage.content = textContentForAssistant ?? null; // OpenAI: content is text or null if tool_calls
          } else if (textContentForAssistant !== null) {
            newMessage.content = textContentForAssistant;
          } else {
            // If no text and no tool_calls, but content is an array (e.g. other types)
            newMessage.content = JSON.stringify(message.content);
          }
        } else if (message.role === "tool") {
          const toolResultPart = contentParts.find(part => part.type === "tool-result");
          if (toolResultPart) {
            newMessage.tool_call_id = toolResultPart.toolCallId;
            newMessage.name = toolResultPart.toolName; // Corresponds to function name for OpenAI
            newMessage.content = typeof toolResultPart.result === 'string'
              ? toolResultPart.result
              : JSON.stringify(toolResultPart.result);
          } else {
            newMessage.content = JSON.stringify(message.content); // Fallback
          }
        } else if (message.role === "user" || message.role === "system") {
          const textParts = contentParts.filter(part => part.type === "text");
          if (textParts.length > 0) {
            newMessage.content = textParts.map(p => p.text).join("\n");
          } else {
            // Handle other content types for user/system if necessary (e.g., images)
            newMessage.content = JSON.stringify(message.content);
          }
        } else {
           // Other roles, stringify content if it's an array
           newMessage.content = JSON.stringify(message.content);
        }
      } else if (typeof message.content === 'string') {
        newMessage.content = message.content;
      } else if (message.content === null || message.content === undefined) {
        newMessage.content = null;
      } else {
        // Fallback for unknown content structure (e.g. object but not array)
        newMessage.content = JSON.stringify(message.content);
      }
      return newMessage;
    });
  }

  private parseInput(span: ReadableSpan): any | undefined {
    const attributes = span.attributes;
    let parsedMessages: any[] | undefined = undefined;
    let parsedTools: any[] | undefined = undefined;

    // Parse messages
    if ("ai.prompt.messages" in attributes) {
      const rawMessages = attributes["ai.prompt.messages"];
      if (typeof rawMessages === 'string') {
        try {
          parsedMessages = JSON.parse(rawMessages);
          if (!Array.isArray(parsedMessages)) {
            this.logDebug("Parsed 'ai.prompt.messages' is not an array:", parsedMessages);
            parsedMessages = undefined;
          }
        } catch (e) {
          console.error("LangfuseExporter: Error parsing 'ai.prompt.messages'", e);
          parsedMessages = undefined;
        }
      } else if (Array.isArray(rawMessages)) {
         parsedMessages = rawMessages;
      }

      if (parsedMessages) {
        parsedMessages = this.transformMessages(parsedMessages);
      }
    }

    // Parse tools
    if ("ai.prompt.tools" in attributes) {
      const rawTools = attributes["ai.prompt.tools"];
      if (typeof rawTools === 'string') {
        try {
          parsedTools = JSON.parse(rawTools);
           if (!Array.isArray(parsedTools)) {
            this.logDebug("Parsed 'ai.prompt.tools' is not an array:", parsedTools);
            parsedTools = undefined;
          }
        } catch (e) {
          console.error("LangfuseExporter: Error parsing 'ai.prompt.tools'", e);
          parsedTools = undefined;
        }
      } else if (Array.isArray(rawTools)) {
        parsedTools = rawTools;
      }
    }

    // Construct the input object based on what was parsed
    if (parsedMessages && parsedTools) {
      return { messages: parsedMessages, tools: parsedTools };
    } else if (parsedMessages) {
      return { messages: parsedMessages };
    } else if (parsedTools) {
      return { tools: parsedTools };
    }

    // Fallbacks for non-chat/tool inputs (simple prompts)
    if ("ai.prompt" in attributes) {
      return attributes["ai.prompt"];
    }
    // `ai.toolCall.args` is input for a tool execution span, not LLM generation.
    return undefined;
  }

  private parseOutput(span: ReadableSpan): any | undefined {
    const attributes = span.attributes;
    let assistantResponse: any = undefined;
    let textContent: string | null = null;

    if ("ai.response.text" in attributes) {
        textContent = attributes["ai.response.text"]?.toString() ?? null;
    } else if ("ai.result.text" in attributes) { // Legacy support
        textContent = attributes["ai.result.text"]?.toString() ?? null;
    }

    if ("ai.response.toolCalls" in attributes || "ai.result.toolCalls" in attributes) {
        const rawToolCalls = attributes["ai.response.toolCalls"] ?? attributes["ai.result.toolCalls"];
        let parsedToolCalls;
        if (typeof rawToolCalls === 'string') {
            try {
                parsedToolCalls = JSON.parse(rawToolCalls);
            } catch (e) {
                console.error("LangfuseExporter: Error parsing toolCalls in output", e);
            }
        } else {
            parsedToolCalls = rawToolCalls; // Assume it's already an array of Vercel SDK tool call objects
        }

        if (Array.isArray(parsedToolCalls) && parsedToolCalls.length > 0) {
            const transformedToolCalls = parsedToolCalls.map(tc => ({
                id: tc.toolCallId || tc.id, // Vercel uses toolCallId
                type: "function",
                function: {
                    name: tc.toolName || tc.function?.name,
                    arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args ?? tc.function?.arguments),
                },
            }));
            // Langfuse generation.output for an assistant message with tool calls
            assistantResponse = {
                content: textContent, // Text content alongside tool_calls
                tool_calls: transformedToolCalls
            };
        } else if (textContent !== null) {
             // Only text response
            assistantResponse = textContent;
        }
    } else if (textContent !== null) {
        assistantResponse = textContent;
    } else if ("ai.response.object" in attributes) {
        assistantResponse = attributes["ai.response.object"];
    } else if ("ai.result.object" in attributes) { // Legacy
        assistantResponse = attributes["ai.result.object"];
    }
    return assistantResponse;
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
