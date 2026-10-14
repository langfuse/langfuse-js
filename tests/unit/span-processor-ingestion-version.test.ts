// @vitest-environment node
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { describe, expect, it } from "vitest";

import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from "@langfuse/otel";

async function exportSpanHeaders(
  params: Partial<LangfuseSpanProcessorParams> = {},
): Promise<IncomingHttpHeaders> {
  const requestHeaders: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    requestHeaders.push(request.headers);
    request.resume();
    request.on("end", () => response.writeHead(200).end());
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
    provider.getTracer("test").startSpan("ingestion-version-span").end();
    await provider.forceFlush();
  } finally {
    await provider.shutdown();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  expect(requestHeaders).toHaveLength(1);
  return requestHeaders[0];
}

describe("LangfuseSpanProcessor ingestion version header", () => {
  it("sends x-langfuse-ingestion-version 4 by default", async () => {
    const headers = await exportSpanHeaders();

    expect(headers["x-langfuse-ingestion-version"]).toBe("4");
    expect(headers["x-langfuse-sdk-name"]).toBe("javascript");
  });

  it("lets additionalHeaders override the ingestion version", async () => {
    const headers = await exportSpanHeaders({
      additionalHeaders: { "x-langfuse-ingestion-version": "3" },
    });

    expect(headers["x-langfuse-ingestion-version"]).toBe("3");
  });
});
