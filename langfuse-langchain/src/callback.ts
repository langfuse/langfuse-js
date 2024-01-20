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
import { type Document } from "langchain/document";

import { Langfuse, type LangfuseOptions } from "langfuse";
import type { LangfuseTraceClient, LangfuseSpanClient } from "langfuse-core";

type RootParams = {
  root: LangfuseTraceClient | LangfuseSpanClient;
};

type KeyParams = {
  publicKey: string;
  secretKey: string;
} & LangfuseOptions;

type ConstructorParams = (RootParams | KeyParams) & {
  userId?: string; // added to all traces
  version?: string; // added to all traces and observations
  sessionId?: string; // added to all traces
};

export class CallbackHandler extends BaseCallbackHandler {
  name = "CallbackHandler";
  langfuse: Langfuse;
  traceId?: string;
  observationId?: string;
  rootObservationId?: string;
  topLevelObservationId?: string;
  userId?: string;
  version?: string;
  sessionId?: string;
  rootProvided: boolean = false;
  debugEnabled: boolean = false;

  constructor(params: ConstructorParams) {
    super();
    if ("root" in params) {
      this.langfuse = params.root.client as Langfuse;
      this.rootObservationId = params.root.observationId ?? undefined;
      this.traceId = params.root.traceId;
      this.rootProvided = true;
    } else {
      this.langfuse = new Langfuse({ ...params, persistence: "memory", sdkIntegration: "LANGCHAIN" });
      this.sessionId = params.sessionId;
    }
    this.userId = params.userId;
    this.version = params.version;
  }

  async flushAsync(): Promise<any> {
    return this.langfuse.flushAsync();
  }

  async shutdownAsync(): Promise<any> {
    return this.langfuse.shutdownAsync();
  }

  debug(enabled: boolean = true): void {
    this.langfuse.debug(enabled);
    this.debugEnabled = enabled;
  }

  _log(message: any): void {
    if (this.debugEnabled) {
      console.log(message);
    }
  }

  async handleNewToken(token: string, runId: string): Promise<void> {
    this._log(`New token: ${token} with ID: ${runId}`);
  }

  getTraceId(): string | undefined {
    return this.traceId;
  }

  getTraceUrl(): string | undefined {
    return this.traceId ? `${this.langfuse.baseUrl}/trace/${this.traceId}` : undefined;
  }

  getLangchainRunId(): string | undefined {
    return this.topLevelObservationId;
  }

  async handleRetrieverError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`Retriever error: ${err} with ID: ${runId}`);
      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, err.toString());
    } catch (e) {
      this._log(e);
    }
  }

  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    runType?: string
    name?: string
  ): Promise<void> {
    try {
      this._log(`Chain start with Id: ${runId}`);

      this.generateTrace(chain, runId, parentRunId, tags, metadata, inputs);
      this.langfuse.span({
        id: runId,
        traceId: this.traceId,
        parentObservationId: parentRunId ?? this.rootObservationId,
        name: name ?? chain.id.at(-1)?.toString(),
        metadata: this.joinTagsAndMetaData(tags, metadata),
        input: inputs,
        version: this.version,
      });
    } catch (e) {
      this._log(e);
    }
  }

  async handleAgentAction(action: AgentAction, runId?: string, parentRunId?: string): Promise<void> {
    try {
      this._log(`Agent action with ID: ${runId}`);

      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        endTime: new Date(),
        input: action,
        version: this.version,
      });
    } catch (e) {
      this._log(e);
    }
  }

  async handleAgentEnd?(action: AgentFinish, runId: string, parentRunId?: string): Promise<void> {
    try {
      this._log(`Agent finish with ID: ${runId}`);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        endTime: new Date(),
        output: action,
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, action);
    } catch (e) {
      this._log(e);
    }
  }

  async handleChainError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`Chain error: ${err} with ID: ${runId}`);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, err.toString());
    } catch (e) {
      this._log(e);
    }
  }

  generateTrace(
    serialized: Serialized,
    runId: string,
    parentRunId: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    input?: string | BaseMessage[][] | ChainValues
  ): void {
    if (this.traceId && !parentRunId && !this.rootProvided) {
      this.traceId = undefined;
      this.topLevelObservationId = undefined;
    }

    if (!this.traceId) {
      this.langfuse.trace({
        id: runId,
        name: serialized.id.at(-1)?.toString(),
        metadata: this.joinTagsAndMetaData(tags, metadata),
        userId: this.userId,
        version: this.version,
        sessionId: this.sessionId,
        input: input,
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
    metadata?: Record<string, unknown> | undefined,
    name?: string
  ): Promise<void> {
    this._log(`Generation start with ID: ${runId}`);

    this.generateTrace(llm, runId, parentRunId, tags, metadata, messages);

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
      name: name ?? llm.id.at(-1)?.toString(),
      metadata: this.joinTagsAndMetaData(tags, metadata),
      parentObservationId: parentRunId ?? this.rootObservationId,
      input: messages,
      model: extractedModelName,
      modelParameters: modelParameters,
      version: this.version,
    });
  }

  async handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string | undefined,
    extraParams?: Record<string, unknown> | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    name?: string
  ): Promise<void> {
    try {
      this._log(`Chat model start with ID: ${runId}`);

      this.handleGenerationStart(llm, messages, runId, parentRunId, extraParams, tags, metadata, name);
    } catch (e) {
      this._log(e);
    }
  }

  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`Chain end with ID: ${runId}`);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        output: outputs,
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, outputs);
    } catch (e) {
      this._log(e);
    }
  }

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string | undefined,
    extraParams?: Record<string, unknown> | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    name?: string
  ): Promise<void> {
    try {
      this._log(`LLM start with ID: ${runId}`);

      this.handleGenerationStart(llm, prompts, runId, parentRunId, extraParams, tags, metadata, name);
    } catch (e) {
      this._log(e);
    }
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    name?: string
  ): Promise<void> {
    try {
      this._log(`Tool start with ID: ${runId}`);

      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        name: name ?? tool.id.at(-1)?.toString(),
        input: input,
        metadata: this.joinTagsAndMetaData(tags, metadata),
        version: this.version,
      });
    } catch (e) {
      this._log(e);
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
      this._log(`Retriever start with ID: ${runId}`);

      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        name: retriever.id.at(-1)?.toString(),
        input: query,
        metadata: this.joinTagsAndMetaData(tags, metadata),
        version: this.version,
      });
    } catch (e) {
      this._log(e);
    }
  }

  async handleRetrieverEnd(
    documents: Document<Record<string, any>>[],
    runId: string,
    parentRunId?: string | undefined
  ): Promise<void> {
    try {
      this._log(`Retriever end with ID: ${runId}`);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        output: documents,
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, documents);
    } catch (e) {
      this._log(e);
    }
  }

  async handleToolEnd(output: string, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`Tool end with ID: ${runId}`);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        output: output,
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, output);
    } catch (e) {
      this._log(e);
    }
  }

  async handleToolError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`Tool error ${err} with ID: ${runId}`);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, err.toString());
    } catch (e) {
      this._log(e);
    }
  }

  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`LLM end with ID: ${runId}`);

      const lastResponse =
        output.generations[output.generations.length - 1][output.generations[output.generations.length - 1].length - 1];

      const llmUsage = output.llmOutput?.["tokenUsage"];

      const extractedOutput =
        !lastResponse.text &&
        "message" in lastResponse &&
        lastResponse["message"] instanceof AIMessage &&
        lastResponse["message"].additional_kwargs
          ? lastResponse["message"].additional_kwargs
          : lastResponse.text;

      this.langfuse._updateGeneration({
        id: runId,
        traceId: this.traceId,
        output: extractedOutput,
        endTime: new Date(),
        usage: llmUsage,
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, extractedOutput);
    } catch (e) {
      this._log(e);
    }
  }

  async handleLLMError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`LLM error ${err} with ID: ${runId}`);

      this.langfuse._updateGeneration({
        id: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, err.toString());
    } catch (e) {
      this._log(e);
    }
  }

  updateTrace(runId: string, parentRunId: string | undefined, output: any): void {
    if (!parentRunId && this.traceId && this.traceId === runId) {
      this.langfuse.trace({ id: this.traceId, output: output });
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
