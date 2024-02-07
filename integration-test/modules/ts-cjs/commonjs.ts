import { Langfuse, CallbackHandler } from "langfuse-langchain";
import LangfuseDefaultCallbackHandler from "langfuse-langchain";

import { Langfuse as LangfuseNode } from "langfuse-node";
import LangfuseNodeDefault from "langfuse-node";

import { OpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

import * as dotenv from "dotenv";

export async function run(): Promise<void> {
  dotenv.config();

  const secrets = {
    baseUrl: String(process.env["LANGFUSE_BASEURL"]),
    publicKey: String(process.env["LANGFUSE_PUBLIC_KEY"]),
    secretKey: String(process.env["LANGFUSE_SECRET_KEY"]),
  };

  const langfuse = new Langfuse(secrets);

  const trace = langfuse.trace({ userId: "user-id" });

  const langfuseHandler = new CallbackHandler({ root: trace });
  await langfuseHandler.flushAsync();

  const langfuseHandler2 = new LangfuseDefaultCallbackHandler({ root: trace });
  await langfuseHandler2.flushAsync();

  console.log("Did construct objects and called them.");

  new LangfuseNode();
  new LangfuseNodeDefault();

  const prompt = PromptTemplate.fromTemplate("What is a good name for a company that makes {product}?");
  const llm = new OpenAI({
    temperature: 0,
    openAIApiKey: String(process.env["OPENAI_API_KEY"]),
  });

  // we are not calling the chain, just testing that it typechecks
  prompt.pipe(llm).withConfig({ callbacks: [langfuseHandler] });
  prompt.pipe(llm).withConfig({ callbacks: [langfuseHandler2] });
}

run();
