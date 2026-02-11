import {
  ChatMessage,
  PlaceholderMessage,
  ChatMessageWithPlaceholders,
  CreateChatPromptRequest,
} from "@langfuse/core";

/**
 * Enumeration of chat message types in Langfuse prompts.
 *
 * @public
 */
export enum ChatMessageType {
  /** Regular chat message with role and content */
  ChatMessage = "chatmessage",
  /** Placeholder for dynamic content insertion */
  Placeholder = "placeholder",
}

/**
 * Union type representing either a chat message or a placeholder.
 *
 * Used in compiled prompts where placeholders may remain unresolved.
 *
 * @public
 */
export type ChatMessageOrPlaceholder =
  | ChatMessage
  | ({ type: ChatMessageType.Placeholder } & PlaceholderMessage);

/**
 * Represents a LangChain MessagesPlaceholder object.
 *
 * Used when converting Langfuse prompts to LangChain format,
 * unresolved placeholders become LangChain MessagesPlaceholder objects.
 *
 * @public
 */
export type LangchainMessagesPlaceholder = {
  /** Name of the variable that will provide the messages */
  variableName: string;
  /** Whether the placeholder is optional (defaults to false) */
  optional?: boolean;
};

/**
 * Type for creating chat prompts that support both regular messages and placeholders.
 *
 * Extends the standard chat prompt creation request to allow mixed content types.
 *
 * @public
 */
export type CreateChatPromptBodyWithPlaceholders = {
  /** Specifies this is a chat prompt */
  type: "chat";
} & Omit<CreateChatPromptRequest, "type" | "prompt"> & {
    /** Array of chat messages and/or placeholders */
    prompt: (ChatMessage | ChatMessageWithPlaceholders)[];
  };
