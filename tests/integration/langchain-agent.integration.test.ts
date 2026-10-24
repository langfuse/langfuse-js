import type { AgentAction, AgentFinish } from "@langchain/core/agents";
import { HumanMessage } from "@langchain/core/messages";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import { CallbackHandler } from "@langfuse/langchain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpanAssertions } from "./helpers/assertions.js";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

/**
 * Regression test for the AgentExecutor trace split.
 *
 * AgentExecutor dispatches handleAgentAction and handleAgentEnd with the
 * running chain's own runId. The handler used to open a span for the action
 * under that runId, which overwrote the chain span already registered there and
 * reparented it at the root, so the chain span was never ended and every span
 * that followed the first action opened a second trace.
 *
 * The callbacks are driven directly here, in the exact order AgentExecutor
 * emits them for a single tool call, so the test is deterministic and needs no
 * model. See https://github.com/langfuse/langfuse-js/issues/867.
 */
describe("LangChain agent executor trace integrity", () => {
  let testEnv: TestEnvironment;
  let assertions: SpanAssertions;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    assertions = new SpanAssertions(testEnv.mockExporter);
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  it("keeps an agent run in a single trace rooted at the chain", async () => {
    const handler = new CallbackHandler();

    const serialized = { lc: 1, type: "not_implemented", id: [] } as Serialized;
    const CHAIN_RUN = "chain-run-id";
    const GEN_RUN = "generation-run-id";
    const TOOL_RUN = "tool-run-id";

    const action: AgentAction = {
      tool: "calculator",
      toolInput: "2+2",
      log: "",
    };
    const finish: AgentFinish = {
      returnValues: { output: "4" },
      log: "",
    };
    const llmResult: LLMResult = {
      generations: [[{ text: "I should use the calculator" }]],
    };

    // The AgentExecutor callback sequence for one tool call then a finish.
    await handler.handleChainStart(
      serialized,
      { input: "what is 2+2?" },
      CHAIN_RUN,
      undefined,
      [],
      {},
      undefined,
      "AgentExecutor",
    );
    await handler.handleChatModelStart(
      serialized,
      [[new HumanMessage("what is 2+2?")]],
      GEN_RUN,
      CHAIN_RUN,
      { invocation_params: { model: "test-model" } },
      [],
      {},
      "ChatModel",
    );
    await handler.handleLLMEnd(llmResult, GEN_RUN);
    // LangChain dispatches the agent callbacks optionally, so the handler is
    // free not to implement them. Mirror that here.
    await handler.handleAgentAction?.(action, CHAIN_RUN, undefined);
    await handler.handleToolStart(
      serialized,
      "2+2",
      TOOL_RUN,
      CHAIN_RUN,
      [],
      {},
      "calculator",
    );
    await handler.handleToolEnd("4", TOOL_RUN);
    await handler.handleAgentEnd?.(finish, CHAIN_RUN);
    await handler.handleChainEnd({ output: "4" }, CHAIN_RUN);

    // chain + generation + tool. Before the fix the chain span never ended, so
    // it was never exported and this timed out at 3.
    await waitForSpanExport(testEnv.mockExporter, 3);

    // The bug's fingerprint: the chain span is gone and the run straddles two
    // traces.
    assertions.expectSpanWithName("AgentExecutor");
    assertions.expectAllSpansInSameTrace();

    assertions.expectSpanCount(3);
    assertions.expectSpanHasNoParent("AgentExecutor");
    assertions.expectSpanParent("ChatModel", "AgentExecutor");
    assertions.expectSpanParent("calculator", "AgentExecutor");
  });
});
