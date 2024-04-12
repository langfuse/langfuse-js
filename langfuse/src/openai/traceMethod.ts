import { LangfuseTraceClient } from "langfuse-core";

import { LangfuseSingleton } from "./LangfuseSingleton";
import { parseChunk, parseCompletionOutput, parseInputArgs, parseUsage } from "./parseOpenAI";
import { isAsyncIterable } from "./utils";
import type { LangfuseConfig } from "./observeOpenAI";

type GenericMethod = (...args: unknown[]) => unknown;

export const withTracing = <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  return (...args) => wrapMethod(tracedMethod, config, ...args);
};

const wrapMethod = async <T extends GenericMethod>(
  tracedMethod: T,
  config?: LangfuseConfig,
  ...args: Parameters<T>
): Promise<ReturnType<T> | any> => {
  const { model, input, modelParameters } = parseInputArgs(args[0] ?? {});
  const data = {
    model,
    input,
    modelParameters,
    name: config?.traceName,
    startTime: new Date(),
  };
  const langfuse = LangfuseSingleton.getInstance();
  const requestedTraceId = config?.traceId;

  let langfuseTrace: LangfuseTraceClient;
  if (!requestedTraceId) {
    langfuseTrace = langfuse.trace({
      ...config,
      ...data,
      timestamp: data.startTime,
    });
  } else {
    langfuseTrace = new LangfuseTraceClient(langfuse, requestedTraceId);
  }

  try {
    const res = await tracedMethod(...args);

    // Handle stream responses
    if (isAsyncIterable(res)) {
      async function* tracedOutputGenerator(): AsyncGenerator<unknown, void, unknown> {
        const response = res;
        const processedChunks: string[] = [];
        let completionStartTime: Date | null = null;

        for await (const rawChunk of response as AsyncIterable<unknown>) {
          completionStartTime = completionStartTime ?? new Date();

          const processedChunk = parseChunk(rawChunk);
          processedChunks.push(processedChunk);

          yield rawChunk;
        }

        const output = processedChunks.join("");

        langfuseTrace.generation({
          ...data,
          output,
          endTime: new Date(),
          completionStartTime,
        });

        if (!requestedTraceId) {
          langfuseTrace.update({ output });
        }
      }

      return tracedOutputGenerator() as ReturnType<T>;
    }

    const output = parseCompletionOutput(res);
    const usage = parseUsage(res);

    langfuseTrace.generation({
      ...data,
      output,
      endTime: new Date(),
      usage,
    });
    if (!requestedTraceId) {
      langfuseTrace.update({ output });
    }
    return res;
  } catch (error) {
    langfuseTrace.generation({
      ...data,
      endTime: new Date(),
      statusMessage: String(error),
      level: "ERROR",
    });

    throw error;
  }
};
