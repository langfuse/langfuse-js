import Langfuse from "langfuse-node";
// @ts-ignore
import wtf from "wtfnode";

const langfuse = new Langfuse();

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
