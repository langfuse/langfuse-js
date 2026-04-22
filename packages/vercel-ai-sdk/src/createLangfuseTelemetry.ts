import type { TelemetryOptions } from "ai";

import { LangfuseVercelAiSdkIntegration } from "./LangfuseVercelAiSdkIntegration.js";
import type { CreateLangfuseTelemetryOptions } from "./types.js";

function asArray<T>(value?: T | T[]): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function createLangfuseTelemetry(
  options: CreateLangfuseTelemetryOptions,
): TelemetryOptions {
  const {
    tracer,
    integrations,
    functionId,
    isEnabled = true,
    recordInputs,
    recordOutputs,
    userId,
    sessionId,
    tags,
    metadata,
    traceName,
    prompt,
  } = options;

  const langfuseIntegration = new LangfuseVercelAiSdkIntegration({
    tracer,
    langfuse: {
      userId,
      sessionId,
      tags,
      metadata,
      traceName,
      prompt,
    },
  });

  const extraIntegrations = asArray(integrations);

  return {
    functionId,
    isEnabled,
    recordInputs,
    recordOutputs,
    integrations:
      extraIntegrations.length > 0
        ? [langfuseIntegration, ...extraIntegrations]
        : langfuseIntegration,
  };
}
