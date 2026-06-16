import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LangfuseBrowser,
  LangfuseBrowserError,
  LangfuseScoreDataType,
} from "./index.js";

const createJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 207,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

describe("LangfuseBrowser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a score as a single ingestion batch", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(init?.body as string);
        const eventId = request.batch[0].id;

        return createJsonResponse({
          successes: [{ id: eventId, status: 201 }],
          errors: [],
        });
      },
    );
    const langfuse = new LangfuseBrowser({
      publicKey: "pk-lf-test",
      baseUrl: "https://cloud.langfuse.com/",
      environment: "production",
      fetch: fetchMock,
    });

    const result = await langfuse.score({
      id: "score-id",
      traceId: "trace-id",
      observationId: "observation-id",
      name: "user_feedback",
      value: 1,
      dataType: LangfuseScoreDataType.Numeric,
      comment: "Helpful",
      metadata: { source: "button" },
    });

    expect(result).toEqual({ id: "score-id" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cloud.langfuse.com/api/public/ingestion");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer pk-lf-test",
      "X-Langfuse-Public-Key": "pk-lf-test",
      "X-Langfuse-Sdk-Name": "javascript",
      "X-Langfuse-Sdk-Variant": "langfuse-browser",
      "X-Langfuse-Sdk-Integration": "DEFAULT",
    });

    const payload = JSON.parse(init?.body as string);
    expect(payload).toMatchObject({
      metadata: {
        batch_size: 1,
        sdk_name: "javascript",
        sdk_variant: "langfuse-browser",
        sdk_integration: "DEFAULT",
        public_key: "pk-lf-test",
      },
    });
    expect(payload.metadata.sdk_version).toEqual(expect.any(String));
    expect(payload.batch).toHaveLength(1);
    expect(payload.batch[0]).toMatchObject({
      type: "score-create",
      timestamp: "2026-06-16T12:00:00.000Z",
      body: {
        id: "score-id",
        traceId: "trace-id",
        observationId: "observation-id",
        name: "user_feedback",
        value: 1,
        dataType: "NUMERIC",
        comment: "Helpful",
        metadata: { source: "button" },
        environment: "production",
      },
    });
    expect(payload.batch[0].id).toEqual(expect.any(String));
  });

  it("generates a score id when none is provided", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(init?.body as string);
        const eventId = request.batch[0].id;

        return createJsonResponse({
          successes: [{ id: eventId, status: 201 }],
          errors: [],
        });
      },
    );
    const langfuse = new LangfuseBrowser({
      publicKey: "pk-lf-test",
      fetch: fetchMock,
    });

    const result = await langfuse.score({
      traceId: "trace-id",
      name: "user_feedback",
      value: 0,
    });

    expect(result.id).toEqual(expect.any(String));

    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload.batch[0].body.id).toBe(result.id);
  });

  it("rejects when ingestion returns item errors", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        successes: [],
        errors: [
          {
            id: "event-id",
            status: 400,
            message: "Invalid request data",
            error: "traceId is required",
          },
        ],
      }),
    );
    const langfuse = new LangfuseBrowser({
      publicKey: "pk-lf-test",
      fetch: fetchMock,
    });

    await expect(
      langfuse.score({ traceId: "trace-id", name: "feedback", value: 1 }),
    ).rejects.toMatchObject({
      name: "LangfuseBrowserError",
      errors: [
        {
          id: "event-id",
          status: 400,
          error: "traceId is required",
        },
      ],
    });
  });

  it("rejects non-2xx responses", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(
        { error: "Unauthorized", message: "Invalid public key" },
        { status: 401 },
      ),
    );
    const langfuse = new LangfuseBrowser({
      publicKey: "pk-lf-test",
      fetch: fetchMock,
    });

    await expect(
      langfuse.score({ traceId: "trace-id", name: "feedback", value: 1 }),
    ).rejects.toMatchObject({
      name: "LangfuseBrowserError",
      status: 401,
      response: { error: "Unauthorized", message: "Invalid public key" },
    });
  });

  it("requires a public key", () => {
    expect(
      () => new LangfuseBrowser({ publicKey: "", fetch: vi.fn() }),
    ).toThrow(LangfuseBrowserError);
  });

  it("keeps SDK auth headers authoritative over additional headers", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(init?.body as string);
        const eventId = request.batch[0].id;

        return createJsonResponse({
          successes: [{ id: eventId, status: 201 }],
          errors: [],
        });
      },
    );
    const langfuse = new LangfuseBrowser({
      publicKey: "pk-lf-test",
      fetch: fetchMock,
      additionalHeaders: {
        Authorization: "Bearer wrong-key",
        "X-Langfuse-Public-Key": "wrong-key",
        "X-Custom-Header": "custom",
      },
    });

    await langfuse.score({ traceId: "trace-id", name: "feedback", value: 1 });

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer pk-lf-test",
      "X-Langfuse-Public-Key": "pk-lf-test",
      "X-Custom-Header": "custom",
    });
  });
});
