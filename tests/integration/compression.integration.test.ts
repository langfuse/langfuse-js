import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

import {
  LogLevel,
  configureGlobalLogger,
  resetGlobalLogger,
} from "@langfuse/core";
import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from "@langfuse/otel";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("LangfuseSpanProcessor export compression", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetGlobalLogger();
  });

  it.each<{
    name: string;
    params?: Partial<LangfuseSpanProcessorParams>;
    env?: Record<string, string>;
    expectedEncoding: string | undefined;
  }>([
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
    {
      name: "unset falls back to OTEL_EXPORTER_OTLP_TRACES_COMPRESSION",
      env: { OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: "gzip" },
      expectedEncoding: "gzip",
    },
  ])("$name", async ({ params, env = {}, expectedEncoding }) => {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }

    const request = await exportSpan(params);

    expect(request.contentEncoding).toBe(expectedEncoding);
    expect(exportedSpanName(request)).toBe("compression-span");
  });

  it("warns on an invalid value and falls back to OTEL env vars", async () => {
    vi.stubEnv("LANGFUSE_OTEL_COMPRESSION", "deflate");
    vi.stubEnv("OTEL_EXPORTER_OTLP_COMPRESSION", "gzip");
    configureGlobalLogger({ level: LogLevel.WARN });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const request = await exportSpan();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Invalid LANGFUSE_OTEL_COMPRESSION value "deflate". Expected "gzip" or "none".',
      ),
    );
    expect(request.contentEncoding).toBe("gzip");
    expect(exportedSpanName(request)).toBe("compression-span");
  });

  it("warns when compression is set with a custom exporter", async () => {
    configureGlobalLogger({ level: LogLevel.WARN });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const processor = new LangfuseSpanProcessor({
      exporter: new InMemorySpanExporter(),
      compression: "gzip",
    });
    await processor.shutdown();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("The compression option is ignored"),
    );
  });
});
