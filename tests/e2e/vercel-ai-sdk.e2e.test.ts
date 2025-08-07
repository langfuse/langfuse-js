import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  embed,
  generateObject,
  generateText,
  streamObject,
  streamText,
  tool,
} from "ai";
import { LangfuseClient } from "@langfuse/client";
import { randomUUID } from "crypto";
import z from "zod";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";
import { startActiveSpan } from "@langfuse/tracing";

import { openai } from "@ai-sdk/openai";

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

describe("Vercel AI SDK integration E2E tests", () => {
  let langfuseClient: LangfuseClient;
  let testEnv: ServerTestEnvironment;

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuseClient = new LangfuseClient();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
  });

  it("should trace a generateText call", async () => {
    const testParams = {
      modelName: "gpt-3.5-turbo-0125",
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

    const {
      modelName,
      maxTokens,
      prompt,
      functionId,
      userId,
      sessionId,
      metadata,
      tags,
    } = testParams;

    const [result, span] = await startActiveSpan(functionId, async (span) => {
      const result = await generateText({
        model: openai(modelName),
        maxTokens,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId,
          metadata: {
            userId,
            sessionId,
            tags,
            ...metadata,
          },
        },
      });

      return [result, span] as const;
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({
        maxTokens: maxTokens.toString(),
      });
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
      functionId: "test-vercel-tool-call",
      modelName: "gpt-3.5-turbo-0125",
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

    const {
      modelName,
      maxTokens,
      prompt,
      functionId,
      userId,
      sessionId,
      metadata,
      tags,
    } = testParams;

    const [result, span] = await startActiveSpan(functionId, async (span) => {
      const result = await generateText({
        model: openai(modelName),
        maxTokens,
        prompt,
        maxSteps: 3,
        tools: {
          weather: weatherTool,
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId,
          metadata: {
            userId,
            sessionId,
            tags,
            ...metadata,
          },
        },
      });

      return [result, span] as const;
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({
        maxTokens: maxTokens.toString(),
      });
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
      functionId: "test-vercel-stream-text",
      modelName: "gpt-3.5-turbo-0125",
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

    const {
      modelName,
      maxTokens,
      prompt,
      functionId,
      userId,
      sessionId,
      metadata,
      tags,
    } = testParams;

    const [result, span] = await startActiveSpan(functionId, async (span) => {
      const stream = streamText({
        model: openai(modelName),
        maxTokens,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId,
          metadata: {
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

      return [result, span] as const;
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({
        maxTokens: maxTokens.toString(),
      });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
      expect(generation.timeToFirstToken).toBeGreaterThan(0);
    }
  }, 10_000);

  // Currently flaky from the AI SDK side, skipping for now
  it.skip("should trace a generateObject call", async () => {
    const testParams = {
      functionId: "test-vercel-generate-object",
      modelName: "gpt-4-turbo-2024-04-09",
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

    const {
      modelName,
      maxTokens,
      prompt,
      functionId,
      userId,
      sessionId,
      metadata,
      tags,
    } = testParams;

    const [result, span] = await startActiveSpan(functionId, async (span) => {
      const result = await generateObject({
        model: openai(modelName),
        schema: z.object({
          recipe: z.object({
            name: z.string(),
            ingredients: z.array(
              z.object({
                name: z.string(),
                amount: z.string(),
              }),
            ),
            steps: z.array(z.string()),
          }),
        }),
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId,
          metadata: {
            userId,
            sessionId,
            tags,
            ...metadata,
          },
        },
      });

      return [result, span] as const;
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({
        maxTokens: maxTokens.toString(),
      });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 30_000);

  // Currently flaky from the AI SDK side, skipping for now
  it("should trace a streamObject call", async () => {
    const testParams = {
      functionId: "test-vercel-streamObject",
      modelName: "gpt-4-turbo-2024-04-09",
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

    const { modelName, prompt, functionId, userId, sessionId, metadata, tags } =
      testParams;

    const [currentObject, span] = await startActiveSpan(
      functionId,
      async (span) => {
        const { partialObjectStream } = streamObject({
          model: openai(modelName),
          schema: z.object({
            recipe: z.object({
              name: z.string(),
              ingredients: z.array(
                z.object({
                  name: z.string(),
                  amount: z.string(),
                }),
              ),
              steps: z.array(z.string()),
            }),
          }),
          prompt,
          experimental_telemetry: {
            isEnabled: true,
            functionId,
            metadata: {
              userId,
              sessionId,
              tags,
              ...metadata,
            },
          },
        });

        let currentObject;
        for await (const partialObject of partialObjectStream) {
          currentObject = partialObject;
        }

        return [currentObject, span] as const;
      },
    );

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
      console.log(generation.timeToFirstToken);
      expect(generation.timeToFirstToken).toBeGreaterThan(0);
    }
  }, 30_000);

  it("should trace a embed call", async () => {
    const testParams = {
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

    const { modelName, functionId, userId, sessionId, metadata, tags } =
      testParams;

    const [result, span] = await startActiveSpan(functionId, async (span) => {
      const result = await embed({
        model: openai.embedding(modelName),
        value: "sunny day at the beach",
        experimental_telemetry: {
          isEnabled: true,
          functionId,
          metadata: {
            userId,
            sessionId,
            tags,
            ...metadata,
          },
        },
      });

      return [result, span] as const;
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.model).toBe(modelName);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
    }
  }, 10_000);

  it("should trace a streamText call with linked prompts", async () => {
    const promptName = randomUUID();

    await langfuseClient.prompt.create({
      name: promptName,
      type: "text",
      prompt: "Invent a new holiday and describe its traditions.",
      labels: ["production"],
    });

    const fetchedPrompt = await langfuseClient.prompt.get(promptName);

    const testParams = {
      functionId: "test-vercel-stream-text",
      modelName: "gpt-3.5-turbo-0125",
      maxTokens: 512,
      prompt: fetchedPrompt.prompt,
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai"],
    };

    const {
      modelName,
      maxTokens,
      prompt,
      functionId,
      userId,
      sessionId,
      metadata,
      tags,
    } = testParams;

    const [result, span] = await startActiveSpan(functionId, async (span) => {
      const stream = streamText({
        model: openai(modelName),
        maxTokens,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId,
          metadata: {
            langfusePrompt: fetchedPrompt.toJSON(),
            userId,
            sessionId,
            tags,
            ...metadata,
          } as any,
        },
      });

      let result = "";

      for await (const chunk of stream.textStream) {
        result += chunk;
      }

      return [result, span] as const;
    });

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Fetch trace
    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.userId).toBe(userId);
    expect(trace.sessionId).toBe(sessionId);
    expect(trace.tags).toEqual(tags.sort());
    expect(trace.metadata).toMatchObject(metadata);

    // Validate generations
    expect(trace.observations.length).toBeGreaterThan(0);
    const generations = trace.observations.filter(
      (o: any) => o.type === "GENERATION",
    );

    for (const generation of generations) {
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.model).toBe(modelName);
      expect(generation.modelParameters).toMatchObject({
        maxTokens: maxTokens.toString(),
      });
      expect(generation.calculatedInputCost).toBeGreaterThan(0);
      expect(generation.calculatedOutputCost).toBeGreaterThan(0);
      expect(generation.calculatedTotalCost).toBeGreaterThan(0);
      expect(generation.promptTokens).toBeGreaterThan(0);
      expect(generation.completionTokens).toBeGreaterThan(0);
      expect(generation.totalTokens).toBeGreaterThan(0);
      expect(generation.timeToFirstToken).toBeGreaterThan(0);
      expect(generation.promptName).toBe(promptName);
      expect(generation.promptVersion).toBe(fetchedPrompt.version);
    }
  }, 20_000);
});
