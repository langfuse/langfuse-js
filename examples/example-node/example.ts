import Langfuse from "langfuse-node";
// @ts-ignore
import wtf from "wtfnode";

const {
  LANGFUSE_PUBLIC_KEY = "pk-lf-1234567890",
  LANGFUSE_SECRET_KEY = "sk-lf-1234567890",
  LANGFUSE_HOST = "http://localhost:3000",
} = process.env;

const langfuse = new Langfuse({
  publicKey: LANGFUSE_PUBLIC_KEY,
  secretKey: LANGFUSE_SECRET_KEY,
  baseUrl: LANGFUSE_HOST,
  // flushAt: 1,
});

langfuse.trace({
  name: "test-trace",
});

async function cleanup() {
  wtf.dump();
  await langfuse.shutdownAsync();
  wtf.dump();
  console.log("shut down successfully");
}

cleanup();
