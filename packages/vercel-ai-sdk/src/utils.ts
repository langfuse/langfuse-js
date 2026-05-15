import type { OpenTelemetrySpanType } from "@ai-sdk/otel";
import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { Attributes } from "@opentelemetry/api";

import type { LangfuseContext, LangfusePrompt } from "./types.js";

export type ResolvedLangfuseContext = LangfuseContext;

const PROMPT_SPAN_TYPES = new Set<OpenTelemetrySpanType>([
  "languageModel",
  "embedding",
  "reranking",
]);

export function resolveLangfuseContext({
  runtimeContext,
}: {
  runtimeContext?: Record<string, unknown>;
}): ResolvedLangfuseContext {
  return extractRuntimeLangfuseContext(runtimeContext);
}

export function createLangfuseObservationAttributes(
  langfuse: ResolvedLangfuseContext,
  spanType: OpenTelemetrySpanType,
): Attributes {
  const attributes: Attributes = {};

  if (shouldAttachPrompt(spanType)) {
    Object.assign(attributes, createLangfusePromptAttributes(langfuse.prompt));
  }

  if (langfuse.metadata) {
    for (const [key, value] of Object.entries(langfuse.metadata)) {
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

function extractRuntimeLangfuseContext(
  runtimeContext: Record<string, unknown> | undefined,
): ResolvedLangfuseContext {
  if (!runtimeContext || !isPlainObject(runtimeContext.langfuse)) {
    return {};
  }

  return normalizeLangfuseContext(runtimeContext.langfuse);
}

function normalizeLangfuseContext(
  value?: LangfuseContext,
): ResolvedLangfuseContext {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    metadata: isPlainObject(value.metadata) ? value.metadata : undefined,
    prompt: normalizePrompt(value.prompt),
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
