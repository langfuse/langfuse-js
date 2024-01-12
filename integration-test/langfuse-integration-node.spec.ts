// uses the compiled node.js version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse-node";

// import { wait } from '../langfuse-core/test/test-utils/test-utils'
import axios from "axios";

import { getKeys } from "./integration-utils";

const getHeaders = {
  Authorization: "Basic " + Buffer.from(`${getKeys().publicKey}:${getKeys().secretKey}`).toString("base64"),
};

describe("Langfuse Node.js", () => {
  let langfuse: Langfuse;
  // jest.setTimeout(100000)
  jest.useRealTimers();

  beforeEach(() => {
    langfuse = new Langfuse({
      ...getKeys(),
      flushAt: 100,
      fetchRetryDelay: 100,
      fetchRetryCount: 3,
    });
    langfuse.debug(true);
  });

  afterEach(async () => {
    // ensure clean shutdown & no test interdependencies
    await langfuse.shutdownAsync();
  });

  describe("core methods", () => {
    it("check health of langfuse server", async () => {
      const res = await axios
        .get(getKeys().baseUrl + "/api/public/health", { headers: getHeaders })
        .then((res) => res.data)
        .catch((err) => console.log(err));
      expect(res).toMatchObject({ status: "OK" });
    });

    it("create trace", async () => {
      const trace = langfuse.trace({ name: "trace-name", tags: ["tag1", "tag2"] });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/traces/${trace.id}`, {
        headers: getHeaders,
      });
      expect(res.data).toMatchObject({ id: trace.id, name: "trace-name", tags: ["tag1", "tag2"] });
    });

    it("update a trace", async () => {
      const trace = langfuse.trace({
        name: "test-trace-10",
      });
      trace.update({
        version: "1.0.0",
      });
      await langfuse.flushAsync();

      const res = await axios.get(`${getKeys().baseUrl}/api/public/traces/${trace.id}`, { headers: getHeaders });

      expect(res.data).toMatchObject({
        id: trace.id,
        name: "test-trace-10",
        version: "1.0.0",
      });
    });

    it("create span", async () => {
      const trace = langfuse.trace({ name: "trace-name-span" });
      const span = trace.span({
        name: "span-name",
        startTime: new Date("2020-01-01T00:00:00.000Z"),
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${span.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: span.id,
        name: "span-name",
        type: "SPAN",
        startTime: new Date("2020-01-01T00:00:00.000Z").toISOString(),
        completionStartTime: null,
        endTime: null,
        metadata: null,
        model: null,
        modelParameters: null,
        input: null,
        output: null,
        level: "DEFAULT",
        parentObservationId: null,
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
        statusMessage: null,
        traceId: trace.id,
        version: null,
      });
    });

    it("update a span", async () => {
      const trace = langfuse.trace({
        name: "test-trace",
      });
      const span = trace.span({
        name: "test-span-1",
      });
      span.update({
        version: "1.0.0",
      });
      span.end();
      await langfuse.flushAsync();

      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${span.id}`, { headers: getHeaders });

      expect(res.data).toMatchObject({
        id: span.id,
        traceId: trace.id,
        name: "test-span-1",
        type: "SPAN",
        version: "1.0.0",
        startTime: expect.any(String),
        endTime: expect.any(String),
      });
    });

    it("create different generation types 1", async () => {
      const trace = langfuse.trace({ name: "trace-name-generation-new" });
      const generation = trace.generation({
        name: "generation-name-new",
        input: {
          text: "prompt",
        },
        output: {
          foo: "bar",
        },
      });

      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${generation.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
        input: {
          text: "prompt",
        },
        output: {
          foo: "bar",
        },
      });
    });

    it("create different generation types 2", async () => {
      const trace = langfuse.trace({ name: "trace-name-generation-new" });
      const generation = trace.generation({
        name: "generation-name-new",
        input: [
          {
            text: "prompt",
          },
        ],
        output: [
          {
            foo: "bar",
          },
        ],
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${generation.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
        input: [
          {
            text: "prompt",
          },
        ],
        output: [
          {
            foo: "bar",
          },
        ],
      });
    });

    it("create different generation types 3", async () => {
      const trace = langfuse.trace({ name: "trace-name-generation-new" });
      const generation = trace.generation({
        name: "generation-name-new",
        input: "prompt",
        output: "completion",
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${generation.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
        input: "prompt",
        output: "completion",
      });
    });

    it("create many objects", async () => {
      const trace = langfuse.trace({ name: "trace-name-generation-new" });
      const generation = trace.generation({
        name: "generation-name-new",
        input: "prompt",
        output: "completion",
      });
      generation.update({
        version: "1.0.0",
      });
      const span = generation.span({
        name: "span-name",
        input: "span-input",
        output: "span-output",
      });
      span.end({ metadata: { foo: "bar" } });
      generation.end({ metadata: { foo: "bar" } });

      await langfuse.flushAsync();
      // check from get api if trace is created
      const returnedGeneration = await axios.get(`${getKeys().baseUrl}/api/public/observations/${generation.id}`, {
        headers: getHeaders,
      });
      expect(returnedGeneration.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
        input: "prompt",
        output: "completion",
        version: "1.0.0",
        endTime: expect.any(String),
        metadata: {
          foo: "bar",
        },
      });

      const returnedSpan = await axios.get(`${getKeys().baseUrl}/api/public/observations/${span.id}`, {
        headers: getHeaders,
      });
      expect(returnedSpan.data).toMatchObject({
        id: span.id,
        name: "span-name",
        type: "SPAN",
        input: "span-input",
        output: "span-output",
        endTime: expect.any(String),
        metadata: {
          foo: "bar",
        },
      });
    });

    it("update a generation", async () => {
      const trace = langfuse.trace({
        name: "test-trace",
      });
      const generation = trace.generation({ name: "generation-name-new-2" });
      generation.update({
        completionStartTime: new Date("2020-01-01T00:00:00.000Z"),
      });
      generation.end({
        output: "Hello world",
        usage: {
          promptTokens: 10,
          completionTokens: 15,
        },
      });

      await langfuse.flushAsync();

      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${generation.id}`, { headers: getHeaders });

      expect(res.data).toMatchObject({
        id: generation.id,
        traceId: trace.id,
        name: "generation-name-new-2",
        type: "GENERATION",
        promptTokens: 10,
        completionTokens: 15,
        endTime: expect.any(String),
        completionStartTime: new Date("2020-01-01T00:00:00.000Z").toISOString(),
        output: "Hello world",
      });
    });

    it("create event", async () => {
      const trace = langfuse.trace({ name: "trace-name-event" });
      const event = trace.event({ name: "event-name" });
      await langfuse.flushAsync();

      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${event.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: event.id,
        name: "event-name",
        type: "EVENT",
      });
    });

    it("create event without creating trace before", async () => {
      const event = langfuse.event({ name: "event-name" });
      await langfuse.flushAsync();

      // check from get api if trace is created
      const res = await axios.get(`${getKeys().baseUrl}/api/public/observations/${event.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: event.id,
        name: "event-name",
        type: "EVENT",
      });
    });
  });
  describe("prompt methods", () => {
    it("create and get a prompt", async () => {
      const promptName = "test-prompt" + Math.random().toString(36);
      await langfuse.createPrompt({
        name: promptName,
        prompt: "This is a prompt with a {{variable}}",
        isActive: true,
      });

      const prompt = await langfuse.getPrompt(promptName);

      const filledPrompt = prompt.compile({ variable: "1.0.0" });

      expect(filledPrompt).toEqual("This is a prompt with a 1.0.0");
      expect(prompt.name).toEqual(promptName);
      expect(prompt.prompt).toEqual("This is a prompt with a {{variable}}");
      expect(prompt.version).toEqual(1);

      const res = await axios.get(`${getKeys().baseUrl}/api/public/prompts/?name=${promptName}`, {
        headers: getHeaders,
      });

      expect(res.data).toMatchObject({
        name: promptName,
        prompt: "This is a prompt with a {{variable}}",
        isActive: true,
        version: expect.any(Number),
      });
    });
  });

  it("link prompt to generation", async () => {
    const promptName = "test-prompt" + Math.random().toString(36);
    await langfuse.createPrompt({
      name: promptName,
      prompt: "This is a prompt with a {{variable}}",
      isActive: true,
    });

    const prompt = await langfuse.getPrompt(promptName);

    const filledPrompt = prompt.compile({ variable: "1.0.0" });

    const generation = langfuse.generation({
      name: "test-generation",
      input: filledPrompt,
      prompt: prompt,
    });

    await langfuse.flushAsync();

    const res = await axios.get(`${getKeys().baseUrl}/api/public/prompts/?name=${promptName}`, {
      headers: getHeaders,
    });

    expect(res.data).toMatchObject({
      name: promptName,
      prompt: "This is a prompt with a {{variable}}",
      isActive: true,
      version: expect.any(Number),
    });
    console.log("post prompt", generation.id);

    const observation = await axios.get(`${getKeys().baseUrl}/api/public/observations/${generation.id}`, {
      headers: getHeaders,
    });

    expect(observation.data).toMatchObject({
      input: "This is a prompt with a 1.0.0",
      promptId: res.data.id,
    });
  });

  it("create and get a prompt for a specific variable", async () => {
    const promptName = "test-prompt" + Math.random().toString(36);
    await langfuse.createPrompt({
      name: promptName,
      prompt: "This is a prompt with a {{variable}}",
      isActive: true,
    });

    await langfuse.createPrompt({
      name: promptName,
      prompt: "This is a prompt with a {{wrongVariable}}",
      isActive: true,
    });

    const prompt = await langfuse.getPrompt(promptName, 1);

    const filledPrompt = prompt.compile({ variable: "1.0.0" });

    expect(filledPrompt).toEqual("This is a prompt with a 1.0.0");

    const res = await axios.get(`${getKeys().baseUrl}/api/public/prompts/?name=${promptName}`, {
      headers: getHeaders,
    });
    expect(res.data).toMatchObject({});
  });
});
