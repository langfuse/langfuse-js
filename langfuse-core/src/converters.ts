import { type components } from "./openapi/server";
import {
  type UpdateLangfuseSpanBody,
  type CreateLangfuseSpanBody,
  type UpdateLangfuseGenerationBody,
  type CreateLangfuseGenerationBody,
  type CreateLangfuseEventBody,
  type Usage,
} from "./types";

export function convertEvent(body: CreateLangfuseEventBody): components["schemas"]["ObservationEvent"] {
  const { id, traceId, startTime, level, ...rest } = body;

  if (!id || !traceId) {
    throw new Error("Cannot convert to ingestion format without id and traceId");
  }

  const observation = {
    id,
    traceId,
    startTime: startTime?.toISOString(),
    level: level ?? "DEFAULT",
    ...rest,
    type: "EVENT",
  };
  return observation;
}

export function convertSpanUpdate(body: UpdateLangfuseSpanBody): components["schemas"]["ObservationEvent"] {
  const { spanId, traceId, startTime, endTime, level, ...rest } = body;

  if (!spanId || !traceId) {
    throw new Error("Cannot convert to ingestion format without id and traceId");
  }

  const observation = {
    id: spanId,
    traceId,
    startTime: startTime?.toISOString(),
    endTime: endTime?.toISOString(),
    level: level ?? "DEFAULT",
    ...rest,
    type: "SPAN",
  };
  return observation;
}

export function convertSpanCreation(body: CreateLangfuseSpanBody): components["schemas"]["ObservationEvent"] {
  const { id, traceId, startTime, endTime, level, ...rest } = body;

  if (!id || !traceId) {
    throw new Error("Cannot convert to ingestion format without id and traceId");
  }

  const observation = {
    id,
    traceId,
    startTime: startTime?.toISOString(),
    endTime: endTime?.toISOString(),
    level: level ?? "DEFAULT",
    ...rest,
    type: "SPAN",
  };
  return observation;
}

export function convertGenerationUpdate(body: UpdateLangfuseGenerationBody): components["schemas"]["ObservationEvent"] {
  const { generationId, traceId, startTime, endTime, completionStartTime, level, usage, prompt, completion, ...rest } =
    body;

  if (!generationId) {
    throw new Error("Cannot convert to ingestion format without generationId");
  }

  const newUsage = convertToNewUsageFormat(body.usage);

  const observation = {
    id: generationId,
    traceId,
    startTime: startTime?.toISOString(),
    endTime: endTime?.toISOString(),
    completionStartTime: completionStartTime?.toISOString(),
    level: level ?? "DEFAULT",
    usage: newUsage,
    input: prompt,
    output: completion,
    ...rest,
    type: "GENERATION",
  };
  return observation;
}

export function convertGenerationCreation(
  body: CreateLangfuseGenerationBody
): components["schemas"]["ObservationEvent"] {
  const { id, traceId, startTime, endTime, completionStartTime, level, usage, prompt, completion, ...rest } = body;

  if (!id || !traceId) {
    throw new Error("Cannot convert to ingestion format without id and traceId");
  }

  const newUsage = convertToNewUsageFormat(body.usage);

  const observation = {
    id: id,
    traceId,
    startTime: startTime?.toISOString(),
    endTime: endTime?.toISOString(),
    completionStartTime: completionStartTime?.toISOString(),
    level: level ?? "DEFAULT",
    usage: newUsage,
    input: prompt,
    output: completion,
    ...rest,
    type: "GENERATION",
  };
  return observation;
}

export function convertToNewUsageFormat(usage?: Usage): components["schemas"]["Usage"] | undefined {
  if (!usage) {
    return undefined;
  }

  // If usage has promptTokens, completionTokens, or totalTokens,
  // then transform it to the new format and set the unit to 'TOKENS'
  if ("promptTokens" in usage || "completionTokens" in usage || "totalTokens" in usage) {
    return {
      input: usage.promptTokens,
      output: usage.completionTokens,
      total: usage.totalTokens,
      unit: "TOKENS" as const, // Ensure 'unit' is always set to 'TOKENS' in this case
    };
  } // If usage has 'input', ensure 'unit' is set (to either its existing value or default to 'TOKENS')
  else if ("input" in usage || "output" in usage || "total" in usage) {
    return {
      ...usage,
      unit: usage.unit || ("TOKENS" as const),
    };
  }

  // If none of the above conditions are met, the format is invalid
  throw new Error("Invalid usage format");
}
