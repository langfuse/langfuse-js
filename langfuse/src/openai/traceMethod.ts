import type OpenAI from "openai";
import type { LangfuseParent } from "./types";

import { LangfuseSingleton } from "./LangfuseSingleton";
import { getToolCallOutput, parseChunk, parseCompletionOutput, parseInputArgs, parseUsage } from "./parseOpenAI";
import { isAsyncIterable } from "./utils";
import type { LangfuseConfig } from "./types";

type GenericMethod = (...args: unknown[]) => unknown;

export const withTracing = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig & Required<{ generationName: string }>
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  return (...args) => wrapMethod(tracedMethod, config, ...args);
};

const wrapMethod = async <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig,
  ...args: Parameters<T>
): Promise<ReturnType<T> | any> => {
  const { model, input, modelParameters } = parseInputArgs(args[0] ?? {});
  let observationData = {
    model,
    input,
    modelParameters,
    name: config?.generationName,
    startTime: new Date(),
    promptName: config?.langfusePrompt?.name,
    promptVersion: config?.langfusePrompt?.version,
  };

  let langfuseParent: LangfuseParent;
  const hasUserProvidedParent = config && "parent" in config;

  if (hasUserProvidedParent) {
    langfuseParent = config.parent;
    observationData = {
      ...config,
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
      timestamp: observationData.startTime,
    });
  }

  try {
    const res = await tracedMethod(...args);

    // Handle stream responses
    if (isAsyncIterable(res)) {
      async function* tracedOutputGenerator(): AsyncGenerator<unknown, void, unknown> {
        const response = res;
        const textChunks: string[] = [];
        const toolCallChunks: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] = [];
        let completionStartTime: Date | null = null;

        for await (const rawChunk of response as AsyncIterable<unknown>) {
          completionStartTime = completionStartTime ?? new Date();

          const processedChunk = parseChunk(rawChunk);

          if (!processedChunk.isToolCall) {
            textChunks.push(processedChunk.data);
          } else {
            toolCallChunks.push(processedChunk.data);
          }

          yield rawChunk;
        }

        const output = toolCallChunks.length > 0 ? getToolCallOutput(toolCallChunks) : textChunks.join("");

        langfuseParent.generation({
          ...observationData,
          output,
          endTime: new Date(),
          completionStartTime,
        });

        if (!hasUserProvidedParent) {
          langfuseParent.update({ output });
        }
      }

      return tracedOutputGenerator() as ReturnType<T>;
    }

    const output = parseCompletionOutput(res);
    const usage = parseUsage(res);

    langfuseParent.generation({
      ...observationData,
      output,
      endTime: new Date(),
      usage,
    });

    if (!hasUserProvidedParent) {
      langfuseParent.update({ output });
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
    });

    throw error;
  }
};
