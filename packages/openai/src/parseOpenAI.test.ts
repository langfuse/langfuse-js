import { describe, it, expect } from "vitest";
import { parseInputArgs } from "./parseOpenAI";

describe("parseInputArgs", () => {
  describe("Responses API: instructions handling", () => {
    it("should return input as-is when no instructions", () => {
      const result = parseInputArgs({ model: "gpt-4o", input: "Hello!" });
      expect(result.input).toBe("Hello!");
    });

    it("should merge string instructions + string input into message list", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        instructions: "You are a pirate.",
        input: "Hello!",
      });
      expect(result.input).toEqual([
        { role: "system", content: "You are a pirate." },
        { role: "user", content: "Hello!" },
      ]);
    });

    it("should prepend instructions to array input", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        instructions: "You are a pirate.",
        input: [{ role: "user", content: "Hello!" }],
      });
      expect(result.input).toEqual([
        { role: "system", content: "You are a pirate." },
        { role: "user", content: "Hello!" },
      ]);
    });

    it("should return { instructions } when input is not provided", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        instructions: "You are a pirate.",
      });
      expect(result.input).toEqual({ instructions: "You are a pirate." });
    });

    it("should return { instructions, input } for non-string/non-array input", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        instructions: "You are a pirate.",
        input: { type: "custom", data: 123 },
      });
      expect(result.input).toEqual({
        instructions: "You are a pirate.",
        input: { type: "custom", data: 123 },
      });
    });

    it("should ignore non-string instructions", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        instructions: 123,
        input: "Hello!",
      });
      expect(result.input).toBe("Hello!");
    });
  });

  describe("Chat Completions API: messages handling", () => {
    it("should capture messages as input", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello!" }],
      });
      expect(result.input).toEqual({
        messages: [{ role: "user", content: "Hello!" }],
      });
    });

    it("should include tools in input when present", () => {
      const result = parseInputArgs({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello!" }],
        tools: [{ type: "function", function: { name: "test" } }],
      });
      expect(result.input).toEqual({
        messages: [{ role: "user", content: "Hello!" }],
        tools: [{ type: "function", function: { name: "test" } }],
      });
    });
  });

  describe("Completions API: prompt handling", () => {
    it("should fall back to prompt when no input or messages", () => {
      const result = parseInputArgs({
        model: "gpt-3.5-turbo-instruct",
        prompt: "Once upon a time",
      });
      expect(result.input).toBe("Once upon a time");
    });
  });
});
