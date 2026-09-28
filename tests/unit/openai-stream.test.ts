import { beforeEach, describe, expect, it, vi } from "vitest";

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

function contentChunk(text: string, usage?: Record<string, number>) {
  return {
    choices: [{ index: 0, delta: { content: text } }],
    ...(usage ? { usage } : {}),
  };
}

describe("observeOpenAI streaming", () => {
  beforeEach(() => {
    mocks.generation.update.mockClear();
    mocks.generation.end.mockClear();
    mocks.generation.update.mockImplementation(() => mocks.generation);
    mocks.startObservation.mockClear();
  });

  it("ends the generation with partial output when the consumer stops early", async () => {
    async function* stream() {
      yield contentChunk("Hello");
      yield contentChunk(" world", {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      });
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
      break;
    }

    expect(mocks.generation.end).toHaveBeenCalledTimes(1);
    expect(mocks.generation.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: "Hello" }),
    );
  });

  it("ends the generation once after the stream is fully consumed", async () => {
    async function* stream() {
      yield contentChunk("Hello");
      yield contentChunk(" world");
    }

    const openai = observeOpenAI({
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    });

    const result = await openai.chat.completions.create();

    const chunks = [];
    for await (const chunk of result as AsyncIterable<unknown>) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(mocks.generation.end).toHaveBeenCalledTimes(1);
    expect(mocks.generation.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: "Hello world" }),
    );
  });

  it("ends the generation as an error when the stream throws", async () => {
    async function* stream() {
      yield contentChunk("Hello");
      throw new Error("socket closed");
    }

    const openai = observeOpenAI({
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    });

    const result = await openai.chat.completions.create();

    await expect(async () => {
      for await (const _chunk of result as AsyncIterable<unknown>) {
        // consume until the stream fails
      }
    }).rejects.toThrow("socket closed");

    expect(mocks.generation.end).toHaveBeenCalledTimes(1);
    expect(mocks.generation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: "Hello",
        level: "ERROR",
        statusMessage: "Error: socket closed",
      }),
    );
    expect(mocks.generation.update.mock.calls.at(-1)?.[0].costDetails).toBe(
      undefined,
    );
  });

  it("keeps captured usage and does not invent a zero cost when the stream throws", async () => {
    async function* stream() {
      yield contentChunk("Hello", {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      });
      throw new Error("socket closed");
    }

    const openai = observeOpenAI({
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    });

    const result = await openai.chat.completions.create();

    await expect(async () => {
      for await (const _chunk of result as AsyncIterable<unknown>) {
        // consume until the stream fails
      }
    }).rejects.toThrow("socket closed");

    const update = mocks.generation.update.mock.calls.at(-1)?.[0];
    expect(update).toMatchObject({
      output: "Hello",
      level: "ERROR",
      usageDetails: { input: 1, output: 2, total: 3 },
    });
    expect(update.costDetails).toBeUndefined();
  });

  it("keeps partial Responses API text when the consumer stops early", async () => {
    async function* stream() {
      yield { type: "response.output_text.delta", delta: "Hello" };
      yield { type: "response.output_text.delta", delta: " world" };
      yield {
        type: "response.completed",
        response: { output_text: "Hello world" },
      };
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
      break;
    }

    expect(mocks.generation.end).toHaveBeenCalledTimes(1);
    expect(mocks.generation.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: "Hello" }),
    );
  });
});
