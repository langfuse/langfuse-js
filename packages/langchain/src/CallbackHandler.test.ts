import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
  setLangfuseTracerProvider,
  getLangfuseTracerProvider,
} from "@langfuse/tracing";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda } from "@langchain/core/runnables";
import { CallbackHandler } from "./CallbackHandler.js";

function findSpan(spans: ReadableSpan[], name: string): ReadableSpan {
  const span = spans.find((s) => s.name === name);
  if (span === undefined) {
    throw new Error(
      `Span "${name}" not found. Available: ${spans.map((s) => s.name).join(", ")}`,
    );
  }
  return span;
}

function parseSpanAttribute(span: ReadableSpan, key: string): unknown {
  const value = span.attributes[key];
  if (typeof value !== "string") {
    return undefined;
  }
  return JSON.parse(value);
}

describe("CallbackHandler handleChainStart input", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let originalProvider: ReturnType<typeof getLangfuseTracerProvider>;

  beforeEach(() => {
    originalProvider = getLangfuseTracerProvider();
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    setLangfuseTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.forceFlush();
    exporter.reset();
    setLangfuseTracerProvider(originalProvider);
  });

  it("should preserve structured input when object has only a 'content' key", async () => {
    const model = new FakeListChatModel({ responses: ["output"] });
    const prompt = ChatPromptTemplate.fromMessages<{ content: string }>([
      ["human", "{content}"],
    ]);
    const chain = prompt.pipe(model);

    await chain.invoke(
      { content: "hello world" },
      { callbacks: [new CallbackHandler()] },
    );

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();

    // When content is the sole key, extracting the string value is acceptable
    const rootSpan = spans.find(
      (s) =>
        parseSpanAttribute(s, "langfuse.observation.input") === "hello world",
    );
    expect(rootSpan).toBeDefined();
  });

  it("should preserve full structured input when object has 'content' alongside other keys", async () => {
    const model = new FakeListChatModel({ responses: ["output"] });
    const prompt = ChatPromptTemplate.fromMessages<{
      content: string;
      topic: string;
      style: string;
    }>([
      ["human", "Write about {topic} in {style} style: {content}"],
    ]);

    const chain = RunnableLambda.from(
      (input: { content: string; topic: string; style: string }) => input,
    )
      .withConfig({ runName: "PrepareInput" })
      .pipe(prompt)
      .pipe(model);

    const input = {
      content: "some article body",
      topic: "technology",
      style: "formal",
    };

    await chain.invoke(input, { callbacks: [new CallbackHandler()] });

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();

    // The PrepareInput span should have the full structured input, not just the "content" value
    const prepareSpan = findSpan(spans, "PrepareInput");
    const observedInput = parseSpanAttribute(
      prepareSpan,
      "langfuse.observation.input",
    );

    expect(observedInput).toEqual({
      content: "some article body",
      topic: "technology",
      style: "formal",
    });
  });

  it("should preserve full structured input in prompt template span when input has 'content' key", async () => {
    const model = new FakeListChatModel({ responses: ["output"] });
    const prompt = ChatPromptTemplate.fromMessages<{
      content: string;
      author: string;
    }>([
      ["human", "Summarize by {author}: {content}"],
    ]);

    const chain = prompt.pipe(model);

    const input = {
      content: "full document text here",
      author: "Jane Doe",
    };

    await chain.invoke(input, { callbacks: [new CallbackHandler()] });

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();

    // Find the ChatPromptTemplate span - it receives the multi-key input with "content"
    const promptSpan = findSpan(spans, "ChatPromptTemplate");
    const observedInput = parseSpanAttribute(
      promptSpan,
      "langfuse.observation.input",
    );

    // Must be the full object, NOT just "full document text here"
    expect(observedInput).toEqual({
      content: "full document text here",
      author: "Jane Doe",
    });
  });
});
