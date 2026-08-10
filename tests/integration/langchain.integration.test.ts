import {
  AIMessagePromptTemplate,
  HumanMessagePromptTemplate,
  PromptTemplate,
  SystemMessagePromptTemplate,
} from "@langchain/core/prompts";
import { RunnableMap } from "@langchain/core/runnables";
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

  it("should extract display-ready prompt template outputs", async () => {
    const handler = new CallbackHandler();
    const map = RunnableMap.from({
      String: PromptTemplate.fromTemplate("Tell me a joke about {topic}."),
      Human: HumanMessagePromptTemplate.fromTemplate(
        "Tell me a joke about {topic}.",
      ),
      AI: AIMessagePromptTemplate.fromTemplate("Tell me a joke about {topic}."),
      System: SystemMessagePromptTemplate.fromTemplate(
        "Tell me a joke about {topic}.",
      ),
    });

    await map.invoke({ topic: "bears" }, { callbacks: [handler] });
    await waitForSpanExport(testEnv.mockExporter, 5);

    const getOutput = (spanName: string) => {
      const span = testEnv.mockExporter.getSpanByName(spanName);
      const output =
        span?.attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT];

      if (
        typeof output === "string" &&
        (output.startsWith("{") || output.startsWith("["))
      ) {
        return JSON.parse(output);
      }

      return output;
    };

    const expectedMessages = {
      Human: [{ role: "user", content: "Tell me a joke about bears." }],
      AI: [{ role: "assistant", content: "Tell me a joke about bears." }],
      System: [{ role: "system", content: "Tell me a joke about bears." }],
    };

    expect(getOutput("PromptTemplate")).toBe("Tell me a joke about bears.");
    expect(getOutput("HumanMessagePromptTemplate")).toEqual(
      expectedMessages.Human,
    );
    expect(getOutput("AIMessagePromptTemplate")).toEqual(expectedMessages.AI);
    expect(getOutput("SystemMessagePromptTemplate")).toEqual(
      expectedMessages.System,
    );
    expect(getOutput("RunnableMap")).toEqual({
      String: "Tell me a joke about bears.",
      ...expectedMessages,
    });
  });
});
