import { Langfuse, CallbackHandler } from "langfuse-langchain";
// This import will not typecheck at THERE below when NodeNext is configured badly
// as then the imports will be treated as CommonJS imports resulting in a missing default export.
import LangfuseDefaultCallbackHandler from "langfuse-langchain";

import * as dotenv from "dotenv";

export async function run(): Promise<void> {
  dotenv.config();

  const langfuse = new Langfuse({
    baseUrl: String(process.env["LANGFUSE_URL"]),
    publicKey: String(process.env["LANGFUSE_PK"]),
    secretKey: String(process.env["LANGFUSE_SK"]),
  });

  const trace = langfuse.trace({ userId: "user-id" });

  const langfuseHandler = new CallbackHandler({ root: trace });
  await langfuseHandler.flushAsync();

  // THERE
  const langfuseHandler2 = new LangfuseDefaultCallbackHandler({ root: trace });
  await langfuseHandler2.flushAsync();

  console.log("Did construct objects and called them.");
}

run();
