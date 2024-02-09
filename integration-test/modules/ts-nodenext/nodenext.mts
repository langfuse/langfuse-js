import { Langfuse, CallbackHandler } from "langfuse-langchain";
// This import will not typecheck at THERE below when NodeNext is configured badly
// as then the imports will be treated as CommonJS imports resulting in a missing default export.
import LangfuseDefaultCallbackHandler from "langfuse-langchain";

import { OpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

import * as dotenv from "dotenv";

export async function run(): Promise<void> {
  dotenv.config();

  const langfuse = new Langfuse({
    baseUrl: String(process.env["LANGFUSE_BASEURL"]),
    publicKey: String(process.env["LANGFUSE_PUBLIC_KEY"]),
    secretKey: String(process.env["LANGFUSE_SECRET_KEY"]),
  });

  const trace = langfuse.trace({ userId: "user-id" });

  const langfuseHandler = new CallbackHandler({ root: trace });
  await langfuseHandler.flushAsync();

  // THERE
  const langfuseHandler2 = new LangfuseDefaultCallbackHandler({ root: trace });
  await langfuseHandler2.flushAsync();

  const prompt = PromptTemplate.fromTemplate("What is a good name for a company that makes {product}?");
  const llm = new OpenAI({
    temperature: 0,
    openAIApiKey: String(process.env["OPENAI_API_KEY"]),
  });
  // we are not calling the chain, just testing that it typechecks
  prompt.pipe(llm).withConfig({ callbacks: [langfuseHandler] });
  prompt.pipe(llm).withConfig({ callbacks: [langfuseHandler2] });
  console.log("Did construct objects and called them.");
}

run();
