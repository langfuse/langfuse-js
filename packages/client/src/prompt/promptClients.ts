import {
  Prompt,
  ChatMessage,
  BasePrompt,
  ChatMessageWithPlaceholders,
} from "@langfuse/core";
import mustache from "mustache";

import {
  ChatMessageOrPlaceholder,
  ChatMessageType,
  LangchainMessagesPlaceholder,
} from "./types.js";

mustache.escape = function (text) {
  return text;
};

/**
 * Base class for all prompt clients.
 *
 * @internal
 */
abstract class BasePromptClient {
  /** The name of the prompt */
  public readonly name: string;
  /** The version number of the prompt */
  public readonly version: number;
  /** Configuration object associated with the prompt */
  public readonly config: unknown;
  /** Labels associated with the prompt */
  public readonly labels: string[];
  /** Tags associated with the prompt */
  public readonly tags: string[];
  /** Whether this prompt client is using fallback content */
  public readonly isFallback: boolean;
  /** The type of prompt ("text" or "chat") */
  public readonly type: "text" | "chat";
  /** Optional commit message for the prompt version */
  public readonly commitMessage: string | null | undefined;

  /**
   * Creates a new BasePromptClient instance.
   *
   * @param prompt - The base prompt data
   * @param isFallback - Whether this is fallback content
   * @param type - The prompt type
   * @internal
   */
  constructor(prompt: BasePrompt, isFallback = false, type: "text" | "chat") {
    this.name = prompt.name;
    this.version = prompt.version;
    this.config = prompt.config;
    this.labels = prompt.labels;
    this.tags = prompt.tags;
    this.isFallback = isFallback;
    this.type = type;
    this.commitMessage = prompt.commitMessage;
  }

  /** Gets the raw prompt content */
  abstract get prompt(): string | ChatMessageWithPlaceholders[];

  /** Sets the raw prompt content */
  abstract set prompt(value: string | ChatMessageWithPlaceholders[]);

  /**
   * Compiles the prompt by substituting variables and resolving placeholders.
   *
   * @param variables - Key-value pairs for variable substitution
   * @param placeholders - Key-value pairs for placeholder resolution
   * @returns The compiled prompt content
   */
  abstract compile(
    variables?: Record<string, string>,
    placeholders?: Record<string, any>,
  ): string | ChatMessage[] | (ChatMessageOrPlaceholder | any)[];

  /**
   * Converts the prompt to a format compatible with LangChain.
   *
   * @param options - Options for conversion
   * @param options.placeholders - Placeholders to resolve during conversion
   * @returns The prompt in LangChain-compatible format
   */
  public abstract getLangchainPrompt(options?: {
    placeholders?: Record<string, any>;
  }):
    | string
    | ChatMessage[]
    | ChatMessageOrPlaceholder[]
    | (ChatMessage | LangchainMessagesPlaceholder | any)[];

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

  /**
   * Serializes the prompt client to JSON.
   *
   * @returns JSON string representation of the prompt
   */
  public abstract toJSON(): string;
}

/**
 * Client for working with text-based prompts.
 *
 * Provides methods to compile text prompts with variable substitution
 * and convert them to LangChain-compatible formats.
 *
 * @public
 */
export class TextPromptClient extends BasePromptClient {
  /** The original prompt response from the API */
  public readonly promptResponse: Prompt.Text;
  /** The text content of the prompt */
  public readonly prompt: string;

  /**
   * Creates a new TextPromptClient instance.
   *
   * @param prompt - The text prompt data
   * @param isFallback - Whether this is fallback content
   */
  constructor(prompt: Prompt.Text, isFallback = false) {
    super(prompt, isFallback, "text");
    this.promptResponse = prompt;
    this.prompt = prompt.prompt;
  }

  /**
   * Compiles the text prompt by substituting variables.
   *
   * Uses Mustache templating to replace {{variable}} placeholders with provided values.
   *
   * @param variables - Key-value pairs for variable substitution
   * @param _placeholders - Ignored for text prompts
   * @returns The compiled text with variables substituted
   *
   * @example
   * ```typescript
   * const prompt = await langfuse.prompt.get("greeting", { type: "text" });
   * const compiled = prompt.compile({ name: "Alice" });
   * // If prompt is "Hello {{name}}!", result is "Hello Alice!"
   * ```
   */
  compile(
    variables?: Record<string, string>,
    _placeholders?: Record<string, any>,
  ): string {
    return mustache.render(this.promptResponse.prompt, variables ?? {});
  }

  /**
   * Converts the prompt to LangChain PromptTemplate format.
   *
   * Transforms Mustache-style {{variable}} syntax to LangChain's {variable} format.
   *
   * @param _options - Ignored for text prompts
   * @returns The prompt string compatible with LangChain PromptTemplate
   *
   * @example
   * ```typescript
   * const prompt = await langfuse.prompt.get("greeting", { type: "text" });
   * const langchainFormat = prompt.getLangchainPrompt();
   * // Transforms "Hello {{name}}!" to "Hello {name}!"
   * ```
   */
  public getLangchainPrompt(_options?: {
    placeholders?: Record<string, any>;
  }): string {
    return this._transformToLangchainVariables(this.prompt);
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

/**
 * Client for working with chat-based prompts.
 *
 * Provides methods to compile chat prompts with variable substitution and
 * placeholder resolution, and convert them to LangChain-compatible formats.
 *
 * @public
 */
export class ChatPromptClient extends BasePromptClient {
  /** The original prompt response from the API */
  public readonly promptResponse: Prompt.Chat;
  /** The chat messages that make up the prompt */
  public readonly prompt: ChatMessageWithPlaceholders[];

  /**
   * Creates a new ChatPromptClient instance.
   *
   * @param prompt - The chat prompt data
   * @param isFallback - Whether this is fallback content
   */
  constructor(prompt: Prompt.Chat, isFallback = false) {
    const normalizedPrompt = ChatPromptClient.normalizePrompt(prompt.prompt);
    const typedPrompt: Prompt.Chat = {
      ...prompt,
      prompt: normalizedPrompt,
    };

    super(typedPrompt, isFallback, "chat");
    this.promptResponse = typedPrompt;
    this.prompt = normalizedPrompt;
  }

  private static normalizePrompt(
    prompt: ChatMessage[] | ChatMessageWithPlaceholders[],
  ): ChatMessageWithPlaceholders[] {
    // Convert ChatMessages to ChatMessageWithPlaceholders for backward compatibility
    return prompt.map((item): ChatMessageWithPlaceholders => {
      if ("type" in item) {
        // Already has type field (new format)
        return item as ChatMessageWithPlaceholders;
      } else {
        // Plain ChatMessage (legacy format) - add type field
        return {
          type: ChatMessageType.ChatMessage,
          ...(item as Omit<ChatMessage, "type">),
        } as ChatMessageWithPlaceholders;
      }
    });
  }

  /**
   * Compiles the chat prompt by replacing placeholders and variables.
   *
   * First resolves placeholders with provided values, then applies variable substitution
   * to message content using Mustache templating. Unresolved placeholders remain
   * as placeholder objects in the output.
   *
   * @param variables - Key-value pairs for Mustache variable substitution in message content
   * @param placeholders - Key-value pairs where keys are placeholder names and values are ChatMessage arrays
   * @returns Array of ChatMessage objects and unresolved placeholder objects
   *
   * @example
   * ```typescript
   * const prompt = await langfuse.prompt.get("conversation", { type: "chat" });
   * const compiled = prompt.compile(
   *   { user_name: "Alice" },
   *   { examples: [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi!" }] }
   * );
   * ```
   */
  compile(
    variables?: Record<string, string>,
    placeholders?: Record<string, any>,
  ): (ChatMessageOrPlaceholder | any)[] {
    const messagesWithPlaceholdersReplaced: (ChatMessageOrPlaceholder | any)[] =
      [];
    const placeholderValues = placeholders ?? {};

    for (const item of this.prompt) {
      if ("type" in item && item.type === ChatMessageType.Placeholder) {
        const placeholderValue = placeholderValues[item.name];
        if (
          Array.isArray(placeholderValue) &&
          placeholderValue.length > 0 &&
          placeholderValue.every(
            (msg) =>
              typeof msg === "object" && "role" in msg && "content" in msg,
          )
        ) {
          messagesWithPlaceholdersReplaced.push(
            ...(placeholderValue as ChatMessage[]),
          );
        } else if (
          Array.isArray(placeholderValue) &&
          placeholderValue.length === 0
        ) {
          // Empty array provided - skip placeholder (don't include it)
        } else if (placeholderValue !== undefined) {
          // Non-standard placeholder value format, just stringfiy
          messagesWithPlaceholdersReplaced.push(
            JSON.stringify(placeholderValue),
          );
        } else {
          // Keep unresolved placeholder in the output
          messagesWithPlaceholdersReplaced.push(
            item as { type: ChatMessageType.Placeholder } & typeof item,
          );
        }
      } else if (
        "role" in item &&
        "content" in item &&
        item.type === ChatMessageType.ChatMessage
      ) {
        messagesWithPlaceholdersReplaced.push({
          role: item.role,
          content: item.content,
        });
      }
    }

    return messagesWithPlaceholdersReplaced.map((item) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "role" in item &&
        "content" in item
      ) {
        return {
          ...item,
          content: mustache.render(item.content, variables ?? {}),
        };
      } else {
        // Return placeholder or stringified value as-is
        return item;
      }
    });
  }

  /**
   * Converts the prompt to LangChain ChatPromptTemplate format.
   *
   * Resolves placeholders with provided values and converts unresolved ones
   * to LangChain MessagesPlaceholder objects. Transforms variables from
   * {{var}} to {var} format without rendering them.
   *
   * @param options - Configuration object
   * @param options.placeholders - Key-value pairs for placeholder resolution
   * @returns Array of ChatMessage objects and LangChain MessagesPlaceholder objects
   *
   * @example
   * ```typescript
   * const prompt = await langfuse.prompt.get("conversation", { type: "chat" });
   * const langchainFormat = prompt.getLangchainPrompt({
   *   placeholders: { examples: [{ role: "user", content: "Hello" }] }
   * });
   * ```
   */
  public getLangchainPrompt(options?: {
    placeholders?: Record<string, any>;
  }): (ChatMessage | LangchainMessagesPlaceholder | any)[] {
    const messagesWithPlaceholdersReplaced: (
      | ChatMessage
      | LangchainMessagesPlaceholder
      | any
    )[] = [];
    const placeholderValues = options?.placeholders ?? {};

    for (const item of this.prompt) {
      if ("type" in item && item.type === ChatMessageType.Placeholder) {
        const placeholderValue = placeholderValues[item.name];
        if (
          Array.isArray(placeholderValue) &&
          placeholderValue.length > 0 &&
          placeholderValue.every(
            (msg) =>
              typeof msg === "object" && "role" in msg && "content" in msg,
          )
        ) {
          // Complete placeholder fill-in, replace with it
          messagesWithPlaceholdersReplaced.push(
            ...(placeholderValue as ChatMessage[]).map((msg) => {
              return {
                role: msg.role,
                content: this._transformToLangchainVariables(msg.content),
              };
            }),
          );
        } else if (
          Array.isArray(placeholderValue) &&
          placeholderValue.length === 0
        ) {
          // Skip empty array placeholder
        } else if (placeholderValue !== undefined) {
          // Non-standard placeholder value, just stringify and add directly
          messagesWithPlaceholdersReplaced.push(
            JSON.stringify(placeholderValue),
          );
        } else {
          // Convert unresolved placeholder to Langchain MessagesPlaceholder format
          // see: https://js.langchain.com/docs/concepts/prompt_templates/#messagesplaceholder
          // we convert it to the format without using the class explicitly. Therefore, we
          // don't have to import langchain as a dependency.
          messagesWithPlaceholdersReplaced.push([
            "placeholder",
            `{${item.name}}`,
          ]);
        }
      } else if (
        "role" in item &&
        "content" in item &&
        item.type === ChatMessageType.ChatMessage
      ) {
        messagesWithPlaceholdersReplaced.push({
          role: item.role,
          content: this._transformToLangchainVariables(item.content),
        });
      }
    }

    return messagesWithPlaceholdersReplaced;
  }

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

/**
 * Union type representing either a text or chat prompt client.
 *
 * @public
 */
export type LangfusePromptClient = TextPromptClient | ChatPromptClient;
