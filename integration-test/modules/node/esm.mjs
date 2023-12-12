import { Langfuse, CallbackHandler } from "langfuse-langchain";
import LangfuseDefaultCallbackHandler from "langfuse-langchain";

import * as dotenv from "dotenv";

export async function run() {
  dotenv.config();

  const langfuse = new Langfuse({
    baseUrl: String(process.env["LF_HOST"]),
    publicKey: String(process.env["LF_PUBLIC_KEY"]),
    secretKey: String(process.env["LF_SECRET_KEY"]),
  });

  const trace = langfuse.trace({ userId: "user-id" });

  const langfuseHandler = new CallbackHandler({ root: trace });
  await langfuseHandler.flushAsync();

  const langfuseHandler2 = new LangfuseDefaultCallbackHandler({ root: trace });
  await langfuseHandler2.flushAsync();

  console.log("Did construct objects and called them.");
}

run();
