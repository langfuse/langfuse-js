import {
  Logger,
  LogLevel,
  getGlobalLogger,
  LangfuseAPIClient,
  LANGFUSE_SDK_VERSION,
  LangfuseOtelSpanAttributes,
  getEnv,
  base64Encode,
  getLangfuseTraceIdFromBaggage,
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
import { isDefaultExportSpan } from "./span-filter.js";

/**
 * Function type for masking sensitive data in spans before export.
 *
 * @param params - Object containing the data to be masked
 * @param params.data - The data that should be masked
 * @returns The masked data, or a promise resolving to it
 *
 * @example
 * ```typescript
 * const maskFunction: MaskFunction = async ({ data }) => {
 *   if (typeof data === 'string') {
 *     return data.replace(/password=\w+/g, 'password=***');
 *   }
 *   return data;
 * };
 * ```
 *
 * @public
 */
export type MaskFunction = (params: { data: any }) => any | Promise<any>;

/**
 * Function type for determining whether a span should be exported to Langfuse.
 * If provided, this is treated as a full override of the default filtering behavior.
 * Langfuse may call this predicate both when a span starts for app-root classification
 * and when the span ends for export filtering. Prefer side-effect-free predicates; the
 * start-time call sees only attributes available at span creation, and end-time fields
 * such as duration may not be populated yet.
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
 * All parameters are optional. Explicit values always take precedence over
 * environment variables; environment variables take precedence over defaults.
 *
 * @public
 */
export interface LangfuseSpanProcessorParams {
  /**
   * Custom OpenTelemetry span exporter. If not provided, a default OTLP HTTP
   * exporter targeting `{baseUrl}/api/public/otel/v1/traces` is created from
   * the credentials below. Provide your own exporter only when routing spans
   * somewhere other than Langfuse (e.g. an OTel collector).
   */
  exporter?: SpanExporter;

  /**
   * Langfuse public API key (`pk-lf-...`).
   * Falls back to the `LANGFUSE_PUBLIC_KEY` environment variable.
   */
  publicKey?: string;

  /**
   * Langfuse secret API key (`sk-lf-...`).
   * Falls back to the `LANGFUSE_SECRET_KEY` environment variable.
   */
  secretKey?: string;

  /**
   * Base URL of the Langfuse instance, e.g. `https://cloud.langfuse.com` (EU),
   * `https://us.cloud.langfuse.com` (US), or your self-hosted URL.
   *
   * Resolution order:
   * 1. This parameter
   * 2. `LANGFUSE_BASE_URL` environment variable (canonical spelling, identical
   *    to the Python SDK's `LANGFUSE_BASE_URL`)
   * 3. `LANGFUSE_BASEURL` environment variable (legacy JS v2/v3 spelling
   *    without the second underscore — still accepted, but prefer
   *    `LANGFUSE_BASE_URL`)
   * 4. Default: `https://cloud.langfuse.com`
   *
   * @defaultValue "https://cloud.langfuse.com"
   */
  baseUrl?: string;

  /**
   * Number of finished spans to buffer before an export is triggered.
   * Only applies to `exportMode: "batched"` (the default); ignored in
   * `"immediate"` mode. Falls back to the `LANGFUSE_FLUSH_AT` environment
   * variable.
   */
  flushAt?: number;

  /**
   * Maximum delay in seconds between exports in `"batched"` mode; ignored in
   * `"immediate"` mode. Falls back to the `LANGFUSE_FLUSH_INTERVAL`
   * environment variable.
   */
  flushInterval?: number;

  /**
   * Function to mask sensitive data before export. It is applied to the
   * observation/trace input, output, and metadata attributes of every
   * exported span. If the function throws, the affected attribute is replaced
   * with `<fully masked due to failed mask function>` rather than exported
   * unmasked.
   *
   * @see {@link MaskFunction}
   * @see https://langfuse.com/docs/observability/features/masking
   */
  mask?: MaskFunction;

  /**
   * Predicate that decides whether a span is exported to Langfuse. Providing
   * it fully replaces the default filter, which exports Langfuse SDK spans,
   * spans with `gen_ai.*`/`ai.*` attributes, and spans from known LLM
   * instrumentation libraries. Use it to drop noisy infrastructure spans
   * (HTTP, database) or to restrict export to specific subtrees.
   *
   * @see {@link ShouldExportSpan}
   */
  shouldExportSpan?: ShouldExportSpan;

  /**
   * Whether the processor scans span input/output/metadata for base64 data
   * URIs (images, audio, PDFs, ...), uploads them to the Langfuse media API,
   * and replaces them with lightweight reference strings before export.
   *
   * Set to `false` to skip media handling and export base64 payloads
   * unchanged — e.g. when spans never contain media and you want to avoid the
   * scanning overhead, or when payload size limits are not a concern.
   * Can also be disabled by setting the `LANGFUSE_MEDIA_UPLOAD_ENABLED`
   * environment variable to `false` or `0`.
   *
   * Media uploads happen asynchronously; await {@link LangfuseSpanProcessor.forceFlush}
   * to guarantee they complete before process exit.
   *
   * @defaultValue true
   * @see https://langfuse.com/docs/observability/features/multi-modality
   */
  mediaUploadEnabled?: boolean;

  /**
   * Environment tag added to all exported traces (e.g. `production`,
   * `staging`). Must be a lowercase alphanumeric string (hyphens/underscores
   * allowed, max 40 chars) not starting with `langfuse`. Falls back to the
   * `LANGFUSE_TRACING_ENVIRONMENT` environment variable.
   *
   * @see https://langfuse.com/docs/observability/features/environments
   */
  environment?: string;

  /**
   * Release identifier (e.g. git SHA, semver) added to all exported traces.
   * Falls back to the `LANGFUSE_RELEASE` environment variable.
   *
   * @see https://langfuse.com/docs/observability/features/releases-and-versioning
   */
  release?: string;

  /**
   * Export request timeout in seconds. Falls back to the `LANGFUSE_TIMEOUT`
   * environment variable.
   *
   * @defaultValue 5
   */
  timeout?: number;

  /**
   * Additional HTTP headers to include with span export and media upload requests.
   */
  additionalHeaders?: Record<string, string>;

  /**
   * Span export mode.
   *
   * - **batched** (default): Spans are buffered and exported in batches
   *   (see {@link LangfuseSpanProcessorParams.flushAt} and
   *   {@link LangfuseSpanProcessorParams.flushInterval}). Use this in
   *   long-running processes (servers, workers) for best throughput.
   * - **immediate**: Every span is handed to the exporter as soon as it ends,
   *   without batching. Use this in short-lived or freezable environments —
   *   serverless functions (Vercel, AWS Lambda, Cloudflare Workers, edge
   *   runtimes) — where the process may be frozen or terminated right after
   *   the response is sent and batched spans would be lost.
   *
   * Note: even with `"immediate"`, span post-processing (masking, media
   * upload) and the export HTTP request are asynchronous. In serverless
   * environments, additionally await {@link LangfuseSpanProcessor.forceFlush}
   * before the function returns (e.g. inside Vercel's `after()` or
   * `waitUntil()`) to guarantee delivery.
   *
   * @defaultValue "batched"
   */
  exportMode?: "immediate" | "batched";
}

/**
 * OpenTelemetry span processor that exports spans to Langfuse.
 *
 * This is the single component that connects any OpenTelemetry-instrumented
 * application to Langfuse: register it with your OTel trace provider and all
 * matching spans (from `@langfuse/tracing`, Vercel AI SDK telemetry, or any
 * other GenAI instrumentation) are sent to Langfuse. It provides:
 * - Batched (default) or immediate span export
 * - Media extraction and upload from base64 data URIs
 * - Masking of sensitive data before export
 * - Smart span filtering (or a custom `shouldExportSpan` override)
 * - Environment and release tagging
 *
 * Configuration is read from constructor params first, then from environment
 * variables: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
 * (legacy alias: `LANGFUSE_BASEURL`), `LANGFUSE_FLUSH_AT`,
 * `LANGFUSE_FLUSH_INTERVAL`, `LANGFUSE_TIMEOUT`,
 * `LANGFUSE_MEDIA_UPLOAD_ENABLED`, `LANGFUSE_TRACING_ENVIRONMENT`,
 * `LANGFUSE_RELEASE`.
 *
 * **Serverless / short-lived environments** (Vercel, AWS Lambda, Cloudflare
 * Workers, edge): pass `exportMode: "immediate"` so spans are not held in a
 * batch, and await {@link LangfuseSpanProcessor.forceFlush} before the
 * function instance is frozen or terminated — e.g. inside Vercel's `after()`
 * callback or the platform's `waitUntil()`. Spans that are still buffered or
 * mid-processing when the process exits are lost.
 *
 * @example
 * Long-running Node.js process:
 * ```typescript
 * import { NodeSDK } from '@opentelemetry/sdk-node';
 * import { LangfuseSpanProcessor } from '@langfuse/otel';
 *
 * const sdk = new NodeSDK({
 *   spanProcessors: [
 *     new LangfuseSpanProcessor({
 *       publicKey: 'pk-lf-...',
 *       secretKey: 'sk-lf-...',
 *       baseUrl: 'https://cloud.langfuse.com',
 *       environment: 'production',
 *     })
 *   ]
 * });
 *
 * sdk.start();
 * ```
 *
 * @example
 * Serverless (e.g. Next.js on Vercel):
 * ```typescript
 * // instrumentation.ts
 * import { LangfuseSpanProcessor } from '@langfuse/otel';
 * import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
 *
 * export const langfuseSpanProcessor = new LangfuseSpanProcessor({
 *   exportMode: 'immediate', // do not batch; process may freeze after response
 * });
 *
 * new NodeTracerProvider({
 *   spanProcessors: [langfuseSpanProcessor],
 * }).register();
 *
 * // app/api/chat/route.ts
 * // import { after } from 'next/server';
 * // after(async () => await langfuseSpanProcessor.forceFlush());
 * ```
 *
 * @see https://langfuse.com/docs/observability/sdk/overview
 * @see https://langfuse.com/integrations/frameworks/vercel-ai-sdk for the Next.js / AI SDK setup
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
  private shouldExportSpan: ShouldExportSpan;
  private mediaUploadEnabled: boolean;
  private apiClient: LangfuseAPIClient;
  private processor: SpanProcessor;
  private mediaService: MediaService;
  private spanExportExpectationById: Map<string, boolean> = new Map();

  /**
   * Creates a new LangfuseSpanProcessor instance.
   *
   * Credentials and settings not passed explicitly are read from environment
   * variables (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
   * `LANGFUSE_BASE_URL` — legacy alias `LANGFUSE_BASEURL`), so
   * `new LangfuseSpanProcessor()` with no arguments is the common setup.
   * Missing credentials log a warning at construction time and cause span
   * exports to fail.
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
   *     // Full override of default filtering:
   *     // export only spans from specific services
   *     return otelSpan.name.startsWith("my-service");
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
    const envMediaUploadEnabled = getEnv("LANGFUSE_MEDIA_UPLOAD_ENABLED");
    const mediaUploadEnabled =
      params?.mediaUploadEnabled ??
      (envMediaUploadEnabled
        ? !["false", "0"].includes(envMediaUploadEnabled.toLowerCase())
        : true);

    const exporter =
      params?.exporter ??
      new OTLPTraceExporter({
        url: `${baseUrl}/api/public/otel/v1/traces`,
        headers: {
          Authorization: `Basic ${authHeaderValue}`,
          "x-langfuse-sdk-name": "javascript",
          "x-langfuse-sdk-version": LANGFUSE_SDK_VERSION,
          "x-langfuse-public-key": publicKey ?? "<missing>",
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
    this.shouldExportSpan =
      params?.shouldExportSpan ??
      (({ otelSpan }) => isDefaultExportSpan(otelSpan));
    this.mediaUploadEnabled = mediaUploadEnabled;
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
      mediaUploadEnabled,
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
    const propagatedAttributes =
      getPropagatedAttributesFromContext(parentContext);

    // An explicit prompt set at span creation takes precedence over a propagated one
    if (
      span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] !=
      null
    ) {
      delete propagatedAttributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME
      ];
      delete propagatedAttributes[
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION
      ];
    }

    // Set propagated attributes, environment and release attributes
    span.setAttributes({
      [LangfuseOtelSpanAttributes.ENVIRONMENT]: this.environment,
      [LangfuseOtelSpanAttributes.RELEASE]: this.release,
      ...propagatedAttributes,
    });

    try {
      this.markAppRootCandidate(span, parentContext);
    } catch (err) {
      this.logger.debug(
        "App-root start-time check failed. Span will not be marked as app root.",
        { spanName: span.name },
        err,
      );
    }

    return this.processor.onStart(span, parentContext);
  }

  /**
   * Called when a span ends. Processes the span for export to Langfuse.
   *
   * This method:
   * 1. Checks if the span should be exported using shouldExportSpan
   *    (custom override or default smart filter)
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
    this.spanExportExpectationById.delete(span.spanContext().spanId);

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
   * Awaiting this promise guarantees that every span that has ended so far —
   * including its asynchronous masking and media-upload post-processing — has
   * been handed to the exporter and exported. This is the only way to
   * guarantee delivery of tracing data; `exportMode: "immediate"` alone does
   * not wait for in-flight async work.
   *
   * **When to call:**
   * - Serverless / edge (Vercel, AWS Lambda, Cloudflare Workers): await this
   *   before the function instance is frozen or terminated — e.g. inside
   *   Vercel's `after()` callback, or via the platform's `waitUntil()`.
   *   For streaming responses, flush after the stream has finished (e.g. from
   *   the `onFinish` callback), otherwise the final spans are not yet ended.
   * - Long-running processes: not needed during normal operation; call
   *   {@link LangfuseSpanProcessor.shutdown} on process exit instead.
   *
   * Note: this flushes tracing spans only. Scores created via
   * `@langfuse/client`'s `LangfuseClient` are flushed separately with
   * `langfuseClient.flush()`.
   *
   * @returns Promise that resolves when all pending spans, media uploads, and exports are complete
   *
   * @example
   * ```typescript
   * // Next.js route handler on Vercel
   * import { after } from 'next/server';
   * import { langfuseSpanProcessor } from '@/instrumentation';
   *
   * export async function POST(req: Request) {
   *   const response = await handleChat(req);
   *   after(async () => await langfuseSpanProcessor.forceFlush());
   *   return response;
   * }
   * ```
   *
   * @override
   */
  public async forceFlush(): Promise<void> {
    await this.flush();

    return this.processor.forceFlush();
  }

  /**
   * Gracefully shuts down the processor: flushes all pending spans and media
   * uploads (like {@link LangfuseSpanProcessor.forceFlush}), then shuts down
   * the underlying exporter. After shutdown, newly ended spans are no longer
   * exported.
   *
   * Call this once before a long-running process exits (e.g. in a `SIGTERM`
   * handler, or via `NodeSDK.shutdown()` which delegates here). In serverless
   * environments prefer {@link LangfuseSpanProcessor.forceFlush}, since the
   * same function instance may be reused for later invocations.
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
    try {
      if (this.shouldExportSpan({ otelSpan: span }) === false) {
        this.logger.debug("Dropped span due to shouldExportSpan filter.", {
          spanName: span.name,
          instrumentationScope: span.instrumentationScope.name,
        });

        return;
      }
    } catch (err) {
      this.logger.error(
        "shouldExportSpan failed with error. Dropping span.",
        {
          spanName: span.name,
          instrumentationScope: span.instrumentationScope.name,
        },
        err,
      );

      return;
    }

    await this.applyMaskInPlace(span);

    if (this.mediaUploadEnabled) {
      await this.mediaService.process(span);
    }

    if (this.logger.isLevelEnabled(LogLevel.DEBUG)) {
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
    }

    this.processor.onEnd(span);
  }

  private markAppRootCandidate(span: Span, parentContext: Context): void {
    const traceId = span.spanContext().traceId;
    const spanId = span.spanContext().spanId;
    const parentSpanId = span.parentSpanContext?.spanId;

    const expectedExportedAtStart = this.isExpectedExportedAtStart(span);
    const propagatedClaim = getLangfuseTraceIdFromBaggage(parentContext);

    const isParentExpectedExported =
      parentSpanId !== undefined
        ? this.spanExportExpectationById.get(parentSpanId) === true
        : false;
    const suppressedByParentClaim = propagatedClaim === traceId;

    this.spanExportExpectationById.set(spanId, expectedExportedAtStart);

    const markAppRoot =
      expectedExportedAtStart &&
      !isParentExpectedExported &&
      !suppressedByParentClaim;

    if (markAppRoot) {
      span.setAttribute(LangfuseOtelSpanAttributes.IS_APP_ROOT, true);
    }
  }

  private isExpectedExportedAtStart(span: Span): boolean {
    // Span (from sdk-trace-base) already implements ReadableSpan, so the cast
    // is safe and avoids depending on private OTel APIs.
    const readable = span as unknown as ReadableSpan;

    try {
      return this.shouldExportSpan({ otelSpan: readable }) === true;
    } catch (err) {
      this.logger.debug(
        "shouldExportSpan threw during app-root start-time check. " +
          "Span will not be marked as app root.",
        {
          spanName: span.name,
          instrumentationScope: readable.instrumentationScope.name,
        },
        err,
      );

      return false;
    }
  }

  private async applyMaskInPlace(span: ReadableSpan): Promise<void> {
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
        span.attributes[maskCandidate] = await this.applyMask(
          span.attributes[maskCandidate],
        );
      }
    }
  }

  private async applyMask<T>(data: T): Promise<T | string> {
    if (!this.mask) return data;

    try {
      return await this.mask({ data });
    } catch (err) {
      this.logger.warn(
        `Applying mask function failed due to error, fully masking property. Error: ${err}`,
      );

      return "<fully masked due to failed mask function>";
    }
  }
}
