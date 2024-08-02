import { embed, embedMany, generateObject, generateText, streamObject, streamText, tool } from "ai";
import { randomUUID } from "crypto";
import z from "zod";

import { openai } from "@ai-sdk/openai";
import { context, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";

import { LangfuseExporter } from "../langfuse-vercel";
import { fetchTraceById } from "./integration-utils";

jest.useRealTimers();

const weatherTool = tool({
  description: "Get the weather in a location",
  parameters: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  // location below is inferred to be a string:
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

describe("langfuse-integration-vercel", () => {
  let sdk: NodeSDK;

  beforeEach(() => {
    sdk = new NodeSDK({
      traceExporter: new LangfuseExporter({ debug: true }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
  });

  afterEach(() => {
    // Reset OTEL as it manipulates the global state and can cause issues with other tests
    context.disable();
    trace.disable();
  });

  it("should trace a generateText call", async () => {
    const testParams = {
      traceId: randomUUID(),
      modelName: "gpt-3.5-turbo",
      maxTokens: 50,
      prompt: "Invent a new holiday and describe its traditions.",
      functionId: "test-vercel-generate-text",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai"],
    };

    const { traceId, modelName, maxTokens, prompt, functionId, userId, sessionId, metadata, tags } = testParams;

    const result = await generateText({
      model: openai(modelName),
      maxTokens,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId,
        metadata: {
          langfuseTraceId: traceId,
          userId,
          sessionId,
          tags,
          ...metadata,
        },
      },
    });

    await sdk.shutdown();

    // Fetch trace
    const traceFetchResult = await fetchTraceById(traceId);
    expect(traceFetchResult.status).toBe(200);

    // Validate trace
    const trace = traceFetchResult.data;

    expect(trace.id).toBe(traceId);
    expect(trace.name).toBe(functionId);
    expect(JSON.parse(trace.input)).toEqual({ prompt });
    expect(trace.output).toBe(result.text);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter((o: any) => o.type === "GENERATION");

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({ maxTokens: maxTokens.toString() });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 10_000);

  it("should work with toolCalls", async () => {
    const testParams = {
      traceId: randomUUID(),
      functionId: "test-vercel-tool-call",
      modelName: "gpt-3.5-turbo",
      maxTokens: 512,
      prompt: "What is the weather in San Francisco?",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai"],
    };

    const { traceId, modelName, maxTokens, prompt, functionId, userId, sessionId, metadata, tags } = testParams;

    const result = await generateText({
      model: openai(modelName),
      maxTokens,
      prompt,
      maxToolRoundtrips: 3,
      tools: {
        weather: weatherTool,
      },
      experimental_telemetry: {
        isEnabled: true,
        functionId,
        metadata: {
          langfuseTraceId: traceId,
          userId,
          sessionId,
          tags,
          ...metadata,
        },
      },
    });

    await sdk.shutdown();

    // Fetch trace
    const traceFetchResult = await fetchTraceById(traceId);
    expect(traceFetchResult.status).toBe(200);

    // Validate trace
    const trace = traceFetchResult.data;

    expect(trace.id).toBe(traceId);
    expect(trace.name).toBe(functionId);
    expect(JSON.parse(trace.input)).toEqual({ prompt });
    expect(trace.output).toBe(result.text);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter((o: any) => o.type === "GENERATION");

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({ maxTokens: maxTokens.toString() });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 10_000);

  it("should trace a streamText call", async () => {
    const testParams = {
      traceId: randomUUID(),
      functionId: "test-vercel-stream-text",
      modelName: "gpt-3.5-turbo",
      maxTokens: 512,
      prompt: "Invent a new holiday and describe its traditions.",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai"],
    };

    const { traceId, modelName, maxTokens, prompt, functionId, userId, sessionId, metadata, tags } = testParams;

    const stream = await streamText({
      model: openai(modelName),
      maxTokens,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId,
        metadata: {
          langfuseTraceId: traceId,
          userId,
          sessionId,
          tags,
          ...metadata,
        },
      },
    });

    let result = "";

    for await (const chunk of stream.textStream) {
      result += chunk;
    }

    await sdk.shutdown();

    // Fetch trace
    const traceFetchResult = await fetchTraceById(traceId);
    expect(traceFetchResult.status).toBe(200);

    // Validate trace
    const trace = traceFetchResult.data;

    expect(trace.id).toBe(traceId);
    expect(trace.name).toBe(functionId);
    expect(JSON.parse(trace.input)).toEqual({ prompt });
    expect(trace.output).toBe(result);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter((o: any) => o.type === "GENERATION");

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({ maxTokens: maxTokens.toString() });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 10_000);

  // Currently flaky from the AI SDK side, skipping for now
  it.skip("should trace a generateObject call", async () => {
    const testParams = {
      traceId: randomUUID(),
      functionId: "test-vercel-generate-object",
      modelName: "gpt-4-turbo",
      maxTokens: 512,
      prompt: "Generate a lasagna recipe.",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai"],
    };

    const { traceId, modelName, maxTokens, prompt, functionId, userId, sessionId, metadata, tags } = testParams;

    const result = await generateObject({
      model: openai(modelName),
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(
            z.object({
              name: z.string(),
              amount: z.string(),
            })
          ),
          steps: z.array(z.string()),
        }),
      }),
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId,
        metadata: {
          langfuseTraceId: traceId,
          userId,
          sessionId,
          tags,
          ...metadata,
        },
      },
    });

    console.log(JSON.stringify(result.object.recipe, null, 2));

    await sdk.shutdown();

    // Fetch trace
    const traceFetchResult = await fetchTraceById(traceId);
    expect(traceFetchResult.status).toBe(200);

    // Validate trace
    const trace = traceFetchResult.data;

    expect(trace.id).toBe(traceId);
    expect(trace.name).toBe(functionId);
    expect(JSON.parse(trace.input)).toEqual({ prompt });
    expect(trace.output.length).toBeGreaterThan(100);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter((o: any) => o.type === "GENERATION");

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({ maxTokens: maxTokens.toString() });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 30_000);
  it("should trace a embed call", async () => {
    const testParams = {
      traceId: randomUUID(),
      modelName: "text-embedding-3-small",
      functionId: "test-vercel-embed",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai"],
    };

    const { traceId, modelName, functionId, userId, sessionId, metadata, tags } = testParams;

    const result = await embed({
      model: openai.embedding(modelName),
      value: "sunny day at the beach",
      experimental_telemetry: {
        isEnabled: true,
        functionId,
        metadata: {
          langfuseTraceId: traceId,
          userId,
          sessionId,
          tags,
          ...metadata,
        },
      },
    });

    await sdk.shutdown();

    // Fetch trace
    const traceFetchResult = await fetchTraceById(traceId);
    expect(traceFetchResult.status).toBe(200);

    // Validate trace
    const trace = traceFetchResult.data;

    expect(trace.id).toBe(traceId);
    expect(trace.name).toBe(functionId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter((o: any) => o.type === "GENERATION");

    for (const generation of generations) {
      expect(generation.model).toBe(modelName);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 10_000);
});
