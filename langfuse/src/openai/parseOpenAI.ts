import type OpenAI from "openai";
import type { Usage } from "langfuse-core";

type ParsedOpenAIArguments = {
  model: string;
  input: Record<string, any> | string;
  modelParameters: Record<string, any>;
};

export const parseInputArgs = (args: Record<string, any>): ParsedOpenAIArguments => {
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
    modelParameters: params,
  };
};

export const parseCompletionOutput = (res: unknown): string => {
  if (!(res instanceof Object && "choices" in res && Array.isArray(res.choices))) {
    return "";
  }

  return "message" in res.choices[0] ? res.choices[0].message : res.choices[0].text ?? "";
};

export const parseUsage = (res: unknown): Usage | undefined => {
  if (hasCompletionUsage(res)) {
    const { prompt_tokens, completion_tokens, total_tokens } = res.usage;

    return {
      promptTokens: prompt_tokens,
      completionTokens: completion_tokens,
      totalTokens: total_tokens,
    };
  }
};

export const parseChunk = (rawChunk: unknown): string => {
  const _chunk = rawChunk as OpenAI.ChatCompletionChunk | OpenAI.Completions.Completion;

  if ("delta" in _chunk?.choices[0]) {
    return _chunk.choices[0].delta?.content || "";
  }

  if ("text" in _chunk?.choices[0]) {
    return _chunk?.choices[0].text || "";
  }

  return "";
};

// Type guard to check if an unknown object is a UsageResponse
function hasCompletionUsage(obj: any): obj is { usage: OpenAI.CompletionUsage } {
  return (
    obj instanceof Object &&
    "usage" in obj &&
    obj.usage instanceof Object &&
    typeof obj.usage.prompt_tokens === "number" &&
    typeof obj.usage.completion_tokens === "number" &&
    typeof obj.usage.total_tokens === "number"
  );
}
