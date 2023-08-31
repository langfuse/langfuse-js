// uses the compiled node.js version, run yarn build after making changes to the SDKs
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { ConversationChain, LLMChain } from "langchain/chains";
import { CallbackHandler } from "../src/callback";
import { LF_HOST, LF_PUBLIC_KEY, LF_SECRET_KEY, getTraces } from "../../integration-test/integration-utils";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { ChatAnthropic } from "langchain/chat_models/anthropic";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RetrievalQAChain } from "langchain/chains";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { z } from "zod";
import { createExtractionChainFromZod } from "langchain/chains";

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || "";

describe("simple chains", () => {
  jest.setTimeout(30_000);
  jest.useRealTimers();

  it("should execute simple llm call", async () => {
    const handler = new CallbackHandler({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      baseUrl: LF_HOST,
    });
    const llm = new OpenAI({});
    const res = await llm.call("Tell me a joke", { callbacks: [handler] });
    await handler.flushAsync();
    expect(res).toBeDefined();

    expect(handler.traceId).toBeDefined();
    const trace = handler.traceId ? await getTraces(handler.traceId) : undefined;

    expect(trace).toBeDefined();
    expect(trace?.observations.length).toBe(1);
    const generation = trace?.observations.filter((o) => o.type === "GENERATION");
    expect(generation?.length).toBe(1);
    expect(generation?.[0].name).toBe("OpenAI");
  });

  it.each([["OpenAI"], ["ChatOpenAI"], ["ChatAnthropic"]])(
    "should execute llm chain with '%s' ",
    async (llm: string) => {
      const handler = new CallbackHandler({
        publicKey: LF_PUBLIC_KEY,
        secretKey: LF_SECRET_KEY,
        baseUrl: LF_HOST,
      });
      const model = (): OpenAI | ChatOpenAI | ChatAnthropic => {
        if (llm === "OpenAI") {
          return new OpenAI({ temperature: 0 });
        }
        if (llm === "ChatOpenAI") {
          return new ChatOpenAI({ temperature: 0 });
        }
        if (llm === "ChatAnthropic") {
          return new ChatAnthropic({ temperature: 0 });
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
      const chain = new LLMChain({ llm: model(), prompt });
      // run the chain by passing the input
      await chain.call({ country: "France" }, { callbacks: [handler] });

      await handler.flushAsync();

      expect(handler.traceId).toBeDefined();
      const trace = handler.traceId ? await getTraces(handler.traceId) : undefined;

      expect(trace).toBeDefined();
      expect(trace?.observations.length).toBe(2);
      const generation = trace?.observations.filter((o) => o.type === "GENERATION");
      expect(generation).toBeDefined();
      expect(generation?.length).toBe(1);

      if (generation) {
        expect(generation[0].name).toBe(extractedModel());
        expect(generation[0].promptTokens).toBeDefined();
        expect(generation[0].completionTokens).toBeDefined();
        expect(generation[0].totalTokens).toBeDefined();
      }
    }
  );

  it("conversation chain should pass", async () => {
    const handler = new CallbackHandler({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      baseUrl: LF_HOST,
    });
    const model = new OpenAI({});
    const chain = new ConversationChain({ llm: model });
    const res1 = await chain.call({ input: "Hi! I'm Jim." }, { callbacks: [handler] });
    console.log({ res1 });

    const res2 = await chain.call({ input: "What's my name?" }, { callbacks: [handler] });
    console.log({ res2 });

    await handler.flushAsync();

    expect(handler.traceId).toBeDefined();
    const trace = handler.traceId ? await getTraces(handler.traceId) : undefined;

    expect(trace).toBeDefined();
    expect(trace?.observations.length).toBe(4);
    const generation = trace?.observations.filter((o) => o.type === "GENERATION");
    expect(generation).toBeDefined();
    expect(generation?.length).toBe(2);
  });

  it("should trace agents", async () => {
    const handler = new CallbackHandler({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      baseUrl: LF_HOST,
    });

    const model = new OpenAI({ temperature: 0 });
    // A tool is a function that performs a specific duty
    // SerpAPI for example accesses google search results in real-time
    const tools = [new SerpAPI(SERPAPI_API_KEY), new Calculator()];

    const executor = await initializeAgentExecutorWithOptions(tools, model);
    console.log("Loaded agent.");

    const input = `What are the total number of countries in Africa raised to the power of 3?`;

    console.log(`Executing with input "${input}"...`);

    const result = await executor.call({ input }, { callbacks: [handler] });

    console.log(`Got output ${result.output}`);

    await handler.flushAsync();
  });

  it("should execute QA retrieval", async () => {
    const callback = new CallbackHandler({ publicKey: LF_PUBLIC_KEY, secretKey: LF_SECRET_KEY, baseUrl: LF_HOST });
    // load docs
    const loader = new TextLoader("../static/state_of_the_union.txt");
    const docs = await loader.load();

    // split docs
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 0,
    });

    const splitDocs = await textSplitter.splitDocuments(docs);

    // // calc embeddings
    const embeddings = new OpenAIEmbeddings();

    const vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);

    // // retrieval chain
    const model = new ChatOpenAI({ modelName: "gpt-3.5-turbo" });
    const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

    const response = await chain.call(
      {
        query: "What is the state of the United States?",
      },
      { callbacks: [callback] }
    );
    console.log(response);
    await callback.flushAsync();

    expect(callback.traceId).toBeDefined();
    const trace = callback.traceId ? await getTraces(callback.traceId) : undefined;

    expect(trace).toBeDefined();
    expect(trace?.observations.length).toBe(2);
    const generations = trace?.observations.filter((o) => o.type === "GENERATION");
    expect(generations).toBeDefined();
    expect(generations?.length).toBe(1);
  });

  it("function calls", async () => {
    const callback = new CallbackHandler({ publicKey: LF_PUBLIC_KEY, secretKey: LF_SECRET_KEY, baseUrl: LF_HOST });

    const zodSchema = z.object({
      "person-name": z.string().optional(),
      "person-age": z.number().optional(),
      "person-hair_color": z.string().optional(),
      "dog-name": z.string().optional(),
      "dog-breed": z.string().optional(),
    });
    const chatModel = new ChatOpenAI({
      temperature: 0,
    });
    const chain = createExtractionChainFromZod(zodSchema, chatModel);
    console.log(
      await chain.run(
        `Alex is 5 feet tall. Claudia is 4 feet taller Alex and jumps higher than him. Claudia is a brunette and Alex is blonde.
    Alex's dog Frosty is a labrador and likes to play hide and seek.`,
        { callbacks: [callback] }
      )
    );
    await callback.flushAsync();
    expect(callback.traceId).toBeDefined();
    const trace = callback.traceId ? await getTraces(callback.traceId) : undefined;

    expect(trace).toBeDefined();
    expect(trace?.observations.length).toBe(2);
    const generations = trace?.observations.filter((o) => o.type === "GENERATION");
    expect(generations).toBeDefined();
    expect(generations?.length).toBe(1);

    if (generations) {
      expect(generations[0].completion).toBeDefined();
      expect(generations[0].completion).toContain("function_call");
      expect(generations[0].completion).toContain("arguments");
      expect(generations[0].completion).toContain("name");
    }
  });
});
