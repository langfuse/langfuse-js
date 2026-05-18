import type { OpenTelemetrySpanType } from "@ai-sdk/otel";
import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { Attributes } from "@opentelemetry/api";

import type { LangfusePrompt } from "./types.js";

const PROMPT_SPAN_TYPES = new Set<OpenTelemetrySpanType>([
  "languageModel",
  "embedding",
  "reranking",
]);

export function createLangfuseObservationAttributes(params: {
  runtimeContext?: Record<string, unknown>;
  spanType: OpenTelemetrySpanType;
}): Attributes {
  const { runtimeContext, spanType } = params;
  const attributes: Attributes = {};

  if (!runtimeContext) {
    return attributes;
  }

  const { langfusePrompt, ...metadata } = runtimeContext;

  // Handle prompt data
  const prompt = normalizePrompt(langfusePrompt);

  if (PROMPT_SPAN_TYPES.has(spanType) && prompt && !prompt.isFallback) {
    attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] =
      prompt.name;
    attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION] =
      prompt.version;
  }

  // Handle metadata
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
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
