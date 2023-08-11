import Langfuse from "langfuse";

export const runtime = "edge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = crypto.randomUUID();

  const langfuse = new Langfuse({
    publicKey: "pk-lf-1234567890",
    secretKey: "sk-lf-1234567890",
    baseUrl: "http://localhost:3000",
    flushAt: 1,
  });

  langfuse.debug();

  langfuse.trace({
    id,
    name: "example-nextjs-backend-route",
  });

  await langfuse.shutdownAsync();

  return new Response(JSON.stringify({ id }), {
    headers: { "content-type": "application/json" },
  });
}
