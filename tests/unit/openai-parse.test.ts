import type OpenAI from "openai";
import { describe, expect, it } from "vitest";

// Internal helpers (not part of the public API)
import {
  getStreamOutput,
  getToolCallOutput,
  parseChunk,
} from "../../packages/openai/src/parseOpenAI.js";

type ToolCallDelta =
  OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall;

const toolCallChunk = (
  toolCalls: ToolCallDelta[],
): OpenAI.Chat.Completions.ChatCompletionChunk => ({
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  created: 0,
  model: "gpt-5.5",
  choices: [
    {
      index: 0,
      delta: { tool_calls: toolCalls },
      finish_reason: null,
      logprobs: null,
    },
  ],
});

const collectToolCalls = (
  chunks: OpenAI.Chat.Completions.ChatCompletionChunk[],
): ToolCallDelta[] =>
  chunks.flatMap((chunk) => {
    const parsed = parseChunk(chunk);
    return parsed.isToolCall ? parsed.data : [];
  });

describe("openai streamed tool calls", () => {
  it("should keep parallel tool calls apart, matching fragments by index", () => {
    const fragments = collectToolCalls([
      toolCallChunk([
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: "" },
        },
      ]),
      toolCallChunk([{ index: 0, function: { arguments: '{"city": ' } }]),
      toolCallChunk([
        {
          index: 1,
          id: "call_2",
          type: "function",
          function: { name: "get_time", arguments: "" },
        },
      ]),
      toolCallChunk([{ index: 0, function: { arguments: '"Paris"}' } }]),
      toolCallChunk([{ index: 1, function: { arguments: '{"tz": "CET"}' } }]),
    ]);

    expect(getToolCallOutput(fragments)).toEqual({
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city": "Paris"}' },
        },
        {
          id: "call_2",
          type: "function",
          function: { name: "get_time", arguments: '{"tz": "CET"}' },
        },
      ],
    });
  });

  it("should keep every tool call carried by a single chunk", () => {
    const fragments = collectToolCalls([
      toolCallChunk([
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city": "Paris"}' },
        },
        {
          index: 1,
          id: "call_2",
          type: "function",
          function: { name: "get_weather", arguments: '{"city": "Rome"}' },
        },
      ]),
    ]);

    expect(
      getToolCallOutput(fragments).tool_calls.map((call) => call.id),
    ).toEqual(["call_1", "call_2"]);
  });

  it("should keep streamed text next to the tool calls", () => {
    const fragments = collectToolCalls([
      toolCallChunk([
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city": "Paris"}' },
        },
      ]),
    ]);

    expect(getStreamOutput(["Checking ", "the weather."], fragments)).toEqual({
      content: "Checking the weather.",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city": "Paris"}' },
        },
      ],
    });
  });

  it("should order tool calls by index when fragments arrive out of order", () => {
    const fragments = collectToolCalls([
      toolCallChunk([
        {
          index: 1,
          id: "call_2",
          type: "function",
          function: { name: "get_time", arguments: "{}" },
        },
      ]),
      toolCallChunk([
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: "{}" },
        },
      ]),
    ]);

    expect(
      getToolCallOutput(fragments).tool_calls.map((call) => call.id),
    ).toEqual(["call_1", "call_2"]);
  });

  it("should keep the text of a chunk that also carries tool calls", () => {
    const chunk = toolCallChunk([
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: "{}" },
      },
    ]);
    chunk.choices[0].delta.content = "Checking the weather.";

    const parsed = parseChunk(chunk);

    expect(parsed.isToolCall && parsed.text).toBe("Checking the weather.");
  });

  it("should return the text for a text-only stream", () => {
    expect(getStreamOutput(["Hello", "!"], [])).toBe("Hello!");
  });
});
