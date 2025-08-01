import { Langfuse, type LangfuseOptions } from "langfuse";

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  ChatMessage,
  FunctionMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type UsageMetadata,
  type BaseMessageFields,
  type MessageContent,
} from "@langchain/core/messages";

import type { Serialized } from "@langchain/core/load/serializable";
import type { AgentAction, AgentFinish } from "@langchain/core/agents";
import type { ChainValues } from "@langchain/core/utils/types";
import type { Generation, LLMResult } from "@langchain/core/outputs";
import type { Document } from "@langchain/core/documents";

import type { ChatPromptClient, LangfuseSpanClient, LangfuseTraceClient, TextPromptClient } from "langfuse-core";

const LANGSMITH_HIDDEN_TAG = "langsmith:hidden";

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

type KeyParams = {
  publicKey?: string;
  secretKey?: string;
} & LangfuseOptions;

type ConstructorParams = (RootParams | KeyParams) & {
  userId?: string; // added to all traces
  version?: string; // added to all traces and observations
  sessionId?: string; // added to all traces
  metadata?: Record<string, unknown>; // added to all traces
  tags?: string[]; // added to all traces
  updateRoot?: boolean;
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
  metadata?: Record<string, unknown>;
  tags?: string[];
  rootProvided: boolean = false;
  updateRoot: boolean = false;
  debugEnabled: boolean = false;
  completionStartTimes: Record<string, Date> = {};
  private promptToParentRunMap;
  private traceUpdates;

  constructor(params?: ConstructorParams) {
    super();
    if (params && "root" in params) {
      this.langfuse = params.root.client as Langfuse;
      this.rootObservationId = params.root.observationId ?? undefined;
      this.traceId = params.root.traceId;
      this.rootProvided = true;
      this.updateRoot = params.updateRoot ?? false;
      this.metadata = params.metadata;
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
    this.promptToParentRunMap = new Map<string, TextPromptClient | ChatPromptClient>();
    this.traceUpdates = new Map<string, { userId?: string; sessionId?: string; tags?: string[] }>();
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

  async handleNewToken(_token: string, runId: string): Promise<void> {
    // if this is the first token, add it to completionStartTimes
    if (runId && !(runId in this.completionStartTimes)) {
      this._log(`LLM first streaming token: ${runId}`);
      this.completionStartTimes[runId] = new Date();
    }
    return Promise.resolve();
  }

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

      const runName = name ?? chain.id.at(-1)?.toString() ?? "Langchain Run";

      this.registerLangfusePrompt(parentRunId, metadata);

      // In chains, inputs can be a string or an array of BaseMessage
      let finalInput: string | ChainValues = inputs;
      if (
        typeof inputs === "object" &&
        "input" in inputs &&
        Array.isArray(inputs["input"]) &&
        inputs["input"].every((m) => m instanceof BaseMessage)
      ) {
        finalInput = inputs["input"].map((m) => this.extractChatMessageContent(m));
      } else if (typeof inputs === "object" && "content" in inputs && typeof inputs["content"] === "string") {
        finalInput = inputs["content"];
      }

      this.generateTrace(runName, runId, parentRunId, tags, metadata, finalInput);
      this.langfuse.span({
        id: runId,
        traceId: this.traceId,
        parentObservationId: parentRunId ?? this.rootObservationId,
        name: runName,
        metadata: this.joinTagsAndMetaData(tags, metadata),
        input: finalInput,
        version: this.version,
        level: tags && tags.includes(LANGSMITH_HIDDEN_TAG) ? "DEBUG" : undefined,
      });

      // If there's no parent run, this is a top-level chain execution.
      // We store trace-level metadata (tags, userId, sessionId) for later use.
      // This information will be used to update on handleChainEnd
      if (!parentRunId) {
        this.traceUpdates.set(runId, {
          tags,
          userId:
            metadata && "langfuseUserId" in metadata && typeof metadata["langfuseUserId"] === "string"
              ? metadata["langfuseUserId"]
              : undefined,
          sessionId:
            metadata && "langfuseSessionId" in metadata && typeof metadata["langfuseSessionId"] === "string"
              ? metadata["langfuseSessionId"]
              : undefined,
        });
      }
    } catch (e) {
      this._log(e);
    }
  }

  private registerLangfusePrompt(parentRunId?: string, metadata?: Record<string, unknown>): void {
    /*
    Register a prompt for linking to a generation with the same parentRunId.

    `parentRunId` must exist when we want to do any prompt linking to a generation. If it does not exist, it means the execution is solely a Prompt template formatting without any following LLM invocation, so no generation will be created to link to.
    For the simplest chain, a parent run is always created to wrap the individual runs consisting of prompt template formatting and LLM invocation.
    So, we do not need to register any prompt for linking if parentRunId is missing.
    */
    if (metadata && "langfusePrompt" in metadata && parentRunId) {
      this.promptToParentRunMap.set(parentRunId, metadata.langfusePrompt as TextPromptClient | ChatPromptClient);
    }
  }

  private deregisterLangfusePrompt(runId: string): void {
    this.promptToParentRunMap.delete(runId);
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

      const azureRefusalError = this.parseAzureRefusalError(err);

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString() + azureRefusalError,
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, err.toString() + azureRefusalError);
    } catch (e) {
      this._log(e);
    }
  }

  generateTrace(
    runName: string,
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
      name: runName,
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
        this.langfuse._updateSpan({ id: this.rootObservationId, traceId: this.traceId, ...params });
      } else {
        this.langfuse.trace({ id: this.traceId, ...params });
      }
    }

    this.topLevelObservationId = parentRunId ? this.topLevelObservationId : runId;
  }

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

    const runName = name ?? llm.id.at(-1)?.toString() ?? "Langchain Generation";

    this.generateTrace(runName, runId, parentRunId, tags, metadata, messages);

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
      const invocationParamsModelName = (extraParams.invocation_params as InvocationParams).model;
      const metadataModelName =
        metadata && "ls_model_name" in metadata ? (metadata["ls_model_name"] as string) : undefined;

      extractedModelName = invocationParamsModelName ?? metadataModelName;
    }

    const registeredPrompt = this.promptToParentRunMap.get(parentRunId ?? "root");
    if (registeredPrompt && parentRunId) {
      this.deregisterLangfusePrompt(parentRunId);
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
      prompt: registeredPrompt,
      level: tags && tags.includes(LANGSMITH_HIDDEN_TAG) ? "DEBUG" : undefined,
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

      const prompts = messages.flatMap((message) => message.map((m) => this.extractChatMessageContent(m)));

      this.handleGenerationStart(llm, prompts, runId, parentRunId, extraParams, tags, metadata, name);
    } catch (e) {
      this._log(e);
    }
  }

  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`Chain end with ID: ${runId}`);

      let finalOutput: ChainValues | string = outputs;
      if (typeof outputs === "object" && "output" in outputs && typeof outputs["output"] === "string") {
        finalOutput = outputs["output"];
      }

      this.langfuse._updateSpan({
        id: runId,
        traceId: this.traceId,
        output: finalOutput,
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, finalOutput);
      this.deregisterLangfusePrompt(runId);
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
        level: tags && tags.includes(LANGSMITH_HIDDEN_TAG) ? "DEBUG" : undefined,
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
        level: tags && tags.includes(LANGSMITH_HIDDEN_TAG) ? "DEBUG" : undefined,
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
      const llmUsage = this.extractUsageMetadata(lastResponse) ?? output.llmOutput?.["tokenUsage"];
      const modelName = this.extractModelNameFromMetadata(lastResponse);

      const usageDetails: Record<string, any> = {
        input: llmUsage?.input_tokens ?? ("promptTokens" in llmUsage ? llmUsage?.promptTokens : undefined),
        output: llmUsage?.output_tokens ?? ("completionTokens" in llmUsage ? llmUsage?.completionTokens : undefined),
        total: llmUsage?.total_tokens ?? ("totalTokens" in llmUsage ? llmUsage?.totalTokens : undefined),
      };

      if (llmUsage && "input_token_details" in llmUsage) {
        for (const [key, val] of Object.entries(llmUsage["input_token_details"] ?? {})) {
          usageDetails[`input_${key}`] = val;

          if ("input" in usageDetails && typeof val === "number") {
            usageDetails["input"] = Math.max(0, usageDetails["input"] - val);
          }
        }
      }

      if (llmUsage && "output_token_details" in llmUsage) {
        for (const [key, val] of Object.entries(llmUsage["output_token_details"] ?? {})) {
          usageDetails[`output_${key}`] = val;

          if ("output" in usageDetails && typeof val === "number") {
            usageDetails["output"] = Math.max(0, usageDetails["output"] - val);
          }
        }
      }

      const extractedOutput =
        "message" in lastResponse && lastResponse["message"] instanceof BaseMessage
          ? this.extractChatMessageContent(lastResponse["message"])
          : lastResponse.text;

      this.langfuse._updateGeneration({
        id: runId,
        model: modelName,
        traceId: this.traceId,
        output: extractedOutput,
        endTime: new Date(),
        completionStartTime: runId in this.completionStartTimes ? this.completionStartTimes[runId] : undefined,
        usage: usageDetails,
        usageDetails: usageDetails,
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

  /** Not all models supports tokenUsage in llmOutput, can use AIMessage.usage_metadata instead */
  private extractUsageMetadata(generation: Generation): UsageMetadata | undefined {
    try {
      const usageMetadata =
        "message" in generation &&
        (generation["message"] instanceof AIMessage || generation["message"] instanceof AIMessageChunk)
          ? generation["message"].usage_metadata
          : undefined;

      return usageMetadata;
    } catch (err) {
      this._log(`Error extracting usage metadata: ${err}`);

      return;
    }
  }

  private extractModelNameFromMetadata(generation: any): string | undefined {
    try {
      return "message" in generation &&
        (generation["message"] instanceof AIMessage || generation["message"] instanceof AIMessageChunk)
        ? generation["message"].response_metadata.model_name
        : undefined;
    } catch {}
  }

  private extractChatMessageContent(message: BaseMessage): LlmMessage | AnonymousLlmMessage | MessageContent {
    let response = undefined;

    if (message instanceof HumanMessage) {
      response = { content: message.content, role: "user" };
    } else if (message instanceof ChatMessage) {
      response = { content: message.content, role: message.role };
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

  async handleLLMError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      this._log(`LLM error ${err} with ID: ${runId}`);

      // Azure has the refusal status for harmful messages in the error property
      // This would not be logged as the error message is only a generic message
      // that there has been a refusal
      const azureRefusalError = this.parseAzureRefusalError(err);

      this.langfuse._updateGeneration({
        id: runId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString() + azureRefusalError,
        endTime: new Date(),
        version: this.version,
      });
      this.updateTrace(runId, parentRunId, err.toString() + azureRefusalError);
    } catch (e) {
      this._log(e);
    }
  }

  private parseAzureRefusalError(err: any): string {
    // Azure has the refusal status for harmful messages in the error property
    // This would not be logged as the error message is only a generic message
    // that there has been a refusal
    let azureRefusalError = "";
    if (typeof err == "object" && "error" in err) {
      try {
        azureRefusalError = "\n\nError details:\n" + JSON.stringify(err["error"], null, 2);
      } catch {}
    }

    return azureRefusalError;
  }

  updateTrace(runId: string, parentRunId: string | undefined, output: any): void {
    const traceUpdates = this.traceUpdates.get(runId);
    this.traceUpdates.delete(runId);

    if (!parentRunId && this.traceId && this.traceId === runId) {
      this.langfuse.trace({ id: this.traceId, output: output, ...traceUpdates });
    }

    if (!parentRunId && this.traceId && this.rootProvided && this.updateRoot) {
      if (this.rootObservationId) {
        this.langfuse._updateSpan({ id: this.rootObservationId, traceId: this.traceId, output });
      } else {
        this.langfuse.trace({ id: this.traceId, output, ...traceUpdates });
      }
    }
  }

  joinTagsAndMetaData(
    tags?: string[] | undefined,
    metadata1?: Record<string, unknown> | undefined,
    metadata2?: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined {
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
    return this.stripLangfuseKeysFromMetadata(finalDict);
  }

  private stripLangfuseKeysFromMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!metadata) {
      return;
    }

    const langfuseKeys = ["langfusePrompt", "langfuseUserId", "langfuseSessionId"];

    return Object.fromEntries(Object.entries(metadata).filter(([key, _]) => !langfuseKeys.includes(key)));
  }
}
