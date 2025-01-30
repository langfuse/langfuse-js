import fs from "fs";
import { randomUUID } from "crypto";

import { getAxiosClient, sleep } from "./integration-utils";

// uses the compiled fetch version, run yarn build after making changes to the SDKs
import Langfuse, { LangfuseMedia } from "../langfuse";
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
      const res = await (
        await getAxiosClient()
      )
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

    it("create trace", async () => {
      const trace = langfuse.trace({
        name: "trace-name",
        sessionId: "123456789",
        input: { hello: "world" },
        output: "hi there",
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, {
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

    it("silently skips creating observations if Langfuse is disabled", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const langfuse = new Langfuse({ enabled: false });
      const fetchSpy = jest.spyOn(langfuse, "fetch");

      expect(consoleSpy).toHaveBeenCalledWith("Langfuse is disabled. No observability data will be sent to Langfuse.");

      const trace = langfuse.trace({
        name: "trace-name",
      });
      trace.span({
        name: "span-name",
      });
      trace.generation({
        name: "generation-name",
      });
      trace.score({ name: "score-name", value: 1, dataType: "NUMERIC" });

      await langfuse.flushAsync();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("create trace with timestamp", async () => {
      const timestamp = new Date("2023-01-01T00:00:00.000Z");
      const trace = langfuse.trace({
        timestamp: timestamp,
      });
      await langfuse.flushAsync();
      // check from get api if trace is created with the specified timestamp
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, {
        headers: getHeaders(),
      });
      expect(res.data).toMatchObject({
        timestamp: timestamp.toISOString(),
      });
    });

    it("create categorical score", async () => {
      const trace = langfuse.trace({});

      langfuse.score({
        traceId: trace.id,
        name: "score-name",
        value: "value",
        dataType: "CATEGORICAL",
      });
      await langfuse.flushAsync();
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/scores/?dataType=CATEGORICAL`, {
        headers: getHeaders(),
      });

      for (const score of res.data.data) {
        if (score.traceId === trace.id) {
          expect(score).toMatchObject({
            value: 0,
            stringValue: "value",
            dataType: "CATEGORICAL",
          });
        }
      }
    });

    it("create boolean score", async () => {
      const trace = langfuse.trace({});

      langfuse.score({
        traceId: trace.id,
        name: "score-name",
        value: 0,
        dataType: "BOOLEAN",
      });
      await langfuse.flushAsync();
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/scores/?dataType=BOOLEAN`, {
        headers: getHeaders(),
      });

      for (const score of res.data.data) {
        if (score.traceId === trace.id) {
          expect(score).toMatchObject({
            value: 0,
            stringValue: "False",
            dataType: "BOOLEAN",
          });
        }
      }
    });

    it("update a trace", async () => {
      const trace = langfuse.trace({
        name: "test-trace-10",
      });
      trace.update({
        version: "1.0.0",
      });
      await langfuse.flushAsync();

      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, {
        headers: getHeaders(),
      });

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
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${span.id}`, {
        headers: getHeaders(),
      });

      expect(res.data).toMatchObject({
        id: span.id,
        name: "span-name",
        type: "SPAN",
        startTime: new Date("2020-01-01T00:00:00.000Z").toISOString(),
        completionStartTime: null,
        endTime: null,
        metadata: {},
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

      // Add small wait for create and update events to not be on same millisecond
      await sleep(5);

      span.update({
        version: "1.0.0",
        name: "test-span-2",
      });
      span.end();
      await langfuse.flushAsync();

      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${span.id}`, {
        headers: getHeaders(),
      });

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
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
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
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
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
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
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
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
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

      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
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
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${event.id}`, {
        headers: getHeaders(),
      });
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

    it("create prompt with special characters in the name", async () => {
      const promptName = "test-prompt-" + "special character !@#$%^&*()_+";
      const createdPrompt = await langfuse.createPrompt({
        name: promptName,
        labels: ["production"],
        prompt: "A {{animal}} usually has {{animal}} friends.",
      });

      expect(createdPrompt.constructor.name).toBe("TextPromptClient");

      const fetchedPrompt = await langfuse.getPrompt(promptName);

      expect(createdPrompt.constructor.name).toBe("TextPromptClient");
      expect(fetchedPrompt.name).toEqual(promptName);
      expect(fetchedPrompt.prompt).toEqual("A {{animal}} usually has {{animal}} friends.");
      expect(fetchedPrompt.compile({ animal: "dog" })).toEqual("A dog usually has dog friends.");
    });

    it("should fetch prompt by version and label", async () => {
      const promptName = "test-prompt-" + Date.now();
      await langfuse.createPrompt({
        name: promptName,
        labels: ["production", "dev"],
        prompt: "A {{animal}} usually has {{animal}} friends.",
      });

      await langfuse.createPrompt({
        name: promptName,
        labels: ["dev"],
        prompt: "A {{animal}} usually has {{animal}} friends.",
      });

      const defaultFetchedPrompt = await langfuse.getPrompt(promptName);
      expect(defaultFetchedPrompt.name).toEqual(promptName);
      expect(defaultFetchedPrompt.labels).toEqual(["production"]);
      expect(defaultFetchedPrompt.version).toEqual(1);

      const fetchedPrompt1 = await langfuse.getPrompt(promptName, 1);

      expect(fetchedPrompt1.name).toEqual(promptName);
      expect(fetchedPrompt1.labels).toEqual(["production"]);
      expect(fetchedPrompt1.version).toEqual(1);

      const fetchedPrompt2 = await langfuse.getPrompt(promptName, undefined, { label: "dev" });
      expect(fetchedPrompt2.labels).toEqual(["dev", "latest"]);
      expect(fetchedPrompt2.name).toEqual(promptName);
      expect(fetchedPrompt2.version).toEqual(2);

      // non-prod prompt fetched via version
      const fetchedPrompt3 = await langfuse.getPrompt(promptName, 2);
      expect(fetchedPrompt3.labels).toEqual(["dev", "latest"]);
      expect(fetchedPrompt3.name).toEqual(promptName);
      expect(fetchedPrompt3.version).toEqual(2);
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

    it("should not return fallback if fetch succeeds", async () => {
      const promptName = "test_text_prompt";
      const createdPrompt = await langfuse.createPrompt({
        name: promptName,
        isActive: true,
        prompt: "A {{animal}} usually has {{animal}} friends.",
      });

      expect(createdPrompt.constructor.name).toBe("TextPromptClient");

      const fetchedPrompt = await langfuse.getPrompt(promptName, undefined, {
        fallback: "fallback with variable {{variable}}",
      });

      expect(createdPrompt.constructor.name).toBe("TextPromptClient");
      expect(fetchedPrompt.name).toEqual(promptName);
      expect(fetchedPrompt.prompt).toEqual("A {{animal}} usually has {{animal}} friends.");
      expect(fetchedPrompt.compile({ animal: "dog" })).toEqual("A dog usually has dog friends.");
    });

    it("should return the fallback text prompt if cache empty and fetch fails", async () => {
      const promptName = "non-existing-prompt" + Date.now();
      const fallback = "fallback with variable {{variable}}";

      // should throw without fallback
      await expect(langfuse.getPrompt(promptName)).rejects.toThrow();

      const prompt = await langfuse.getPrompt(promptName, undefined, {
        fallback,
      });

      expect(prompt.name).toEqual(promptName);
      expect(prompt.prompt).toEqual(fallback);
      expect(prompt.compile({ variable: "value" })).toEqual("fallback with variable value");
    });

    it("should return the fallback chat prompt if cache empty and fetch fails", async () => {
      const promptName = "non-existing-prompt" + Date.now();
      const fallback = [{ role: "system", content: "fallback with variable {{variable}}" }];

      // should throw without fallback
      await expect(langfuse.getPrompt(promptName)).rejects.toThrow();

      const prompt = await langfuse.getPrompt(promptName, undefined, {
        type: "chat",
        fallback,
      });

      expect(prompt.name).toEqual(promptName);
      expect(prompt.prompt).toEqual(fallback);
      expect(prompt.compile({ variable: "value" })).toEqual([
        { role: "system", content: "fallback with variable value" },
      ]);
    });

    it("should not link the prompt to a generation if it was a fallback", async () => {
      const promptName = "non-existing-prompt" + Date.now();
      const fallback = "fallback with variable {{variable}}";

      const prompt = await langfuse.getPrompt(promptName, undefined, {
        fallback,
      });

      expect(prompt.name).toEqual(promptName);
      expect(prompt.prompt).toEqual(fallback);
      expect(prompt.compile({ variable: "value" })).toEqual("fallback with variable value");

      const trace = langfuse.trace({ name: "trace-name-generation-new" });
      const generation = trace.generation({ name: "generation-name-new", prompt });

      await langfuse.flushAsync();

      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
      });

      expect(res.data).toMatchObject({
        id: generation.id,
        name: "generation-name-new",
        type: "GENERATION",
        promptId: null,
      });
    });

    it("create event without creating trace before", async () => {
      const event = langfuse.event({ name: "event-name" });
      await langfuse.flushAsync();

      // check from get api if trace is created
      const res = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${event.id}`, {
        headers: getHeaders(),
      });
      expect(res.data).toMatchObject({
        id: event.id,
        name: "event-name",
        type: "EVENT",
      });
    });

    it("sampleRate can be passed as constructor arg", () => {
      const sampleRate = 0.5;
      const langfuse = new Langfuse({ sampleRate });

      expect((langfuse as any).sampleRate).toBe(sampleRate);
    });

    it("sampleRate can be passed as environment variable", () => {
      process.env.LANGFUSE_SAMPLE_RATE = "0.5";
      const langfuse = new Langfuse();

      expect((langfuse as any).sampleRate).toBe(0.5);
      delete process.env.LANGFUSE_SAMPLE_RATE;
    });

    it("should sample trace Ids correctly", async () => {
      const traceIdOutSample = "test-trace-out-sample"; // Deterministic hash: 0.92
      const traceIdInSample = "test-trace-in-the-sample"; // Deterministic hash: 0.02

      const langfuse = new Langfuse({ sampleRate: 0.5 });
      langfuse.debug();

      const inSampleTrace = langfuse.trace({ id: traceIdInSample, name: traceIdInSample });
      inSampleTrace.span({ name: "span" });
      inSampleTrace.generation({ name: "generation" });

      const outSampleTrace = langfuse.trace({ id: traceIdOutSample, name: traceIdOutSample });
      outSampleTrace.span({ name: "span" });
      outSampleTrace.generation({ name: "generation" });

      await langfuse.flushAsync();

      expect(
        (await getAxiosClient()).get(`${LANGFUSE_BASEURL}/api/public/traces/${traceIdOutSample}`, {
          headers: getHeaders(),
        })
      ).rejects.toThrow();

      const fetchedInSampleTrace = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/traces/${traceIdInSample}`, {
        headers: getHeaders(),
      });

      expect(fetchedInSampleTrace.data.id).toBe(traceIdInSample);
    }, 10_000);

    it("should mask data in the event body", async () => {
      const mask = ({ data }: { data: any }): string =>
        typeof data === "string" && data.includes("confidential") ? "MASKED" : data;

      const langfuse = new Langfuse({ mask });
      const traceId = randomUUID();

      const trace = langfuse.trace({ id: traceId, input: "confidential data" });
      trace.update({ output: "confidential data" });

      const spanId = randomUUID();
      const span = trace.span({ id: spanId, input: "confidential data" });
      span.update({ output: "confidential data" });

      const generationId = randomUUID();
      const generation = trace.generation({ id: generationId, input: "confidential data" });
      generation.update({ output: "confidential data" });

      await langfuse.flushAsync();

      const fetchedTrace = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/traces/${traceId}`, {
        headers: getHeaders(),
      });

      expect(fetchedTrace.data.input).toEqual("MASKED");
      expect(fetchedTrace.data.output).toEqual("MASKED");

      const fetchedSpan = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${spanId}`, {
        headers: getHeaders(),
      });

      expect(fetchedSpan.data.input).toEqual("MASKED");
      expect(fetchedSpan.data.output).toEqual("MASKED");

      const fetchedGeneration = await (
        await getAxiosClient()
      ).get(`${LANGFUSE_BASEURL}/api/public/observations/${generationId}`, {
        headers: getHeaders(),
      });

      expect(fetchedGeneration.data.input).toEqual("MASKED");
      expect(fetchedGeneration.data.output).toEqual("MASKED");
    }, 10_000);
  });

  it("replace media reference string in object", async () => {
    const langfuse = new Langfuse();
    const mockTraceName = "test-trace-with-audio" + Math.random().toString(36);
    const mockAudioBytes = fs.readFileSync("./static/joke_prompt.wav"); // Simple mock audio bytes

    const trace = langfuse.trace({
      name: mockTraceName,
      metadata: {
        context: {
          nested: new LangfuseMedia({
            base64DataUri: `data:audio/wav;base64,${Buffer.from(mockAudioBytes).toString("base64")}`,
          }),
        },
      },
    });

    await langfuse.flushAsync();
    await sleep(2000);

    const res = await langfuse.fetchTrace(trace.id);

    expect(res.data).toMatchObject({
      id: trace.id,
      name: mockTraceName,
      metadata: {
        context: {
          nested: expect.stringMatching(/^@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@$/),
        },
      },
    });

    const mediaReplacedTrace = await langfuse.resolveMediaReferences({
      resolveWith: "base64DataUri",
      obj: res.data,
    });

    // Check that the replaced base64 data is the same as the original
    expect(mediaReplacedTrace.metadata.context.nested).toEqual(
      "data:audio/wav;base64," + Buffer.from(mockAudioBytes).toString("base64")
    );

    // Double check: reference strings must be the same if data URI is reused
    const trace2 = langfuse.trace({
      name: "2-" + mockTraceName,
      metadata: {
        context: {
          nested: mediaReplacedTrace.metadata.context.nested,
        },
      },
    });

    await langfuse.flushAsync();

    const res2 = await (
      await getAxiosClient()
    ).get(`${LANGFUSE_BASEURL}/api/public/traces/${trace2.id}`, {
      headers: getHeaders(),
    });
    expect(res2.data).toMatchObject({
      id: trace2.id,
      name: "2-" + mockTraceName,
      metadata: {
        context: {
          nested: res.data.metadata.context.nested,
        },
      },
    });
  }, 20_000);
});
