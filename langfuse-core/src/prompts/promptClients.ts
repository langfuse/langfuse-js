import mustache from "mustache";

import type { ChatMessage, ChatPrompt, CreateLangfusePromptResponse, TextPrompt } from "../types";

mustache.escape = function (text) {
  return text;
};

/**
 * BasePromptClient - A base class for handling prompts.
 *
 * @class
 * @property {string} name - The name of the prompt.
 * @property {number} version - The version of the prompt.
 * @property {unknown} config - The config of the prompt.
 * @property {string[]} labels - The labels of the prompt.
 */
abstract class BasePromptClient {
  public readonly name: string;
  public readonly version: number;
  public readonly config: unknown;
  public readonly labels: string[];

  constructor(prompt: CreateLangfusePromptResponse) {
    this.name = prompt.name;
    this.version = prompt.version;
    this.config = prompt.config;
    this.labels = prompt.labels;
  }

  abstract compile(variables?: Record<string, string>): string | ChatMessage[];

  public abstract getLangchainPrompt(): string | ChatMessage[];

  protected _transformToLangchainVariables(content: string): string {
    return content.replace(/\{\{(.*?)\}\}/g, "{$1}");
  }
}
/**
 * TextPromptClient - A client for handling text-based prompts.
 *
 * @class
 * @extends BasePromptClient
 * @property {TextPrompt} promptResponse - The prompt response object.
 * @property {string} prompt - The prompt string.
 */
export class TextPromptClient extends BasePromptClient {
  public readonly promptResponse: TextPrompt;
  public readonly prompt: string;

  constructor(prompt: TextPrompt) {
    super(prompt);
    this.promptResponse = prompt;
    this.prompt = prompt.prompt;
  }

  compile(variables?: Record<string, string>): string {
    return mustache.render(this.promptResponse.prompt, variables ?? {});
  }

  public getLangchainPrompt(): string {
    /**
     * Converts Langfuse prompt into string compatible with Langchain PromptTemplate.
     *
     * It specifically adapts the mustache-style double curly braces {{variable}} used in Langfuse
     * to the single curly brace {variable} format expected by Langchain.
     *
     * @returns {string} The string that can be plugged into Langchain's PromptTemplate.
     */
    return this._transformToLangchainVariables(this.prompt);
  }
}

export class ChatPromptClient extends BasePromptClient {
  public readonly promptResponse: ChatPrompt;
  public readonly prompt: ChatMessage[];

  constructor(prompt: ChatPrompt) {
    super(prompt);
    this.promptResponse = prompt;
    this.prompt = prompt.prompt;
  }

  compile(variables?: Record<string, string>): ChatMessage[] {
    return this.prompt.map<ChatMessage>((chatMessage) => ({
      ...chatMessage,
      content: mustache.render(chatMessage.content, variables ?? {}),
    }));
  }

  public getLangchainPrompt(): ChatMessage[] {
    /**
     * Converts Langfuse prompt into string compatible with Langchain PromptTemplate.
     *
     * It specifically adapts the mustache-style double curly braces {{variable}} used in Langfuse
     * to the single curly brace {variable} format expected by Langchain.
     * Example usage:
     *
     * ```
     * import { ChatPromptTemplate } from "@langchain/core/prompts";
     *
     * const langchainChatPrompt = ChatPromptTemplate.fromMessages(
     *    langfuseChatPrompt.getLangchainPrompt().map((m) => [m.role, m.content])
     *  );
     *
     * const formattedPrompt = await langchainPrompt.format(values);
     *
     * ```
     * @returns {ChatMessage[]} Chat messages with variables that can be plugged into Langchain's ChatPromptTemplate.
     */
    return this.prompt.map((chatMessage) => ({
      ...chatMessage,
      content: this._transformToLangchainVariables(chatMessage.content),
    }));
  }
}

export type LangfusePromptClient = TextPromptClient | ChatPromptClient;
