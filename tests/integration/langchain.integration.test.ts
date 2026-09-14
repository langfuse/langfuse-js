import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

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

  it("should include tools and tool choice in generation input", async () => {
    const handler = new CallbackHandler();
    const runId = "generation-with-tools";
    const tools = [
      {
        type: "function",
        function: {
          name: "validate_customer",
          description: "Validates a customer",
          parameters: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
      },
    ];

    await handler.handleGenerationStart(
      { id: ["ChatOpenAI"] },
      [{ role: "user", content: "hi" }],
      runId,
      undefined,
      {
        invocation_params: {
          model: "gpt-4.1-mini",
          temperature: 0.2,
          tools,
          tool_choice: "auto",
        },
      },
    );
    await handler.handleLLMEnd({ generations: [[{ text: "ok" }]] }, runId);

    await waitForSpanExport(testEnv.mockExporter, 1);

    assertions.expectSpanAttributeContains(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      '"name":"validate_customer"',
    );
    assertions.expectSpanAttributeContains(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      '"tool_choice":"auto"',
    );
    assertions.expectSpanAttributeContains(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
      '"temperature":0.2',
    );
  });

  it("should preserve message-array input without tool configuration", async () => {
    const handler = new CallbackHandler();
    const runId = "generation-without-tools";

    await handler.handleGenerationStart(
      { id: ["ChatOpenAI"] },
      [{ role: "user", content: "hi" }],
      runId,
      undefined,
      { invocation_params: { model: "gpt-4.1-mini" } },
    );
    await handler.handleLLMEnd({ generations: [[{ text: "ok" }]] }, runId);

    await waitForSpanExport(testEnv.mockExporter, 1);

    assertions.expectSpanAttribute(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      '[{"role":"user","content":"hi"}]',
    );
  });

  it("should record completion start time from chat model stream events", async () => {
    class StreamEventPreferringHandler extends BaseCallbackHandler {
      name = "StreamEventPreferringHandler";
      lc_prefer_chat_model_stream_events = true;
    }

    const handler = new CallbackHandler();
    const model = new FakeStreamingChatModel({
      responses: [new AIMessage("Hi!")],
      sleep: 10,
    });

    const result = await model.invoke([new HumanMessage("Hello")], {
      callbacks: [handler, new StreamEventPreferringHandler()],
    });

    expect(result.text).toBe("Hi!");

    await waitForSpanExport(testEnv.mockExporter, 1);

    const generation = assertions.expectSpanWithName("FakeStreamingChatModel");

    expect(
      generation.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
      ],
    ).toBeDefined();
  });
});
