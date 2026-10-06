import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExportRequest = { contentEncoding?: string; body: Buffer };

async function exportSpan(
  params: Partial<LangfuseSpanProcessorParams> = {},
): Promise<ExportRequest> {
  const requests: ExportRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        contentEncoding: request.headers["content-encoding"],
        body: Buffer.concat(chunks),
      });
      response.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        baseUrl: `http://127.0.0.1:${port}`,
        publicKey: "pk-lf-test",
        secretKey: "sk-lf-test",
        exportMode: "immediate",
        mediaUploadEnabled: false,
        shouldExportSpan: () => true,
        ...params,
      }),
    ],
  });

  try {
    provider.getTracer("test").startSpan("compression-span").end();
    await provider.forceFlush();
  } finally {
    await provider.shutdown();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  expect(requests).toHaveLength(1);
  return requests[0];
}

function exportedSpanName({ contentEncoding, body }: ExportRequest): string {
  const json = contentEncoding === "gzip" ? gunzipSync(body) : body;

  return JSON.parse(json.toString("utf8")).resourceSpans[0].scopeSpans[0]
    .spans[0].name;
}

const COMPRESSION_ENV_VARS = [
  "LANGFUSE_OTEL_COMPRESSION",
  "OTEL_EXPORTER_OTLP_TRACES_COMPRESSION",
  "OTEL_EXPORTER_OTLP_COMPRESSION",
];

describe("LangfuseSpanProcessor export compression", () => {
  beforeEach(() => {
    for (const key of COMPRESSION_ENV_VARS) {
      vi.stubEnv(key, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each<{
    name: string;
    params?: Partial<LangfuseSpanProcessorParams>;
    env?: Record<string, string>;
    expectedEncoding: string | undefined;
  }>([
    {
      name: "defaults to gzip when nothing is configured",
      expectedEncoding: "gzip",
    },
    {
      name: "invalid LANGFUSE_OTEL_COMPRESSION falls back to gzip",
      env: { LANGFUSE_OTEL_COMPRESSION: "brotli" },
      expectedEncoding: "gzip",
    },
    {
      name: 'compression option "none" disables gzip',
      params: { compression: "none" },
      expectedEncoding: undefined,
    },
    {
      name: 'LANGFUSE_OTEL_COMPRESSION "none" disables gzip',
      env: { LANGFUSE_OTEL_COMPRESSION: " NONE " },
      expectedEncoding: undefined,
    },
    {
      name: 'OTEL_EXPORTER_OTLP_TRACES_COMPRESSION "none" disables gzip',
      env: { OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: "none" },
      expectedEncoding: undefined,
    },
    {
      name: 'OTEL_EXPORTER_OTLP_COMPRESSION "none" disables gzip',
      env: { OTEL_EXPORTER_OTLP_COMPRESSION: "none" },
      expectedEncoding: undefined,
    },
    {
      name: "OTEL_EXPORTER_OTLP_TRACES_COMPRESSION overrides OTEL_EXPORTER_OTLP_COMPRESSION",
      env: {
        OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: "none",
        OTEL_EXPORTER_OTLP_COMPRESSION: "gzip",
      },
      expectedEncoding: undefined,
    },
    {
      name: "LANGFUSE_OTEL_COMPRESSION overrides OTEL_EXPORTER_OTLP_COMPRESSION",
      env: {
        LANGFUSE_OTEL_COMPRESSION: "gzip",
        OTEL_EXPORTER_OTLP_COMPRESSION: "none",
      },
      expectedEncoding: "gzip",
    },
    {
      name: "compression option enables gzip",
      params: { compression: "gzip" },
      expectedEncoding: "gzip",
    },
    {
      name: "LANGFUSE_OTEL_COMPRESSION enables gzip",
      env: { LANGFUSE_OTEL_COMPRESSION: " GZIP " },
      expectedEncoding: "gzip",
    },
    {
      name: "compression option overrides LANGFUSE_OTEL_COMPRESSION",
      params: { compression: "gzip" },
      env: { LANGFUSE_OTEL_COMPRESSION: "none" },
      expectedEncoding: "gzip",
    },
    {
      name: '"none" overrides OTEL_EXPORTER_OTLP_TRACES_COMPRESSION',
      params: { compression: "none" },
      env: { OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: "gzip" },
      expectedEncoding: undefined,
    },
  ])("$name", async ({ params, env = {}, expectedEncoding }) => {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }

    const request = await exportSpan(params);

    expect(request.contentEncoding).toBe(expectedEncoding);
    expect(exportedSpanName(request)).toBe("compression-span");
  });
});
