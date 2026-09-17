import type { Serialized } from "@langchain/core/load/serializable";
import { DynamicTool } from "@langchain/core/tools";
import {
  Annotation,
  Command,
  END,
  GraphInterrupt,
  interrupt,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
  AIMessage,
  FunctionMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const TEST_SERIALIZED: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["tests", "control-flow"],
};

function getObservationStatusMessage(span: ReadableSpan): string | undefined {
  const statusMessage =
    span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE];

  return typeof statusMessage === "string" ? statusMessage : undefined;
}

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

  it("should not mark LangGraph interrupts as errors", async () => {
    const InterruptState = Annotation.Root({
      selection: Annotation<string>(),
    });
    const graph = new StateGraph(InterruptState)
      .addNode("wait-for-selection", () => ({
        selection: interrupt({
          reason: "input_required",
          message: "Select a class before generating the summary.",
        }),
      }))
      .addEdge(START, "wait-for-selection")
      .addEdge("wait-for-selection", END)
      .compile({ checkpointer: new MemorySaver() });
    const handler = new CallbackHandler();

    await graph.invoke(
      { selection: "" },
      {
        callbacks: [handler],
        configurable: { thread_id: "langfuse-graph-interrupt-test" },
        runName: "interrupt-graph",
      },
    );
    await testEnv.spanProcessor.forceFlush();

    const interruptSpans = testEnv.mockExporter.exportedSpans.filter((span) =>
      getObservationStatusMessage(span)?.includes("GraphInterrupt"),
    );

    expect(interruptSpans.length).toBeGreaterThan(0);
    expect(
      interruptSpans.every(
        (span) =>
          span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_LEVEL] ===
          "DEFAULT",
      ),
    ).toBe(true);
    expect(
      interruptSpans.some((span) =>
        getObservationStatusMessage(span)?.includes("input_required"),
      ),
    ).toBe(true);
  });

  it("should not mark parent graph commands as errors", async () => {
    const GraphState = Annotation.Root({
      route: Annotation<string>(),
      done: Annotation<boolean>(),
    });
    const childGraph = new StateGraph(GraphState)
      .addNode(
        "handoff",
        () =>
          new Command({
            graph: Command.PARENT,
            goto: "after",
            update: { route: "from-child" },
          }),
      )
      .addEdge(START, "handoff")
      .compile();
    const parentGraph = new StateGraph(GraphState)
      .addNode("child-graph", childGraph, { ends: ["after"] })
      .addNode("after", (state) => ({
        done: state.route === "from-child",
      }))
      .addEdge(START, "child-graph")
      .addEdge("after", END)
      .compile();
    const handler = new CallbackHandler();

    const result = await parentGraph.invoke(
      { route: "", done: false },
      {
        callbacks: [handler],
        runName: "parent-command-graph",
      },
    );
    await testEnv.spanProcessor.forceFlush();

    expect(result).toEqual({ route: "from-child", done: true });

    const parentCommandSpans = testEnv.mockExporter.exportedSpans.filter(
      (span) => getObservationStatusMessage(span) === "ParentCommand",
    );

    expect(parentCommandSpans.length).toBeGreaterThan(0);
    expect(
      parentCommandSpans.every(
        (span) =>
          span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_LEVEL] ===
          "DEFAULT",
      ),
    ).toBe(true);
  });

  it.each([
    {
      name: "handleChainError",
      start: (handler: CallbackHandler, runId: string) =>
        handler.handleChainStart(TEST_SERIALIZED, {}, runId),
    },
    {
      name: "handleRetrieverError",
      start: (handler: CallbackHandler, runId: string) =>
        handler.handleRetrieverStart(TEST_SERIALIZED, "test query", runId),
    },
    {
      name: "handleToolError",
      start: (handler: CallbackHandler, runId: string) =>
        handler.handleToolStart(TEST_SERIALIZED, "test input", runId),
    },
    {
      name: "handleLLMError",
      start: (handler: CallbackHandler, runId: string) =>
        handler.handleLLMStart(TEST_SERIALIZED, ["test prompt"], runId),
    },
  ] as const)(
    "should classify $name control-flow errors as DEFAULT and ordinary errors as ERROR",
    async ({ name, start }) => {
      const handler = new CallbackHandler();

      const controlFlowRunId = `${name}-control-flow`;
      await start(handler, controlFlowRunId);
      await handler[name](
        new GraphInterrupt([{ value: { reason: "input_required" } }]),
        controlFlowRunId,
      );

      const errorRunId = `${name}-error`;
      await start(handler, errorRunId);
      await handler[name](new Error("database unavailable"), errorRunId);

      await waitForSpanExport(testEnv.mockExporter, 2);

      const controlFlowSpan = testEnv.mockExporter.exportedSpans.find((span) =>
        getObservationStatusMessage(span)?.includes("GraphInterrupt"),
      );
      const errorSpan = testEnv.mockExporter.exportedSpans.find((span) =>
        getObservationStatusMessage(span)?.includes("database unavailable"),
      );

      expect(
        controlFlowSpan?.attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL
        ],
      ).toBe("DEFAULT");
      expect(
        errorSpan?.attributes[LangfuseOtelSpanAttributes.OBSERVATION_LEVEL],
      ).toBe("ERROR");
    },
  );

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

  it("should discard the completion start time when a streamed run errors", async () => {
    const handler = new CallbackHandler();
    const runId = "generation-stream-error";
    const completionStartTimes = Reflect.get(
      handler,
      "completionStartTimes",
    ) as Record<string, Date>;

    await handler.handleGenerationStart(
      { id: ["ChatOpenAI"] } as any,
      [{ role: "user", content: "hi" }],
      runId,
      undefined,
      { invocation_params: { model: "gpt-4.1-mini" } },
    );
    await handler.handleChatModelStreamEvent({ event: "message-start" }, runId);

    expect(completionStartTimes).toHaveProperty(runId);

    await handler.handleLLMError(new Error("stream failed"), runId);

    expect(completionStartTimes).not.toHaveProperty(runId);
  });

  it("should serialize tool and function messages with role, name and tool_call_id", async () => {
    const handler = new CallbackHandler();
    const runId = "generation-with-tool-results";

    await handler.handleChatModelStart(
      { id: ["ChatOpenAI"] },
      [
        [
          new HumanMessage("What is my updated debt?"),
          new AIMessage({
            content: "",
            tool_calls: [{ id: "call_1", name: "get_debt", args: {} }],
          }),
          new ToolMessage({ content: "1874.32", tool_call_id: "call_1" }),
          new ToolMessage({
            content: "1874.32",
            tool_call_id: "call_2",
            name: "get_debt",
          }),
          new FunctionMessage({ content: "1874.32", name: "get_debt" }),
        ],
      ],
      runId,
      undefined,
      { invocation_params: { model: "gpt-4.1-mini" } },
    );
    await handler.handleLLMEnd({ generations: [[{ text: "ok" }]] }, runId);

    await waitForSpanExport(testEnv.mockExporter, 1);

    assertions.expectSpanAttributeContains(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      '{"content":"1874.32","additional_kwargs":{},"role":"tool","tool_call_id":"call_1"}',
    );
    assertions.expectSpanAttributeContains(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      '{"content":"1874.32","additional_kwargs":{},"role":"tool","name":"get_debt","tool_call_id":"call_2"}',
    );
    assertions.expectSpanAttributeContains(
      "ChatOpenAI",
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      '{"content":"1874.32","additional_kwargs":{},"role":"function","name":"get_debt"}',
    );
  });
});
