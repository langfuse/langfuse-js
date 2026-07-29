import { afterEach, describe, expect, it, vi } from "vitest";

import { LangfuseAPIClient, type legacy } from "@langfuse/core";

const request: Parameters<LangfuseAPIClient["scores"]["create"]>[0] = {
  traceId: "trace-id",
  name: "quality",
  value: 0.9,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("score create API compatibility", () => {
  it.each([
    ["canonical", (client: LangfuseAPIClient) => client.scores.create(request)],
    [
      "legacy",
      (client: LangfuseAPIClient) =>
        client.legacy.scoreV1.create(request as legacy.CreateScoreRequest),
    ],
  ])("sends the same request through the %s path", async (_, createScore) => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "score-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new LangfuseAPIClient({
      environment: "https://cloud.langfuse.com",
      username: "public-key",
      password: "secret-key",
    });

    await createScore(client);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cloud.langfuse.com/api/public/scores");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify(request),
    });
  });
});
