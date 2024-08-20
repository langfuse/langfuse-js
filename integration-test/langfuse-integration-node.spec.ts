// uses the compiled node.js version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse-node";

// import { wait } from '../langfuse-core/test/test-utils/test-utils'
import axios from "axios";
import { LANGFUSE_BASEURL, getHeaders } from "./integration-utils";
import { utils } from "../langfuse-core/src";
import exp from "constants";

describe("Langfuse Node.js", () => {
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
          "X-Langfuse-Sdk-Variant": "langfuse-node",
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
          "X-Langfuse-Sdk-Variant": "langfuse-node",
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
      const trace = langfuse.trace({ name: "trace-name", tags: ["tag1", "tag2"] });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/traces/${trace.id}`, {
        headers: getHeaders(),
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
      });
      span.update({
        version: "1.0.0",
      });
      span.end();
      await langfuse.flushAsync();

      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${span.id}`, { headers: getHeaders() });

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
      const returnedGeneration = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
        headers: getHeaders(),
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

      const returnedSpan = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${span.id}`, {
        headers: getHeaders(),
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
        output: "Hello world",
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

      const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/prompts/?name=${promptName}`, {
        headers: getHeaders(),
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

    const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/prompts/?name=${promptName}`, {
      headers: getHeaders(),
    });

    expect(res.data).toMatchObject({
      name: promptName,
      prompt: "This is a prompt with a {{variable}}",
      isActive: true,
      version: expect.any(Number),
    });

    const observation = await axios.get(`${LANGFUSE_BASEURL}/api/public/observations/${generation.id}`, {
      headers: getHeaders(),
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
    expect(prompt.config).toEqual({});
    const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/prompts/?name=${promptName}`, {
      headers: getHeaders(),
    });
    expect(res.data).toMatchObject({
      name: promptName,
      prompt: "This is a prompt with a {{wrongVariable}}",
      isActive: true,
      version: expect.any(Number),
    });
  });

  it("create and get a prompt with a config", async () => {
    const promptName = "test-prompt" + Math.random().toString(36);

    await langfuse.createPrompt({
      name: promptName,
      prompt: "This is a prompt with a config",
      isActive: true,
      config: {
        temperature: 0.5,
      },
    });

    const prompt = await langfuse.getPrompt(promptName, 1);
    expect(prompt.config).toEqual({ temperature: 0.5 });
    const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/prompts/?name=${promptName}`, {
      headers: getHeaders(),
    });
    expect(res.data).toMatchObject({
      name: promptName,
      prompt: "This is a prompt with a config",
      isActive: true,
      version: expect.any(Number),
      config: {
        temperature: 0.5,
      },
    });
  });

  it("create a prompt with nullish config and get a prompt with an empty config", async () => {
    const promptName = "test-prompt" + Math.random().toString(36);
    await langfuse.createPrompt({
      name: promptName,
      prompt: "This is a prompt with a nullish config",
      isActive: true,
      config: null,
    });

    const prompt = await langfuse.getPrompt(promptName, 1);
    expect(prompt.config).toEqual({});
    const res = await axios.get(`${LANGFUSE_BASEURL}/api/public/prompts/?name=${promptName}`, {
      headers: getHeaders(),
    });
    expect(res.data).toMatchObject({
      name: promptName,
      prompt: "This is a prompt with a nullish config",
      isActive: true,
      version: expect.any(Number),
      config: {},
    });
  });

  it("create and fetch traces", async () => {
    const name = utils.generateUUID();
    const trace = langfuse.trace({
      name,
      sessionId: "session-123",
      input: { key: "value" },
      output: "output-value",
    });
    await langfuse.flushAsync();

    const traces = await langfuse.fetchTraces({ name });
    expect(traces.data).toContainEqual(expect.objectContaining({ id: trace.id, name }));

    const fetchedTrace = await langfuse.fetchTrace(trace.id);
    expect(fetchedTrace.data).toMatchObject({
      id: trace.id,
      name,
      sessionId: "session-123",
      input: { key: "value" },
      output: "output-value",
    });
  });

  it("create and fetch scores", async () => {
    const traceName = utils.generateUUID();
    const trace = langfuse.trace({
      name: traceName,
    });
    const score = trace.score({
      name: "quality",
      value: 1,
      comment: "Factually correct",
    });
    await langfuse.flushAsync();

    const scores = await langfuse.fetchScores({ name: "quality" });
    expect(scores.data).toContainEqual(expect.objectContaining({ traceId: score.id, name: "quality" }));
  });

  it("create and fetch score by id", async () => {
    const traceName = utils.generateUUID();
    const trace = langfuse.trace({
      name: traceName,
    });
    trace.score({
      name: "harmfulness",
      value: 0.5,
    });
    trace.score({
      name: "quality",
      value: 1,
      comment: "Factually correct",
    });
    trace.score({
      name: "relevance",
      value: 0.8,
      comment: "Mostly relevant",
    });

    await langfuse.flushAsync();
    const scores = await langfuse.fetchScores();
    const score1 = scores.data[2];
    const score2 = scores.data[1];
    console.log("ScoreId", score1.id);
    const fetchedScore1 = await langfuse.fetchScore(score1.id);
    console.log("ScoreData", fetchedScore1.data);
    expect(fetchedScore1.data).toContainEqual(
      expect.objectContaining({ traceId: trace.id, name: "harmfulness", value: 0.5 })
    );
    const fetchedScore2 = await langfuse.fetchScore(score2.id);
    expect(fetchedScore2.data).toContainEqual(
      expect.objectContaining({
        traceId: trace.id,
        name: "quality",
        value: 1,
        comment: "Factually correct",
      })
    );
  });

  it("create 3 traces with different timestamps and fetch the middle one using to and from timestamp", async () => {
    const traceName = utils.generateUUID();
    const traceParams = [
      { id: utils.generateUUID(), timestamp: new Date(Date.now() - 10000) }, // 10 seconds ago
      { id: utils.generateUUID(), timestamp: new Date(Date.now() - 5000) }, // 5 seconds ago
      { id: utils.generateUUID(), timestamp: new Date(Date.now()) }, // now
    ];

    // Create 3 traces with different timestamps
    traceParams.forEach((traceParam) => {
      langfuse.trace({
        id: traceParam.id,
        name: traceName,
        sessionId: "session-1",
        input: { key: "value" },
        output: "output-value",
        timestamp: traceParam.timestamp,
      });
    });
    await langfuse.flushAsync();

    // Fetch traces with a time range that should only include the middle trace
    const fromTimestamp = new Date(Date.now() - 7500); // 7.5 seconds ago
    const toTimestamp = new Date(Date.now() - 2500); // 2.5 seconds ago

    const fetchedTraces = await langfuse.fetchTraces({
      fromTimestamp: fromTimestamp,
      toTimestamp: toTimestamp,
      name: traceName,
    });

    expect(fetchedTraces.data).toHaveLength(1);
    expect(fetchedTraces.data[0]).toMatchObject({
      name: traceName,
      sessionId: "session-1",
      input: { key: "value" },
      output: "output-value",
      timestamp: traceParams[1].timestamp.toISOString(),
    });
  });

  it("create and fetch observations", async () => {
    const traceName = utils.generateUUID();
    const observationName = utils.generateUUID();
    const trace = langfuse.trace({
      name: traceName,
    });
    const observation = trace.generation({
      name: observationName,
      input: "observation-value",
    });
    await langfuse.flushAsync();

    const observations = await langfuse.fetchObservations({ name: observationName });
    expect(observations.data).toContainEqual(expect.objectContaining({ id: observation.id, name: observationName }));

    const fetchedObservation = await langfuse.fetchObservation(observation.id);
    expect(fetchedObservation.data).toMatchObject({
      id: observation.id,
      name: observationName,
      input: "observation-value",
    });
  });

  it("create and fetch a session", async () => {
    const traceName = utils.generateUUID();
    const sessionId = utils.generateUUID();
    langfuse.trace({
      name: traceName,
      sessionId,
    });
    await langfuse.flushAsync();

    const sessions = await langfuse.fetchSessions();
    expect(sessions.data).toContainEqual(expect.objectContaining({ id: sessionId }));
  });

  it("create and fetch prompts", async () => {
    const promptName1 = utils.generateUUID();
    const promptName2 = utils.generateUUID();
    const promptName3 = utils.generateUUID();

    // Create multiple prompts
    await langfuse.createPrompt({
      name: promptName1,
      prompt: "This is prompt 1",
    });
    await langfuse.createPrompt({
      name: promptName2,
      prompt: "This is prompt 2",
    });
    await langfuse.createPrompt({
      name: promptName3,
      prompt: "This is prompt 3",
    });

    // Create multiple versions of the same prompt
    await langfuse.createPrompt({
      name: promptName1,
      prompt: "This is prompt 1 version 2",
    });
    await langfuse.createPrompt({
      name: promptName1,
      prompt: "This is prompt 1 version 3",
    });

    const prompts = await langfuse.fetchPrompts();
    expect(prompts.data).toContainEqual(expect.objectContaining({ name: promptName1 }));
    expect(prompts.data).toContainEqual(expect.objectContaining({ name: promptName2 }));
    expect(prompts.data).toContainEqual(expect.objectContaining({ name: promptName3 }));

    // Fetch specific versions of the prompt
    const prompt1Version1 = await langfuse.getPrompt(promptName1, 1);
    const prompt1Version2 = await langfuse.getPrompt(promptName1, 2);
    const prompt1Version3 = await langfuse.getPrompt(promptName1, 3);

    expect(prompt1Version1.prompt).toEqual("This is prompt 1");
    expect(prompt1Version2.prompt).toEqual("This is prompt 1 version 2");
    expect(prompt1Version3.prompt).toEqual("This is prompt 1 version 3");
  });
});
