// uses the compiled fetch version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse";

import axios from "axios";
import { getHeaders, LANGFUSE_BASEURL } from "./integration-utils";

describe("Langfuse (fetch)", () => {
  let langfuse: Langfuse;
  // jest.setTimeout(100000)
  jest.useRealTimers();

  beforeEach(() => {
    langfuse = new Langfuse({
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
        .get(LANGFUSE_BASEURL + "/api/public/health", { headers: getHeaders() })
        .then((res) => res.data)
        .catch((err) => console.log(err));
      expect(res).toMatchObject({ status: "OK" });
    });

    it("instantiates with env variables", async () => {
      const langfuse = new Langfuse();

      const options = langfuse._getFetchOptions({ method: "POST", body: "test" });
      expect(langfuse.baseUrl).toEqual(LANGFUSE_BASEURL);

      expect(options).toMatchObject({
        headers: {
          "Content-Type": "application/json",
          "X-Langfuse-Sdk-Name": "langfuse-js",
          "X-Langfuse-Sdk-Variant": "langfuse",
          "X-Langfuse-Public-Key": process.env.LANGFUSE_PUBLIC_KEY,
          ...getHeaders(),
        },
        body: "test",
      });
    });

    it("instantiates with constructor variables", async () => {
      const langfuse = new Langfuse({ publicKey: "test-pk", secretKey: "test-sk", baseUrl: "http://example.com" });
      const options = langfuse._getFetchOptions({ method: "POST", body: "test" });

      expect(langfuse.baseUrl).toEqual("http://example.com");
      expect(options).toMatchObject({
        headers: {
          "Content-Type": "application/json",
          "X-Langfuse-Sdk-Name": "langfuse-js",
          "X-Langfuse-Sdk-Variant": "langfuse",
          "X-Langfuse-Public-Key": "test-pk",
          ...getHeaders("test-pk", "test-sk"),
        },
        body: "test",
      });
    });

    it("instantiates with without mandatory variables", async () => {
      const LANGFUSE_PUBLIC_KEY = String(process.env.LANGFUSE_PUBLIC_KEY);
      const LANGFUSE_SECRET_KEY = String(process.env.LANGFUSE_SECRET_KEY);
      const LANGFUSE_BASEURL = String(process.env.LANGFUSE_BASEURL);

      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASEURL;

      expect(() => new Langfuse()).toThrow();

      process.env.LANGFUSE_PUBLIC_KEY = LANGFUSE_PUBLIC_KEY;
      process.env.LANGFUSE_SECRET_KEY = LANGFUSE_SECRET_KEY;
      process.env.LANGFUSE_BASEURL = LANGFUSE_BASEURL;
    });

    it("create trace", async () => {
      const trace = langfuse.trace({
        name: "trace-name",
        sessionId: "123456789",
        input: { hello: "world" },
        output: "hi there",
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, {
        headers: getHeaders(),
      });
      expect(res.data).toMatchObject({
        id: trace.id,
        name: "trace-name",
        sessionId: "123456789",
        input: { hello: "world" },
        output: "hi there",
      });
    });

    it("create trace with timestamp", async () => {
      const timestamp = new Date("2023-01-01T00:00:00.000Z");
      const trace = langfuse.trace({
        timestamp: timestamp,
      });
      await langfuse.flushAsync();
      // check from get api if trace is created with the specified timestamp
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, {
        headers: getHeaders(),
      });
      expect(res.data).toMatchObject({
        timestamp: timestamp.toISOString(),
      });
    });

    it("update a trace", async () => {
      const trace = langfuse.trace({
        name: "test-trace-10",
      });
      trace.update({
        version: "1.0.0",
      });
      await langfuse.flushAsync();

      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, { headers: getHeaders() });

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
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${span.id}`, { headers: getHeaders() });
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
        metadata: { key: "value" },
      });
      span.update({
        version: "1.0.0",
        name: "test-span-2",
      });
      span.end();
      await langfuse.flushAsync();

      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${span.id}`, { headers: getHeaders() });

      expect(res.data).toMatchObject({
        id: span.id,
        traceId: trace.id,
        name: "test-span-2",
        type: "SPAN",
        version: "1.0.0",
        startTime: expect.any(String),
        endTime: expect.any(String),
        metadata: { key: "value" },
      });
    });

    it("create generation", async () => {
      const trace = langfuse.trace({ name: "trace-name-generation-new" });
      const generation = trace.generation({ name: "generation-name-new" });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
      });
      expect(res.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
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
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
      });
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
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
      });
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
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
      });
      expect(res.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
        input: "prompt",
        output: "completion",
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

      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
      });

      expect(res.data).toMatchObject({
        id: generation.id,
        traceId: trace.id,
        name: "generation-name-new-2",
        type: "GENERATION",
        promptTokens: 10,
        completionTokens: 15,
        endTime: expect.any(String),
        completionStartTime: new Date("2020-01-01T00:00:00.000Z").toISOString(),
      });
    });

    it("create event", async () => {
      const trace = langfuse.trace({ name: "trace-name-event" });
      const event = trace.event({ name: "event-name" });
      await langfuse.flushAsync();

      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${event.id}`, { headers: getHeaders() });
      expect(res.data).toMatchObject({
        id: event.id,
        name: "event-name",
        type: "EVENT",
      });
    });
    it("create prompt", async () => {
      const promptName = "test_text_prompt";
      const createdPrompt = await langfuse.createPrompt({
        name: promptName,
        isActive: true,
        prompt: "A {{animal}} usually has {{animal}} friends.",
      });

      expect(createdPrompt.constructor.name).toBe("TextPromptClient");

      const fetchedPrompt = await langfuse.getPrompt(promptName);

      expect(createdPrompt.constructor.name).toBe("TextPromptClient");
      expect(fetchedPrompt.name).toEqual(promptName);
      expect(fetchedPrompt.prompt).toEqual("A {{animal}} usually has {{animal}} friends.");
      expect(fetchedPrompt.compile({ animal: "dog" })).toEqual("A dog usually has dog friends.");
    });

    it("create chat prompt", async () => {
      const promptName = "test_chat_prompt";
      const createdPrompt = await langfuse.createPrompt({
        name: promptName,
        type: "chat",
        isActive: true,
        prompt: [{ role: "system", content: "A {{animal}} usually has {{animal}} friends." }],
      });

      expect(createdPrompt.constructor.name).toBe("ChatPromptClient");

      const fetchedPrompt = await langfuse.getPrompt(promptName, undefined, { type: "chat" });

      expect(createdPrompt.constructor.name).toBe("ChatPromptClient");
      expect(fetchedPrompt.name).toEqual(promptName);
      expect(fetchedPrompt.prompt).toEqual([
        { role: "system", content: "A {{animal}} usually has {{animal}} friends." },
      ]);
      expect(fetchedPrompt.compile({ animal: "dog" })).toEqual([
        { role: "system", content: "A dog usually has dog friends." },
      ]);
    });

    it("create event without creating trace before", async () => {
      const event = langfuse.event({ name: "event-name" });
      await langfuse.flushAsync();

      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${event.id}`, { headers: getHeaders() });
      expect(res.data).toMatchObject({
        id: event.id,
        name: "event-name",
        type: "EVENT",
      });
    });
  });
});
