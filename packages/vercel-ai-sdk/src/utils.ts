import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { Attributes } from "@opentelemetry/api";

import type {
  LangfuseContext,
  LangfuseContextResolver,
  LangfusePrompt,
  LangfuseStartEvent,
} from "./types.js";

export type ResolvedLangfuseContext = LangfuseContext;

const GENERATION_SPAN_SUFFIXES = [
  ".doGenerate",
  ".doStream",
  ".doEmbed",
  ".doRerank",
];

export function resolveLangfuseContext({
  configuredLangfuse,
  event,
}: {
  configuredLangfuse?: LangfuseContext | LangfuseContextResolver;
  event: LangfuseStartEvent;
}): ResolvedLangfuseContext {
  const runtimeContext = extractRuntimeLangfuseContext(event);
  const configuredContext =
    typeof configuredLangfuse === "function"
      ? normalizeLangfuseContext(configuredLangfuse(event))
      : normalizeLangfuseContext(configuredLangfuse);

  return mergeLangfuseContexts(configuredContext, runtimeContext);
}

export function hasLangfuseObservationAttributes(
  langfuse: ResolvedLangfuseContext,
): boolean {
  return (
    Boolean(langfuse.prompt && !langfuse.prompt.isFallback) ||
    Boolean(langfuse.metadata && Object.keys(langfuse.metadata).length > 0)
  );
}

export function createLangfuseObservationAttributes(
  langfuse: ResolvedLangfuseContext,
  spanName: string,
): Attributes {
  const attributes: Attributes = {};

  if (shouldAttachPrompt(spanName)) {
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

export function getRuntimeContext(
  event: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const runtimeContext = isPlainObject(event.runtimeContext)
    ? event.runtimeContext
    : undefined;
  if (runtimeContext) {
    return runtimeContext;
  }

  return isPlainObject(event.context) ? event.context : undefined;
}

function extractRuntimeLangfuseContext(
  event: LangfuseStartEvent,
): ResolvedLangfuseContext {
  const runtimeContext = getRuntimeContext(
    event as unknown as Record<string, unknown>,
  );
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

function mergeLangfuseContexts(
  ...contexts: ResolvedLangfuseContext[]
): ResolvedLangfuseContext {
  const result: ResolvedLangfuseContext = {};

  for (const context of contexts) {
    if (context.prompt !== undefined) {
      result.prompt = context.prompt;
    }

    if (context.metadata !== undefined) {
      result.metadata = {
        ...(result.metadata ?? {}),
        ...context.metadata,
      };
    }
  }

  return result;
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

function shouldAttachPrompt(spanName: string): boolean {
  return GENERATION_SPAN_SUFFIXES.some((suffix) => spanName.endsWith(suffix));
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
