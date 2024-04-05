import type OpenAI from "openai";
import { Langfuse, type LangfuseTraceClient } from "./langfuse";

const client = new Langfuse();
interface InputArgsData {
  model: string;
  input: Record<string, any> | string;
  modelParams: Record<string, any>;
}

const parseInputArgs = (args: Record<string, any>): InputArgsData => {
  let params: Record<string, any> = {};
  params = {
    frequency_penalty: args.frequency_penalty,
    logit_bias: args.logit_bias,
    logprobs: args.logprobs,
    max_tokens: args.max_tokens,
    n: args.n,
    presence_penalty: args.presence_penalty,
    seed: args.seed,
    stop: args.stop,
    stream: args.stream,
    temperature: args.temperature,
    top_p: args.top_p,
    user: args.user,
    response_format: args.response_format,
    top_logprobs: args.top_logprobs,
  };

  let input: Record<string, any> | string;
  if ("messages" in args) {
    input = {};
    input.messages = args.messages;
    if ("function_call" in args) {
      input.function_call = args.function_call;
    }
    if ("functions" in args) {
      input.functions = args.functions;
    }
    if ("tools" in args) {
      input.tools = args.tools;
    }

    if ("tool_choice" in args) {
      input.tool_choice = args.tool_choice;
    }
  } else {
    input = args.prompt;
  }

  return {
    model: args.model,
    input: input,
    modelParams: params,
  };
};

interface TraceConfig {
  name?: string;
  inputs?: Record<string, any>;
  config?: WrapperConfig;
}

const generateOutput = (res: any): any => {
  return "message" in res.choices[0] ? res.choices[0].message : res.choices[0].text ?? "";
};

interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const getUsageDetails = (res: any): CompletionUsage => {
  return {
    promptTokens: res.usage?.prompt_tokens,
    completionTokens: res.usage?.completion_tokens,
    totalTokens: res.usage?.total_tokens,
  };
};

const processChunks = (chunk: unknown): string => {
  const _chunk = chunk as OpenAI.ChatCompletionChunk | OpenAI.Completions.Completion;
  if ("delta" in _chunk?.choices[0]) {
    return _chunk.choices[0].delta?.content || "";
  } else if ("text" in _chunk?.choices[0]) {
    return _chunk?.choices[0].text || "";
  }
  return "";
};

class TraceGenerator {
  name?: string;
  inputs?: Record<string, any>;
  startTime?: Date;
  endTime?: Date;
  outputs?: string;
  client?: Langfuse;
  level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR" | undefined;
  trace?: LangfuseTraceClient;
  config?: WrapperConfig;
  constructor(tracerConfig: TraceConfig) {
    this.config = tracerConfig.config;
    this.name = tracerConfig.name;
    this.inputs = tracerConfig.inputs;
    this.client = client;
    this.startTime = new Date();
  }

  createTrace(): void {
    const input = parseInputArgs(this.inputs ?? {});
    this.trace = client.trace({
      name: this.config?.traceName,
      input: input.input,
      metadata: this.config?.metadata,
      tags: this.config?.tags,
      userId: this.config?.userId,
      timestamp: this.startTime,
      sessionId: this.config?.sessionId,
      version: this.config?.version,
      release: this.config?.release,
    });
  }

  createGeneration(
    output?: any,
    usage?: CompletionUsage,
    error?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR" | undefined,
    statusMessage?: string,
    endTime = new Date()
  ): void {
    const input = parseInputArgs(this.inputs ?? {});
    this.trace?.generation({
      model: input.model,
      name: this.config?.traceName,
      input: input.input,
      modelParameters: input.modelParams,
      startTime: this.startTime,
      endTime: endTime,
      level: error,
      statusMessage,
      output,
      usage,
    });
    this.trace?.update({ output });
  }

  async flush(): Promise<void> {
    client.flush();
  }
}

export const openaiTracer = async <T extends (...args: any[]) => any>(
  baseFunction: T,
  config?: WrapperConfig,
  ...args: Parameters<T>
): Promise<ReturnType<T> | any> => {
  const tracer = new TraceGenerator({
    name: baseFunction.name,
    inputs: args[0],
    config,
  });

  tracer.createTrace();
  let res: any;
  try {
    res = await baseFunction(...args);
    if (isAsyncIterable(res)) {
      async function* tracedOutputGenerator(): AsyncGenerator<unknown, void, unknown> {
        const response = res;
        const chunks: unknown[] = [];
        // TypeScript thinks this is unsafe
        for await (const chunk of response as AsyncIterable<unknown>) {
          const _chunk = processChunks(chunk);
          chunks.push(_chunk);
          yield chunk;
        }
        tracer.createGeneration(chunks.join(""));
      }
      return tracedOutputGenerator() as ReturnType<T>;
    } else {
      tracer.createGeneration(generateOutput(res), getUsageDetails(res));
    }
  } catch (error) {
    tracer.createGeneration(undefined, undefined, "ERROR", String(error));
    throw error;
  }
  return res;
};

const isAsyncIterable = (x: unknown): x is AsyncIterable<unknown> =>
  x != null && typeof x === "object" && typeof (x as any)[Symbol.asyncIterator] === "function";

export const wrappedTracer = <T extends (...args: any[]) => any>(
  baseFuntion: T,
  config?: any
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  {
    try {
      return (...args: Parameters<T>): Promise<ReturnType<T>> => openaiTracer(baseFuntion, config, ...args);
    } catch (error) {
      throw error;
    }
  }
};

interface WrapperConfig {
  traceName?: string;
  sessionId?: string;
  userId?: string;
  release?: string;
  version?: string;
  metadata?: any;
  tags?: string[];
}

interface ExtendedOpenAI extends OpenAI {
  flushAsync: () => Promise<void>;
}

/**
 * Wraps an OpenAI SDK object with tracing capabilities, allowing for detailed tracing of SDK method calls.
 * It wraps function calls with a tracer that logs detailed information about the call, including the method name,
 * input parameters, and output.
 * 
 * @template T - The SDK object to be wrapped.
 * @param {T} sdk - The OpenAI SDK object to be wrapped.
 * @param {WrapperConfig} [config] - Optional configuration object for the wrapper.
 * @param {string} [config.traceName] - The name to use for tracing. If not provided, a default name based on the SDK's constructor name and the method name will be used.
 * @param {string} [config.sessionId] - Optional session ID for tracing.
 * @param {string} [config.userId] - Optional user ID for tracing.
 * @param {string} [config.release] - Optional release version for tracing.
 * @param {string} [config.version] - Optional version for tracing.
 * @param {string} [config.metadata] - Optional metadata for tracing.
 * @param {string} [config.tags] - Optional tags for tracing.
 * @returns {T} - A proxy of the original SDK object with methods wrapped for tracing.
 *
 * @example
 * const client = new OpenAI();
 * const res = OpenAIWrapper(client, { traceName: "My.OpenAI.Chat.Trace" }).chat.completions.create({
 *      messages: [{ role: "system", content: "Say this is a test!" }],
        model: "gpt-3.5-turbo",
        user: "langfuse",
        max_tokens: 300
 * });
 * console.log(res); // This call will be traced.
 * */
const OpenAIWrapper = <T extends object>(sdk: T, config?: WrapperConfig): T & ExtendedOpenAI => {
  return new Proxy(sdk, {
    get(target, propKey, receiver) {
      const originalValue = target[propKey as keyof T];
      if (propKey === "flushAsync") {
        return async () => {
          await client.flushAsync();
        };
      } else if (typeof originalValue === "function") {
        return wrappedTracer(originalValue.bind(target), {
          ...config,
          traceName: config?.traceName ?? `${sdk.constructor?.name}.${propKey.toString()}`,
        });
      } else if (
        originalValue != null &&
        !Array.isArray(originalValue) &&
        !(originalValue instanceof Date) &&
        typeof originalValue === "object"
      ) {
        return OpenAIWrapper(originalValue, {
          ...config,
          traceName: config?.traceName ?? `${sdk.constructor?.name}.${propKey.toString()}`,
        });
      } else {
        return Reflect.get(target, propKey, receiver);
      }
    },
  }) as T & ExtendedOpenAI;
};

export default OpenAIWrapper;
