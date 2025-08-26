import { OpenAI } from "openai";
import crypto from "node:crypto";
import { observeOpenAI } from "@langfuse/openai";
import { LangfuseClient } from "@langfuse/client";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";
import { nanoid } from "nanoid";
import { startActiveObservation } from "@langfuse/tracing";

describe("OpenAI integration E2E tests", () => {
  let langfuseClient: LangfuseClient;
  let testEnv: ServerTestEnvironment;

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuseClient = new LangfuseClient();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
  });

  it("should trace OpenAI Chat Completion Create ", async () => {
    const promptName = "test-prompt-" + nanoid();
    await langfuseClient.prompt.create({
      name: promptName,
      prompt: "hello",
      labels: ["production"],
    });
    const traceName = "Test OpenAI-" + nanoid();
    const config = {
      traceName,
      sessionId: "my-session",
      userId: "my-user",
      tags: ["tag1", "tag2"],
      langfusePrompt: await langfuseClient.prompt.get(promptName),
      generationMetadata: { service: "agent" },
      generationName: "OpenAI call",
    };
    const wrappedOpenAI = observeOpenAI(new OpenAI(), config);

    await wrappedOpenAI.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: "whassup",
        },
      ],
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({ name: traceName });
    expect(traces.data.length).toBe(1);

    const trace = traces.data[0];

    expect(trace).toMatchObject({
      sessionId: config.sessionId,
      userId: config.userId,
      tags: config.tags,
      name: config.traceName,
    });

    const observations = await langfuseClient.api.observations.getMany({
      traceId: trace.id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();

    expect(generation).toMatchObject({
      metadata: expect.objectContaining(config.generationMetadata),
      name: config.generationName,
    });
  });

  it("should trace nested OpenAI Chat Completion Create ", async () => {
    const wrappedOpenAI = observeOpenAI(new OpenAI());

    const [result, traceId] = await startActiveObservation(
      "parent",
      async (span) => {
        return [
          await wrappedOpenAI.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: "whassup",
              },
            ],
          }),
          span.traceId,
        ] as const;
      },
    );

    console.log(result);

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.observations.length).toBe(2);
    const span = trace.observations.find((o) => o.name === "parent");
    expect(span).toBeDefined();

    const generation = trace.observations.find((o) => o.name === "OpenAI.chat");
    expect(generation).toBeDefined();

    expect(generation!.parentObservationId).toBe(span!.id);
  });

  it("should trace chat completion with streaming", async () => {
    const generationName = `ChatComplete-Streaming-${nanoid()}`;
    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const stream = await wrappedOpenAI.chat.completions.create({
      messages: [
        { role: "system", content: "Who is the president of America ?" },
      ],
      model: "gpt-3.5-turbo",
      stream: true,
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk.choices[0]?.delta?.content || "";
    }

    expect(content).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const observations = await langfuseClient.api.observations.getMany({
      traceId: traces.data[0].id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
      stream: "true",
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([
      { role: "system", content: "Who is the president of America ?" },
    ]);
    expect(generation.output).toBeDefined();
    expect(generation.output).toMatch(content);
    expect(
      new Date(generation.completionStartTime).getTime(),
    ).toBeGreaterThanOrEqual(new Date(generation.startTime).getTime());
    expect(
      new Date(generation.completionStartTime).getTime(),
    ).toBeLessThanOrEqual(new Date(generation.endTime).getTime());
  });

  it("should trace completion without streaming", async () => {
    const generationName = `Completion-NonStreaming-${nanoid()}`;
    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const res = await wrappedOpenAI.completions.create({
      prompt: "Say this is a test!",
      model: "gpt-3.5-turbo-instruct",
      stream: false,
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    const usage = res.usage;

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const observations = await langfuseClient.api.observations.getMany({
      traceId: traces.data[0].id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
      stream: "false",
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo-instruct");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input).toBe("Say this is a test!");
    expect(generation.output).toBeDefined();
    expect(res.choices[0].text).toContain(generation.output);
    expect(generation.usage).toMatchObject({
      unit: "TOKENS",
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
  });

  it("should trace completion with streaming", async () => {
    const generationName = `Completions-streaming-${nanoid()}`;
    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const stream = await wrappedOpenAI.completions.create({
      prompt: "Say this is a test",
      model: "gpt-3.5-turbo-instruct",
      stream: true,
      user: "langfuse-user@gmail.com",
      temperature: 0,
      max_tokens: 300,
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk.choices[0].text || "";
    }

    expect(content).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const observations = await langfuseClient.api.observations.getMany({
      traceId: traces.data[0].id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
      stream: "true",
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo-instruct");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input).toBe("Say this is a test");
    expect(generation.output).toBeDefined();
    expect(generation.output).toMatch(content);
    expect(
      new Date(generation.completionStartTime).getTime(),
    ).toBeGreaterThanOrEqual(new Date(generation.startTime).getTime());
    expect(
      new Date(generation.completionStartTime).getTime(),
    ).toBeLessThanOrEqual(new Date(generation.endTime).getTime());
  });

  it("should trace function calling", async () => {
    const generationName = `FunctionCalling-NonStreaming-${nanoid()}`;
    const functions = [
      {
        name: "get_answer_for_user_query",
        description: "Get user answer in series of steps",
        parameters: {
          title: "StepByStepAIResponse",
          type: "object",
          properties: {
            title: { title: "Title", type: "string" },
            steps: { title: "Steps", type: "array", items: { type: "string" } },
          },
          required: ["title", "steps"],
        },
      },
    ];
    const functionCall = { name: "get_answer_for_user_query" };

    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const res = await wrappedOpenAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Explain how to assemble a PC" }],
      functions,
      function_call: functionCall,
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    const content = res.choices[0].message;
    const usage = res.usage;

    expect(content).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const observations = await langfuseClient.api.observations.getMany({
      traceId: traces.data[0].id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([
      { role: "user", content: "Explain how to assemble a PC" },
    ]);
    expect(generation.input.functions).toMatchObject(functions);
    expect(generation.input.function_call).toMatchObject(functionCall);
    expect(generation.output).toBeDefined();
    expect(generation.output).toMatchObject(content);
    expect(generation.usage).toMatchObject({
      unit: "TOKENS",
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
  });

  it("should trace tools and tool choice calling", async () => {
    const generationName = `Tools-and-Toolchoice-NonStreaming-${nanoid()}`;

    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const res = await wrappedOpenAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "What's the weather like in Boston today?" },
      ],
      tool_choice: "auto",
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_weather",
            description: "Get the current weather in a given location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and state, e.g. San Francisco, CA",
                },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
          },
        },
      ],
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    const content = res.choices[0].message;
    const usage = res.usage;

    expect(content).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const observations = await langfuseClient.api.observations.getMany({
      traceId: traces.data[0].id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([
      { role: "user", content: "What's the weather like in Boston today?" },
    ]);
    expect(generation.input.tools).toMatchObject([
      {
        type: "function",
        function: {
          name: "get_current_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ]);
    expect(generation.input.tool_choice).toBe("auto");
    expect(generation.output).toBeDefined();
    expect(generation.output).toMatchObject(content);
    expect(generation.usage).toMatchObject({
      unit: "TOKENS",
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
  });

  it("should trace streamed tools and tool choice calling", async () => {
    const generationName = `Tools-and-Toolchoice-Streaming-${nanoid()}`;

    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const stream = await wrappedOpenAI.chat.completions.create({
      stream: true,
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "What's the weather like in Boston today?" },
      ],
      tool_choice: "auto",
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_weather",
            description: "Get the current weather in a given location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and state, e.g. San Francisco, CA",
                },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
          },
        },
      ],
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    for await (const _ of stream) {
      // Consume the stream
    }

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const observations = await langfuseClient.api.observations.getMany({
      traceId: traces.data[0].id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([
      { role: "user", content: "What's the weather like in Boston today?" },
    ]);
    expect(generation.input.tools).toMatchObject([
      {
        type: "function",
        function: {
          name: "get_current_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ]);
    expect(generation.input.tool_choice).toBe("auto");
    expect(generation.output).toBeDefined();
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
  });

  it("should trace multiple requests with common client", async () => {
    const generationName = `Common-client-initialisation-${nanoid()}`;
    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
    });

    const res1 = await wrappedOpenAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "What's the weather like in Boston today?" },
      ],
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    await wrappedOpenAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "What's the weather like in Boston today?" },
      ],
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    await wrappedOpenAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "What's the weather like in Boston today?" },
      ],
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    const content = res1.choices[0].message;
    expect(content).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    // Should have at least 2 traces (potentially 3, depending on timing)
    expect(traces.data.length).toBeGreaterThanOrEqual(2);

    const firstTrace = traces.data[0];
    const observations = await langfuseClient.api.observations.getMany({
      traceId: firstTrace.id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
  });

  it("should trace with extra wrapper params", async () => {
    const generationName = `Extra-wrapper-params-${nanoid()}`;
    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
      generationMetadata: {
        hello: "World",
      },
      tags: ["hello", "World"],
      sessionId: "Langfuse",
      userId: "LangfuseUser",
    });

    const res = await wrappedOpenAI.chat.completions.create({
      messages: [{ role: "system", content: "Tell me a story about a king." }],
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    const usage = res.usage;

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traces = await langfuseClient.api.trace.list({
      name: generationName,
    });
    expect(traces.data.length).toBe(1);

    const trace = traces.data[0];
    expect(trace.tags).toBeDefined();
    expect(trace.tags).toEqual(expect.arrayContaining(["hello", "World"]));
    expect(trace.sessionId).toBeDefined();
    expect(trace.sessionId).toBe("Langfuse");
    expect(trace.userId).toBeDefined();
    expect(trace.userId).toBe("LangfuseUser");

    const observations = await langfuseClient.api.observations.getMany({
      traceId: trace.id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();
    expect(generation.output).toMatchObject(res.choices[0].message);
    expect(generation.usage).toMatchObject({
      unit: "TOKENS",
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
    expect(generation.metadata).toBeDefined();
    expect(generation.metadata).toMatchObject({
      hello: "World",
    });
  });

  it("should handle error in openai", async () => {
    const generationName = `Error-Handling-in-wrapper-${nanoid()}`;
    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      generationName,
      traceName: generationName,
      generationMetadata: {
        hello: "World",
      },
      tags: ["hello", "World"],
      sessionId: "Langfuse",
      userId: "LangfuseUser",
    });

    try {
      await wrappedOpenAI.chat.completions.create({
        messages: [
          { role: "system", content: "Tell me a story about a king." },
        ],
        model: "gpt-3.5-turbo-instruct", // Purposely wrong model for chat completions
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });
    } catch (error) {
      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      const traces = await langfuseClient.api.trace.list({
        name: generationName,
      });
      expect(traces.data.length).toBe(1);

      const trace = traces.data[0];
      expect(trace.tags).toBeDefined();
      expect(trace.tags).toEqual(expect.arrayContaining(["hello", "World"]));
      expect(trace.sessionId).toBeDefined();
      expect(trace.sessionId).toBe("Langfuse");
      expect(trace.userId).toBeDefined();
      expect(trace.userId).toBe("LangfuseUser");

      const observations = await langfuseClient.api.observations.getMany({
        traceId: trace.id,
      });

      expect(observations.data.length).toBe(1);
      const generation = observations.data[0];

      expect(generation.name).toBe(generationName);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });
      expect(generation.model).toContain("gpt-3.5-turbo-instruct");
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeNull();
      expect(generation.statusMessage).toBeDefined();
      expect(generation.metadata).toBeDefined();
      expect(generation.metadata).toMatchObject({
        hello: "World",
      });
    }
  });

  it("should allow passing a parent trace", async () => {
    const traceName = "parent-trace";

    const traceId = crypto.randomBytes(16).toString("hex");
    const spanId = crypto.randomBytes(8).toString("hex");

    const wrappedOpenAI = observeOpenAI(new OpenAI(), {
      parentSpanContext: { traceId, spanId, traceFlags: 1 },
      generationMetadata: { child: true },
    });

    const res = await wrappedOpenAI.chat.completions.create({
      messages: [{ role: "system", content: "Tell me a story about a king." }],
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    const usage = res.usage;

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const trace = await langfuseClient.api.trace.get(traceId);

    // TODO: Currently AS_ROOT is not passed that would trigger trace data propagation
    // expect(trace.name).toBe(traceName);
    // expect(trace.metadata).toEqual({ parent: true });

    const observations = await langfuseClient.api.observations.getMany({
      traceId: trace.id,
    });

    expect(observations.data.length).toBe(1);
    const generation = observations.data[0];

    expect(generation.name).toBe("OpenAI.chat"); // Default name
    expect(generation.metadata).toMatchObject({ child: true });
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([
      { role: "system", content: "Tell me a story about a king." },
    ]);
    expect(generation.output).toBeDefined();
    expect(generation.output).toMatchObject(res.choices[0].message);
    expect(trace.output).toBeNull(); // Do not update trace if traceId is passed
    expect(generation.usage).toMatchObject({
      unit: "TOKENS",
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.calculatedInputCost).toBeDefined();
    expect(generation.calculatedOutputCost).toBeDefined();
    expect(generation.calculatedTotalCost).toBeDefined();
    expect(generation.statusMessage).toBeNull();
  });
});
