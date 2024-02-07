/* eslint-disable @typescript-eslint/no-var-requires */
const { Langfuse, CallbackHandler } = require("langfuse-langchain");
const LangfuseDefaultCallbackHandler = require("langfuse-langchain").default;

const { Langfuse: LangfuseNode } = require("langfuse-node");
const LangfuseNodeDefault = require("langfuse-node").default;

const dotenv = require("dotenv");

async function run() {
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

  const langfuseNode = new LangfuseNode(secrets);
  const langfuseNodeDefault = new LangfuseNodeDefault(secrets);
}

run();
