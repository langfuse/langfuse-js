import "dotenv/config";

import OpenAI from "openai";
import Langfuse, { observeOpenAI } from "../langfuse";
import { randomUUID } from "crypto";
import axios, { type AxiosResponse } from "axios";
import { LANGFUSE_BASEURL, getHeaders, fetchTraceById, encodeFile } from "./integration-utils";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

jest.useFakeTimers({ doNotFake: ["Date"] });

const openai = new OpenAI();

const getGeneration = async (name: string): Promise<AxiosResponse<any, any>> => {
  const url = `${LANGFUSE_BASEURL}/api/public/observations?name=${name}&type=GENERATION`;
  const res = await axios.get(url, {
    headers: getHeaders(),
  });
  return res;
};

describe("Langfuse-OpenAI-Integation", () => {
  describe("Core Methods", () => {
    it("Chat-completion without streaming", async () => {
      const name = `ChatCompletion-Nonstreaming-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const res = await client.chat.completions.create({
        messages: [{ role: "system", content: "Tell me a story about a king." }],
        model: "gpt-3.5-turbo",
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });
      expect(res).toBeDefined();
      const usage = res.usage;
      await client.flushAsync();
      const response = await getGeneration(name);
      expect(response.status).toBe(200);
      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
      expect(generation.totalTokens).toBeDefined();
      expect(generation.promptTokens).toBeDefined();
      expect(generation.completionTokens).toBeDefined();
      expect(generation.input).toBeDefined();
      expect(generation.input.messages).toMatchObject([{ role: "system", content: "Tell me a story about a king." }]);

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
    }, 10000);

    it("Chat-completion with streaming", async () => {
      const name = `ChatComplete-Streaming-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const stream = await client.chat.completions.create({
        messages: [{ role: "system", content: "Who is the president of America ?" }],
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
      await client.flushAsync();

      const response = await getGeneration(name);
      expect(response.status).toBe(200);

      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
        stream: true,
      });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
      expect(generation.totalTokens).toBeDefined();
      expect(generation.promptTokens).toBeDefined();
      expect(generation.completionTokens).toBeDefined();
      expect(generation.input).toBeDefined();
      expect(generation.input.messages).toMatchObject([
        { role: "system", content: "Who is the president of America ?" },
      ]);
      expect(generation.output).toBeDefined();
      expect(generation.output).toMatch(content);
      expect(new Date(generation.completionStartTime).getTime()).toBeGreaterThanOrEqual(
        new Date(generation.startTime).getTime()
      );
      expect(new Date(generation.completionStartTime).getTime()).toBeLessThanOrEqual(
        new Date(generation.endTime).getTime()
      );
    }, 10000);

    it("Completion without streaming", async () => {
      const name = `Completion-NonStreaming-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const res = await client.completions.create({
        prompt: "Say this is a test!",
        model: "gpt-3.5-turbo-instruct",
        stream: false,
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });
      expect(res).toBeDefined();
      const usage = res.usage;
      await client.flushAsync();

      const response = await getGeneration(name);
      expect(response.status).toBe(200);

      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
        stream: false,
      });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo-instruct");
      expect(generation.totalTokens).toBeDefined();
      expect(generation.promptTokens).toBeDefined();
      expect(generation.completionTokens).toBeDefined();
      expect(generation.input).toBeDefined();
      expect(generation.input).toBe("Say this is a test!");
      expect(generation.output).toBeDefined();
      expect(generation.output).toMatch(res.choices[0].text);
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
    }, 10000);

    it("Completion with streaming", async () => {
      const name = `Completions-streaming-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const stream = await client.completions.create({
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
      await client.flushAsync();

      const response = await getGeneration(name);
      expect(response.status).toBe(200);

      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
        stream: true,
      });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo-instruct");
      expect(generation.totalTokens).toBeDefined();
      expect(generation.promptTokens).toBeDefined();
      expect(generation.completionTokens).toBeDefined();
      expect(generation.input).toBeDefined();
      expect(generation.input).toBe("Say this is a test");
      expect(generation.output).toBeDefined();
      expect(generation.output).toMatch(content);
      expect(new Date(generation.completionStartTime).getTime()).toBeGreaterThanOrEqual(
        new Date(generation.startTime).getTime()
      );
      expect(new Date(generation.completionStartTime).getTime()).toBeLessThanOrEqual(
        new Date(generation.endTime).getTime()
      );
    }, 10000);

    it("Function Calling on openai", async () => {
      const name = `FunctionCalling-NonStreaming-${randomUUID()}`;
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
      const client = observeOpenAI(openai, { generationName: name });
      const res = await client.chat.completions.create({
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
      await client.flushAsync();

      const response = await getGeneration(name);
      expect(response.status).toBe(200);
      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
      expect(generation.totalTokens).toBeDefined();
      expect(generation.promptTokens).toBeDefined();
      expect(generation.completionTokens).toBeDefined();
      expect(generation.input).toBeDefined();
      expect(generation.input.messages).toMatchObject([{ role: "user", content: "Explain how to assemble a PC" }]);
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
    }, 10000);

    it("Tools and Toolchoice Calling on openai", async () => {
      const name = `Tools-and-Toolchoice-NonStreaming-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const res = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "What's the weather like in Boston today?" }],
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
      await client.flushAsync();

      const response = await getGeneration(name);
      expect(response.status).toBe(200);
      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
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
    }, 10000);

    it("Streamed Tools and Toolchoice Calling on openai", async () => {
      const name = `Tools-and-Toolchoice-Streaming-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const stream = await client.chat.completions.create({
        stream: true,
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "What's the weather like in Boston today?" }],
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
      }

      await client.flushAsync();

      const response = await getGeneration(name);
      expect(response.status).toBe(200);
      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
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
    }, 10000);

    it("Using a common OpenAI client for multiple requests", async () => {
      const name = `Common-client-initialisation-${randomUUID()}`;
      const client = observeOpenAI(openai, { generationName: name });
      const res1 = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "What's the weather like in Boston today?" }],
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });

      await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "What's the weather like in Boston today?" }],
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });

      await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "What's the weather like in Boston today?" }],
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });

      const content = res1.choices[0].message;

      expect(content).toBeDefined();

      await client.flushAsync();
      // Fetches the generation by name. According to the condition it should return 3 generations.
      // Since the returned results may not be in the order we expect, avoiding the comparison of the
      // langfuse trace output against model output. We only check the existence. Similarly for few other params.
      const response = await getGeneration(name);
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.data).toBeDefined();
      // Greater than 2 becuase the data is not immediately consistent on langfuse. So it might miss
      // the last value when fetching from db.
      // TODO: Make the trace save immediately consistent, ensuring always the latest data is returned.
      expect(response.data.data.length).toBeGreaterThanOrEqual(2);
      const generation = response.data.data[0];
      const traceId = generation.id;
      for (const i of response.data.data.splice(1)) {
        expect(i.id).not.toBe(traceId);
      }
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
      expect(generation.totalTokens).toBeDefined();
      expect(generation.promptTokens).toBeDefined();
      expect(generation.completionTokens).toBeDefined();
      expect(generation.input).toBeDefined();
      expect(generation.output).toBeDefined();
      expect(generation.calculatedInputCost).toBeDefined();
      expect(generation.calculatedOutputCost).toBeDefined();
      expect(generation.calculatedTotalCost).toBeDefined();
      expect(generation.statusMessage).toBeNull();
    }, 10000);

    it("Extra Wrapper params", async () => {
      const name = `Extra-wrapper-params-${randomUUID()}`;
      const client = observeOpenAI(openai, {
        generationName: name,
        metadata: {
          hello: "World",
        },
        tags: ["hello", "World"],
        sessionId: "Langfuse",
        userId: "LangfuseUser",
      });
      const res = await client.chat.completions.create({
        messages: [{ role: "system", content: "Tell me a story about a king." }],
        model: "gpt-3.5-turbo",
        user: "langfuse-user@gmail.com",
        max_tokens: 300,
      });
      expect(res).toBeDefined();
      const usage = res.usage;
      await client.flushAsync();
      const response = await getGeneration(name);
      expect(response.status).toBe(200);
      const generation = response.data.data[0];
      expect(generation.name).toBe(name);
      expect(generation.modelParameters).toBeDefined();
      expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
      expect(generation.usage).toBeDefined();
      expect(generation.model).toBe("gpt-3.5-turbo");
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

      const traceId = generation.traceId;
      const resp = await fetchTraceById(traceId);
      expect(resp.status).toBe(200);
      expect(resp.data).toBeDefined();
      const trace = resp.data;
      expect(trace.metada);
      expect(trace.metadata).toBeDefined();
      expect(trace.metadata).toMatchObject({
        hello: "World",
      });
      expect(trace.tags).toBeDefined();
      expect(trace.tags).toEqual(expect.arrayContaining(["hello", "World"]));
      expect(trace.sessionId).toBeDefined();
      expect(trace.sessionId).toBe("Langfuse");
      expect(trace.userId).toBeDefined();
      expect(trace.userId).toBe("LangfuseUser");
    }, 10000);

    it("Error Handling in openai", async () => {
      const name = `Error-Handling-in-wrapper-${randomUUID()}`;
      const client = observeOpenAI(openai, {
        generationName: name,
        metadata: {
          hello: "World",
        },
        tags: ["hello", "World"],
        sessionId: "Langfuse",
        userId: "LangfuseUser",
      });
      try {
        await client.chat.completions.create({
          messages: [{ role: "system", content: "Tell me a story about a king." }],
          model: "gpt-3.5-turbo-instruct", // Purposely changed the model to completions.
          user: "langfuse-user@gmail.com",
          max_tokens: 300,
        });
      } catch (error) {
        await client.flushAsync();
        const response = await getGeneration(name);
        const generation = response.data.data[0];
        expect(generation.name).toBe(name);
        expect(generation.modelParameters).toBeDefined();
        expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
        expect(generation.model).toBe("gpt-3.5-turbo-instruct");
        expect(generation.input).toBeDefined();
        expect(generation.output).toBeNull();
        expect(generation.statusMessage).toBeDefined();

        const traceId = generation.traceId;
        const resp = await fetchTraceById(traceId);
        expect(resp.status).toBe(200);
        expect(resp.data).toBeDefined();
        const trace = resp.data;
        expect(trace.metada);
        expect(trace.metadata).toBeDefined();
        expect(trace.metadata).toMatchObject({
          hello: "World",
        });
        expect(trace.tags).toBeDefined();
        expect(trace.tags).toEqual(expect.arrayContaining(["hello", "World"]));
        expect(trace.sessionId).toBeDefined();
        expect(trace.sessionId).toBe("Langfuse");
        expect(trace.userId).toBeDefined();
        expect(trace.userId).toBe("LangfuseUser");
      }
    }, 10000);
  });

  it("allows passing a parent trace", async () => {
    const traceId = randomUUID();
    const name = "parent-trace";
    const langfuse = new Langfuse();
    const trace = langfuse.trace({ id: traceId, name, metadata: { parent: true }, version: "trace-1" });
    expect(trace.id).toBe(traceId);

    const client = observeOpenAI(openai, { parent: trace, metadata: { child: true }, version: "generation-1" });
    const res = await client.chat.completions.create({
      messages: [{ role: "system", content: "Tell me a story about a king." }],
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(res).toBeDefined();
    const usage = res.usage;

    // Flushes the correct client
    await client.flushAsync();

    const response = await fetchTraceById(traceId);

    expect(response.status).toBe(200);
    const trace_data = response.data;
    expect(trace_data.name).toBe(name);
    expect(trace_data.metadata).toEqual({ parent: true });
    expect(trace_data.version).toBe("trace-1");
    expect(trace_data.observations).toBeDefined();

    const observations = trace_data.observations;
    const generation = observations[0];

    expect(generation.name).toBe("OpenAI.chat"); // Use the default name
    expect(generation.metadata).toEqual({ child: true });
    expect(generation.version).toBe("generation-1");
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toBe("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([{ role: "system", content: "Tell me a story about a king." }]);

    expect(generation.output).toBeDefined();
    expect(generation.output).toMatchObject(res.choices[0].message);
    expect(trace_data.output).toBeNull(); // Do not update trace if traceId is passed
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
  }, 10000);
  it("allows passing a parent observation", async () => {
    // Parent trace
    const traceId = randomUUID();
    const name = "parent-trace";
    const langfuse = new Langfuse();
    const trace = langfuse.trace({ id: traceId, name });
    expect(trace.id).toBe(traceId);

    // Parent observation
    const parentSpanId = randomUUID();
    const parentSpanName = "parent-observation";
    const parentSpan = trace.span({
      id: parentSpanId,
      name: parentSpanName,
    });
    expect(parentSpan.id).toBe(parentSpanId);

    const client = observeOpenAI(openai, { parent: parentSpan, metadata: { child: true }, version: "generation-1" });
    const res = await client.chat.completions.create({
      messages: [{ role: "system", content: "Tell me a story about a king." }],
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });
    expect(res).toBeDefined();
    const usage = res.usage;

    // Flushes the correct client
    await client.flushAsync();

    const response = await fetchTraceById(traceId);
    expect(response.status).toBe(200);

    const trace_data = response.data;
    expect(trace_data.name).toBe(name);

    expect(trace_data.observations).toBeDefined();
    const observations = trace_data.observations;
    expect(observations.length).toBe(2);
    const generation = observations.filter((o: any) => o.type === "GENERATION")[0];
    const parentSpanData = observations.filter((o: any) => o.type === "SPAN")[0];

    expect(parentSpanData.name).toBe(parentSpanName);
    expect(parentSpanData.id).toBe(parentSpanId);
    expect(generation.parentObservationId).toBe(parentSpanId);

    expect(generation.name).toBe("OpenAI.chat"); // Use the default name
    expect(generation.metadata).toEqual({ child: true });
    expect(generation.version).toBe("generation-1");
    expect(generation.modelParameters).toBeDefined();
    expect(generation.modelParameters).toMatchObject({ user: "langfuse-user@gmail.com", max_tokens: 300 });
    expect(generation.usage).toBeDefined();
    expect(generation.model).toBe("gpt-3.5-turbo");
    expect(generation.totalTokens).toBeDefined();
    expect(generation.promptTokens).toBeDefined();
    expect(generation.completionTokens).toBeDefined();
    expect(generation.input).toBeDefined();
    expect(generation.input.messages).toMatchObject([{ role: "system", content: "Tell me a story about a king." }]);

    expect(generation.output).toBeDefined();
    expect(generation.output).toMatchObject(res.choices[0].message);
    expect(trace_data.output).toBeNull(); // Do not update trace if traceId is passed
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
  }, 10000);

  it("allows initializing Langfuse with custom params", async () => {
    // Get original env variables and set them to empty
    const envVars = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASEURL"] as const;
    const originalValues = {} as Record<(typeof envVars)[number], string | undefined>;

    for (const varName of envVars) {
      originalValues[varName] = process.env[varName];
      process.env[varName] = "";

      expect(process.env[varName]).toBe("");
    }

    // Set the custom init variables
    const publicKey = originalValues["LANGFUSE_PUBLIC_KEY"];
    const secretKey = originalValues["LANGFUSE_SECRET_KEY"];
    const baseUrl = originalValues["LANGFUSE_BASEURL"];

    const traceId = randomUUID();
    const name = "from-custom-init-params";

    const client = observeOpenAI(openai, {
      traceId,
      generationName: name,
      clientInitParams: { publicKey, secretKey, baseUrl },
    });

    const res = await client.chat.completions.create({
      messages: [{ role: "system", content: "Tell me a story about a king." }],
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    await client.flushAsync();

    const response = await fetchTraceById(traceId);
    expect(response.status).toBe(200);

    const trace_data = response.data;
    expect(trace_data.name).toBe(name);

    // Reset env variables
    for (const varName of envVars) {
      process.env[varName] = originalValues[varName];
    }
  }, 10000);
  it("tracks a created text prompt by passing it as langfusePrompt", async () => {
    // Create prompt
    const promptName = "fun-fact-prompt-" + randomUUID();
    const langfuse = new Langfuse();
    const prompt = await langfuse.createPrompt({
      prompt: "Tell me a fun fact",
      name: promptName,
      isActive: true,
    });

    // Use prompt for completion
    const client = observeOpenAI(openai, { generationName: promptName, langfusePrompt: prompt });
    const res = await client.completions.create({
      prompt: prompt.prompt,
      model: "gpt-3.5-turbo-instruct",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    await client.flushAsync();

    const response = await getGeneration(promptName);
    expect(response.status).toBe(200);

    const generation = response.data.data[0];
    expect(generation.name).toBe(promptName);
    expect(generation.metadata).toBeDefined();
    // @ts-expect-error: promptResponse.id is not defined in the type
    expect(generation.promptId).toBe(prompt.promptResponse.id);
  }, 10000);

  it("tracks a fetched text prompt by passing it as langfusePrompt", async () => {
    // Create prompt
    const promptName = "fun-fact-prompt-" + randomUUID();
    const langfuse = new Langfuse();
    await langfuse.createPrompt({
      prompt: "Tell me a fun fact",
      name: promptName,
      isActive: true,
    });

    const prompt = await langfuse.getPrompt(promptName);

    // Use prompt for completion
    const client = observeOpenAI(openai, { generationName: promptName, langfusePrompt: prompt });
    const res = await client.completions.create({
      prompt: prompt.prompt,
      model: "gpt-3.5-turbo-instruct",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    await client.flushAsync();

    const response = await getGeneration(promptName);
    expect(response.status).toBe(200);

    const generation = response.data.data[0];
    expect(generation.name).toBe(promptName);
    // @ts-expect-error: promptResponse.id is not defined in the type
    expect(generation.promptId).toBe(prompt.promptResponse.id);
  }, 10000);
  it("tracks a created chat prompt by passing it as langfusePrompt", async () => {
    // Create prompt
    const promptName = "fun-fact-prompt-" + randomUUID();
    const langfuse = new Langfuse();
    const chatPrompt = await langfuse.createPrompt({
      type: "chat",
      prompt: [{ role: "system", content: "Tell me a fun fact" }],
      name: promptName,
      isActive: true,
    });

    // Use prompt for completion
    const client = observeOpenAI(openai, { generationName: promptName, langfusePrompt: chatPrompt });
    const res = await client.chat.completions.create({
      messages: chatPrompt.prompt as OpenAI.ChatCompletionMessageParam[], // type-cast as role can be any string in Langfuse whereas in OpenAI it is narrowed down
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    await client.flushAsync();

    const response = await getGeneration(promptName);
    expect(response.status).toBe(200);

    const generation = response.data.data[0];
    expect(generation.name).toBe(promptName);
    // @ts-expect-error: promptResponse.id is not defined in the type
    expect(generation.promptId).toBe(chatPrompt.promptResponse.id);
  }, 10000);

  it("tracks a fetched chat prompt by passing it as langfusePrompt", async () => {
    // Create prompt
    const promptName = "fun-fact-prompt-" + randomUUID();
    const langfuse = new Langfuse();
    await langfuse.createPrompt({
      type: "chat",
      prompt: [{ role: "system", content: "Tell me a fun fact" }],
      name: promptName,
      isActive: true,
    });

    const chatPrompt = await langfuse.getPrompt(promptName, undefined, { type: "chat" });

    // Use prompt for completion
    const client = observeOpenAI(openai, { generationName: promptName, langfusePrompt: chatPrompt });
    const res = await client.chat.completions.create({
      messages: chatPrompt.prompt as OpenAI.ChatCompletionMessageParam[], // type-cast as role can be any string in Langfuse whereas in OpenAI it is narrowed down
      model: "gpt-3.5-turbo",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    await client.flushAsync();

    const response = await getGeneration(promptName);
    expect(response.status).toBe(200);

    const generation = response.data.data[0];
    expect(generation.name).toBe(promptName);
    // @ts-expect-error: promptResponse.id is not defined in the type
    expect(generation.promptId).toBe(chatPrompt.promptResponse.id);
  }, 10000);

  it("tracks the used prompt by passing a parent and setting promptName and promptVersion (backward compat)", async () => {
    // Create prompt
    const promptName = "fun-fact-prompt-" + randomUUID();
    const langfuse = new Langfuse();
    const prompt = await langfuse.createPrompt({
      prompt: "Tell me a fun fact",
      name: promptName,
      isActive: true,
    });

    const traceId = randomUUID();
    const parent = langfuse.trace({ name: promptName, id: traceId });

    // Use prompt for completion via parent
    const client = observeOpenAI(openai, { parent, promptName, promptVersion: prompt.version });
    const res = await client.completions.create({
      prompt: prompt.prompt,
      model: "gpt-3.5-turbo-instruct",
      user: "langfuse-user@gmail.com",
      max_tokens: 300,
    });

    expect(res).toBeDefined();
    await client.flushAsync();

    const response = await fetchTraceById(traceId);
    expect(response.status).toBe(200);

    const generation = response.data.observations[0];
    // @ts-expect-error: promptResponse.id is not defined in the type
    expect(generation.promptId).toBe(prompt.promptResponse.id);
  }, 10000);

  it("should fail silently when using the Assistants API", async () => {
    const traceId = randomUUID();
    const client = observeOpenAI(openai, { traceId });

    const assistant = await client.beta.assistants.create({
      name: "Math Tutor",
      instructions: "You are a personal math tutor. Answer questions briefly, in a sentence or less.",
      model: "gpt-4",
    });

    const inputMessages = [
      {
        role: "assistant",
        content: "I am a math tutor that likes to help math students, how can I help?",
      },
      {
        role: "user",
        content: "I need to solve the equation `3x + 11 = 14`. Can you help me?",
      },
    ];

    const thread = await client.beta.threads.create({ messages: inputMessages } as any);
    await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
      stream: false,
    });

    const messages = await client.beta.threads.messages.list(thread.id);
    expect(messages).toBeDefined();

    await client.flushAsync();
  }, 10000);

  it("should work with structured output parsing with response_format", async () => {
    const traceId = randomUUID();
    const client = observeOpenAI(openai, { traceId, metadata: { someKey: "someValue" } });
    const response_format = {
      type: "json_schema",
      json_schema: {
        name: "math_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  explanation: { type: "string" },
                  output: { type: "string" },
                },
                required: ["explanation", "output"],
                additionalProperties: false,
              },
            },
            final_answer: { type: "string" },
          },
          required: ["steps", "final_answer"],
          additionalProperties: false,
        },
      },
    } as any;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a helpful math tutor. Guide the user through the solution step by step." },
        { role: "user", content: "how can I solve 8x + 7 = -23" },
      ],
      response_format,
    });

    await client.flushAsync();

    const trace = await fetchTraceById(traceId);
    expect(trace.status).toBe(200);

    const generation = trace.data.observations[0];
    expect(generation.input).toMatchObject({
      messages: [
        { role: "system", content: "You are a helpful math tutor. Guide the user through the solution step by step." },
        { role: "user", content: "how can I solve 8x + 7 = -23" },
      ],
    });
    expect(generation.output).toMatchObject(completion.choices[0].message);
    expect(generation.metadata).toMatchObject({ someKey: "someValue", response_format });
    expect(generation.model).toBe("gpt-4o-2024-08-06");
  }, 10000);

  it("should work with structured output parsing with beta API", async () => {
    const traceId = randomUUID();
    const client = observeOpenAI(openai, { traceId, metadata: { someKey: "someValue" } });
    const Step = z.object({
      explanation: z.string(),
      output: z.string(),
    });

    const MathResponse = z.object({
      steps: z.array(Step),
      final_answer: z.string(),
    });

    const completion = await client.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a helpful math tutor. Guide the user through the solution step by step." },
        { role: "user", content: "how can I solve 8x + 7 = -23" },
      ],
      response_format: zodResponseFormat(MathResponse, "math_response"),
    });

    await client.flushAsync();

    const trace = await fetchTraceById(traceId);
    expect(trace.status).toBe(200);

    const generation = trace.data.observations[0];
    expect(generation.input).toMatchObject({
      messages: [
        { role: "system", content: "You are a helpful math tutor. Guide the user through the solution step by step." },
        { role: "user", content: "how can I solve 8x + 7 = -23" },
      ],
    });
    expect(generation.output).toMatchObject(completion.choices[0].message);
    expect(generation.metadata).toMatchObject({
      someKey: "someValue",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "math_response",
          schema: {
            type: "object",
            $schema: "http://json-schema.org/draft-07/schema#",
            required: ["steps", "final_answer"],
            properties: {
              steps: {
                type: "array",
                items: {
                  type: "object",
                  required: ["explanation", "output"],
                  properties: { output: { type: "string" }, explanation: { type: "string" } },
                  additionalProperties: false,
                },
              },
              final_answer: { type: "string" },
            },
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });
    expect(generation.model).toBe("gpt-4o-2024-08-06");
  }, 10000);

  it("should work with vision input", async () => {
    const traceId = randomUUID();
    const client = observeOpenAI(openai, { traceId, metadata: { someKey: "someValue" } });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a helpful math tutor. Guide the user through the solution step by step." },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What’s in this image?",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${await encodeFile("./static/puton.jpg")}`,
              },
            },
          ],
        },
      ],
    });

    await client.flushAsync();

    const trace = await fetchTraceById(traceId);
    expect(trace.status).toBe(200);

    const generation = trace.data.observations[0];
    expect(generation.model).toBe("gpt-4o-2024-08-06");
    expect(generation.input).toMatchObject({
      messages: [
        {
          role: "system",
          content: "You are a helpful math tutor. Guide the user through the solution step by step.",
        },
        {
          role: "user",
          content: [
            {
              text: "What’s in this image?",
              type: "text",
            },
            {
              type: "image_url",
              image_url: {
                url: expect.stringMatching(/^@@@langfuseMedia:type=image\/jpeg\|id=.+\|source=base64_data_uri@@@$/),
              },
            },
          ],
        },
      ],
    });
  }, 10_000);

  it("should work with audio input and output", async () => {
    const traceId = randomUUID();
    const client = observeOpenAI(openai, { traceId, metadata: { someKey: "someValue" } });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-audio-preview",
      modalities: ["text", "audio"],
      audio: { voice: "alloy", format: "wav" },
      messages: [
        { role: "system", content: "You are a hilarious comedian. Make the user laugh." },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Do what this recording says.",
            },
            {
              type: "input_audio",
              input_audio: {
                data: await encodeFile("./static/joke_prompt.wav"),
                format: "wav",
              },
            },
          ],
        },
      ],
    });

    await client.flushAsync();

    const trace = await fetchTraceById(traceId);
    expect(trace.status).toBe(200);

    const generation = trace.data.observations[0];
    expect(generation.model).toBe("gpt-4o-audio-preview");
    expect(generation.input).toMatchObject({
      messages: [
        {
          role: "system",
          content: "You are a hilarious comedian. Make the user laugh.",
        },
        {
          role: "user",
          content: [
            {
              text: "Do what this recording says.",
              type: "text",
            },
            {
              type: "input_audio",
              input_audio: {
                data: expect.stringMatching(/^@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@$/),
                format: "wav",
              },
            },
          ],
        },
      ],
    });

    expect(generation.output).toMatchObject({
      role: "assistant",
      audio: {
        id: expect.any(String),
        data: expect.stringMatching(/^@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@$/),
        expires_at: expect.any(Number),
        transcript: expect.any(String),
      },
      content: null,
      refusal: null,
    });
  }, 20_000);
});
