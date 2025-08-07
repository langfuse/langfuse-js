import {
  ChatMessage,
  PlaceholderMessage,
  ChatMessageWithPlaceholders,
  CreatePromptRequest,
} from "@langfuse/core";

export enum ChatMessageType {
  ChatMessage = "chatmessage",
  Placeholder = "placeholder",
}

export type ChatMessageOrPlaceholder =
  | ChatMessage
  | ({ type: ChatMessageType.Placeholder } & PlaceholderMessage);

export type LangchainMessagesPlaceholder = {
  variableName: string;
  optional?: boolean;
};

export type CreateChatPromptBodyWithPlaceholders = {
  type: "chat";
} & Omit<CreatePromptRequest.Chat, "type" | "prompt"> & {
    prompt: (ChatMessage | ChatMessageWithPlaceholders)[];
  };
