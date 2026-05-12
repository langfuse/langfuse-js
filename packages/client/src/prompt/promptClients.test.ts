import { describe, it, expect } from "vitest";
import { ChatPromptClient } from "./promptClients.js";
import { ChatMessageType } from "./types.js";

// Minimal prompt factory for tests
function makeChatPrompt(messages: any[]): any {
  return {
    name: "test-prompt",
    version: 1,
    config: {},
    labels: [],
    tags: [],
    commitMessage: null,
    prompt: messages,
  };
}

describe("ChatPromptClient.compile() — array (multimodal) content", () => {
  it("compiles string content normally (regression)", () => {
    const client = new ChatPromptClient(
      makeChatPrompt([
        { type: ChatMessageType.ChatMessage, role: "user", content: "Hello {{name}}" },
      ]),
    );
    const result = client.compile({ name: "Alice" });
    expect(result).toEqual([{ role: "user", content: "Hello Alice" }]);
  });

  it("does not crash when message content is an array", () => {
    const client = new ChatPromptClient(
      makeChatPrompt([
        {
          type: ChatMessageType.ChatMessage,
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://example.com/img.png" } },
          ],
        },
      ]),
    );
    expect(() => client.compile({})).not.toThrow();
  });

  it("applies variable substitution to text-type items within array content", () => {
    const client = new ChatPromptClient(
      makeChatPrompt([
        {
          type: ChatMessageType.ChatMessage,
          role: "user",
          content: [
            { type: "text", text: "Describe this {{doc_type}}" },
            { type: "image_url", image_url: { url: "https://example.com/img.png" } },
          ],
        },
      ]),
    );
    const result = client.compile({ doc_type: "invoice" }) as any[];
    expect(result[0].content[0].text).toBe("Describe this invoice");
    // Non-text parts are passed through unchanged
    expect(result[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/img.png" },
    });
  });

  it("passes through non-text items in array content without modification", () => {
    const client = new ChatPromptClient(
      makeChatPrompt([
        {
          type: ChatMessageType.ChatMessage,
          role: "user",
          content: [
            { type: "input_file", file_url: "path/to/file.pdf" },
          ],
        },
      ]),
    );
    const result = client.compile({}) as any[];
    expect(result[0].content[0]).toEqual({ type: "input_file", file_url: "path/to/file.pdf" });
  });

  it("resolves placeholder containing messages with array content (issue #12338)", () => {
    const client = new ChatPromptClient(
      makeChatPrompt([
        { type: ChatMessageType.ChatMessage, role: "system", content: "You are helpful." },
        { type: ChatMessageType.Placeholder, name: "attachments" },
      ]),
    );
    const attachments = [
      {
        role: "user",
        content: [
          { type: "input_file", file_url: "path_to_pdf" },
        ],
      },
    ];
    const result = client.compile({ emailBody: "test" }, { attachments }) as any[];
    expect(result).toHaveLength(2);
    expect(result[1].role).toBe("user");
    expect(result[1].content[0]).toEqual({ type: "input_file", file_url: "path_to_pdf" });
  });
});
