import { embed, embedMany, generateObject, generateText, streamObject, streamText, tool } from "ai";

import { openai } from "@ai-sdk/openai";

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import z from "zod";
import { LangfuseVercelSpanExporter } from "../langfuse-vercel";
import { randomUUID } from "crypto";

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
      traceExporter: new LangfuseVercelSpanExporter({ debug: true }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
  });

  afterEach(async () => {
    await sdk.shutdown();
  });

  it("should trace a generateText call", async () => {
    const result = await generateText({
      model: openai("gpt-3.5-turbo"),
      maxTokens: 50,
      prompt: "Invent a new holiday and describe its traditions.",
      maxToolRoundtrips: 3,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "my-awesome-function",
        metadata: {
          something: "custom",
          someOtherThing: "other-value",
          userId: "some-user-id",
          sessionId: "some-session-id",
          tags: ["vercel", "openai"],
        },
      },
    });

    console.log(result.text);
  }, 10_000);
  it("should work with toolCalls", async () => {
    const traceId = randomUUID();

    const result = await generateText({
      model: openai("gpt-3.5-turbo"),
      maxTokens: 512,
      tools: {
        weather: weatherTool,
      },
      prompt: "What is the weather in San Francisco?",
      maxToolRoundtrips: 3,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "my-awesome-function",
        metadata: {
          something: "custom",
          someOtherThing: "other-value",
          userId: "some-user-id",
          sessionId: "some-session-id",
          tags: ["vercel", "openai"],
          langfuseTraceId: traceId,
        },
      },
    });

    console.log(result.text);
  }, 10_000);
  //   it("should trace a streamText call", async () => {});
  //   it("should trace a generateObject call", async () => {});
  //   it("should trace a streamObject call", async () => {});
  //   it("should trace a embed call", async () => {});
  //   it("should trace a embedMany call", async () => {});
});
