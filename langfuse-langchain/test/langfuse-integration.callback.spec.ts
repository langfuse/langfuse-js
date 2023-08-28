// uses the compiled node.js version, run yarn build after making changes to the SDKs
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { LLMChain, SimpleSequentialChain } from "langchain/chains";
import { CallbackHandler } from "../src/callback";

const LF_HOST = process.env.LF_HOST ?? "http://localhost:3000";
const LF_PUBLIC_KEY = process.env.LF_PUBLIC_KEY ?? "pk-lf-1234567890";
const LF_SECRET_KEY = process.env.LF_SECRET_KEY ?? "sk-lf-1234567890";

describe("concatenated chain", () => {
  it("should pass", async () => {
    const handler = new CallbackHandler({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      baseUrl: LF_HOST,
    });
    const llm = new OpenAI({ temperature: 0 });
    const template = `You are a playwright. Given the title of play, it is your job to write a synopsis for that title.
 
  Title: {title}
  Playwright: This is a synopsis for the above play:`;
    const promptTemplate = new PromptTemplate({
      template,
      inputVariables: ["title"],
    });
    const synopsisChain = new LLMChain({ llm, prompt: promptTemplate });

    // This is an LLMChain to write a review of a play given a synopsis.
    const reviewLLM = new OpenAI({ temperature: 0 });
    const reviewTemplate = `You are a play critic from the New York Times. Given the synopsis of play, it is your job to write a review for that play.
 
  Play Synopsis:
  {synopsis}
  Review from a New York Times play critic of the above play:`;
    const reviewPromptTemplate = new PromptTemplate({
      template: reviewTemplate,
      inputVariables: ["synopsis"],
    });
    const reviewChain = new LLMChain({
      llm: reviewLLM,
      prompt: reviewPromptTemplate,
    });

    const overallChain = new SimpleSequentialChain({
      chains: [synopsisChain, reviewChain],
      verbose: true,
    });
    const review = await overallChain.run("Tragedy at sunset on the beach", { callbacks: [handler] });
    handler.langfuse.flush();

    expect(true).toBe(true);
  }, 100000000);
});
