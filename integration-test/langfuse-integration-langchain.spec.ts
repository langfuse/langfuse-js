import { ConversationChain } from "langchain/chains";

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI, OpenAI } from "@langchain/openai";

import { CallbackHandler, Langfuse, type LlmMessage } from "../langfuse-langchain";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";

import { getHeaders, getTrace, LANGFUSE_BASEURL, LANGFUSE_PUBLIC_KEY } from "./integration-utils";

describe("Langchain", () => {
  jest.setTimeout(30_000);
  jest.useRealTimers();

  // describe("setup", () => {
  //   it("instantiates with env variables", async () => {
  //     const callback = new CallbackHandler();
  //     const options = callback.langfuse._getFetchOptions({ method: "POST", body: "test" });
  //     expect(callback.langfuse.baseUrl).toEqual(LANGFUSE_BASEURL);
  //     expect(options).toMatchObject({
  //       headers: {
  //         "Content-Type": "application/json",
  //         "X-Langfuse-Sdk-Name": "langfuse-js",
  //         "X-Langfuse-Sdk-Variant": "langfuse",
  //         "X-Langfuse-Public-Key": LANGFUSE_PUBLIC_KEY,
  //         ...getHeaders(),
  //       },
  //       body: "test",
  //     });
  //   });

  //   it("instantiates with constructor variables", async () => {
  //     const callback = new CallbackHandler({
  //       publicKey: "test-pk",
  //       secretKey: "test-sk",
  //       baseUrl: "http://example.com",
  //     });

  //     const options = callback.langfuse._getFetchOptions({ method: "POST", body: "test" });

  //     expect(callback.langfuse.baseUrl).toEqual("http://example.com");
  //     expect(options).toMatchObject({
  //       headers: {
  //         "Content-Type": "application/json",
  //         "X-Langfuse-Sdk-Name": "langfuse-js",
  //         "X-Langfuse-Sdk-Variant": "langfuse",
  //         "X-Langfuse-Public-Key": "test-pk",
  //         ...getHeaders("test-pk", "test-sk"),
  //       },
  //       body: "test",
  //     });
  //   });

  //   it("instantiates with without mandatory variables", async () => {
  //     const LANGFUSE_PUBLIC_KEY = String(process.env.LANGFUSE_PUBLIC_KEY);
  //     const LANGFUSE_SECRET_KEY = String(process.env.LANGFUSE_SECRET_KEY);
  //     const LANGFUSE_BASEURL = String(process.env.LANGFUSE_BASEURL);

  //     delete process.env.LANGFUSE_PUBLIC_KEY;
  //     delete process.env.LANGFUSE_SECRET_KEY;
  //     delete process.env.LANGFUSE_BASEURL;

  //     expect(() => new CallbackHandler()).toThrow();

  //     process.env.LANGFUSE_PUBLIC_KEY = LANGFUSE_PUBLIC_KEY;
  //     process.env.LANGFUSE_SECRET_KEY = LANGFUSE_SECRET_KEY;
  //     process.env.LANGFUSE_BASEURL = LANGFUSE_BASEURL;
  //   });
  // });

  describe("chains", () => {
    it("should execute simple llm call", async () => {
      const handler = new CallbackHandler({
        sessionId: "test-session",
        userId: "test-user",
        metadata: {
          foo: "bar",
          array: ["a", "b"],
        },
        tags: ["test-tag", "test-tag-2"],
        version: "1.0.0",
      });
      handler.debug(true);
      const llm = new ChatOpenAI({ modelName: "gpt-4-turbo-preview" });
      const res = await llm.invoke("Tell me a joke", { callbacks: [handler] });
      await handler.flushAsync();

      expect(res).toBeDefined();

      expect(handler.traceId).toBeDefined();
      const trace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.sessionId).toBe("test-session");
      expect(trace?.userId).toBe("test-user");
      expect(trace?.metadata).toMatchObject({
        foo: "bar",
        array: ["a", "b"],
      });
      expect(trace?.tags).toMatchObject(["test-tag", "test-tag-2"]);
      expect(trace?.version).toBe("1.0.0");
      expect(trace?.observations.length).toBe(1);

      const rootLevelObservation = trace?.observations.filter((o) => !o.parentObservationId)[0];
      expect(rootLevelObservation).toBeDefined();
      expect(trace?.input).toStrictEqual(rootLevelObservation?.input);
      expect(trace?.output).toStrictEqual(rootLevelObservation?.output);
      expect(rootLevelObservation?.version).toBe("1.0.0");

      const generation = trace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation?.length).toBe(1);
      expect(generation?.[0].name).toBe("ChatOpenAI");
      expect(generation?.[0].usage?.input).toBeDefined();
      expect(generation?.[0].version).toBe("1.0.0");

      const input = generation?.[0].input;
      expect(input).toBeDefined();
      expect(typeof input).toBe("object");
      expect(Array.isArray(input)).toBe(true);
      if (typeof input === "object" && input !== null && Array.isArray(input)) {
        expect(input.every((input) => isChatMessage(input))).toBe(true);
      }

      const output = generation?.[0].output;
      console.log(output);
      expect(output).toBeDefined();
      expect(typeof output).toBe("object");
      if (typeof output === "object" && output !== null) {
        expect(isChatMessage(output)).toBe(true);
      }

      expect(generation?.[0].usage?.output).toBeDefined();
      expect(generation?.[0].usage?.total).toBeDefined();
    });

    it("should execute simple non chat llm call", async () => {
      const handler = new CallbackHandler({});
      const llm = new OpenAI({ modelName: "gpt-4-1106-preview", maxTokens: 20 });
      const res = await llm.invoke("Tell me a joke on a non chat api", { callbacks: [handler] });
      const traceId = handler.traceId;
      await handler.flushAsync();

      expect(res).toBeDefined();
      expect(traceId).toBeDefined();
      const trace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.observations.length).toBe(1);

      const rootLevelObservation = trace?.observations.filter((o) => !o.parentObservationId)[0];
      expect(rootLevelObservation).toBeDefined();
      expect(trace?.input).toStrictEqual(rootLevelObservation?.input);
      expect(trace?.output).toStrictEqual(rootLevelObservation?.output);

      const generation = trace?.observations.filter((o) => o.type === "GENERATION");

      expect(generation?.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const singleGeneration = generation![0];

      expect(singleGeneration.name).toBe("OpenAIChat");
      expect(singleGeneration.input).toMatchObject(["Tell me a joke on a non chat api"]);
      expect(singleGeneration.usage?.input).toBeDefined();
      expect(singleGeneration.usage?.output).toBeDefined();
      expect(singleGeneration.usage?.total).toBeDefined();
      expect(singleGeneration.startTime).toBeDefined();
      expect(singleGeneration.endTime).toBeDefined();

      const startTime = new Date(singleGeneration.startTime);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const endTime = new Date(singleGeneration.endTime!);

      expect(startTime).toBeInstanceOf(Date);
      expect(endTime).toBeInstanceOf(Date);

      expect(startTime.getTime()).toBeLessThanOrEqual(endTime.getTime());
    });

    it("should execute simple streaming llm call (debug)", async () => {
      const handler = new CallbackHandler({
        sessionId: "test-session",
      });
      handler.debug(true);
      const llm = new ChatOpenAI({ streaming: true });
      const res = await llm.invoke("Tell me a streaming chat joke", { callbacks: [handler] });
      await handler.flushAsync();

      expect(res).toBeDefined();

      expect(handler.traceId).toBeDefined();
      const trace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.sessionId).toBe("test-session");
      expect(trace?.observations.length).toBe(1);

      const rootLevelObservation = trace?.observations.filter((o) => !o.parentObservationId)[0];
      expect(rootLevelObservation).toBeDefined();
      expect(trace?.input).toStrictEqual(rootLevelObservation?.input);
      expect(trace?.output).toStrictEqual(rootLevelObservation?.output);

      const generation = trace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation?.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const singleGeneration = generation![0];

      expect(singleGeneration.name).toBe("ChatOpenAI");
      expect(singleGeneration.input).toMatchObject([
        {
          content: "Tell me a streaming chat joke",
          role: "user",
        },
      ]);
      console.warn(singleGeneration.output);
      expect(singleGeneration.output).toMatchObject({
        content: expect.any(String),
      });
      expect(singleGeneration.usage?.input).toBeDefined();
      expect(singleGeneration.usage?.output).toBeDefined();
      expect(singleGeneration.usage?.total).toBeDefined();
      expect(singleGeneration.startTime).toBeDefined();
      expect(singleGeneration.endTime).toBeDefined();
      expect(singleGeneration.completionStartTime).toBeDefined();

      const startTime = new Date(singleGeneration.startTime);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const endTime = new Date(singleGeneration.endTime!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const completionStartTime = new Date(singleGeneration.completionStartTime!);

      expect(startTime).toBeInstanceOf(Date);
      expect(endTime).toBeInstanceOf(Date);
      expect(completionStartTime).toBeInstanceOf(Date);

      expect(startTime.getTime()).toBeLessThanOrEqual(endTime.getTime());
      expect(startTime.getTime()).toBeLessThanOrEqual(completionStartTime.getTime());
      expect(completionStartTime.getTime()).toBeLessThanOrEqual(endTime.getTime());
    });

    it("should execute tool call", async () => {
      const langfuse = new Langfuse();
      const initialTrace = langfuse.trace({ name: "wikipedia-test" });

      const handler = new CallbackHandler({ root: initialTrace });
      handler.debug(true);

      const tool = new WikipediaQueryRun({
        topKResults: 3,
        maxDocContentLength: 4000,
      });

      const res = await tool.invoke("Langchain", { callbacks: [handler] });

      await handler.flushAsync();

      expect(res).toBeDefined();

      expect(handler.traceId).toBeDefined();

      const trace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.observations.length).toBe(1);

      const rootLevelObservation = trace?.observations.filter((o) => !o.parentObservationId)[0];
      expect(rootLevelObservation).toBeDefined();

      const generation = trace?.observations.filter((o) => o.type === "SPAN");
      expect(generation?.length).toBe(1);
      expect(generation?.[0].name).toBe("WikipediaQueryRun");
      expect(generation?.[0].input).toBe("Langchain");
    });

    it("should execute simple llm call twice on two different traces", async () => {
      const handler = new CallbackHandler({
        sessionId: "test-session",
      });
      const llm = new ChatOpenAI({ streaming: true });
      await llm.invoke("Tell me a joke", { callbacks: [handler] });
      const traceIdOne = handler.getTraceId();
      await llm.invoke("Tell me a joke", { callbacks: [handler] });
      const traceIdTwo = handler.getTraceId();

      await handler.flushAsync();

      expect(handler.traceId).toBeDefined();
      expect(traceIdOne).toBeDefined();
      expect(traceIdTwo).toBeDefined();
      const traceOne = traceIdOne ? await getTrace(traceIdOne) : undefined;
      const traceTwo = traceIdTwo ? await getTrace(traceIdTwo) : undefined;

      expect(traceOne).toBeDefined();
      expect(traceTwo).toBeDefined();

      expect(traceOne?.id).toBe(traceIdOne);
      expect(traceTwo?.id).toBe(traceIdTwo);
    });
    // Could add Anthropic or other models here as well
    it.each([["ChatOpenAI"]])("should execute llm chain with '%s' ", async (llm: string) => {
      const handler = new CallbackHandler();
      const model = (): ChatOpenAI => {
        if (llm === "ChatOpenAI") {
          return new ChatOpenAI({ temperature: 0 });
        }

        throw new Error("Invalid LLM");
      };

      const extractedModel = (): string => {
        if (llm === "OpenAI") {
          return "OpenAI";
        }
        if (llm === "ChatAnthropic") {
          return "ChatAnthropic";
        }
        if (llm === "ChatOpenAI") {
          return "ChatOpenAI";
        }
        throw new Error("Invalid LLM");
      };

      const template = "What is the capital city of {country}?";
      const prompt = new PromptTemplate({ template, inputVariables: ["country"] });
      // create a chain that takes the user input, format it and then sends to LLM
      const chain = prompt.pipe(model());
      // run the chain by passing the input
      await chain.invoke({ country: "France" }, { callbacks: [handler] });

      await handler.flushAsync();

      expect(handler.traceId).toBeDefined();
      const trace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.observations.length).toBe(3);

      const rootLevelObservation = trace?.observations.filter((o) => !o.parentObservationId)[0];
      expect(rootLevelObservation).toBeDefined();
      expect(rootLevelObservation?.input).toBeDefined();
      expect(rootLevelObservation?.output).toBeDefined();
      expect(trace?.input).toStrictEqual(rootLevelObservation?.input);
      expect(trace?.output).toStrictEqual(rootLevelObservation?.output);

      const generation = trace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation).toBeDefined();
      expect(generation?.length).toBe(1);

      if (generation) {
        expect(generation[0].name).toBe(extractedModel());
        expect(generation?.[0].usage?.input).toBeDefined();
        expect(generation?.[0].usage?.output).toBeDefined();
        expect(generation?.[0].usage?.total).toBeDefined();
      }

      const spans = trace?.observations.filter((o) => o.type === "SPAN");
      expect(spans?.length).toBe(2);
      // if (spans) {
      //   expect(handler.getLangchainRunId()).toBe(spans[0].id);
      // }
      expect(handler.getTraceId()).toBe(handler.traceId);
    });

    it("conversation chain should pass", async () => {
      const handler = new CallbackHandler({
        sessionId: "test-session",
      });
      const model = new ChatOpenAI({});
      const chain = new ConversationChain({ llm: model, callbacks: [handler] });
      await chain.call({ input: "Hi! I'm Jim." }, { callbacks: [handler] });

      await handler.shutdownAsync();

      expect(handler.traceId).toBeDefined();
      const trace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.sessionId).toBe("test-session");
      expect(trace?.observations.length).toBe(2);
      const generation = trace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation).toBeDefined();
      expect(generation?.length).toBe(1);
    });

    it("function calls", async () => {
      const callback = new CallbackHandler();

      const zodSchema = z.object({
        "person-name": z.string().optional(),
        "person-age": z.number().optional(),
        "person-hair_color": z.string().optional(),
        "dog-name": z.string().optional(),
        "dog-breed": z.string().optional(),
      });

      const extractionFunctionSchema = {
        name: "extractor",
        description: "Extracts fields from the input.",
        parameters: zodToJsonSchema(zodSchema),
      };

      const chain = new ChatOpenAI({
        temperature: 0,
      }).bind({
        functions: [extractionFunctionSchema],
        function_call: { name: "extractor" },
      });

      console.log(
        await chain.invoke(
          `Alex is 5 feet tall. Claudia is 4 feet taller Alex and jumps higher than him. Claudia is a brunette and Alex is blonde.
      Alex's dog Frosty is a labrador and likes to play hide and seek.`,
          { callbacks: [callback] }
        )
      );
      await callback.flushAsync();
      expect(callback.traceId).toBeDefined();
      const trace = callback.traceId ? await getTrace(callback.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.observations.length).toBe(1);
      const generations = trace?.observations.filter((o) => o.type === "GENERATION");
      expect(generations).toBeDefined();
      expect(generations?.length).toBe(1);
    });

    it("create trace for callback", async () => {
      const langfuse = new Langfuse();

      const trace = langfuse.trace({ name: "test-123" });

      const handler = new CallbackHandler({ root: trace });

      const llm = new ChatOpenAI({ streaming: true });
      const res = await llm.invoke("Tell me a joke", { callbacks: [handler] });
      await handler.flushAsync();
      expect(res).toBeDefined();

      expect(handler.traceId).toBeDefined();
      const returnedTrace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(returnedTrace).toBeDefined();
      expect(returnedTrace?.name).toBe("test-123");
      expect(returnedTrace?.input).toBeNull();
      expect(returnedTrace?.output).toBeNull();
      expect(returnedTrace?.observations.length).toBe(1);
      const generation = returnedTrace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation?.length).toBe(1);
      expect(generation?.[0].name).toBe("ChatOpenAI");
    });

    it("create trace for callback and sets the correct name if specified", async () => {
      const langfuse = new Langfuse();
      const trace = langfuse.trace({ name: "test-123" });
      const handler = new CallbackHandler({ root: trace });

      const model = new ChatOpenAI();

      const prompt = PromptTemplate.fromTemplate("What is a good name for a company that makes {product}?");
      const promptName = "Ice cream prompt";
      prompt.name = promptName;

      const chain = prompt.pipe(model);
      const res = await chain.invoke(
        {
          product: "ice cream",
        },
        { callbacks: [handler] }
      );

      await handler.flushAsync();
      expect(res).toBeDefined();

      expect(handler.traceId).toBeDefined();
      const returnedTrace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(returnedTrace).toBeDefined();
      expect(returnedTrace?.name).toBe("test-123");
      expect(returnedTrace?.input).toBeNull();
      expect(returnedTrace?.output).toBeNull();
      expect(returnedTrace?.observations.length).toBe(3);

      // An observation with the correct name should be present
      expect(returnedTrace?.observations?.some((obs) => obs.name === promptName)).toBe(true);
    });

    it("create span for callback", async () => {
      const langfuse = new Langfuse();

      const trace = langfuse.trace({ name: "test-trace" });
      const span = trace.span({ name: "test-span" });

      const handler = new CallbackHandler({ root: span });

      const llm = new ChatOpenAI({});
      const res = await llm.invoke("Tell me a joke", { callbacks: [handler] });
      await handler.flushAsync();

      expect(res).toBeDefined();

      expect(handler.traceId).toBeDefined();
      const returnedTrace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(returnedTrace).toBeDefined();
      expect(returnedTrace?.name).toBe("test-trace");
      expect(returnedTrace?.input).toBeNull();
      expect(returnedTrace?.output).toBeNull();
      expect(returnedTrace?.observations.length).toBe(2);
      const generation = returnedTrace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation?.length).toBe(1);
      expect(generation?.[0].name).toBe("ChatOpenAI");
      expect(handler.getLangchainRunId()).toBe(generation?.[0].id);
      const returnedSpan = returnedTrace?.observations.filter((o) => o.type === "SPAN");
      expect(returnedSpan?.length).toBe(1);
      expect(returnedSpan?.[0].name).toBe("test-span");
      expect(returnedSpan?.[0].input).toBeNull();
      expect(returnedSpan?.[0].output).toBeNull();

      expect(handler.getTraceId()).toBe(returnedTrace?.id);

      await llm.invoke("Tell me a better", { callbacks: [handler] });
      await handler.flushAsync();

      const newTrace = handler.traceId ? await getTrace(handler.traceId) : undefined;

      expect(newTrace).toBeDefined();
      expect(handler.getTraceId()).toBe(returnedTrace?.id);
      expect(newTrace?.id).toBe(returnedTrace?.id);

      console.log(JSON.stringify(newTrace?.observations));

      const returnedNewGeneration = newTrace?.observations.filter((o) => o.type === "GENERATION");
      expect(returnedNewGeneration?.length).toBe(2);
      // Returned observations within traces are currently not sorted, so we can't guarantee the order of the returned observations
      expect(returnedNewGeneration?.some((gen) => gen.id === handler.getLangchainRunId())).toBe(true);
    });
  });
});

const isChatMessage = (message: unknown): message is LlmMessage => {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    typeof message.role === "string" &&
    "content" in message &&
    typeof message.content === "string"
  );
};
