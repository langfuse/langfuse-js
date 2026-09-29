import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  ChatMessageType,
  ChatPromptClient,
  TextPromptClient,
} from "@langfuse/client";
import { describe, expect, it } from "vitest";

const createTextPrompt = (prompt: string) =>
  new TextPromptClient({
    type: "text",
    name: "test",
    version: 1,
    config: {},
    tags: [],
    labels: [],
    prompt,
  });

describe("getLangchainPrompt JSON escaping", () => {
  it("keeps every closing brace of nested single-brace JSON", async () => {
    const prompt = createTextPrompt(
      'Reply with JSON like {"user": {"name": "{{name}}"}}',
    );

    const langchainPrompt = prompt.getLangchainPrompt();
    expect(langchainPrompt).toBe(
      'Reply with JSON like {{"user": {{"name": "{name}"}}}}',
    );

    const formatted = await PromptTemplate.fromTemplate(langchainPrompt).format(
      { name: "Ann" },
    );
    expect(formatted).toBe('Reply with JSON like {"user": {"name": "Ann"}}');
  });

  it("handles deeply nested JSON that closes several levels at once", async () => {
    const prompt = createTextPrompt('{"a": {"b": {"c": 1}}} and {{x}}');

    const formatted = await PromptTemplate.fromTemplate(
      prompt.getLangchainPrompt(),
    ).format({ x: "y" });

    expect(formatted).toBe('{"a": {"b": {"c": 1}}} and y');
  });

  it("still leaves variables and pre-escaped braces inside JSON untouched", async () => {
    const prompt = createTextPrompt(
      '{"value": "{{name}}"} and {{"already": "escaped"}}',
    );

    const formatted = await PromptTemplate.fromTemplate(
      prompt.getLangchainPrompt(),
    ).format({ name: "Ann" });

    expect(formatted).toBe('{"value": "Ann"} and {"already": "escaped"}');
  });

  it("keeps nested JSON intact in chat messages", async () => {
    const prompt = new ChatPromptClient({
      type: "chat",
      name: "test",
      version: 1,
      config: {},
      tags: [],
      labels: [],
      prompt: [
        {
          type: ChatMessageType.ChatMessage,
          role: "system",
          content: 'Answer as {"result": {"city": "{{city}}"}}',
        },
      ],
    });

    const messages = await ChatPromptTemplate.fromMessages(
      prompt.getLangchainPrompt().map((m) => [m.role, m.content]),
    ).formatMessages({ city: "Paris" });

    expect(messages[0].content).toBe('Answer as {"result": {"city": "Paris"}}');
  });
});
