import crypto from "node:crypto";

import { LangfuseClient } from "@langfuse/client";
import { observeOpenAI } from "@langfuse/openai";
import { startActiveObservation } from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { OpenAI } from "openai";
import { describe, it, beforeEach, afterEach, expect } from "vitest";

import {
  ServerAssertions,
  parseIO,
  traceNameFilter,
} from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

describe("OpenAI integration E2E tests", () => {
  let langfuseClient: LangfuseClient;
  let testEnv: ServerTestEnvironment;
  let assertions: ServerAssertions;

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuseClient = new LangfuseClient();
    assertions = new ServerAssertions();
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

    const observations = await assertions.waitForObservationsWhere({
      filter: traceNameFilter(traceName),
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];

    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();

    expect(generation).toMatchObject({
      metadata: expect.objectContaining(config.generationMetadata),
      name: config.generationName,
      traceName: config.traceName,
      sessionId: config.sessionId,
      userId: config.userId,
      tags: config.tags,
      promptName,
      promptVersion: 1,
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

    const observations = await assertions.waitForObservations(traceId, {
      count: 2,
    });

    expect(observations.length).toBe(2);
    assertions.expectObservationParent(observations, "OpenAI.chat", "parent");
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
      stream: "true",
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input.messages).toMatchObject([
      { role: "system", content: "Who is the president of America ?" },
    ]);
    expect(generation.output).toBeDefined();
    expect(parseIO(generation.output)).toMatch(content);
    expect(
      new Date(generation.completionStartTime!).getTime(),
    ).toBeGreaterThanOrEqual(new Date(generation.startTime).getTime());
    expect(
      new Date(generation.completionStartTime!).getTime(),
    ).toBeLessThanOrEqual(new Date(generation.endTime!).getTime());
  });

  // OpenAI retired gpt-3.5-turbo-instruct, the legacy completions model this test depends on.
  it.skip("should trace completion without streaming", async () => {
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
      stream: "false",
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo-instruct");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input).toBe("Say this is a test!");
    expect(generation.output).toBeDefined();
    expect(res.choices[0].text).toContain(parseIO(generation.output));
    expect(generation.usageDetails).toMatchObject({
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
  });

  // OpenAI retired gpt-3.5-turbo-instruct, the legacy completions model this test depends on.
  it.skip("should trace completion with streaming", async () => {
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
      stream: "true",
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo-instruct");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input).toBe("Say this is a test");
    expect(generation.output).toBeDefined();
    expect(parseIO(generation.output)).toMatch(content);
    expect(
      new Date(generation.completionStartTime!).getTime(),
    ).toBeGreaterThanOrEqual(new Date(generation.startTime).getTime());
    expect(
      new Date(generation.completionStartTime!).getTime(),
    ).toBeLessThanOrEqual(new Date(generation.endTime!).getTime());
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input.messages).toMatchObject([
      { role: "user", content: "Explain how to assemble a PC" },
    ]);
    expect(input.functions).toMatchObject(functions);
    expect(input.function_call).toMatchObject(functionCall);
    expect(generation.output).toBeDefined();
    expect(parseIO(generation.output)).toMatchObject(content);
    expect(generation.usageDetails).toMatchObject({
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input.messages).toMatchObject([
      { role: "user", content: "What's the weather like in Boston today?" },
    ]);
    expect(input.tools).toMatchObject([
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
    expect(input.tool_choice).toBe("auto");
    expect(generation.output).toBeDefined();
    expect(parseIO(generation.output)).toMatchObject(content);
    expect(generation.usageDetails).toMatchObject({
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input.messages).toMatchObject([
      { role: "user", content: "What's the weather like in Boston today?" },
    ]);
    expect(input.tools).toMatchObject([
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
    expect(input.tool_choice).toBe("auto");
    expect(generation.output).toBeDefined();
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
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

    // Each request is traced as its own generation in its own trace
    const observations = await assertions.waitForObservationsWhere(
      { name: generationName },
      { count: 3 },
    );

    expect(observations.length).toBe(3);
    expect(new Set(observations.map((o) => o.traceId)).size).toBe(3);
    const generation = observations[0];

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
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

    const observations = await assertions.waitForObservationsWhere({
      name: generationName,
    });

    expect(observations.length).toBe(1);
    const generation = observations[0];

    expect(generation.traceName).toBe(generationName);
    expect(generation.tags).toEqual(expect.arrayContaining(["hello", "World"]));
    expect(generation.sessionId).toBe("Langfuse");
    expect(generation.userId).toBe("LangfuseUser");

    expect(generation.name).toBe(generationName);
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();
    expect(parseIO(generation.output)).toMatchObject(res.choices[0].message);
    expect(generation.usageDetails).toMatchObject({
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
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

      const observations = await assertions.waitForObservationsWhere({
        name: generationName,
      });

      expect(observations.length).toBe(1);
      const generation = observations[0];

      expect(generation.traceName).toBe(generationName);
      expect(generation.tags).toEqual(
        expect.arrayContaining(["hello", "World"]),
      );
      expect(generation.sessionId).toBe("Langfuse");
      expect(generation.userId).toBe("LangfuseUser");

      expect(generation.name).toBe(generationName);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });
      expect(generation.model).toContain("gpt-3.5-turbo-instruct");
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeFalsy();
      expect(generation.level).toBe("ERROR");
      expect(generation.statusMessage).toBeTruthy();
      expect(generation.metadata).toBeDefined();
      expect(generation.metadata).toMatchObject({
        hello: "World",
      });
    }
  });

  it("should allow passing a parent trace", async () => {
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

    const observations = await assertions.waitForObservations(traceId);

    expect(observations.length).toBe(1);
    const generation = observations[0];
    const input = parseIO(generation.input) as any;

    // The generation is attached to the passed parent span
    expect(generation.parentObservationId).toBe(spanId);

    expect(generation.name).toBe("OpenAI.chat"); // Default name
    expect(generation.metadata).toMatchObject({ child: true });
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(generation.usageDetails).toBeDefined();
    expect(generation.model).toContain("gpt-3.5-turbo");
    expect(generation.usageDetails).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
      total: expect.any(Number),
    });
    expect(generation.input).toBeDefined();
    expect(input.messages).toMatchObject([
      { role: "system", content: "Tell me a story about a king." },
    ]);
    expect(generation.output).toBeDefined();
    expect(parseIO(generation.output)).toMatchObject(res.choices[0].message);
    expect(generation.usageDetails).toMatchObject({
      input: usage?.prompt_tokens,
      output: usage?.completion_tokens,
      total: usage?.total_tokens,
    });
    expect(generation.costDetails).toBeDefined();
    expect(generation.statusMessage).toBeFalsy();
  });
});
