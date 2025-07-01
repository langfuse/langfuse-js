import mustache from "mustache";

import {
  type ChatMessage,
  type ChatMessageOrPlaceholder,
  ChatMessageType,
  type ChatPrompt,
  type ChatPromptCompat,
  type CreateLangfusePromptResponse,
  type LangchainMessagesPlaceholder,
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
  public readonly commitMessage: string | null | undefined;

  constructor(prompt: CreateLangfusePromptResponse, isFallback = false, type: "text" | "chat") {
    this.name = prompt.name;
    this.version = prompt.version;
    this.config = prompt.config;
    this.labels = prompt.labels;
    this.tags = prompt.tags;
    this.isFallback = isFallback;
    this.type = type;
    this.commitMessage = prompt.commitMessage;
  }

  abstract get prompt(): string | ChatMessageWithPlaceholders[];
  abstract set prompt(value: string | ChatMessageWithPlaceholders[]);

  abstract compile(
    variables?: Record<string, string>,
    placeholders?: Record<string, any>
  ): string | ChatMessage[] | ChatMessageOrPlaceholder[];

  public abstract getLangchainPrompt(options?: {
    variables?: Record<string, string>;
    placeholders?: Record<string, any>;
  }): string | ChatMessage[] | ChatMessageOrPlaceholder[] | (ChatMessage | LangchainMessagesPlaceholder)[];

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

  public abstract toJSON(): string;
}

export class TextPromptClient extends BasePromptClient {
  public readonly promptResponse: TextPrompt;
  private rawPrompt!: string;

  constructor(prompt: TextPrompt, isFallback = false) {
    super(prompt, isFallback, "text");
    this.promptResponse = prompt;
    this.prompt = prompt.prompt;
  }

  get prompt(): string {
    return this.rawPrompt;
  }

  protected set prompt(prompt: string) {
    this.rawPrompt = prompt;
  }

  compile(variables?: Record<string, string>, _placeholders?: Record<string, any>): string {
    return mustache.render(this.promptResponse.prompt, variables ?? {});
  }

  public getLangchainPrompt(_options?: {
    variables?: Record<string, string>;
    placeholders?: Record<string, any>;
  }): string {
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

  public toJSON(): string {
    return JSON.stringify({
      name: this.name,
      prompt: this.rawPrompt,
      version: this.version,
      isFallback: this.isFallback,
      tags: this.tags,
      labels: this.labels,
      type: this.type,
      config: this.config,
    });
  }
}

export class ChatPromptClient extends BasePromptClient {
  public readonly promptResponse: ChatPrompt;
  public readonly prompt: ChatMessageWithPlaceholders[];

  constructor(prompt: ChatPromptCompat, isFallback = false) {
    const normalizedPrompt = ChatPromptClient.normalizePrompt(prompt.prompt);
    const typedPrompt: ChatPrompt = {
      ...prompt,
      prompt: normalizedPrompt,
    };

    super(typedPrompt, isFallback, "chat");
    this.promptResponse = typedPrompt;
    this.prompt = normalizedPrompt;
  }

  private static normalizePrompt(prompt: ChatMessage[] | ChatMessageWithPlaceholders[]): ChatMessageWithPlaceholders[] {
    // Convert ChatMessages to ChatMessageWithPlaceholders for backward compatibility
    return prompt.map((item): ChatMessageWithPlaceholders => {
      if ("type" in item) {
        // Already has type field (new format)
        return item as ChatMessageWithPlaceholders;
      } else {
        // Plain ChatMessage (legacy format) - add type field
        return { type: ChatMessageType.ChatMessage, ...item } as ChatMessageWithPlaceholders;
      }
    });
  }

  compile(variables?: Record<string, string>, placeholders?: Record<string, any>): ChatMessageOrPlaceholder[] {
    /**
     * Compiles the chat prompt by replacing placeholders and variables with provided values.
     *
     * First fills-in placeholders by from the provided placeholder parameter.
     * Then compiles variables into the message content.
     * Unresolved placeholders are included in the output as placeholder objects.
     * If you only want to fill-in placeholders, pass an empty object for variables.
     *
     * @param variables - Key-value pairs for Mustache variable substitution in message content
     * @param placeholders - Key-value pairs where keys are placeholder names and values can be ChatMessage arrays
     * @returns Array of ChatMessage objects and placeholder objects with placeholders replaced and variables rendered
     */
    const messagesWithPlaceholdersReplaced: ChatMessageOrPlaceholder[] = [];
    const placeholderValues = placeholders ?? {};

    for (const item of this.prompt) {
      if ("type" in item && item.type === ChatMessageType.Placeholder) {
        const placeholderValue = placeholderValues[item.name];
        if (
          Array.isArray(placeholderValue) &&
          placeholderValue.length > 0 &&
          placeholderValue.every((msg) => typeof msg === "object" && "role" in msg && "content" in msg)
        ) {
          messagesWithPlaceholdersReplaced.push(...(placeholderValue as ChatMessage[]));
        } else if (Array.isArray(placeholderValue) && placeholderValue.length === 0) {
          // Empty array provided - skip placeholder (don't include it)
        } else {
          // Keep unresolved placeholder in the output
          messagesWithPlaceholdersReplaced.push(item as { type: ChatMessageType.Placeholder } & typeof item);
        }
      } else if ("role" in item && "content" in item && item.type === ChatMessageType.ChatMessage) {
        messagesWithPlaceholdersReplaced.push({
          role: item.role,
          content: item.content,
        });
      }
    }

    return messagesWithPlaceholdersReplaced.map<ChatMessageOrPlaceholder>((item) => {
      if ("role" in item && "content" in item) {
        return {
          ...item,
          content: mustache.render(item.content, variables ?? {}),
        };
      } else {
        // Return placeholder as-is
        return item;
      }
    });
  }

  public getLangchainPrompt(options?: {
    variables?: Record<string, string>;
    placeholders?: Record<string, any>;
  }): (ChatMessage | LangchainMessagesPlaceholder)[] {
    /*
     * Converts Langfuse prompt into format compatible with Langchain PromptTemplate.
     *
     * const langchainChatPrompt = ChatPromptTemplate.fromMessages(
     *    langfuseChatPrompt.getLangchainPrompt().map((m) => [m.role, m.content])
     *  );
     *
     * const formattedPrompt = await langchainPrompt.format(values);
     *
     * ```
     * @returns {ChatMessageOrPlaceholder[]} All prompt messages (chat messages and placeholders) with variables transformed for Langchain compatibility.
     */
    return this.prompt.map((item): ChatMessageOrPlaceholder => {
      if ("type" in item && item.type === ChatMessageType.Placeholder) {
        return item as { type: ChatMessageType.Placeholder } & typeof item;
      } else if ("role" in item && "content" in item && item.type === ChatMessageType.ChatMessage) {
        return {
          role: item.role,
          content: this._transformToLangchainVariables(item.content),
        };
      } else {
        throw new Error("Invalid item in prompt array");
      }
    });
  }

  // Keep the toJSON backwards compatibile - in case someone uses that. we don't return the type for non-placeholders here.
  public toJSON(): string {
    return JSON.stringify({
      name: this.name,
      prompt: this.promptResponse.prompt.map((item) => {
        if ("type" in item && item.type === ChatMessageType.ChatMessage) {
          const { type: _, ...messageWithoutType } = item;
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
