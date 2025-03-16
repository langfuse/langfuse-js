import type OpenAI from "openai";
import type { CreateLangfuseGenerationBody, Usage, UsageDetails } from "langfuse-core";

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

  let input: Record<string, any> | string = args.input;

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
  } else if (!input) {
    input = args.prompt;
  }

  return {
    model: args.model,
    input: input,
    modelParameters: params,
  };
};

export const parseCompletionOutput = (res: unknown): CreateLangfuseGenerationBody["output"] => {
  if (res instanceof Object && "output_text" in res && res["output_text"] !== "") {
    return res["output_text"] as string;
  }

  if (typeof res === "object" && res && "output" in res && Array.isArray(res["output"])) {
    const output = res["output"];

    if (output.length > 1) {
      return output;
    }
    if (output.length === 1) {
      return output[0] as Record<string, unknown>;
    }

    return null;
  }

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
  if ("prompt_tokens" in completionUsage) {
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
  } else if ("input_tokens" in completionUsage) {
    const { input_tokens, output_tokens, total_tokens, input_tokens_details, output_tokens_details } = completionUsage;

    return {
      input: input_tokens,
      output: output_tokens,
      total: total_tokens,
      ...Object.fromEntries(
        Object.entries(input_tokens_details ?? {}).map(([key, value]) => [`input_${key}`, value as number])
      ),
      ...Object.fromEntries(
        Object.entries(output_tokens_details ?? {}).map(([key, value]) => [`output_${key}`, value as number])
      ),
    };
  }
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
    // Completion API Usage format
    ((typeof obj.usage.prompt_tokens === "number" &&
      typeof obj.usage.completion_tokens === "number" &&
      typeof obj.usage.total_tokens === "number") ||
      // Response API Usage format
      (typeof obj.usage.input_tokens === "number" &&
        typeof obj.usage.output_tokens === "number" &&
        typeof obj.usage.total_tokens === "number"))
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

export const parseModelDataFromResponse = (
  res: unknown
): {
  model: string | undefined;
  modelParameters: Record<string, string | number> | undefined;
  metadata: Record<string, unknown> | undefined;
} => {
  if (typeof res !== "object" || res === null) {
    return {
      model: undefined,
      modelParameters: undefined,
      metadata: undefined,
    };
  }

  const model = "model" in res ? (res["model"] as string) : undefined;
  const modelParameters: Record<string, string | number> = {};
  const modelParamKeys = [
    "max_output_tokens",
    "parallel_tool_calls",
    "store",
    "temperature",
    "tool_choice",
    "top_p",
    "truncation",
    "user",
  ];

  const metadata: Record<string, unknown> = {};
  const metadataKeys = [
    "reasoning",
    "incomplete_details",
    "instructions",
    "previous_response_id",
    "tools",
    "metadata",
    "status",
    "error",
  ];

  for (const key of modelParamKeys) {
    const val = key in res ? (res[key as keyof typeof res] as string | number) : null;
    if (val) {
      modelParameters[key as keyof typeof modelParameters] = val;
    }
  }

  for (const key of metadataKeys) {
    const val = key in res ? (res[key as keyof typeof res] as string | number) : null;
    if (val) {
      metadata[key as keyof typeof metadata] = val;
    }
  }

  return {
    model,
    modelParameters: Object.keys(modelParameters).length > 0 ? modelParameters : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
};
