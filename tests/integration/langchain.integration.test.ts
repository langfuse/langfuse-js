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
  AIMessageChunk,
  FunctionMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
import type { ChatGeneration } from "@langchain/core/outputs";
import {
  AIMessagePromptTemplate,
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  PromptTemplate,
  SystemMessagePromptTemplate,
} from "@langchain/core/prompts";
import { RunnableLambda, RunnableMap } from "@langchain/core/runnables";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("should keep the output when run metadata exceeds the attribute limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const echoTool = new DynamicTool({
      name: "echo",
      description: "Echoes the input",
      func: async (input: string) => input,
    });

    const metadata = Object.fromEntries(
      Array.from({ length: 150 }, (_, i) => [`key${i}`, i]),
    );

    try {
      await echoTool.invoke("hi", {
        callbacks: [new CallbackHandler()],
        metadata,
      });

      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanAttribute(
        "echo",
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        "hi",
      );
      expect(assertions.expectSpanWithName("echo").droppedAttributesCount).toBe(
        0,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("span attribute limit of 128"),
      );
    } finally {
      warn.mockRestore();
    }
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

  it("should propagate trace attributes to child observations", async () => {
    const handler = new CallbackHandler({
      sessionId: "session-1",
      userId: "user-1",
      tags: ["handler-tag"],
      traceMetadata: { team: "core" },
    });
    const model = new FakeStreamingChatModel({
      responses: [new AIMessage("Hi!")],
    });
    const chain = RunnableLambda.from((input: string) => [
      new HumanMessage(input),
    ]).pipe(model);

    await chain.invoke("Hello", { callbacks: [handler] });

    await waitForSpanExport(testEnv.mockExporter, 2);

    const spans = testEnv.mockExporter.exportedSpans;
    expect(
      spans.some(
        (span) =>
          span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] ===
          "generation",
      ),
    ).toBe(true);

    for (const span of spans) {
      expect(span.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID]).toBe(
        "session-1",
      );
      expect(span.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user-1",
      );
      expect(span.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
        "handler-tag",
      ]);
      expect(
        span.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.team`],
      ).toBe('"core"');
    }
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

  it("should read usage and model name from streamed AIMessageChunk generations", async () => {
    const handler = new CallbackHandler();
    const runId = "generation-with-chunk-usage";

    await handler.handleChatModelStart(
      { id: ["ChatOpenAI"] } as any,
      [[new HumanMessage("hi")]],
      runId,
      undefined,
      { invocation_params: {} },
    );
    await handler.handleLLMEnd(
      {
        generations: [
          [
            {
              text: "hello",
              message: new AIMessageChunk({
                content: "hello",
                usage_metadata: {
                  input_tokens: 10,
                  output_tokens: 5,
                  total_tokens: 15,
                },
                response_metadata: { model_name: "gpt-4.1-mini-2025-04-14" },
              }),
            } as ChatGeneration,
          ],
        ],
      },
      runId,
    );

    await waitForSpanExport(testEnv.mockExporter, 1);

    const generation = assertions.expectSpanWithName("ChatOpenAI");
    expect(
      generation.attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL],
    ).toBe("gpt-4.1-mini-2025-04-14");
    expect(
      JSON.parse(
        generation.attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS
        ] as string,
      ),
    ).toEqual({ input: 10, output: 5, total: 15 });
  });

  describe("chain outputs", () => {
    const getOutputAttribute = (spanName: string) =>
      assertions.expectSpanWithName(spanName).attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT
      ];
    const getJsonOutput = (spanName: string) =>
      JSON.parse(getOutputAttribute(spanName) as string);

    it("should extract display-ready prompt template outputs", async () => {
      const template = "Tell me a joke about {topic}.";
      const map = RunnableMap.from({
        String: PromptTemplate.fromTemplate(template),
        Human: HumanMessagePromptTemplate.fromTemplate(template),
        AI: AIMessagePromptTemplate.fromTemplate(template),
        System: SystemMessagePromptTemplate.fromTemplate(template),
      });

      const result = await map.invoke(
        { topic: "bears" },
        { callbacks: [new CallbackHandler()] },
      );
      await waitForSpanExport(testEnv.mockExporter, 5);

      const text = "Tell me a joke about bears.";
      const messages = {
        Human: [{ role: "user", content: text }],
        AI: [{ role: "assistant", content: text }],
        System: [{ role: "system", content: text }],
      };

      expect(getOutputAttribute("PromptTemplate")).toBe(text);
      expect(getJsonOutput("HumanMessagePromptTemplate")).toEqual(
        messages.Human,
      );
      expect(getJsonOutput("AIMessagePromptTemplate")).toEqual(messages.AI);
      expect(getJsonOutput("SystemMessagePromptTemplate")).toEqual(
        messages.System,
      );
      expect(getJsonOutput("RunnableMap")).toEqual({
        String: text,
        ...messages,
      });

      // Only what is reported changes, never the values flowing through the chain
      expect(HumanMessage.isInstance(result.Human[0])).toBe(true);
    });

    it("should keep chat prompt template outputs as role/content messages", async () => {
      const chatPrompt = ChatPromptTemplate.fromMessages([
        ["system", "You are a {role}."],
        ["human", "Tell me a joke about {topic}."],
      ]);
      const input = { role: "comedian", topic: "bears" };
      const handler = new CallbackHandler();

      await chatPrompt.invoke(input, {
        callbacks: [handler],
        runName: "chat-prompt",
      });
      await RunnableMap.from({
        Chat: chatPrompt,
        String: PromptTemplate.fromTemplate("Tell me a joke about {topic}."),
      }).invoke(input, { callbacks: [handler], runName: "prompt-map" });
      await waitForSpanExport(testEnv.mockExporter, 4);

      const chatMessages = {
        messages: [
          { role: "system", content: "You are a comedian." },
          { role: "user", content: "Tell me a joke about bears." },
        ],
      };

      expect(getJsonOutput("chat-prompt")).toEqual(chatMessages);
      expect(getJsonOutput("prompt-map")).toEqual({
        Chat: chatMessages,
        String: "Tell me a joke about bears.",
      });
    });

    it("should normalize message lists returned by runnables", async () => {
      const handler = new CallbackHandler();
      const messageList = () => [
        new HumanMessage("hi"),
        new AIMessage("hello"),
      ];

      await RunnableLambda.from(messageList).invoke("input", {
        callbacks: [handler],
        runName: "message-list",
      });
      await RunnableLambda.from(() => ({
        question: "hi",
        cursor: null,
        history: messageList(),
        turns: [[new HumanMessage("a")], [new AIMessage("b")]],
      })).invoke("input", { callbacks: [handler], runName: "nested-list" });
      await RunnableLambda.from(() => ({
        output: messageList(),
        sources: ["a"],
      })).invoke("input", { callbacks: [handler], runName: "list-with-keys" });
      await waitForSpanExport(testEnv.mockExporter, 3);

      const history = [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ];

      expect(getJsonOutput("message-list")).toEqual(history);
      expect(getJsonOutput("nested-list")).toEqual({
        question: "hi",
        cursor: null,
        history,
        turns: [
          [{ role: "user", content: "a" }],
          [{ role: "assistant", content: "b" }],
        ],
      });
      expect(getJsonOutput("list-with-keys")).toEqual({
        output: history,
        sources: ["a"],
      });
    });

    it("should not modify the outputs it reports", async () => {
      const history = [new HumanMessage("hi")];
      const turns = [[new HumanMessage("a")]];
      const scores = [Number.NaN, 1];
      const outputs = { history, turns, scores };

      const result = await RunnableLambda.from(() => outputs).invoke("input", {
        callbacks: [new CallbackHandler()],
      });
      await waitForSpanExport(testEnv.mockExporter, 1);

      expect(result).toBe(outputs);
      expect(outputs.history).toBe(history);
      expect(outputs.turns).toBe(turns);
      expect(outputs.scores).toBe(scores);
      expect(HumanMessage.isInstance(history[0])).toBe(true);
      expect(HumanMessage.isInstance(turns[0][0])).toBe(true);
      expect(getJsonOutput("RunnableLambda")).toEqual({
        history: [{ role: "user", content: "hi" }],
        turns: [[{ role: "user", content: "a" }]],
        scores: [null, 1],
      });
    });

    const mixedList = ["a", new HumanMessage("hi")];
    const aiMessage = new AIMessage("answer");
    const conversation = new (class Conversation {
      history = [new HumanMessage("hi")];
    })();

    // These outputs are reported as LangChain hands them over. Results that are
    // not objects arrive as `{ output: result }`, of which only a string is
    // unwrapped
    it.each([
      { name: "a string", value: "plain text", reported: "plain text" },
      { name: "an empty list", value: [], reported: '{"output":[]}' },
      {
        name: "a list of strings",
        value: ["a", "b"],
        reported: '{"output":["a","b"]}',
      },
      {
        name: "plain data",
        value: { a: 1, nested: { list: [1, { b: 2 }] } },
        reported: '{"a":1,"nested":{"list":[1,{"b":2}]}}',
      },
      {
        name: "a list mixing strings and messages",
        value: mixedList,
        reported: JSON.stringify({ output: mixedList }),
      },
      {
        name: "a single message",
        value: aiMessage,
        reported: JSON.stringify(aiMessage),
      },
      {
        name: "a class instance holding messages",
        value: conversation,
        reported: JSON.stringify(conversation),
      },
    ])("should leave $name unchanged", async ({ value, reported }) => {
      await RunnableLambda.from(() => value).invoke("input", {
        callbacks: [new CallbackHandler()],
      });
      await waitForSpanExport(testEnv.mockExporter, 1);

      expect(getOutputAttribute("RunnableLambda")).toBe(reported);
    });

    it("should still end the observation when the output cannot be traversed", async () => {
      // A circular output can be neither traversed nor serialized, but the
      // observation must still end and be exported
      const circular: Record<string, unknown> = { name: "circular" };
      circular.self = circular;

      await RunnableLambda.from(() => circular).invoke("input", {
        callbacks: [new CallbackHandler()],
      });
      await waitForSpanExport(testEnv.mockExporter, 1);

      assertions.expectSpanWithName("RunnableLambda");
    });

    it("should report the raw output when it cannot be traversed", async () => {
      // Reading `unreadable` throws, but JSON serialization only calls `toJSON`
      const output = {
        get unreadable(): string {
          throw new Error("cannot be read");
        },
        toJSON: () => ({ readable: true }),
      };

      await RunnableLambda.from(() => output).invoke("input", {
        callbacks: [new CallbackHandler()],
      });
      await waitForSpanExport(testEnv.mockExporter, 1);

      expect(getOutputAttribute("RunnableLambda")).toBe('{"readable":true}');
    });
  });
});
