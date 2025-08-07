import { LangfuseGeneration, startGeneration } from "@langfuse/tracing";
import type OpenAI from "openai";

import {
  getToolCallOutput,
  parseChunk,
  parseCompletionOutput,
  parseInputArgs,
  parseUsageDetails,
  parseModelDataFromResponse,
  parseUsageDetailsFromResponse,
} from "./parseOpenAI.js";
import type { LangfuseConfig } from "./types.js";
import { isAsyncIterable } from "./utils.js";

type GenericMethod = (...args: unknown[]) => unknown;

export const withTracing = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig & Required<{ generationName: string }>,
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  return (...args) => wrapMethod(tracedMethod, config, ...args);
};

const wrapMethod = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig,
  ...args: Parameters<T>
): ReturnType<T> | any => {
  const { model, input, modelParameters } = parseInputArgs(args[0] ?? {});

  const finalModelParams = { ...modelParameters, response_format: null };
  const finalMetadata = {
    ...config?.generationMetadata,
    response_format:
      "response_format" in modelParameters
        ? modelParameters.response_format
        : undefined,
  };

  const generation = startGeneration(
    config?.generationName ?? "OpenAI-completion",
    {
      model,
      input,
      modelParameters: finalModelParams,
      prompt: config?.langfusePrompt,
      metadata: finalMetadata,
    },
    { parentSpanContext: config?.parentSpanContext },
  ).updateTrace({
    userId: config?.userId,
    sessionId: config?.sessionId,
    tags: config?.tags,
    name: config?.traceName,
  });

  try {
    const res = tracedMethod(...args);

    // Handle stream responses
    if (isAsyncIterable(res)) {
      return wrapAsyncIterable(res, generation);
    }

    if (res instanceof Promise) {
      const wrappedPromise = res
        .then((result) => {
          if (isAsyncIterable(result)) {
            return wrapAsyncIterable(result, generation);
          }

          const output = parseCompletionOutput(result);
          const usageDetails = parseUsageDetailsFromResponse(result);
          const {
            model: modelFromResponse,
            modelParameters: modelParametersFromResponse,
            metadata: metadataFromResponse,
          } = parseModelDataFromResponse(result);

          generation
            .update({
              output,
              usageDetails,
              model: modelFromResponse,
              modelParameters: modelParametersFromResponse,
              metadata: metadataFromResponse,
            })
            .end();

          return result;
        })
        .catch((err) => {
          generation
            .update({
              statusMessage: String(err),
              level: "ERROR",
              costDetails: {
                input: 0,
                output: 0,
                total: 0,
              },
            })
            .end();

          throw err;
        });

      return wrappedPromise;
    }

    return res;
  } catch (error) {
    generation
      .update({
        statusMessage: String(error),
        level: "ERROR",
        costDetails: {
          input: 0,
          output: 0,
          total: 0,
        },
      })
      .end();

    throw error;
  }
};

function wrapAsyncIterable<R>(
  iterable: AsyncIterable<unknown>,
  generation: LangfuseGeneration,
): R {
  async function* tracedOutputGenerator(): AsyncGenerator<
    unknown,
    void,
    unknown
  > {
    const response = iterable;
    const textChunks: string[] = [];
    const toolCallChunks: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] =
      [];
    let usage: OpenAI.CompletionUsage | null = null;
    let completionStartTime: Date | undefined = undefined;
    let usageDetails: Record<string, number> | undefined = undefined;
    let output: unknown = null;

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

        generation.update({
          model: modelFromResponse,
          modelParameters: modelParametersFromResponse,
          metadata: metadataFromResponse,
        });
      }

      if (
        typeof rawChunk === "object" &&
        rawChunk != null &&
        "usage" in rawChunk
      ) {
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

    output =
      output ??
      (toolCallChunks.length > 0
        ? getToolCallOutput(toolCallChunks)
        : textChunks.join(""));

    generation
      .update({
        output,
        completionStartTime,
        usageDetails:
          usageDetails ?? (usage ? parseUsageDetails(usage) : undefined),
      })
      .end();
  }

  return tracedOutputGenerator() as R;
}
