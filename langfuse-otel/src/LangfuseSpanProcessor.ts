import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";

import { LANGFUSE_VERSION } from "./constants";

export type LangfuseSpanProcessorParams = {
  publicKey?: string;
  secretKey?: string;
  host?: string;
  debug?: boolean;
  flushAt?: number;
  flushInterval?: number;
  additionalHeaders?: Record<string, string>;
  exportTimeoutMillis?: number;
};

export class LangfuseSpanProcessor extends BatchSpanProcessor {
  constructor(params: LangfuseSpanProcessorParams) {
    const {
      publicKey: providedPublicKey,
      secretKey: providedSecretKey,
      host: providedHost,
      flushAt,
      flushInterval,
      additionalHeaders,
      exportTimeoutMillis,
    } = params;

    const publicKey = providedPublicKey ?? process.env["LANGFUSE_PUBLIC_KEY"];
    const secretKey = providedSecretKey ?? process.env["LANGFUSE_SECRET_KEY"];
    const host =
      providedHost ??
      process.env["LANGFUSE_HOST"] ??
      "https://cloud.langfuse.com";

    if (!publicKey) throw Error("Missing public key");
    if (!secretKey) throw Error("Missing secret key");

    const basicAuthHeader =
      "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

    const exporter = new OTLPTraceExporter({
      url: `${host}/api/public/otel/v1/traces`,
      headers: {
        Authorization: basicAuthHeader,
        x_langfuse_sdk_name: "javascript",
        x_langfuse_sdk_version: LANGFUSE_VERSION,
        x_langfuse_public_key: publicKey,
        ...additionalHeaders,
      },
    });

    super(exporter, {
      exportTimeoutMillis,
      scheduledDelayMillis: flushInterval,
      maxExportBatchSize: flushAt,
    });
  }
}
