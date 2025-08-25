import { LangfuseGeneration, startObservation } from "@langfuse/tracing";
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

/**
 * Generic method type for any function that can be traced.
 * @internal
 */
type GenericMethod = (...args: unknown[]) => unknown;

/**
 * Wraps a method with Langfuse tracing functionality.
 *
 * This function creates a wrapper around OpenAI SDK methods that automatically
 * creates Langfuse generations, captures input/output data, handles streaming
 * responses, and records usage metrics and errors.
 *
 * @param tracedMethod - The OpenAI SDK method to wrap with tracing
 * @param config - Configuration for the trace and generation
 * @returns A wrapped version of the method that creates Langfuse traces
 *
 * @internal
 */
export const withTracing = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig & Required<{ generationName: string }>,
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  return (...args) => wrapMethod(tracedMethod, config, ...args);
};

/**
 * Internal method that handles the actual tracing logic for OpenAI SDK methods.
 *
 * This function creates a Langfuse generation, executes the original method,
 * and captures all relevant data including input, output, usage, and errors.
 * It handles both streaming and non-streaming responses appropriately.
 *
 * @param tracedMethod - The original OpenAI SDK method to execute
 * @param config - Langfuse configuration options
 * @param args - Arguments to pass to the original method
 * @returns The result from the original method, potentially wrapped for streaming
 *
 * @internal
 */
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

  const generation = startObservation(
    config?.generationName ?? "OpenAI-completion",
    {
      model,
      input,
      modelParameters: finalModelParams,
      prompt: config?.langfusePrompt,
      metadata: finalMetadata,
    },
    {
      asType: "generation",
      parentSpanContext: config?.parentSpanContext,
    },
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

/**
 * Wraps an async iterable (streaming response) with Langfuse tracing.
 *
 * This function handles streaming OpenAI responses by collecting chunks,
 * parsing usage information, and updating the Langfuse generation with
 * the complete output and usage details once the stream is consumed.
 *
 * @param iterable - The async iterable from OpenAI (streaming response)
 * @param generation - The Langfuse generation to update with stream data
 * @returns An async generator that yields original chunks while collecting data
 *
 * @internal
 */
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
