import { BaseCallbackHandler } from "langchain/callbacks";
import type { Serialized } from "langchain/load/serializable";
import {
  AIMessage,
  type AgentAction,
  type AgentFinish,
  type BaseMessage,
  type ChainValues,
  type LLMResult,
} from "langchain/schema";

import { Langfuse } from "../../langfuse/index";

import { type LangfuseOptions } from "langfuse/src/types";
import { type Document } from "langchain/document";
import type { LangfuseTraceClient, LangfuseSpanClient } from "langfuse-core/src";

type RootParams = {
  root: LangfuseTraceClient | LangfuseSpanClient;
};

type KeyParams = {
  publicKey: string;
  secretKey: string;
} & LangfuseOptions;

type ConstructorParams = RootParams | KeyParams;

export class CallbackHandler extends BaseCallbackHandler {
  name = "CallbackHandler";
  langfuse: Langfuse;
  traceId?: string;
  observationId?: string;
  rootObservationId?: string;
  topLevelObservationId?: string;

  constructor(params: ConstructorParams) {
    super();
    if ("root" in params) {
      this.langfuse = params.root.client as Langfuse;
      this.rootObservationId = params.root.observationId ?? undefined;
      this.traceId = params.root.traceId;
    } else {
      this.langfuse = new Langfuse({ ...params, persistence: "memory" });
    }
  }

  async flushAsync(): Promise<any> {
    return this.langfuse.flushAsync();
  }

  async shutdownAsync(): Promise<any> {
    return this.langfuse.shutdownAsync();
  }

  async handleNewToken(token: string, runId: string): Promise<void> {
    console.log("New token:", token, "with ID:", runId);
  }

  getTraceId(): string | undefined {
    return this.traceId;
  }

  getLangchainRunId(): string | undefined {
    return this.topLevelObservationId;
  }

  async handleRetrieverError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Retriever error:", err, runId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Promise<void> {
    try {
      console.log("Chain start with Id:", runId);
      this.generateTrace(chain, runId, parentRunId, tags, metadata);
      this.langfuse.span({
        id: runId,
        traceId: this.traceId,
        parentObservationId: parentRunId ?? this.rootObservationId,
        name: chain.id.at(-1)?.toString(),
        metadata: this.joinTagsAndMetaData(tags, metadata),
        input: inputs,
        startTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleAgentAction(action: AgentAction, runId?: string, parentRunId?: string): Promise<void> {
    try {
      console.log("Agent action:", runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        endTime: new Date(),
        input: action,
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleAgentEnd?(action: AgentFinish, runId: string, parentRunId?: string): Promise<void> {
    try {
      console.log("Agent finish:", runId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        endTime: new Date(),
        output: action,
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleChainError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Chain error:", err, runId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  generateTrace(
    serialized: Serialized,
    runId: string,
    parentRunId: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): void {
    if (!this.traceId) {
      this.langfuse.trace({
        id: runId,
        name: serialized.id.at(-1)?.toString(),
        metadata: this.joinTagsAndMetaData(tags, metadata),
      });
      this.traceId = runId;
    }
    this.topLevelObservationId = parentRunId ? this.topLevelObservationId : runId;
  }

  async handleGenerationStart(
    llm: Serialized,
    messages: BaseMessage[][] | string[],
    runId: string,
    parentRunId?: string | undefined,
    extraParams?: Record<string, unknown> | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Promise<void> {
    console.log("Generation start:", runId);
    this.generateTrace(llm, runId, parentRunId, tags, metadata);

    const modelParameters: Record<string, any> = {};
    const invocationParams = extraParams?.["invocation_params"];

    for (const [key, value] of Object.entries({
      temperature: (invocationParams as any)?.temperature,
      max_tokens: (invocationParams as any)?.max_tokens,
      top_p: (invocationParams as any)?.top_p,
      frequency_penalty: (invocationParams as any)?.frequency_penalty,
      presence_penalty: (invocationParams as any)?.presence_penalty,
      request_timeout: (invocationParams as any)?.request_timeout,
    })) {
      if (value !== undefined && value !== null) {
        modelParameters[key] = value;
      }
    }

    interface InvocationParams {
      _type?: string;
      model?: string;
      model_name?: string;
      repo_id?: string;
    }

    let extractedModelName: string | undefined;
    if (extraParams) {
      const params = extraParams.invocation_params as InvocationParams;
      extractedModelName = params.model;
    }

    this.langfuse.generation({
      id: runId,
      traceId: this.traceId,
      name: llm.id.at(-1)?.toString(),
      startTime: new Date(),
      metadata: this.joinTagsAndMetaData(tags, metadata),
      parentObservationId: parentRunId ?? this.rootObservationId,
      prompt: messages as any,
      model: extractedModelName,
      modelParameters: modelParameters,
    });
  }

  async handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string | undefined,
    extraParams?: Record<string, unknown> | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Promise<void> {
    try {
      console.log("ChatModel start:", runId);
      this.handleGenerationStart(llm, messages, runId, parentRunId, extraParams, tags, metadata);
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Chain end:", runId, parentRunId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        output: outputs,
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string | undefined,
    extraParams?: Record<string, unknown> | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Promise<void> {
    try {
      console.log("LLM start:", runId);
      this.handleGenerationStart(llm, prompts, runId, parentRunId, extraParams, tags, metadata);
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Promise<void> {
    try {
      console.log("Tool start:", runId);

      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        name: tool.id.at(-1)?.toString(),
        input: input as any,
        metadata: this.joinTagsAndMetaData(tags, metadata),
        startTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleRetrieverStart(
    retriever: Serialized,
    query: string,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Promise<void> {
    try {
      console.log("Retriever start:", runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        name: retriever.id.at(-1)?.toString(),
        input: query as any,
        metadata: this.joinTagsAndMetaData(tags, metadata),
        startTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleRetrieverEnd(
    documents: Document<Record<string, any>>[],
    runId: string,
    parentRunId?: string | undefined
  ): Promise<void> {
    try {
      console.log("Retriever end:", runId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        output: documents as any,
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleToolEnd(output: string, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Tool end:", runId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        output: output as any,
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleToolError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Tool error:", err, runId);
      this.langfuse._updateSpan({
        spanId: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("LLM end:", runId, parentRunId);
      const lastResponse =
        output.generations[output.generations.length - 1][output.generations[output.generations.length - 1].length - 1];

      const llmUsage = output.llmOutput?.["tokenUsage"];

      this.langfuse._updateGeneration({
        generationId: runId,
        traceId: this.traceId,
        completion:
          !lastResponse.text &&
          "message" in lastResponse &&
          lastResponse["message"] instanceof AIMessage &&
          lastResponse["message"].additional_kwargs
            ? JSON.stringify(lastResponse["message"].additional_kwargs)
            : lastResponse.text,
        endTime: new Date(),
        usage: llmUsage,
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleLLMError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("LLM error:", err, runId);
      this.langfuse._updateGeneration({
        generationId: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  joinTagsAndMetaData(
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    if (tags) {
      const finalDict = { tags: tags };
      if (metadata) {
        return { ...finalDict, ...metadata };
      }
    }
    return metadata ?? {};
  }
}
