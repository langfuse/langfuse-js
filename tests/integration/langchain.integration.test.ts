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

  it.each(
    (
      [
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
      ] as const
    ).flatMap(({ name, start }) => [
      {
        name,
        start,
        error: new GraphInterrupt([{ value: { reason: "input_required" } }]),
        expectedLevel: "DEFAULT",
        expectedStatus: "GraphInterrupt",
      },
      {
        name,
        start,
        error: new Error("database unavailable"),
        expectedLevel: "ERROR",
        expectedStatus: "database unavailable",
      },
    ]),
  )(
    "should classify $name observations as $expectedLevel",
    async ({ name, start, error, expectedLevel, expectedStatus }) => {
      const handler = new CallbackHandler();
      const runId = `${name}-${expectedLevel}`;

      await start(handler, runId);
      await handler[name](error, runId);
      await waitForSpanExport(testEnv.mockExporter, 1);

      expect(testEnv.mockExporter.exportedSpans).toHaveLength(1);
      expect(
        testEnv.mockExporter.exportedSpans[0].attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_LEVEL
        ],
      ).toBe(expectedLevel);
      expect(
        getObservationStatusMessage(testEnv.mockExporter.exportedSpans[0]),
      ).toContain(expectedStatus);
    },
  );
});
