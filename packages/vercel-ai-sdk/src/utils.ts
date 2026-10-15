import type { OpenTelemetrySpanType } from "@ai-sdk/otel";
import {
  getGlobalLogger,
  LangfuseOtelSpanAttributes,
  serializeMetadataValue,
} from "@langfuse/core";
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
      const serialized = serializeMetadataValue(value);

      if (serialized !== undefined) {
        attributes[
          `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.${key}`
        ] = serialized;
      } else {
        getGlobalLogger().debug(
          `Observation metadata key "${key}" was not written because its value is ${value == null ? String(value) : "not JSON-serializable"}`,
        );
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
