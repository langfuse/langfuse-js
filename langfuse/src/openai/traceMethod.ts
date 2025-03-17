import type OpenAI from "openai";

import { type CreateLangfuseGenerationBody } from "langfuse-core";

import { LangfuseSingleton } from "./LangfuseSingleton";
import {
  getToolCallOutput,
  parseChunk,
  parseCompletionOutput,
  parseInputArgs,
  parseUsage,
  parseUsageDetails,
  parseModelDataFromResponse,
  parseUsageDetailsFromResponse,
} from "./parseOpenAI";
import { isAsyncIterable } from "./utils";
import type { LangfuseConfig, LangfuseParent } from "./types";

type GenericMethod = (...args: unknown[]) => unknown;

export const withTracing = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig & Required<{ generationName: string }>
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  return (...args) => wrapMethod(tracedMethod, config, ...args);
};

const wrapMethod = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig,
  ...args: Parameters<T>
): ReturnType<T> | any => {
  const { model, input, modelParameters } = parseInputArgs(args[0] ?? {});

  const finalModelParams = { ...modelParameters, response_format: undefined };
  const finalMetadata = {
    ...config?.metadata,
    response_format: "response_format" in modelParameters ? modelParameters.response_format : undefined,
  };

  let observationData = {
    model,
    input,
    modelParameters: finalModelParams,
    name: config?.generationName,
    startTime: new Date(),
    promptName: config?.langfusePrompt?.name,
    promptVersion: config?.langfusePrompt?.version,
    metadata: finalMetadata,
  };

  let langfuseParent: LangfuseParent;
  const hasUserProvidedParent = config && "parent" in config;

  if (hasUserProvidedParent) {
    langfuseParent = config.parent;

    // Remove the parent from the config to avoid circular references in the generation body
    const filteredConfig = { ...config, parent: undefined };

    observationData = {
      ...filteredConfig,
      ...observationData,
      promptName: config?.promptName ?? config?.langfusePrompt?.name, // Maintain backward compatibility for users who use promptName
      promptVersion: config?.promptVersion ?? config?.langfusePrompt?.version, // Maintain backward compatibility for users who use promptVersion
    };
  } else {
    const langfuse = LangfuseSingleton.getInstance(config?.clientInitParams);
    langfuseParent = langfuse.trace({
      ...config,
      ...observationData,
      id: config?.traceId,
      name: config?.traceName,
      timestamp: observationData.startTime,
    });
  }

  try {
    const res = tracedMethod(...args);

    // Handle stream responses
    if (isAsyncIterable(res)) {
      return wrapAsyncIterable(res, langfuseParent, hasUserProvidedParent, observationData);
    }

    if (res instanceof Promise) {
      const wrappedPromise = res
        .then((result) => {
          if (isAsyncIterable(result)) {
            return wrapAsyncIterable(result, langfuseParent, hasUserProvidedParent, observationData);
          }

          const output = parseCompletionOutput(result);
          const usage = parseUsage(result);
          const usageDetails = parseUsageDetailsFromResponse(result);
          const {
            model: modelFromResponse,
            modelParameters: modelParametersFromResponse,
            metadata: metadataFromResponse,
          } = parseModelDataFromResponse(result);

          langfuseParent.generation({
            ...observationData,
            output,
            endTime: new Date(),
            usage,
            usageDetails,
            model: modelFromResponse || observationData.model,
            modelParameters: { ...observationData.modelParameters, ...modelParametersFromResponse },
            metadata: { ...observationData.metadata, ...metadataFromResponse },
          });

          if (!hasUserProvidedParent) {
            langfuseParent.update({ output });
          }

          return result;
        })
        .catch((err) => {
          langfuseParent.generation({
            ...observationData,
            endTime: new Date(),
            statusMessage: String(err),
            level: "ERROR",
            usage: {
              inputCost: 0,
              outputCost: 0,
              totalCost: 0,
            },
            costDetails: {
              input: 0,
              output: 0,
              total: 0,
            },
          });

          throw err;
        });

      return wrappedPromise;
    }

    return res;
  } catch (error) {
    langfuseParent.generation({
      ...observationData,
      endTime: new Date(),
      statusMessage: String(error),
      level: "ERROR",
      usage: {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
      },
      costDetails: {
        input: 0,
        output: 0,
        total: 0,
      },
    });

    throw error;
  }
};

function wrapAsyncIterable<R>(
  iterable: AsyncIterable<unknown>,
  langfuseParent: LangfuseParent,
  hasUserProvidedParent: boolean | undefined,
  observationData: Record<string, any>
): R {
  async function* tracedOutputGenerator(): AsyncGenerator<unknown, void, unknown> {
    const response = iterable;
    const textChunks: string[] = [];
    const toolCallChunks: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] = [];
    let completionStartTime: Date | null = null;
    let usage: OpenAI.CompletionUsage | null = null;
    let usageDetails: CreateLangfuseGenerationBody["usageDetails"] = undefined;
    let output: CreateLangfuseGenerationBody["output"] = null;

    for await (const rawChunk of response as AsyncIterable<unknown>) {
      completionStartTime = completionStartTime ?? new Date();

      // Handle Response API chunks
      if (typeof rawChunk === "object" && rawChunk && "response" in rawChunk) {
        const result = rawChunk["response"];
        output = parseCompletionOutput(result);
        usageDetails = parseUsageDetailsFromResponse(result);

        const {
          model: modelFromResponse,
          modelParameters: modelParametersFromResponse,
          metadata: metadataFromResponse,
        } = parseModelDataFromResponse(result);

        observationData["model"] = modelFromResponse ?? observationData["model"];
        observationData["modelParameters"] = { ...observationData.modelParameters, ...modelParametersFromResponse };
        observationData["metadata"] = { ...observationData.metadata, ...metadataFromResponse };
      }

      if (typeof rawChunk === "object" && rawChunk != null && "usage" in rawChunk) {
        usage = rawChunk.usage as OpenAI.CompletionUsage | null;
      }

      const processedChunk = parseChunk(rawChunk);

      if (!processedChunk.isToolCall) {
        textChunks.push(processedChunk.data);
      } else {
        toolCallChunks.push(processedChunk.data);
      }

      yield rawChunk;
    }

    output = output ?? (toolCallChunks.length > 0 ? getToolCallOutput(toolCallChunks) : textChunks.join(""));

    langfuseParent.generation({
      ...observationData,
      output,
      endTime: new Date(),
      completionStartTime,
      usage: usage
        ? {
            input: "prompt_tokens" in usage ? usage.prompt_tokens : undefined,
            output: "completion_tokens" in usage ? usage.completion_tokens : undefined,
            total: "total_tokens" in usage ? usage.total_tokens : undefined,
          }
        : undefined,
      usageDetails: usageDetails ?? (usage ? parseUsageDetails(usage) : undefined),
    });

    if (!hasUserProvidedParent) {
      langfuseParent.update({ output });
    }
  }

  return tracedOutputGenerator() as R;
}
