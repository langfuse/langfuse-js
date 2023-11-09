// uses the compiled node.js version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse-node";

// import { wait } from '../langfuse-core/test/test-utils/test-utils'
import axios from "axios";

const LANGFUSE_HOST = process.env.LANGFUSE_HOST ?? "http://localhost:3000";
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? "pk-lf-1234567890";
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? "sk-lf-1234567890";

const getHeaders = {
  Authorization: "Basic " + Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64"),
};

describe("Langfuse Node.js", () => {
  let langfuse: Langfuse;
  // jest.setTimeout(100000)
  jest.useRealTimers();

  beforeEach(() => {
    langfuse = new Langfuse({
      publicKey: LANGFUSE_PUBLIC_KEY,
      secretKey: LANGFUSE_SECRET_KEY,
      baseUrl: LANGFUSE_HOST,
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
        .get(LANGFUSE_HOST + "/api/public/health", { headers: getHeaders })
        .then((res) => res.data)
        .catch((err) => console.log(err));
      expect(res).toMatchObject({ status: "OK" });
    });

    it("create trace", async () => {
      const trace = langfuse.trace({ name: "trace-name" });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/traces/${trace.id}`, {
        headers: getHeaders,
      });
      expect(res.data).toMatchObject({ id: trace.id, name: "trace-name" });
    });

    it("update a trace", async () => {
      const trace = langfuse.trace({
        name: "test-trace-10",
      });
      trace.update({
        version: "1.0.0",
      });
      await langfuse.flushAsync();

      const res = await axios.get(`${LANGFUSE_HOST}/api/public/traces/${trace.id}`, { headers: getHeaders });

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
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${span.id}`, { headers: getHeaders });
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

      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${span.id}`, { headers: getHeaders });

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
        prompt: {
          text: "prompt",
        },
        completion: {
          foo: "bar",
        },
      });

      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${generation.id}`, { headers: getHeaders });
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
        prompt: [
          {
            text: "prompt",
          },
        ],
        completion: [
          {
            foo: "bar",
          },
        ],
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${generation.id}`, { headers: getHeaders });
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
        prompt: "prompt",
        completion: "completion",
      });
      await langfuse.flushAsync();
      // check from get api if trace is created
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${generation.id}`, { headers: getHeaders });
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
        completion: "Hello world",
        usage: {
          promptTokens: 10,
          completionTokens: 15,
        },
      });

      await langfuse.flushAsync();

      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${generation.id}`, { headers: getHeaders });

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
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${event.id}`, { headers: getHeaders });
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
      const res = await axios.get(`${LANGFUSE_HOST}/api/public/observations/${event.id}`, { headers: getHeaders });
      expect(res.data).toMatchObject({
        id: event.id,
        name: "event-name",
        type: "EVENT",
      });
    });
  });
});
