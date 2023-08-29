// uses the compiled node.js version, run yarn build after making changes to the SDKs
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { ConversationChain, LLMChain } from "langchain/chains";
import { CallbackHandler } from "../src/callback";
import { LF_HOST, LF_PUBLIC_KEY, LF_SECRET_KEY, getTraces } from "../../integration-test/integration-utils";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || "";

describe("simple chains", () => {
  jest.setTimeout(10_000);
  it("llm chain", async () => {
    const handler = new CallbackHandler({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      baseUrl: LF_HOST,
    });

    const model = new OpenAI({ temperature: 0.1 });
    const template = "What is the capital city of {country}?";
    const prompt = new PromptTemplate({ template, inputVariables: ["country"] });
    // create a chain that takes the user input, format it and then sends to LLM
    const chain = new LLMChain({ llm: model, prompt });
    // run the chain by passing the input
    await chain.call({ country: "France" }, { callbacks: [handler] });

    await handler.langfuse.flushAsync();

    expect(handler.traceId).toBeDefined();
    const trace = handler.traceId ? await getTraces(handler.traceId) : undefined;

    expect(trace).toBeDefined();
    expect(trace?.observations.length).toBe(2);
    const generation = trace?.observations.filter((o) => o.type === "GENERATION");
    expect(generation).toBeDefined();
    expect(generation?.length).toBe(1);
    if (generation) {
      expect(generation[0].name).toBe("OpenAI");
      expect(generation[0].model).toBe("text-davinci-003");
      expect(generation[0].promptTokens).toBeDefined();
      expect(generation[0].completionTokens).toBeDefined();
      expect(generation[0].totalTokens).toBeDefined();
    }
  });

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

    await handler.langfuse.flushAsync();

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

    await handler.langfuse.flushAsync();
  });

  // it("should pass", async () => {
  //   const handler = new CallbackHandler({
  //     publicKey: LF_PUBLIC_KEY,
  //     secretKey: LF_SECRET_KEY,
  //     baseUrl: LF_HOST,
  //   });
  //   const llm = new OpenAI({ temperature: 0 });
  //   const template = `You are a playwright. Given the title of play, it is your job to write a synopsis for that title.
  // Title: {title}
  // Playwright: This is a synopsis for the above play:`;
  //   const promptTemplate = new PromptTemplate({
  //     template,
  //     inputVariables: ["title"],
  //   });
  //   const synopsisChain = new LLMChain({ llm, prompt: promptTemplate });
  //   // This is an LLMChain to write a review of a play given a synopsis.
  //   const reviewLLM = new OpenAI({ temperature: 0 });
  //   const reviewTemplate = `You are a play critic from the New York Times. Given the synopsis of play, it is your job to write a review for that play.
  // Play Synopsis:
  // {synopsis}
  // Review from a New York Times play critic of the above play:`;
  //   const reviewPromptTemplate = new PromptTemplate({
  //     template: reviewTemplate,
  //     inputVariables: ["synopsis"],
  //   });
  //   const reviewChain = new LLMChain({
  //     llm: reviewLLM,
  //     prompt: reviewPromptTemplate,
  //   });
  //   const overallChain = new SimpleSequentialChain({
  //     chains: [synopsisChain, reviewChain],
  //     verbose: true,
  //   });
  //   const review = await overallChain.run("Tragedy at sunset on the beach", { callbacks: [handler] });
  //   console.log(review);
  //   await handler.langfuse.flushAsync();
  //   expect(true).toBe(true);
  // }, 100000000);
});
