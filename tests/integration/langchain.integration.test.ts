import { CallbackManager } from "@langchain/core/callbacks/manager";
import type { ContentBlockDelta } from "@langchain/core/language_models/event";
import { HumanMessage } from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const contentDeltaCases = [
  {
    name: "text",
    delta: {
      type: "text-delta",
      text: "Hello",
    },
  },
  {
    name: "reasoning",
    delta: {
      type: "reasoning-delta",
      reasoning: "Thinking",
    },
  },
  {
    name: "tool call",
    delta: {
      type: "block-delta",
      fields: {
        type: "tool_call_chunk",
        args: '{"query":"weather',
      },
    },
  },
] satisfies Array<{ name: string; delta: ContentBlockDelta }>;

describe("LangChain callback handler integration tests", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  it("should mark LangChain tool runs as tool observations", async () => {
    const calculatorTool = new DynamicTool({
      name: "calculator",
      description:
        "Perform basic arithmetic operations. Input should be a mathematical expression.",
      func: async (input: string) => {
        const sanitizedInput = input.replace(/[^0-9+\-*/().]/g, "");
        const result = eval(sanitizedInput);
        return `The result is: ${result}`;
      },
    });

    const handler = new CallbackHandler();

    const result = await calculatorTool.invoke("25*4", {
      callbacks: [handler],
    });

    expect(result).toBe("The result is: 100");

    await waitForSpanExport(testEnv.mockExporter, 1);

    assertions.expectSpanCount(1);
    assertions.expectSpanWithName("calculator");
    assertions.expectSpanAttribute(
      "calculator",
      LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
      "tool",
    );
    assertions.expectSpanAttributeContains(
      "calculator",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      "25*4",
    );
    assertions.expectSpanAttribute(
      "calculator",
      LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
      "The result is: 100",
    );
  });

  it.each(contentDeltaCases)(
    "should record the first $name content delta as completion start time",
    async ({ delta }) => {
      const handler = new CallbackHandler();
      const callbackManager = CallbackManager.configure([handler])!;
      const runId = crypto.randomUUID();
      const firstDeltaTime = new Date("2026-01-01T00:00:01.000Z");

      vi.useFakeTimers({ toFake: ["Date"] });

      try {
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        const [runManager] = await callbackManager.handleChatModelStart(
          {
            lc: 1,
            type: "not_implemented",
            id: ["test", "stream-events-v3-model"],
          },
          [[new HumanMessage("Hello")]],
          runId,
        );

        await runManager.handleChatModelStreamEvent({
          event: "message-start",
        });

        vi.setSystemTime(firstDeltaTime);

        await runManager.handleChatModelStreamEvent({
          event: "content-block-delta",
          index: 0,
          delta,
        });

        vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));

        await runManager.handleChatModelStreamEvent({
          event: "content-block-delta",
          index: 0,
          delta: {
            type: "text-delta",
            text: " world",
          },
        });

        await runManager.handleLLMEnd({
          generations: [
            [
              {
                text: "Hello world",
              },
            ],
          ],
        });
      } finally {
        vi.useRealTimers();
      }

      await waitForSpanExport(testEnv.mockExporter, 1);

      const generation = testEnv.mockExporter.getSpanByName(
        "stream-events-v3-model",
      );

      expect(
        generation?.attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
        ],
      ).toBe(JSON.stringify(firstDeltaTime));
    },
  );

  it("should preserve completion start time from legacy token callbacks", async () => {
    const handler = new CallbackHandler();
    const callbackManager = CallbackManager.configure([handler])!;
    const runId = crypto.randomUUID();
    const firstTokenTime = new Date("2026-01-01T00:00:01.000Z");

    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const [runManager] = await callbackManager.handleChatModelStart(
        {
          lc: 1,
          type: "not_implemented",
          id: ["test", "legacy-token-model"],
        },
        [[new HumanMessage("Hello")]],
        runId,
      );

      vi.setSystemTime(firstTokenTime);

      await runManager.handleLLMNewToken("Hello", {
        prompt: 0,
        completion: 0,
      });

      vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));

      await runManager.handleLLMNewToken(" world", {
        prompt: 0,
        completion: 0,
      });

      await runManager.handleLLMEnd({
        generations: [
          [
            {
              text: "Hello world",
            },
          ],
        ],
      });
    } finally {
      vi.useRealTimers();
    }

    await waitForSpanExport(testEnv.mockExporter, 1);

    const generation = testEnv.mockExporter.getSpanByName("legacy-token-model");

    expect(
      generation?.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
      ],
    ).toBe(JSON.stringify(firstTokenTime));
  });

  it("should ignore chat model stream events without content deltas", async () => {
    const handler = new CallbackHandler();
    const callbackManager = CallbackManager.configure([handler])!;
    const runId = crypto.randomUUID();

    const [runManager] = await callbackManager.handleChatModelStart(
      {
        lc: 1,
        type: "not_implemented",
        id: ["test", "stream-events-v3-without-delta"],
      },
      [[new HumanMessage("Hello")]],
      runId,
    );

    await runManager.handleChatModelStreamEvent({
      event: "message-start",
    });

    await runManager.handleChatModelStreamEvent({
      event: "content-block-start",
      index: 0,
      content: {
        type: "text",
        text: "",
      },
    });

    await runManager.handleChatModelStreamEvent({
      event: "usage",
      usage: {},
    });

    await runManager.handleChatModelStreamEvent({
      event: "message-finish",
    });

    await runManager.handleLLMEnd({
      generations: [
        [
          {
            text: "Hello",
          },
        ],
      ],
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    const generation = testEnv.mockExporter.getSpanByName(
      "stream-events-v3-without-delta",
    );

    assertions.expectSpanWithName("stream-events-v3-without-delta");
    expect(
      generation?.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
      ],
    ).toBeUndefined();
  });

  it("should clear completion start time after a streamed chat model error", async () => {
    const handler = new CallbackHandler();
    const callbackManager = CallbackManager.configure([handler])!;
    const runId = crypto.randomUUID();

    const [runManager] = await callbackManager.handleChatModelStart(
      {
        lc: 1,
        type: "not_implemented",
        id: ["test", "stream-events-v3-error"],
      },
      [[new HumanMessage("Hello")]],
      runId,
    );

    await runManager.handleChatModelStreamEvent({
      event: "content-block-delta",
      index: 0,
      delta: {
        type: "text-delta",
        text: "Hello",
      },
    });

    const completionStartTimes = Reflect.get(
      handler,
      "completionStartTimes",
    ) as Record<string, Date>;

    expect(completionStartTimes).toHaveProperty(runId);

    await runManager.handleLLMError(new Error("stream failed"));

    expect(completionStartTimes).not.toHaveProperty(runId);
  });
});
