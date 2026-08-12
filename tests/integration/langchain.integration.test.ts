import { HumanMessage } from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
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

  const tools = [
    {
      type: "function",
      function: {
        name: "lookup_customer",
        description: "Look up a customer by ID",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
  ];

  const recordGeneration = async (
    runId: string,
    invocationParams?: Record<string, unknown>,
  ): Promise<unknown> => {
    const handler = new CallbackHandler();

    await handler.handleChatModelStart(
      { id: ["langchain", "ChatOpenAI"] } as any,
      [[new HumanMessage("Find customer 123")]],
      runId,
      undefined,
      invocationParams
        ? {
            invocation_params: {
              model: "gpt-4.1-mini",
              ...invocationParams,
            },
          }
        : undefined,
    );
    await handler.handleLLMEnd(
      { generations: [[{ text: "Customer found" }]], llmOutput: {} } as any,
      runId,
    );

    await waitForSpanExport(testEnv.mockExporter, 1);

    return JSON.parse(
      testEnv.mockExporter.getSpanByName("ChatOpenAI")?.attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT
      ] as string,
    );
  };

  it("should preserve the original messages input without tools", async () => {
    await expect(recordGeneration("generation-without-tools")).resolves.toEqual(
      [{ content: "Find customer 123", role: "user" }],
    );
  });

  it("should preserve tools in generation input", async () => {
    await expect(
      recordGeneration("generation-with-tools", { tools }),
    ).resolves.toEqual({
      messages: [{ role: "user", content: "Find customer 123" }],
      tools,
    });
  });

  it("should preserve tool choice in generation input", async () => {
    await expect(
      recordGeneration("generation-with-tool-choice", {
        tool_choice: "auto",
      }),
    ).resolves.toEqual({
      messages: [{ role: "user", content: "Find customer 123" }],
      tool_choice: "auto",
    });
  });

  it("should preserve tools and tool choice in generation input", async () => {
    await expect(
      recordGeneration("generation-with-tools-and-choice", {
        tools,
        tool_choice: "auto",
      }),
    ).resolves.toEqual({
      messages: [{ role: "user", content: "Find customer 123" }],
      tools,
      tool_choice: "auto",
    });
  });
});
