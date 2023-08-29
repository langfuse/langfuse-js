import { BaseCallbackHandler } from "langchain/callbacks";
import type { Serialized } from "langchain/load/serializable";
import type { AgentAction, AgentFinish, BaseMessage, ChainValues, LLMResult } from "langchain/schema";

import Langfuse from "langfuse";
import { type LangfuseOptions } from "langfuse/src/types";
import { type Document } from "langchain/document";

export class CallbackHandler extends BaseCallbackHandler {
  name = "CallbackHandler";
  langfuse: Langfuse;
  traceId?: string;

  constructor(params: { publicKey: string; secretKey: string } & LangfuseOptions) {
    super();
    this.langfuse = new Langfuse(params);
  }

  async handleNewToken(token: string, runId: string): Promise<void> {
    console.log("New token:", token, "with ID:", runId);
  }

  async handleRetrieverError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Retriever error:", err, runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
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

      if (!this.traceId) {
        this.langfuse.trace({
          id: runId,
          name: chain.id.at(-1)?.toString(),
          metadata: this.joinTagsAndMetaData(tags, metadata),
        });
        this.traceId = runId;
      }
      console.log("Chain start with Id:", runId);
      this.langfuse.span({
        id: runId,
        traceId: this.traceId,
        parentObservationId: parentRunId,
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
        output: action,
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleAgentFinish(finish: AgentFinish, runId?: string, parentRunId?: string): Promise<void> {
    try {
      console.log("Agent finish:", runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        endTime: new Date(),
        output: finish,
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleChainError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Chain error:", err, runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        level: "ERROR",
        statusMessage: err.toString(),
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
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
      const modelName = (extraParams?.invocation_params as any)?.model;
      this.langfuse.generation({
        id: runId,
        traceId: this.traceId,
        name: llm.id.at(-1)?.toString(),
        startTime: new Date(),
        metadata: this.joinTagsAndMetaData(tags, metadata),
        parentObservationId: parentRunId,
        prompt: { prompt: messages[0][0] },
        model: modelName,
        modelParameters: modelParameters,
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleChainEnd(
    outputs: ChainValues,
    runId: string,
    parentRunId?: string | undefined,
    tags?: string[] | undefined
  ): Promise<void> {
    try {
      console.log("Chain end:", outputs, runId, parentRunId, tags);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
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

      let extractedModelName;
      if ((extraParams?.invocation_params as any)?._type == "anthropic-llm") {
        extractedModelName = "anthropic"; // unfortunately no model info by anthropic provided.
      } else if ((extraParams?.invocation_params as any)?._type == "huggingface_hub") {
        extractedModelName = (extraParams?.invocation_params as any)?.repo_id;
      } else if ((extraParams?.invocation_params as any)?._type == "azure-openai-chat") {
        extractedModelName = (extraParams?.invocation_params as any)?.model;
      } else {
        extractedModelName = (extraParams?.invocation_params as any)?.model_name;
      }

      this.langfuse.generation({
        id: runId,
        traceId: this.traceId,
        name: llm.id.at(-1)?.toString(),
        startTime: new Date(),
        metadata: this.joinTagsAndMetaData(tags, metadata),
        parentObservationId: parentRunId,
        prompt: { prompt: prompts },
        model: extractedModelName,
        modelParameters: modelParameters,
      });
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
        input: { input: input },
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
        input: { query: query },
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
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        output: { documents: documents },
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleToolEnd(output: string, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Tool end:", runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
        traceId: this.traceId,
        output: { output: output },
        endTime: new Date(),
      });
    } catch (e) {
      console.log("Error:", e);
    }
  }

  async handleToolError(err: any, runId: string, parentRunId?: string | undefined): Promise<void> {
    try {
      console.log("Tool error:", err, runId);
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
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
      console.log("LLM output:", output.generations);
      const lastResponse =
        output.generations[output.generations.length - 1][output.generations[output.generations.length - 1].length - 1]
          .text;
      const llmUsage = output.llmOutput?.["tokenUsage"];

      this.langfuse.generation({
        id: runId,
        traceId: this.traceId,
        parentObservationId: parentRunId,
        completion: lastResponse,
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
      this.langfuse.span({
        id: runId,
        parentObservationId: parentRunId,
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
