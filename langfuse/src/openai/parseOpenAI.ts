import type OpenAI from "openai";
import type { Usage, UsageDetails } from "langfuse-core";

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
  if (args && typeof args === "object" && !Array.isArray(args) && "messages" in args) {
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
      input: prompt_tokens,
      output: completion_tokens,
      total: total_tokens,
    };
  }
};

export const parseUsageDetails = (completionUsage: OpenAI.CompletionUsage): UsageDetails | undefined => {
  const { prompt_tokens, completion_tokens, total_tokens, completion_tokens_details, prompt_tokens_details } =
    completionUsage;

  return {
    input: prompt_tokens,
    output: completion_tokens,
    total: total_tokens,
    ...Object.fromEntries(
      Object.entries(prompt_tokens_details ?? {}).map(([key, value]) => [`input_${key}`, value as number])
    ),
    ...Object.fromEntries(
      Object.entries(completion_tokens_details ?? {}).map(([key, value]) => [`output_${key}`, value as number])
    ),
  };
};

export const parseUsageDetailsFromResponse = (res: unknown): UsageDetails | undefined => {
  if (hasCompletionUsage(res)) {
    return parseUsageDetails(res.usage);
  }
};

export const parseChunk = (
  rawChunk: unknown
):
  | { isToolCall: false; data: string }
  | { isToolCall: true; data: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall } => {
  let isToolCall = false;
  const _chunk = rawChunk as OpenAI.ChatCompletionChunk | OpenAI.Completions.Completion;
  const chunkData = _chunk?.choices?.[0];

  try {
    if ("delta" in chunkData && "tool_calls" in chunkData.delta && Array.isArray(chunkData.delta.tool_calls)) {
      isToolCall = true;

      return { isToolCall, data: chunkData.delta.tool_calls[0] };
    }
    if ("delta" in chunkData) {
      return { isToolCall, data: chunkData.delta?.content || "" };
    }

    if ("text" in chunkData) {
      return { isToolCall, data: chunkData.text || "" };
    }
  } catch (e) {}

  return { isToolCall: false, data: "" };
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

export const getToolCallOutput = (
  toolCallChunks: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
): {
  tool_calls: {
    function: {
      name: string;
      arguments: string;
    };
  }[];
} => {
  let name = "";
  let toolArguments = "";

  for (const toolCall of toolCallChunks) {
    name = toolCall.function?.name || name;
    toolArguments += toolCall.function?.arguments || "";
  }

  return {
    tool_calls: [
      {
        function: {
          name,
          arguments: toolArguments,
        },
      },
    ],
  };
};
