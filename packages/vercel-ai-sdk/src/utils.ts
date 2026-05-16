import type { OpenTelemetrySpanType } from "@ai-sdk/otel";
import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { Attributes } from "@opentelemetry/api";

import type { LangfusePrompt } from "./types.js";

export type ResolvedRuntimeContext = {
  metadata?: Record<string, unknown>;
  prompt?: LangfusePrompt;
};

const PROMPT_SPAN_TYPES = new Set<OpenTelemetrySpanType>([
  "languageModel",
  "embedding",
  "reranking",
]);

export function resolveRuntimeContext({
  runtimeContext,
}: {
  runtimeContext?: Record<string, unknown>;
}): ResolvedRuntimeContext {
  return extractRuntimeContext(runtimeContext);
}

export function createLangfuseObservationAttributes(
  context: ResolvedRuntimeContext,
  spanType: OpenTelemetrySpanType,
): Attributes {
  const attributes: Attributes = {};

  if (shouldAttachPrompt(spanType)) {
    Object.assign(attributes, createLangfusePromptAttributes(context.prompt));
  }

  if (context.metadata) {
    for (const [key, value] of Object.entries(context.metadata)) {
      const serialized =
        typeof value === "string" ? value : safeSerialize(value);

      if (serialized != null) {
        attributes[
          `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.${key}`
        ] = serialized;
      }
    }
  }

  return attributes;
}

function extractRuntimeContext(
  runtimeContext: Record<string, unknown> | undefined,
): ResolvedRuntimeContext {
  if (!runtimeContext) {
    return {};
  }

  const { langfusePrompt, ...metadata } = runtimeContext;
  const prompt = normalizePrompt(langfusePrompt);

  return {
    metadata,
    prompt,
  };
}

function normalizePrompt(value: unknown): LangfusePrompt | undefined {
  if (!isPlainObject(value)) {
    return;
  }

  if (typeof value.name !== "string" || typeof value.version !== "number") {
    return;
  }

  return {
    name: value.name,
    version: value.version,
    isFallback:
      typeof value.isFallback === "boolean" ? value.isFallback : false,
  };
}

function createLangfusePromptAttributes(prompt?: LangfusePrompt): Attributes {
  if (!prompt || prompt.isFallback) {
    return {};
  }

  return {
    [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]: prompt.name,
    [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]: prompt.version,
  };
}

function shouldAttachPrompt(spanType: OpenTelemetrySpanType): boolean {
  return PROMPT_SPAN_TYPES.has(spanType);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeSerialize(value: unknown): string | undefined {
  try {
    if (value == null) {
      return;
    }

    return JSON.stringify(value);
  } catch {
    return "<failed to serialize>";
  }
}
