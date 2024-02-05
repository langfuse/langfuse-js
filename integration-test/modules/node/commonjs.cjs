/* eslint-disable @typescript-eslint/no-var-requires */
const { Langfuse, CallbackHandler } = require("langfuse-langchain");
const LangfuseDefaultCallbackHandler = require("langfuse-langchain").default;

const { Langfuse: LangfuseNode } = require("langfuse-node");
const LangfuseNodeDefault = require("langfuse-node").default;

const dotenv = require("dotenv");

async function run() {
  dotenv.config();

  const langfuse = new Langfuse();

  const trace = langfuse.trace({ userId: "user-id" });

  const langfuseHandler = new CallbackHandler({ root: trace });
  await langfuseHandler.flushAsync();

  const langfuseHandler2 = new LangfuseDefaultCallbackHandler({ root: trace });
  await langfuseHandler2.flushAsync();

  console.log("Did construct objects and called them.");

  const langfuseNode = new LangfuseNode();
  const langfuseNodeDefault = new LangfuseNodeDefault();
}

run();
