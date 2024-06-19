import { Langfuse, type LangfuseOptions } from "langfuse";

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
  BaseMessage,
  HumanMessage,
  ChatMessage,
  AIMessage,
  SystemMessage,
  FunctionMessage,
  ToolMessage,
  type BaseMessageFields,
  type MessageContent,
} from "@langchain/core/messages";

import type { Serialized } from "@langchain/core/load/serializable";
import type { AgentAction, AgentFinish } from "@langchain/core/agents";
import type { ChainValues } from "@langchain/core/utils/types";
import type { LLMResult } from "@langchain/core/outputs";
import type { Document } from "@langchain/core/documents";

import type { LangfuseTraceClient, LangfuseSpanClient } from "langfuse-core";

export type LlmMessage = {
  role: string;
  content: BaseMessageFields["content"];
  additional_kwargs?: BaseMessageFields["additional_kwargs"];
};

export type AnonymousLlmMessage = {
  content: BaseMessageFields["content"];
  additional_kwargs?: BaseMessageFields["additional_kwargs"];
};

type RootParams = {
  root: LangfuseTraceClient | LangfuseSpanClient;
};

type ConstructorParams = (RootParams | LangfuseOptions) & {
  userId?: string; // added to all traces
  version?: string; // added to all traces and observations
  sessionId?: string; // added to all traces
  metadata?: Record<string, unknown>; // added to all traces
  tags?: string[]; // added to all traces
  updateRoot?: boolean;
};

/**
 * CallbackHandler
 * Handles various callbacks and interactions with the Langfuse SDK.
 *
 * @class
 * @extends BaseCallbackHandler
 * @property {Langfuse} langfuse - The Langfuse SDK instance.
 * @property {string} [traceId] - The trace ID for the current session.
 * @property {string} [observationId] - The observation ID for the current session.
 * @property {string} [rootObservationId] - The root observation ID for the current session.
 * @property {string} [topLevelObservationId] - The top-level observation ID for the current session.
 * @property {string} [userId] - The user ID associated with the session.
 * @property {string} [version] - The version of the application.
 * @property {string} [sessionId] - The session ID for the current session.
 * @property {Record<string, unknown>} [metadata] - Additional metadata for the session.
 * @property {string[]} [tags] - Tags associated with the session.
 * @property {boolean} rootProvided - Indicates if the root was provided.
 * @property {boolean} updateRoot - Indicates if the root should be updated.
 * @property {boolean} debugEnabled - Indicates if debugging is enabled.
 * @property {Record<string, Date>} completionStartTimes - Records the start times of completions.
 */
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
  metadata?: Record<string, unknown>;
  tags?: string[];
  rootProvided: boolean = false;
  updateRoot: boolean = false;
  debugEnabled: boolean = false;
  completionStartTimes: Record<string, Date> = {};

  /**
   * Creates an instance of CallbackHandler.
   *
   * @param {ConstructorParams} [params] - The configuration options for the CallbackHandler.
   */
  constructor(params?: ConstructorParams) {
    super();
    if (params && "root" in params) {
      this.langfuse = params.root.client as Langfuse;
      this.rootObservationId = params.root.observationId ?? undefined;
      this.traceId = params.root.traceId;
      this.rootProvided = true;
      this.updateRoot = params.updateRoot ?? false;
    } else {
      this.langfuse = new Langfuse({
        ...params,
        persistence: "memory",
        sdkIntegration: params?.sdkIntegration ?? "LANGCHAIN",
      });
      this.sessionId = params?.sessionId;
      this.userId = params?.userId;
      this.metadata = params?.metadata;
      this.tags = params?.tags;
    }
    this.version = params?.version;
  }

  /**
   * Flushes any pending data asynchronously.
   *
   * @returns {Promise<any>} A promise that resolves when the flush is complete.
   */
  async flushAsync(): Promise<any> {
    return this.langfuse.flushAsync();
  }

  /**
   * Shuts down the Langfuse SDK asynchronously.
   *
   * @returns {Promise<any>} A promise that resolves when the shutdown is complete.
   */
  async shutdownAsync(): Promise<any> {
    return this.langfuse.shutdownAsync();
  }

  /**
   * Enables or disables debugging.
   *
   * @param {boolean} [enabled=true] - Whether to enable debugging or not. Defaults to true.
   * @returns {void}
   *
   * @example
   * ```typescript
   * langfuse.debug();
   * ```
   */
  debug(enabled: boolean = true): void {
    this.langfuse.debug(enabled);
    this.debugEnabled = enabled;
  }

  _log(message: any): void {
    if (this.debugEnabled) {
      console.log(message);
    }
  }

  /**
   * Handles a new token event.
   *
   * @param {string} _token - The token.
   * @param {string} runId - The run ID.
   * @returns {Promise<void>}
   */
  async handleNewToken(_token: string, runId: string): Promise<void> {
    // if this is the first token, add it to completionStartTimes
    if (runId && !(runId in this.completionStartTimes)) {
      this._log(`LLM first streaming token: ${runId}`);
      this.completionStartTimes[runId] = new Date();
    }
    return Promise.resolve();
  }

  /**
   * Handles a new token event for LLM.
   *
   * @param {string} token - The token.
   * @param {any} _idx - The index.
   * @param {string} runId - The run ID.
   * @param {string} [_parentRunId] - The parent run ID.
   * @param {string[]} [_tags] - The tags.
   * @param {any} [_fields] - The fields.
   * @returns {Promise<void>}
   */
  async handleLLMNewToken(
    token: string,
    _idx: any,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _fields?: any
  ): Promise<void> {
    // if this is the first token, add it to completionStartTimes
    if (runId && !(runId in this.completionStartTimes)) {
      this._log(`LLM first streaming token: ${runId}`);
      this.completionStartTimes[runId] = new Date();
    }
    return Promise.resolve();
  }

  /**
   * @deprecated This method will be removed in a future version as it is not concurrency-safe.
   * Please use interop with the Langfuse SDK to get the trace ID ([docs](https://langfuse.com/docs/integrations/langchain/get-started#interoperability)).
   */
  getTraceId(): string | undefined {
    return this.traceId;
  }

  /**
   * @deprecated This method will be removed in a future version as it is not concurrency-safe.
   * For more information on how to get trace URLs, see {@link https://langfuse.com/docs/tracing/url}.
   */
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

  /**
   * Handles the start of a chain run.
   *
   * @param {Serialized} serialized - The serialized chain.
   * @param {ChainValues} inputs - The inputs to the chain.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @param {string[]} [tags] - The tags associated with the run.
   * @param {Record<string, any>} [metadata] - Additional metadata for the run.
   * @returns {Promise<void>}
   */
  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    runType?: string,
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

  /**
   * Handles the start of an agent action.
   *
   * @param {AgentAction} action - The agent action.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles the end of an agent run.
   *
   * @param {AgentFinish} finish - The agent end details.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles an error during a chain run.
   *
   * @param {Error} error - The error that occurred.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Generates a trace for the current session.
   *
   * @param {Serialized} serialized - The serialized object.
   * @param {string} runId - The run ID.
   * @param {string | undefined} parentRunId - The parent run ID.
   * @param {string[] | undefined} [tags] - The tags associated with the trace.
   * @param {Record<string, unknown> | undefined} [metadata] - Additional metadata for the trace.
   * @param {string | BaseMessage[][] | ChainValues | undefined} [input] - The input to the trace.
   * @returns {void}
   */
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

    const params = {
      name: serialized.id.at(-1)?.toString(),
      metadata: this.joinTagsAndMetaData(tags, metadata, this.metadata),
      userId: this.userId,
      version: this.version,
      sessionId: this.sessionId,
      input: input,
      tags: this.tags,
    };

    if (!this.traceId) {
      this.langfuse.trace({
        id: runId,
        ...params,
      });
      this.traceId = runId;
    }

    if (this.rootProvided && this.updateRoot) {
      if (this.rootObservationId) {
        this.langfuse._updateSpan({ id: this.rootObservationId, ...params });
      } else {
        this.langfuse.trace({ id: this.traceId, ...params });
      }
    }

    this.topLevelObservationId = parentRunId ? this.topLevelObservationId : runId;
  }

  /**
   * Handles the start of a generation run.
   * @param {Serialized} llm - The serialized LLM.
   * @param {(LlmMessage | MessageContent | AnonymousLlmMessage)[]} messages - The messages for the LLM.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @param {Record<string, any>} [extraParams] - Additional parameters for the run.
   * @param {string[]} [tags] - The tags associated with the run.
   * @param {Record<string, any>} [metadata] - Additional metadata for the run.
   * @param {string} [name] - The name of the LLM.
   * @returns {Promise<void>}
   */
  async handleGenerationStart(
    llm: Serialized,
    messages: (LlmMessage | MessageContent | AnonymousLlmMessage)[],
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

  /**
   * Handles the start of a chat model run.
   * @param {Serialized} llm - The serialized LLM.
   * @param {BaseMessage[][]} messages - The messages for the LLM.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @param {Record<string, unknown>} [extraParams] - Additional parameters for the run.
   * @param {string[]} [tags] - The tags associated with the run.
   * @param {Record<string, unknown>} [metadata] - Additional metadata for the run.
   * @param {string} [name] - The name of the LLM.
   * @returns {Promise<void>}
   */
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

      const prompts = messages.flatMap((message) => message.map((m) => this.extractChatMessageContent(m)));

      this.handleGenerationStart(llm, prompts, runId, parentRunId, extraParams, tags, metadata, name);
    } catch (e) {
      this._log(e);
    }
  }

  /**
   * Handles the end of a chain run.
   *
   * @param {ChainValues} outputs - The outputs of the chain.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles the start of an LLM run.
   *
   * @param {Serialized} serialized - The serialized LLM.
   * @param {BaseMessage[]} messages - The messages for the LLM.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @param {Record<string, any>} [extraParams] - Additional parameters for the run.
   * @param {string[]} [tags] - The tags associated with the run.
   * @param {Record<string, any>} [metadata] - Additional metadata for the run.
   * @param {string} [name] - The name of the LLM.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles the start of a tool run.
   *
   * @param {Serialized} tool - The serialized tool.
   * @param {string} input - The input to the tool.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @param {string[]} [tags] - The tags associated with the run.
   * @param {Record<string, unknown>} [metadata] - Additional metadata for the run.
   * @param {string} [name] - The name of the tool.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles the start of a retriever run.
   * @param {Serialized} retriever - The serialized retriever.
   * @param {string} query - The query for the retriever.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @param {string[]} [tags] - The tags associated with the run.
   * @param {Record<string, unknown>} [metadata] - Additional metadata for the run.
   * @param {string} [name] - The name of the retriever.
   * @returns {Promise<void>}
   */
  async handleRetrieverStart(
    retriever: Serialized,
    query: string,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined,
    metadata?: Record<string, unknown> | undefined,
    name?: string
  ): Promise<void> {
    try {
      this._log(`Retriever start with ID: ${runId}`);

      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        name: name ?? retriever.id.at(-1)?.toString(),
        input: query,
        metadata: this.joinTagsAndMetaData(tags, metadata),
        version: this.version,
      });
    } catch (e) {
      this._log(e);
    }
  }

  /**
   * Handles the end of a retriever run.
   * @param {Document<Record<string, any>>[]} documents - The documents retrieved by the retriever.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles the end of a tool run.
   *
   * @param {string} output - The output of the tool.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles an error during a tool run.
   *
   * @param {any} error - The error that occurred.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles the end of an LLM run.
   *
   * @param {LLMResult} output - The output of the LLM.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`LLM end with ID: ${runId}`);

      const lastResponse =
        output.generations[output.generations.length - 1][output.generations[output.generations.length - 1].length - 1];

      const llmUsage = output.llmOutput?.["tokenUsage"];

      const extractedOutput =
        "message" in lastResponse && lastResponse["message"] instanceof BaseMessage
          ? this.extractChatMessageContent(lastResponse["message"])
          : lastResponse.text;

      this.langfuse._updateGeneration({
        id: runId,
        traceId: this.traceId,
        output: extractedOutput,
        endTime: new Date(),
        completionStartTime: runId in this.completionStartTimes ? this.completionStartTimes[runId] : undefined,
        usage: llmUsage,
        version: this.version,
      });

      if (runId in this.completionStartTimes) {
        delete this.completionStartTimes[runId];
      }

      this.updateTrace(runId, parentRunId, extractedOutput);
    } catch (e) {
      this._log(e);
    }
  }

  private extractChatMessageContent(message: BaseMessage): LlmMessage | AnonymousLlmMessage | MessageContent {
    let response = undefined;

    if (message instanceof HumanMessage) {
      response = { content: message.content, role: "user" };
    } else if (message instanceof ChatMessage) {
      response = { content: message.content, role: message.name };
    } else if (message instanceof AIMessage) {
      response = { content: message.content, role: "assistant" };
    } else if (message instanceof SystemMessage) {
      response = { content: message.content, role: "system" };
    } else if (message instanceof FunctionMessage) {
      response = { content: message.content, additional_kwargs: message.additional_kwargs, role: message.name };
    } else if (message instanceof ToolMessage) {
      response = { content: message.content, additional_kwargs: message.additional_kwargs, role: message.name };
    } else if (!message.name) {
      response = { content: message.content };
    } else {
      response = {
        role: message.name,
        content: message.content,
      };
    }
    if (message.additional_kwargs.function_call || message.additional_kwargs.tool_calls) {
      return { ...response, additional_kwargs: message.additional_kwargs };
    }
    return response;
  }

  /**
   * Handles an error during an LLM run.
   *
   * @param {any} error - The error that occurred.
   * @param {string} runId - The run ID.
   * @param {string} [parentRunId] - The parent run ID.
   * @returns {Promise<void>}
   */
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

  /**
   * Updates the trace with the output.
   *
   * @param {string} runId - The run ID.
   * @param {string | undefined} parentRunId - The parent run ID.
   * @param {string | Record<string, any>} output - The output to update the trace with.
   * @returns {void}
   */
  updateTrace(runId: string, parentRunId: string | undefined, output: any): void {
    if (!parentRunId && this.traceId && this.traceId === runId) {
      this.langfuse.trace({ id: this.traceId, output: output });
    }

    if (!parentRunId && this.traceId && this.rootProvided && this.updateRoot) {
      if (this.rootObservationId) {
        this.langfuse._updateSpan({ id: this.rootObservationId, output });
      } else {
        this.langfuse.trace({ id: this.traceId, output });
      }
    }
  }

  /**
   * Joins tags and metadata into a single object.
   *
   * @param {string[] | undefined} [tags] - The tags.
   * @param {Record<string, unknown> | undefined} [metadata1] - The first metadata object.
   * @param {Record<string, unknown> | undefined} [metadata2] - The second metadata object.
   * @returns {Record<string, unknown>} - The combined tags and metadata.
   */
  joinTagsAndMetaData(
    tags?: string[] | undefined,
    metadata1?: Record<string, unknown> | undefined,
    metadata2?: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    const finalDict: Record<string, unknown> = {};
    if (tags && tags.length > 0) {
      finalDict.tags = tags;
    }
    if (metadata1) {
      Object.assign(finalDict, metadata1);
    }
    if (metadata2) {
      Object.assign(finalDict, metadata2);
    }
    return finalDict;
  }
}
