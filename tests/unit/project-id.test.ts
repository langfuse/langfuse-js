// @vitest-environment node
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

import { LangfuseClient } from "@langfuse/client";
import {
  getGlobalLogger,
  resetGlobalLogger,
  withProjectIdHeader,
} from "@langfuse/core";
import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from "@langfuse/otel";
import { ExportResultCode } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const keys = {
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-test",
};

async function exportSpans(
  params: Partial<LangfuseSpanProcessorParams> = {},
  { status = 200, spanCount = 1 }: { status?: number; spanCount?: number } = {},
): Promise<IncomingHttpHeaders[]> {
  const requestHeaders: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    requestHeaders.push(request.headers);
    request.resume();
    request.on("end", () => response.writeHead(status).end());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        ...keys,
        baseUrl: `http://127.0.0.1:${port}`,
        exportMode: "immediate",
        mediaUploadEnabled: false,
        shouldExportSpan: () => true,
        ...params,
      }),
    ],
  });

  try {
    for (let i = 0; i < spanCount; i++) {
      provider.getTracer("test").startSpan(`span-${i}`).end();
      await provider.forceFlush();
    }
  } finally {
    await provider.shutdown();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  return requestHeaders;
}

async function apiRequestHeaders(client: LangfuseClient): Promise<Headers> {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await client.api.projects.get();

  expect(fetchMock).toHaveBeenCalledOnce();
  const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
  return new Headers(init.headers);
}

describe("withProjectIdHeader", () => {
  it("adds the project ID header", () => {
    expect(withProjectIdHeader("proj-1", { a: "1" })).toEqual({
      a: "1",
      "x-langfuse-project-id": "proj-1",
    });
  });

  it("leaves headers unchanged without a project ID", () => {
    const headers = { "x-langfuse-project-id": "proj-1" };

    expect(withProjectIdHeader(undefined, headers)).toBe(headers);
    expect(withProjectIdHeader(undefined)).toEqual({});
  });

  it.each([
    "x-langfuse-project-id",
    "X-Langfuse-Project-Id",
    "langfuse-project-id",
    "LANGFUSE-PROJECT-ID",
  ])("throws when %s names a different project", (name) => {
    expect(() => withProjectIdHeader("proj-1", { [name]: "proj-2" })).toThrow(
      /conflicts with the configured projectId/,
    );
  });

  it("accepts a header with the same value without duplicating it", () => {
    expect(
      withProjectIdHeader("proj-1", { "X-Langfuse-Project-Id": "proj-1" }),
    ).toEqual({ "X-Langfuse-Project-Id": "proj-1" });
    expect(
      withProjectIdHeader("proj-1", { "langfuse-project-id": "proj-1" }),
    ).toEqual({
      "langfuse-project-id": "proj-1",
      "x-langfuse-project-id": "proj-1",
    });
  });
});

describe("LangfuseClient projectId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the projectId option as x-langfuse-project-id", async () => {
    const headers = await apiRequestHeaders(
      new LangfuseClient({ ...keys, projectId: "proj-option" }),
    );

    expect(headers.get("x-langfuse-project-id")).toBe("proj-option");
  });

  it("reads LANGFUSE_PROJECT_ID and lets the option win", async () => {
    vi.stubEnv("LANGFUSE_PROJECT_ID", "proj-env");

    const envHeaders = await apiRequestHeaders(new LangfuseClient(keys));
    expect(envHeaders.get("x-langfuse-project-id")).toBe("proj-env");

    const optionHeaders = await apiRequestHeaders(
      new LangfuseClient({ ...keys, projectId: "proj-option" }),
    );
    expect(optionHeaders.get("x-langfuse-project-id")).toBe("proj-option");
  });

  it("does not send the header without a project ID", async () => {
    vi.stubEnv("LANGFUSE_PROJECT_ID", "");

    const headers = await apiRequestHeaders(new LangfuseClient(keys));

    expect(headers.has("x-langfuse-project-id")).toBe(false);
  });

  it("keeps a project ID header set only through additionalHeaders", async () => {
    vi.stubEnv("LANGFUSE_PROJECT_ID", "");

    const headers = await apiRequestHeaders(
      new LangfuseClient({
        ...keys,
        additionalHeaders: { "x-langfuse-project-id": "proj-header" },
      }),
    );

    expect(headers.get("x-langfuse-project-id")).toBe("proj-header");
  });

  it("throws on a conflicting additionalHeaders project ID", () => {
    expect(
      () =>
        new LangfuseClient({
          ...keys,
          projectId: "proj-1",
          additionalHeaders: { "Langfuse-Project-Id": "proj-2" },
        }),
    ).toThrow(/conflicts with the configured projectId/);
  });

  it("returns the configured project ID without calling projects.get", async () => {
    const client = new LangfuseClient({
      ...keys,
      baseUrl: "http://localhost:3000",
      projectId: "proj-1",
    });
    const projectsGet = vi.fn();
    client.api.projects.get = projectsGet;

    await expect(client.getProjectId()).resolves.toBe("proj-1");
    await expect(client.getTraceUrl("trace-1")).resolves.toBe(
      "http://localhost:3000/project/proj-1/traces/trace-1",
    );
    expect(projectsGet).not.toHaveBeenCalled();
  });
});

describe("LangfuseSpanProcessor projectId", () => {
  beforeEach(() => {
    resetGlobalLogger();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the projectId option on span exports", async () => {
    const [headers] = await exportSpans({ projectId: "proj-option" });

    expect(headers["x-langfuse-project-id"]).toBe("proj-option");
  });

  it("reads LANGFUSE_PROJECT_ID and lets the option win", async () => {
    vi.stubEnv("LANGFUSE_PROJECT_ID", "proj-env");

    const [envHeaders] = await exportSpans();
    expect(envHeaders["x-langfuse-project-id"]).toBe("proj-env");

    const [optionHeaders] = await exportSpans({ projectId: "proj-option" });
    expect(optionHeaders["x-langfuse-project-id"]).toBe("proj-option");
  });

  it("sends a single header when additionalHeaders repeats the project ID", async () => {
    const [headers] = await exportSpans({
      projectId: "proj-1",
      additionalHeaders: { "X-Langfuse-Project-Id": "proj-1" },
    });

    expect(headers["x-langfuse-project-id"]).toBe("proj-1");
  });

  it("throws on a conflicting additionalHeaders project ID", () => {
    expect(
      () =>
        new LangfuseSpanProcessor({
          ...keys,
          projectId: "proj-1",
          additionalHeaders: { "X-LANGFUSE-PROJECT-ID": "proj-2" },
        }),
    ).toThrow(/conflicts with the configured projectId/);
  });

  it("warns that a custom exporter must set the header itself", () => {
    const warnSpy = vi.spyOn(getGlobalLogger(), "warn");
    const exporter = {
      export: (_: unknown, cb: (r: { code: ExportResultCode }) => void) =>
        cb({ code: ExportResultCode.SUCCESS }),
      shutdown: async () => {},
    };

    new LangfuseSpanProcessor({ exporter, projectId: "proj-1" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("custom exporter"),
    );
  });

  it("logs the organization key hint once when exports get 403", async () => {
    vi.stubEnv("LANGFUSE_PROJECT_ID", "");
    const errorSpy = vi.spyOn(getGlobalLogger(), "error");

    const requests = await exportSpans({}, { status: 403, spanCount: 2 });

    expect(requests).toHaveLength(2);
    const hints = errorSpy.mock.calls.filter(([message]) =>
      String(message).includes("LANGFUSE_PROJECT_ID"),
    );
    expect(hints).toHaveLength(1);
  });

  it("does not log the hint when a project ID is configured", async () => {
    const errorSpy = vi.spyOn(getGlobalLogger(), "error");

    await exportSpans({ projectId: "proj-1" }, { status: 403 });

    expect(
      errorSpy.mock.calls.some(([message]) =>
        String(message).includes("LANGFUSE_PROJECT_ID"),
      ),
    ).toBe(false);
  });
});
