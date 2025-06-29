import mustache from "mustache";

import {
  type ChatMessage,
  ChatMessageType,
  type ChatPrompt,
  type ChatPromptCompat,
  type CreateLangfusePromptResponse,
  type TextPrompt,
  type ChatMessageWithPlaceholders,
} from "../types";

mustache.escape = function (text) {
  return text;
};

abstract class BasePromptClient {
  public readonly name: string;
  public readonly version: number;
  public readonly config: unknown;
  public readonly labels: string[];
  public readonly tags: string[];
  public readonly isFallback: boolean;
  public readonly type: "text" | "chat";
  public readonly prompt: string | ChatMessageWithPlaceholders[];
  public readonly commitMessage: string | null | undefined;

  constructor(prompt: CreateLangfusePromptResponse, isFallback = false, type: "text" | "chat") {
    this.name = prompt.name;
    this.version = prompt.version;
    this.config = prompt.config;
    this.labels = prompt.labels;
    this.tags = prompt.tags;
    this.isFallback = isFallback;
    this.type = type;
    this.prompt = prompt.prompt;
    this.commitMessage = prompt.commitMessage;
  }

  abstract compile(
    variables?: Record<string, string>,
    placeholders?: Record<string, ChatMessage[]>
  ): string | ChatMessage[];

  public abstract getLangchainPrompt(): string | ChatMessage[];

  protected _transformToLangchainVariables(content: string): string {
    const jsonEscapedContent = this.escapeJsonForLangchain(content);

    return jsonEscapedContent.replace(/\{\{(\w+)\}\}/g, "{$1}");
  }

  /**
   * Escapes every curly brace that is part of a JSON object by doubling it.
   *
   * A curly brace is considered “JSON-related” when, after skipping any immediate
   * whitespace, the next non-whitespace character is a single (') or double (") quote.
   *
   * Braces that are already doubled (e.g. `{{variable}}` placeholders) are left untouched.
   *
   * @param text - Input string that may contain JSON snippets.
   * @returns The string with JSON-related braces doubled.
   */
  protected escapeJsonForLangchain(text: string): string {
    const out: string[] = []; // collected characters
    const stack: boolean[] = []; // true = “this { belongs to JSON”, false = normal “{”
    let i = 0;
    const n = text.length;

    while (i < n) {
      const ch = text[i];

      // ---------- opening brace ----------
      if (ch === "{") {
        // leave existing “{{ …” untouched
        if (i + 1 < n && text[i + 1] === "{") {
          out.push("{{");
          i += 2;
          continue;
        }

        // look ahead to find the next non-space character
        let j = i + 1;
        while (j < n && /\s/.test(text[j])) {
          j++;
        }

        const isJson = j < n && (text[j] === "'" || text[j] === '"');
        out.push(isJson ? "{{" : "{");
        stack.push(isJson); // remember how this “{” was treated
        i += 1;
        continue;
      }

      // ---------- closing brace ----------
      if (ch === "}") {
        // leave existing “… }}” untouched
        if (i + 1 < n && text[i + 1] === "}") {
          out.push("}}");
          i += 2;
          continue;
        }

        const isJson = stack.pop() ?? false;
        out.push(isJson ? "}}" : "}");
        i += 1;
        continue;
      }

      // ---------- any other character ----------
      out.push(ch);
      i += 1;
    }

    return out.join("");
  }

  public toJSON(): string {
    return JSON.stringify({
      name: this.name,
      prompt: this.prompt,
      version: this.version,
      isFallback: this.isFallback,
      tags: this.tags,
      labels: this.labels,
      type: this.type,
      config: this.config,
    });
  }
}

export class TextPromptClient extends BasePromptClient {
  public readonly promptResponse: TextPrompt;
  public readonly prompt: string;

  constructor(prompt: TextPrompt, isFallback = false) {
    super(prompt, isFallback, "text");
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
  public readonly prompt: ChatMessageWithPlaceholders[];

  constructor(prompt: ChatPromptCompat, isFallback = false) {
    // Convert ChatMessages to ChatMessageWithPlaceholders for backward compatibility
    const normalizedPrompt = prompt.prompt.map((item): ChatMessageWithPlaceholders => {
      if ("type" in item) {
        // Already has type field (new format)
        return item as ChatMessageWithPlaceholders;
      } else {
        // Plain ChatMessage (legacy format) - add type field
        return { type: ChatMessageType.ChatMessage, ...item } as ChatMessageWithPlaceholders;
      }
    });

    const typedPrompt: ChatPrompt = {
      ...prompt,
      prompt: normalizedPrompt,
    };

    super(typedPrompt, isFallback, "chat");
    this.promptResponse = typedPrompt;
    this.prompt = normalizedPrompt;
  }

  compile(variables?: Record<string, string>, placeholders?: Record<string, ChatMessage[]>): ChatMessage[] {
    const messagesWithPlaceholdersReplaced: ChatMessage[] = [];

    // Replace placeholders with provided message arrays
    for (const item of this.prompt) {
      if ("type" in item && item.type === ChatMessageType.Placeholder) {
        if (placeholders && item.name in placeholders) {
          messagesWithPlaceholdersReplaced.push(...placeholders[item.name]);
        }
        // If no placeholder fill-ins provided for a name, skip it
      } else if ("role" in item && "content" in item) {
        messagesWithPlaceholdersReplaced.push({
          role: item.role,
          content: item.content,
        });
      }
    }

    return messagesWithPlaceholdersReplaced.map<ChatMessage>((chatMessage) => ({
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
    return this.prompt
      .filter((item) => "role" in item && "content" in item)
      .map((item) => ({
        role: item.role,
        content: this._transformToLangchainVariables(item.content),
      }));
  }

  // Keep the toJSON backwards compatibile - in case someone uses that. we don't return the type for non-placeholders here.
  public toJSON(): string {
    return JSON.stringify({
      name: this.name,
      prompt: this.promptResponse.prompt.map((item) => {
        if ("type" in item && item.type === ChatMessageType.ChatMessage) {
          const { type, ...messageWithoutType } = item;
          return messageWithoutType;
        }
        return item;
      }),
      version: this.version,
      isFallback: this.isFallback,
      tags: this.tags,
      labels: this.labels,
      type: this.type,
      config: this.config,
    });
  }
}

export type LangfusePromptClient = TextPromptClient | ChatPromptClient;
