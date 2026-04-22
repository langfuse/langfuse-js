import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { AttributeValue, Attributes } from "@opentelemetry/api";
import type { TelemetryOptions } from "ai";

import type {
  LangfuseContext,
  LangfuseContextResolver,
  LangfusePrompt,
  LangfuseStartEvent,
} from "./types.js";

export type ResolvedLangfuseContext = LangfuseContext;

type TelemetryAttribute =
  | AttributeValue
  | { input: () => AttributeValue | undefined }
  | { output: () => AttributeValue | undefined }
  | undefined;

const LEGACY_METADATA_KEYS = new Set([
  "userId",
  "sessionId",
  "tags",
  "langfusePrompt",
  "traceName",
]);

export function asArray<T>(value?: T | T[]): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function getBaseTelemetryAttributes({
  model,
  settings,
  headers,
  runtimeContext,
}: {
  model: { modelId: string; provider: string };
  settings: Record<string, unknown>;
  headers: Record<string, string | undefined> | undefined;
  runtimeContext: Record<string, unknown> | undefined;
}): Attributes {
  return {
    "ai.model.provider": model.provider,
    "ai.model.id": model.modelId,
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      attributes[`ai.settings.${key}`] = value as AttributeValue;
      return attributes;
    }, {} as Attributes),
    ...Object.entries(runtimeContext ?? {}).reduce(
      (attributes, [key, value]) => {
        if (value !== undefined) {
          attributes[`ai.settings.context.${key}`] = value as AttributeValue;
        }

        return attributes;
      },
      {} as Attributes,
    ),
    ...Object.entries(headers ?? {}).reduce((attributes, [key, value]) => {
      if (value !== undefined) {
        attributes[`ai.request.headers.${key}`] = value;
      }

      return attributes;
    }, {} as Attributes),
  };
}

export function assembleOperationName({
  operationId,
  telemetry,
}: {
  operationId: string;
  telemetry?: TelemetryOptions;
}): Attributes {
  return {
    "operation.name": `${operationId}${
      telemetry?.functionId != null ? ` ${telemetry.functionId}` : ""
    }`,
    "resource.name": telemetry?.functionId,
    "ai.operationId": operationId,
    "ai.telemetry.functionId": telemetry?.functionId,
  };
}

export function selectAttributes({
  telemetry,
  attributes,
}: {
  telemetry?: TelemetryOptions;
  attributes: Record<string, TelemetryAttribute>;
}): Attributes {
  if (telemetry?.isEnabled === false) {
    return {};
  }

  const result: Attributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) {
      continue;
    }

    if (
      typeof value === "object" &&
      "input" in value &&
      typeof value.input === "function"
    ) {
      if (telemetry?.recordInputs === false) {
        continue;
      }

      const resolved = value.input();
      if (resolved != null) {
        result[key] = resolved;
      }
      continue;
    }

    if (
      typeof value === "object" &&
      "output" in value &&
      typeof value.output === "function"
    ) {
      if (telemetry?.recordOutputs === false) {
        continue;
      }

      const resolved = value.output();
      if (resolved != null) {
        result[key] = resolved;
      }
      continue;
    }

    result[key] = value as AttributeValue;
  }

  return result;
}

export function resolveLangfuseContext({
  configuredLangfuse,
  event,
}: {
  configuredLangfuse?: LangfuseContext | LangfuseContextResolver;
  event: LangfuseStartEvent;
}): ResolvedLangfuseContext {
  const runtimeContext = extractRuntimeLangfuseContext(event);
  const legacyContext = extractLegacyLangfuseContext(event);
  const configuredContext =
    typeof configuredLangfuse === "function"
      ? normalizeLangfuseContext(configuredLangfuse(event))
      : normalizeLangfuseContext(configuredLangfuse);

  return mergeLangfuseContexts(
    configuredContext,
    legacyContext,
    runtimeContext,
  );
}

export function createLangfuseTraceAttributes(
  langfuse: ResolvedLangfuseContext,
): Attributes {
  const attributes: Attributes = {
    [LangfuseOtelSpanAttributes.TRACE_USER_ID]: langfuse.userId,
    [LangfuseOtelSpanAttributes.TRACE_COMPAT_USER_ID]: langfuse.userId,
    [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: langfuse.sessionId,
    [LangfuseOtelSpanAttributes.TRACE_COMPAT_SESSION_ID]: langfuse.sessionId,
    [LangfuseOtelSpanAttributes.TRACE_TAGS]:
      langfuse.tags && langfuse.tags.length > 0 ? langfuse.tags : undefined,
    [LangfuseOtelSpanAttributes.TRACE_NAME]: langfuse.traceName,
  };

  if (langfuse.metadata) {
    for (const [key, value] of Object.entries(langfuse.metadata)) {
      const serialized =
        typeof value === "string" ? value : safeSerialize(value);
      if (serialized != null) {
        attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`] =
          serialized;
      }
    }
  }

  return filterUndefinedAttributes(attributes);
}

export function createLangfusePromptAttributes(
  prompt?: LangfusePrompt,
): Attributes {
  if (!prompt || prompt.isFallback) {
    return {};
  }

  return {
    [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]: prompt.name,
    [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]: prompt.version,
  };
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

function extractLegacyLangfuseContext(
  event: LangfuseStartEvent,
): ResolvedLangfuseContext {
  const metadata = (event as unknown as Record<string, unknown>).metadata;
  if (!isPlainObject(metadata)) {
    return {};
  }

  const metadataCopy: Record<string, unknown> = { ...metadata };
  const prompt = normalizePrompt(metadata.langfusePrompt);
  delete metadataCopy.langfusePrompt;

  return {
    userId: typeof metadata.userId === "string" ? metadata.userId : undefined,
    sessionId:
      typeof metadata.sessionId === "string" ? metadata.sessionId : undefined,
    tags: Array.isArray(metadata.tags)
      ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    traceName:
      typeof metadata.traceName === "string" ? metadata.traceName : undefined,
    prompt,
    metadata: Object.fromEntries(
      Object.entries(metadataCopy).filter(
        ([key, value]) => !LEGACY_METADATA_KEYS.has(key) && value !== undefined,
      ),
    ),
  };
}

function normalizeLangfuseContext(
  value?: LangfuseContext,
): ResolvedLangfuseContext {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    userId: typeof value.userId === "string" ? value.userId : undefined,
    sessionId:
      typeof value.sessionId === "string" ? value.sessionId : undefined,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    metadata: isPlainObject(value.metadata) ? value.metadata : undefined,
    traceName:
      typeof value.traceName === "string" ? value.traceName : undefined,
    prompt: normalizePrompt(value.prompt),
  };
}

function mergeLangfuseContexts(
  ...contexts: ResolvedLangfuseContext[]
): ResolvedLangfuseContext {
  const result: ResolvedLangfuseContext = {};

  for (const context of contexts) {
    if (context.userId !== undefined) {
      result.userId = context.userId;
    }

    if (context.sessionId !== undefined) {
      result.sessionId = context.sessionId;
    }

    if (context.tags !== undefined) {
      result.tags = context.tags;
    }

    if (context.traceName !== undefined) {
      result.traceName = context.traceName;
    }

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

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeSerialize(value: unknown): string | undefined {
  try {
    if (value == null) {
      return;
    }

    if (typeof value === "string") {
      return value;
    }

    return JSON.stringify(value);
  } catch {
    return "<failed to serialize>";
  }
}

function filterUndefinedAttributes(attributes: Attributes): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  );
}
