import { Langfuse, CallbackHandler } from "langfuse-langchain";
// This import will not typecheck at THERE below when NodeNext is configured badly
// as then the imports will be treated as CommonJS imports resulting in a missing default export.
import LangfuseDefaultCallbackHandler from "langfuse-langchain";

import { LLMChain } from "langchain/chains";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";

import * as dotenv from "dotenv";

export async function run(): Promise<void> {
  dotenv.config();

  const langfuse = new Langfuse();

  const trace = langfuse.trace({ userId: "user-id" });

  const langfuseHandler = new CallbackHandler({ root: trace });
  await langfuseHandler.flushAsync();

  // THERE
  const langfuseHandler2 = new LangfuseDefaultCallbackHandler({ root: trace });
  await langfuseHandler2.flushAsync();

  console.log("Did construct objects and called them.");

  const prompt = PromptTemplate.fromTemplate("What is a good name for a company that makes {product}?");
  const llm = new OpenAI({
    temperature: 0,
    openAIApiKey: String(process.env["OPENAI_API_KEY"]),
  });
  // we are not calling the chain, just testing that it typechecks
  const chain = new LLMChain({
    llm,
    prompt,
    callbacks: [langfuseHandler],
  });
  const chain2 = new LLMChain({
    llm,
    prompt,
    callbacks: [langfuseHandler2],
  });
}

run();
