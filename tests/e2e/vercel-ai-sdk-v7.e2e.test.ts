import { randomUUID } from "crypto";
import fs from "fs/promises";

import { openai } from "@ai-sdk/openai";
import { LangfuseClient } from "@langfuse/client";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { embed, generateText, streamText, tool } from "ai";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import z from "zod";

import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

type TraceAttributes = {
  userId: string;
  sessionId: string;
  metadata: Record<string, string>;
  tags: string[];
};

type LangfuseRuntimeContext = {
  feature?: string;
  langfusePrompt?: {
    name: string;
    version: number;
    isFallback?: boolean;
  };
};

function telemetry(functionId: string) {
  return {
    isEnabled: true,
    functionId,
    includeRuntimeContext: {
      feature: true,
      langfusePrompt: true,
    },
    integrations: new LangfuseVercelAiSdkIntegration(),
  };
}

function runtimeContext(context?: LangfuseRuntimeContext) {
  return context;
}

async function withTrace<T>({
  functionId,
  traceAttributes,
  run,
}: {
  functionId: string;
  traceAttributes?: TraceAttributes;
  run: () => Promise<T>;
}) {
  return startActiveObservation(functionId, async (span) => {
    const result = traceAttributes
      ? await propagateAttributes(
          {
            userId: traceAttributes.userId,
            sessionId: traceAttributes.sessionId,
            metadata: traceAttributes.metadata,
            tags: traceAttributes.tags,
          },
          run,
        )
      : await run();

    return [result, span] as const;
  });
}

function expectTraceAttributes(
  trace: Awaited<ReturnType<LangfuseClient["api"]["trace"]["get"]>>,
  traceId: string,
  traceAttributes: TraceAttributes,
) {
  expect(trace.id).toBe(traceId);
  expect(trace.userId).toBe(traceAttributes.userId);
  expect(trace.sessionId).toBe(traceAttributes.sessionId);
  expect(trace.tags).toEqual([...traceAttributes.tags].sort());
  expect(trace.metadata).toMatchObject(traceAttributes.metadata);
}

function expectGenerationBasics({
  trace,
  modelName,
  maxTokens,
}: {
  trace: Awaited<ReturnType<LangfuseClient["api"]["trace"]["get"]>>;
  modelName: string;
  maxTokens?: number;
}) {
  expect(trace.observations.length).toBeGreaterThan(0);

  const generations = trace.observations.filter(
    (observation: any) => observation.type === "GENERATION",
  );
  expect(generations.length).toBeGreaterThan(0);

  for (const generation of generations) {
    expect(generation.input).toBeDefined();
    expect(generation.output).toBeDefined();
    expect(generation.model).toContain(modelName);

    if (maxTokens !== undefined) {
      expect(generation.modelParameters).toMatchObject({
        max_tokens: maxTokens,
      });
    }

    expect(generation.calculatedInputCost).toBeGreaterThan(0);
    expect(generation.calculatedOutputCost).toBeGreaterThan(0);
    expect(generation.calculatedTotalCost).toBeGreaterThan(0);
    expect(generation.promptTokens).toBeGreaterThan(0);
    expect(generation.completionTokens).toBeGreaterThan(0);
    expect(generation.totalTokens).toBeGreaterThan(0);
  }

  return generations;
}

describe("Vercel AI SDK v7 integration E2E tests", () => {
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
      functionId: "test-vercel-v7-generate-text",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai", "ai-sdk-v7"],
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

    const [result, span] = await withTrace({
      functionId,
      traceAttributes: { userId, sessionId, metadata, tags },
      run: () =>
        generateText({
          model: openai(modelName),
          maxOutputTokens: maxTokens,
          prompt,
          runtimeContext: runtimeContext({
            feature: "generate-text",
          }),
          telemetry: telemetry(functionId),
        }),
    });

    expect(result.text).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expectTraceAttributes(trace, traceId, {
      userId,
      sessionId,
      metadata,
      tags,
    });

    const generations = expectGenerationBasics({
      trace,
      modelName,
      maxTokens,
    });

    expect(
      generations.some(
        (generation: any) => generation.metadata?.feature === "generate-text",
      ),
    ).toBe(true);
  }, 10_000);

  it("should work with toolCalls", async () => {
    const testParams = {
      functionId: "test-vercel-v7-tool-call",
      modelName: "gpt-3.5-turbo-0125",
      maxTokens: 512,
      prompt: "What is the weather in San Francisco?",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai", "ai-sdk-v7"],
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

    const [result, span] = await withTrace({
      functionId,
      traceAttributes: { userId, sessionId, metadata, tags },
      run: () =>
        generateText({
          model: openai(modelName),
          maxOutputTokens: maxTokens,
          prompt,
          tools: {
            weather: weatherTool,
          },
          toolChoice: {
            type: "tool",
            toolName: "weather",
          },
          runtimeContext: runtimeContext({
            feature: "tool-call",
          }),
          telemetry: telemetry(functionId),
        }),
    });

    expect(result.text).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expectTraceAttributes(trace, traceId, {
      userId,
      sessionId,
      metadata,
      tags,
    });

    expectGenerationBasics({
      trace,
      modelName,
      maxTokens,
    });
  }, 10_000);

  it("should trace a streamText call", async () => {
    const testParams = {
      functionId: "test-vercel-v7-stream-text",
      modelName: "gpt-3.5-turbo-0125",
      maxTokens: 512,
      prompt: "Invent a new holiday and describe its traditions.",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai", "ai-sdk-v7"],
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

    const [result, span] = await withTrace({
      functionId,
      traceAttributes: { userId, sessionId, metadata, tags },
      run: async () => {
        const stream = streamText({
          model: openai(modelName),
          maxOutputTokens: maxTokens,
          prompt,
          runtimeContext: runtimeContext({
            feature: "stream-text",
          }),
          telemetry: telemetry(functionId),
        });

        let text = "";

        for await (const chunk of stream.textStream) {
          text += chunk;
        }

        return text;
      },
    });

    expect(result).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expectTraceAttributes(trace, traceId, {
      userId,
      sessionId,
      metadata,
      tags,
    });

    expectGenerationBasics({
      trace,
      modelName,
      maxTokens,
    });
  }, 20_000);

  it("should trace a embed call", async () => {
    const testParams = {
      modelName: "text-embedding-3-small",
      functionId: "test-vercel-v7-embed",
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai", "ai-sdk-v7"],
    };

    const { modelName, functionId, userId, sessionId, metadata, tags } =
      testParams;

    const [result, span] = await withTrace({
      functionId,
      traceAttributes: { userId, sessionId, metadata, tags },
      run: () =>
        embed({
          model: openai.embedding(modelName),
          value: "sunny day at the beach",
          telemetry: telemetry(functionId),
        }),
    });

    expect(result.embedding).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expectTraceAttributes(trace, traceId, {
      userId,
      sessionId,
      metadata,
      tags,
    });

    const embeddingObservation = trace.observations.find(
      (observation: any) => observation.type === "EMBEDDING",
    );

    expect(embeddingObservation).toBeDefined();
    expect(embeddingObservation!.model).toContain(modelName);
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
      functionId: "test-vercel-v7-stream-text-prompt",
      modelName: "gpt-3.5-turbo-0125",
      maxTokens: 512,
      prompt: fetchedPrompt.prompt,
      userId: "some-user-id",
      sessionId: "some-session-id",
      metadata: {
        something: "custom",
        someOtherThing: "other-value",
      },
      tags: ["vercel", "openai", "ai-sdk-v7"],
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

    const [result, span] = await withTrace({
      functionId,
      traceAttributes: { userId, sessionId, metadata, tags },
      run: async () => {
        const stream = streamText({
          model: openai(modelName),
          maxOutputTokens: maxTokens,
          prompt,
          runtimeContext: runtimeContext({
            langfusePrompt: {
              name: fetchedPrompt.name,
              version: fetchedPrompt.version,
              isFallback: fetchedPrompt.isFallback,
            },
          }),
          telemetry: telemetry(functionId),
        });

        let text = "";

        for await (const chunk of stream.textStream) {
          text += chunk;
        }

        return text;
      },
    });

    expect(result).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expectTraceAttributes(trace, traceId, {
      userId,
      sessionId,
      metadata,
      tags,
    });

    const generations = expectGenerationBasics({
      trace,
      modelName,
      maxTokens,
    });

    const promptLinkedGeneration = generations.find(
      (generation: any) => generation.promptName === promptName,
    );

    expect(promptLinkedGeneration?.promptName).toBe(promptName);
    expect(promptLinkedGeneration?.promptVersion).toBe(fetchedPrompt.version);
  }, 20_000);

  it("should trace a call with file attachment", async () => {
    const attachmentPath = "tests/static/bitcoin.pdf";
    const attachment = await fs.readFile(attachmentPath);
    const attachmentBase64 = attachment.toString("base64");

    const [result, span] = await withTrace({
      functionId: "test-vercel-v7-file-attachment",
      run: () =>
        generateText({
          model: openai("gpt-5-nano"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Give me a summary" },
                {
                  type: "file",
                  mediaType: "application/pdf",
                  data: attachmentBase64,
                },
              ],
            },
          ],
          providerOptions: {
            openai: {
              reasoningEffort: "minimal",
            },
          },
          telemetry: telemetry("test-vercel-v7-file-attachment"),
        }),
    });

    expect(result.text).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.observations.length).toBeGreaterThan(0);

    const generations = trace.observations.filter(
      (observation: any) => observation.type === "GENERATION",
    );

    expect(generations.length).toBeGreaterThan(0);

    const traceInput = JSON.stringify(trace.observations);

    expect(traceInput).toMatch(
      /@@@langfuseMedia:type=application\/pdf\|id=.+\|source=bytes@@@/,
    );
    expect(traceInput).not.toContain(attachmentBase64);
  });

  it("should trace a call with image", async () => {
    const imagePath = "tests/static/puton.jpg";
    const image = await fs.readFile(imagePath);
    const imageBase64 = image.toString("base64");

    const [result, span] = await withTrace({
      functionId: "test-vercel-v7-image",
      run: () =>
        generateText({
          model: openai("gpt-5-nano"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Give me a summary" },
                { type: "image", mediaType: "image/jpeg", image: imageBase64 },
              ],
            },
          ],
          providerOptions: {
            openai: {
              reasoningEffort: "minimal",
            },
          },
          telemetry: telemetry("test-vercel-v7-image"),
        }),
    });

    expect(result.text).toBeDefined();

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    const traceId = span.traceId;
    const trace = await langfuseClient.api.trace.get(traceId);

    expect(trace.id).toBe(traceId);
    expect(trace.observations.length).toBeGreaterThan(0);

    const generations = trace.observations.filter(
      (observation: any) => observation.type === "GENERATION",
    );

    expect(generations.length).toBeGreaterThan(0);

    const traceInput = JSON.stringify(trace.observations);

    expect(traceInput).toMatch(
      /@@@langfuseMedia:type=image\/jpeg\|id=.+\|source=bytes@@@/,
    );
    expect(traceInput).not.toContain(imageBase64);
  });
});
