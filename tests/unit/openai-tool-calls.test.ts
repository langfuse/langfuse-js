import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getToolCallOutput,
  parseChunk,
} from "../../packages/openai/src/parseOpenAI.js";

const mocks = vi.hoisted(() => {
  const generation = {
    update: vi.fn(),
    end: vi.fn(),
  };
  generation.update.mockImplementation(() => generation);

  return {
    generation,
    startObservation: vi.fn(() => generation),
  };
});

vi.mock("@langfuse/tracing", () => ({
  startObservation: mocks.startObservation,
  propagateAttributes: (_params: unknown, fn: () => unknown) => fn(),
}));

import { observeOpenAI } from "@langfuse/openai";

function toolChunk(
  calls: Array<{
    index: number;
    id?: string;
    name?: string;
    arguments?: string;
  }>,
) {
  return {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: calls.map((call) => ({
            index: call.index,
            id: call.id,
            type: "function" as const,
            function: {
              name: call.name,
              arguments: call.arguments,
            },
          })),
        },
      },
    ],
  };
}

describe("streamed tool calls", () => {
  it("keeps every tool call in a single chunk", () => {
    const parsed = parseChunk(
      toolChunk([
        { index: 0, id: "call_a", name: "get_weather", arguments: "" },
        { index: 1, id: "call_b", name: "get_time", arguments: "" },
      ]),
    );

    expect(parsed.isToolCall).toBe(true);
    if (!parsed.isToolCall) return;

    expect(parsed.data).toEqual([
      expect.objectContaining({
        index: 0,
        function: expect.objectContaining({ name: "get_weather" }),
      }),
      expect.objectContaining({
        index: 1,
        function: expect.objectContaining({ name: "get_time" }),
      }),
    ]);
  });

  it("assembles interleaved tool-call deltas by index", () => {
    const output = getToolCallOutput([
      {
        index: 0,
        id: "call_a",
        function: { name: "get_weather", arguments: '{"city":' },
      },
      {
        index: 1,
        id: "call_b",
        function: { name: "get_time", arguments: '{"tz":' },
      },
      { index: 0, function: { arguments: '"Paris"}' } },
      { index: 1, function: { arguments: '"UTC"}' } },
    ]);

    expect(output).toEqual({
      tool_calls: [
        { function: { name: "get_weather", arguments: '{"city":"Paris"}' } },
        { function: { name: "get_time", arguments: '{"tz":"UTC"}' } },
      ],
    });
  });

  it("still concatenates deltas for a single tool call", () => {
    const output = getToolCallOutput([
      {
        index: 0,
        function: { name: "get_weather", arguments: '{"city":' },
      },
      { index: 0, function: { arguments: '"Paris"}' } },
    ]);

    expect(output).toEqual({
      tool_calls: [
        { function: { name: "get_weather", arguments: '{"city":"Paris"}' } },
      ],
    });
  });

  describe("observeOpenAI", () => {
    beforeEach(() => {
      mocks.generation.update.mockClear();
      mocks.generation.end.mockClear();
      mocks.generation.update.mockImplementation(() => mocks.generation);
      mocks.startObservation.mockClear();
    });

    it("records parallel tool calls as separate functions", async () => {
      async function* stream() {
        yield toolChunk([
          {
            index: 0,
            id: "call_a",
            name: "get_weather",
            arguments: '{"city":',
          },
        ]);
        yield toolChunk([
          { index: 1, id: "call_b", name: "get_time", arguments: '{"tz":' },
        ]);
        yield toolChunk([{ index: 0, arguments: '"Paris"}' }]);
        yield toolChunk([{ index: 1, arguments: '"UTC"}' }]);
      }

      const openai = observeOpenAI({
        chat: {
          completions: {
            create: async () => stream(),
          },
        },
      });

      const result = await openai.chat.completions.create();
      for await (const _chunk of result as AsyncIterable<unknown>) {
        // drain
      }

      expect(mocks.generation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            tool_calls: [
              {
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Paris"}',
                },
              },
              {
                function: { name: "get_time", arguments: '{"tz":"UTC"}' },
              },
            ],
          },
        }),
      );
    });
  });
});
