import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { DynamicTool } from "@langchain/core/tools";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal fake chat model that reports a provider-computed cost on
 * `response_metadata.usage.cost`, the way OpenAI-compatible providers such
 * as OpenRouter do. Used to reproduce https://github.com/langfuse/langfuse-js/issues/828:
 * the LangChain CallbackHandler previously never forwarded this value to
 * Langfuse's `costDetails`, silently discarding it.
 */
class FakeChatModelWithProviderCost extends BaseChatModel {
  _llmType(): string {
    return "fake-provider-cost";
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const text = messages.map((m) => String(m.content)).join("\n");

    return {
      generations: [
        {
          text,
          message: new AIMessage({
            content: `Echo: ${text}`,
            response_metadata: {
              model_name: "fake-provider-cost-model",
              usage: {
                cost: 0.0042,
              },
            },
          }),
        },
      ],
    };
  }
}

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

  it("forwards provider-reported cost from response_metadata.usage.cost to costDetails", async () => {
    const model = new FakeChatModelWithProviderCost({});
    const handler = new CallbackHandler();

    await model.invoke("Hello", {
      runName: "cost-forwarding-llm",
      callbacks: [handler],
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    assertions.expectSpanCount(1);
    assertions.expectSpanWithName("cost-forwarding-llm");
    assertions.expectSpanAttribute(
      "cost-forwarding-llm",
      LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
      JSON.stringify({ total: 0.0042 }),
    );
  });

  it("omits costDetails on a generation that reports no provider cost", async () => {
    const model = new FakeListChatModel({ responses: ["hi there"] });
    const handler = new CallbackHandler();

    await model.invoke("Hello", {
      runName: "no-cost-forwarding-llm",
      callbacks: [handler],
    });

    await waitForSpanExport(testEnv.mockExporter, 1);

    const span = assertions.expectSpanWithName("no-cost-forwarding-llm");
    expect(
      span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS],
    ).toBeUndefined();
  });
});
