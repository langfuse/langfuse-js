import {
  Logger,
  getGlobalLogger,
  LangfuseAPIClient,
  LANGFUSE_SDK_VERSION,
  LangfuseOtelSpanAttributes,
  getEnv,
  base64Encode,
  getPropagatedAttributesFromContext,
} from "@langfuse/core";
import { Context } from "@opentelemetry/api";
import { hrTimeToMilliseconds } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  Span,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  SpanExporter,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { MediaService } from "./MediaService.js";

/**
 * Function type for masking sensitive data in spans before export.
 *
 * @param params - Object containing the data to be masked
 * @param params.data - The data that should be masked
 * @returns The masked data (can be of any type)
 *
 * @example
 * ```typescript
 * const maskFunction: MaskFunction = ({ data }) => {
 *   if (typeof data === 'string') {
 *     return data.replace(/password=\w+/g, 'password=***');
 *   }
 *   return data;
 * };
 * ```
 *
 * @public
 */
export type MaskFunction = (params: { data: any }) => any;

/**
 * Function type for determining whether a span should be exported to Langfuse.
 *
 * @param params - Object containing the span to evaluate
 * @param params.otelSpan - The OpenTelemetry span to evaluate
 * @returns `true` if the span should be exported, `false` otherwise
 *
 * @example
 * ```typescript
 * const shouldExportSpan: ShouldExportSpan = ({ otelSpan }) => {
 *   // Only export spans that took longer than 100ms
 *   return otelSpan.duration[0] * 1000 + otelSpan.duration[1] / 1000000 > 100;
 * };
 * ```
 *
 * @public
 */
export type ShouldExportSpan = (params: { otelSpan: ReadableSpan }) => boolean;

/**
 * Configuration parameters for the LangfuseSpanProcessor.
 *
 * @public
 */
export interface LangfuseSpanProcessorParams {
  /**
   * Custom OpenTelemetry span exporter. If not provided, a default OTLP exporter will be used.
   */
  exporter?: SpanExporter;

  /**
   * Langfuse public API key. Can also be set via LANGFUSE_PUBLIC_KEY environment variable.
   */
  publicKey?: string;

  /**
   * Langfuse secret API key. Can also be set via LANGFUSE_SECRET_KEY environment variable.
   */
  secretKey?: string;

  /**
   * Langfuse instance base URL. Can also be set via LANGFUSE_BASE_URL environment variable.
   * @defaultValue "https://cloud.langfuse.com"
   */
  baseUrl?: string;

  /**
   * Number of spans to batch before flushing. Can also be set via LANGFUSE_FLUSH_AT environment variable.
   */
  flushAt?: number;

  /**
   * Flush interval in seconds. Can also be set via LANGFUSE_FLUSH_INTERVAL environment variable.
   */
  flushInterval?: number;

  /**
   * Function to mask sensitive data in spans before export.
   */
  mask?: MaskFunction;

  /**
   * Function to determine whether a span should be exported to Langfuse.
   */
  shouldExportSpan?: ShouldExportSpan;

  /**
   * Environment identifier for the traces. Can also be set via LANGFUSE_TRACING_ENVIRONMENT environment variable.
   */
  environment?: string;

  /**
   * Release identifier for the traces. Can also be set via LANGFUSE_RELEASE environment variable.
   */
  release?: string;

  /**
   * Request timeout in seconds. Can also be set via LANGFUSE_TIMEOUT environment variable.
   * @defaultValue 5
   */
  timeout?: number;

  /**
   * Additional HTTP headers to include with requests.
   */
  additionalHeaders?: Record<string, string>;
  /**
   * Span export mode to use.
   *
   * - **batched**: Recommended for production environments with long-running processes.
   *   Spans are batched and exported in groups for optimal performance.
   * - **immediate**: Recommended for short-lived environments such as serverless functions.
   *   Spans are exported immediately to prevent data loss when the process terminates / is frozen.
   *
   * @defaultValue "batched"
   */
  exportMode?: "immediate" | "batched";
}

/**
 * OpenTelemetry span processor for sending spans to Langfuse.
 *
 * This processor extends the standard BatchSpanProcessor to provide:
 * - Automatic batching and flushing of spans to Langfuse
 * - Media content extraction and upload from base64 data URIs
 * - Data masking capabilities for sensitive information
 * - Conditional span export based on custom logic
 * - Environment and release tagging
 *
 * @example
 * ```typescript
 * import { NodeSDK } from '@opentelemetry/sdk-node';
 * import { LangfuseSpanProcessor } from '@langfuse/otel';
 *
 * const sdk = new NodeSDK({
 *   spanProcessors: [
 *     new LangfuseSpanProcessor({
 *       publicKey: 'pk_...',
 *       secretKey: 'sk_...',
 *       baseUrl: 'https://cloud.langfuse.com',
 *       environment: 'production',
 *       mask: ({ data }) => {
 *         // Mask sensitive data
 *         return data.replace(/api_key=\w+/g, 'api_key=***');
 *       }
 *     })
 *   ]
 * });
 *
 * sdk.start();
 * ```
 *
 * @public
 */
export class LangfuseSpanProcessor implements SpanProcessor {
  private pendingEndedSpans: Set<Promise<void>> = new Set();

  private publicKey?: string;
  private baseUrl?: string;
  private environment?: string;
  private release?: string;
  private mask?: MaskFunction;
  private shouldExportSpan?: ShouldExportSpan;
  private apiClient: LangfuseAPIClient;
  private processor: SpanProcessor;
  private mediaService: MediaService;

  /**
   * Creates a new LangfuseSpanProcessor instance.
   *
   * @param params - Configuration parameters for the processor
   *
   * @example
   * ```typescript
   * const processor = new LangfuseSpanProcessor({
   *   publicKey: 'pk_...',
   *   secretKey: 'sk_...',
   *   environment: 'staging',
   *   flushAt: 10,
   *   flushInterval: 2,
   *   mask: ({ data }) => {
   *     // Custom masking logic
   *     return typeof data === 'string'
   *       ? data.replace(/secret_\w+/g, 'secret_***')
   *       : data;
   *   },
   *   shouldExportSpan: ({ otelSpan }) => {
   *     // Only export spans from specific services
   *     return otelSpan.name.startsWith('my-service');
   *   }
   * });
   * ```
   */
  constructor(params?: LangfuseSpanProcessorParams) {
    const logger = getGlobalLogger();

    const publicKey = params?.publicKey ?? getEnv("LANGFUSE_PUBLIC_KEY");
    const secretKey = params?.secretKey ?? getEnv("LANGFUSE_SECRET_KEY");
    const baseUrl =
      params?.baseUrl ??
      getEnv("LANGFUSE_BASE_URL") ??
      getEnv("LANGFUSE_BASEURL") ?? // legacy v2
      "https://cloud.langfuse.com";

    if (!params?.exporter && !publicKey) {
      logger.warn(
        "No exporter configured and no public key provided in constructor or as LANGFUSE_PUBLIC_KEY env var. Span exports will fail.",
      );
    }
    if (!params?.exporter && !secretKey) {
      logger.warn(
        "No exporter configured and no secret key provided in constructor or as LANGFUSE_SECRET_KEY env var. Span exports will fail.",
      );
    }
    const flushAt = params?.flushAt ?? getEnv("LANGFUSE_FLUSH_AT");
    const flushIntervalSeconds =
      params?.flushInterval ?? getEnv("LANGFUSE_FLUSH_INTERVAL");

    const authHeaderValue = base64Encode(`${publicKey}:${secretKey}`);
    const timeoutSeconds =
      params?.timeout ?? Number(getEnv("LANGFUSE_TIMEOUT") ?? 5);

    const exporter =
      params?.exporter ??
      new OTLPTraceExporter({
        url: `${baseUrl}/api/public/otel/v1/traces`,
        headers: {
          Authorization: `Basic ${authHeaderValue}`,
          x_langfuse_sdk_name: "javascript",
          x_langfuse_sdk_version: LANGFUSE_SDK_VERSION,
          x_langfuse_public_key: publicKey ?? "<missing>",
          ...params?.additionalHeaders,
        },
        timeoutMillis: timeoutSeconds * 1_000,
      });

    this.processor =
      params?.exportMode === "immediate"
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter, {
            maxExportBatchSize: flushAt ? Number(flushAt) : undefined,
            scheduledDelayMillis: flushIntervalSeconds
              ? Number(flushIntervalSeconds) * 1_000
              : undefined,
          });

    this.publicKey = publicKey;
    this.baseUrl = baseUrl;
    this.environment =
      params?.environment ?? getEnv("LANGFUSE_TRACING_ENVIRONMENT");
    this.release = params?.release ?? getEnv("LANGFUSE_RELEASE");
    this.mask = params?.mask;
    this.shouldExportSpan = params?.shouldExportSpan;
    this.apiClient = new LangfuseAPIClient({
      baseUrl: this.baseUrl,
      username: this.publicKey,
      password: secretKey,
      xLangfusePublicKey: this.publicKey,
      xLangfuseSdkVersion: LANGFUSE_SDK_VERSION,
      xLangfuseSdkName: "javascript",
      environment: "", // noop as baseUrl is set
      headers: params?.additionalHeaders,
    });

    this.mediaService = new MediaService({ apiClient: this.apiClient });

    logger.debug("Initialized LangfuseSpanProcessor with params:", {
      publicKey,
      baseUrl,
      environment: this.environment,
      release: this.release,
      timeoutSeconds,
      flushAt,
      flushIntervalSeconds,
    });
  }

  private get logger(): Logger {
    return getGlobalLogger();
  }

  /**
   * Called when a span is started. Adds environment, release, and propagated attributes to the span.
   *
   * @param span - The span that was started
   * @param parentContext - The parent context
   *
   * @override
   */
  public onStart(span: Span, parentContext: Context): void {
    // Set propagated attributes, environment and release attributes
    span.setAttributes({
      [LangfuseOtelSpanAttributes.ENVIRONMENT]: this.environment,
      [LangfuseOtelSpanAttributes.RELEASE]: this.release,
      ...getPropagatedAttributesFromContext(parentContext),
    });

    return this.processor.onStart(span, parentContext);
  }

  /**
   * Called when a span ends. Processes the span for export to Langfuse.
   *
   * This method:
   * 1. Checks if the span should be exported using the shouldExportSpan function
   * 2. Applies data masking to sensitive attributes
   * 3. Handles media content extraction and upload
   * 4. Logs span details in debug mode
   * 5. Passes the span to the parent processor for export
   *
   * @param span - The span that ended
   *
   * @override
   */
  public onEnd(span: ReadableSpan): void {
    const processEndedSpanPromise = this.processEndedSpan(span).catch((err) => {
      this.logger.error(err);
    });

    // Enqueue this export to the pending list so it can be flushed by the user.
    this.pendingEndedSpans.add(processEndedSpanPromise);

    void processEndedSpanPromise.finally(() =>
      this.pendingEndedSpans.delete(processEndedSpanPromise),
    );
  }

  private async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingEndedSpans));
    await this.mediaService.flush();
  }

  /**
   * Forces an immediate flush of all pending spans and media uploads.
   *
   * @returns Promise that resolves when all pending operations are complete
   *
   * @override
   */
  public async forceFlush(): Promise<void> {
    await this.flush();

    return this.processor.forceFlush();
  }

  /**
   * Gracefully shuts down the processor, ensuring all pending operations are completed.
   *
   * @returns Promise that resolves when shutdown is complete
   *
   * @override
   */
  public async shutdown(): Promise<void> {
    await this.flush();

    return this.processor.shutdown();
  }

  private async processEndedSpan(span: ReadableSpan) {
    if (this.shouldExportSpan) {
      try {
        if (this.shouldExportSpan({ otelSpan: span }) === false) return;
      } catch (err) {
        this.logger.error(
          "ShouldExportSpan failed with error. Excluding span. Error: ",
          err,
        );

        return;
      }
    }

    this.applyMaskInPlace(span);
    await this.mediaService.process(span);

    this.logger.debug(
      `Processed span:\n${JSON.stringify(
        {
          name: span.name,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanContext?.spanId ?? null,
          attributes: span.attributes,
          startTime: new Date(hrTimeToMilliseconds(span.startTime)),
          endTime: new Date(hrTimeToMilliseconds(span.endTime)),
          durationMs: hrTimeToMilliseconds(span.duration),
          kind: span.kind,
          status: span.status,
          resource: span.resource.attributes,
          instrumentationScope: span.instrumentationScope,
        },
        null,
        2,
      )}`,
    );

    this.processor.onEnd(span);
  }
  private applyMaskInPlace(span: ReadableSpan): void {
    const maskCandidates = [
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      LangfuseOtelSpanAttributes.TRACE_INPUT,
      LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
      LangfuseOtelSpanAttributes.TRACE_OUTPUT,
      LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
      LangfuseOtelSpanAttributes.TRACE_METADATA,
    ];

    for (const maskCandidate of maskCandidates) {
      if (maskCandidate in span.attributes) {
        span.attributes[maskCandidate] = this.applyMask(
          span.attributes[maskCandidate],
        );
      }
    }
  }

  private applyMask<T>(data: T): T | string {
    if (!this.mask) return data;

    try {
      return this.mask({ data });
    } catch (err) {
      this.logger.warn(
        `Applying mask function failed due to error, fully masking property. Error: ${err}`,
      );

      return "<fully masked due to failed mask function>";
    }
  }
}
