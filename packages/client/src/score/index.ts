import {
  LangfuseAPIClient,
  IngestionEvent,
  getEnv,
  generateUUID,
  ScoreBody,
  getGlobalLogger,
  safeSetTimeout,
  IngestionResponse,
} from "@langfuse/core";
import { Span, trace } from "@opentelemetry/api";

const MAX_QUEUE_SIZE = 100_000; // prevent memory leaks
const MAX_BATCH_SIZE = 100;

/**
 * Manager for creating and batching score events in Langfuse.
 *
 * The ScoreManager handles automatic batching and flushing of score events
 * to optimize API usage. Scores are automatically sent when the queue reaches
 * a certain size or after a time interval.
 *
 * @public
 */
export class ScoreManager {
  private apiClient: LangfuseAPIClient;
  private eventQueue: IngestionEvent[] = [];
  private flushPromise: Promise<void> | null = null;
  private flushTimer: any = null;
  private flushAtCount: number;
  private flushIntervalSeconds: number;

  /**
   * Creates a new ScoreManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;

    const envFlushAtCount = getEnv("LANGFUSE_FLUSH_AT");
    const envFlushIntervalSeconds = getEnv("LANGFUSE_FLUSH_INTERVAL");

    this.flushAtCount = envFlushAtCount ? Number(envFlushAtCount) : 10;
    this.flushIntervalSeconds = envFlushIntervalSeconds
      ? Number(envFlushIntervalSeconds)
      : 1;
  }

  get logger() {
    return getGlobalLogger();
  }

  /**
   * Creates a new score event and adds it to the processing queue.
   *
   * Scores are queued and sent in batches for efficiency. The score will be
   * automatically sent when the queue reaches the flush threshold or after
   * the flush interval expires.
   *
   * @param data - The score data to create
   *
   * @example
   * ```typescript
   * langfuse.score.create({
   *   name: "quality",
   *   value: 0.85,
   *   traceId: "trace-123",
   *   comment: "High quality response"
   * });
   * ```
   */
  public create(data: ScoreBody): void {
    const scoreData: ScoreBody = {
      ...data,
      id: data.id ?? generateUUID(),
      environment: data.environment ?? getEnv("LANGFUSE_TRACING_ENVIRONMENT"),
    };

    const scoreIngestionEvent: IngestionEvent = {
      id: generateUUID(),
      type: "score-create",
      timestamp: new Date().toISOString(),
      body: scoreData,
    };

    if (this.eventQueue.length >= MAX_QUEUE_SIZE) {
      this.logger.error(
        `Score queue is at max size ${MAX_QUEUE_SIZE}. Dropping score.`,
      );
      return;
    }

    this.eventQueue.push(scoreIngestionEvent);

    if (this.eventQueue.length >= this.flushAtCount) {
      this.flushPromise = this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = safeSetTimeout(() => {
        this.flushPromise = this.flush();
      }, this.flushIntervalSeconds * 1_000);
    }
  }

  /**
   * Creates a score for a specific observation using its OpenTelemetry span.
   *
   * This method automatically extracts the trace ID and observation ID from
   * the provided span context.
   *
   * @param observation - Object containing the OpenTelemetry span
   * @param data - Score data (traceId and observationId will be auto-populated)
   *
   * @example
   * ```typescript
   * import { startSpan } from '@langfuse/tracing';
   *
   * const span = startSpan({ name: "my-operation" });
   * langfuse.score.observation(
   *   { otelSpan: span },
   *   { name: "accuracy", value: 0.92 }
   * );
   * ```
   */
  public observation(
    observation: { otelSpan: Span },
    data: Omit<
      ScoreBody,
      "traceId" | "sessionId" | "observationId" | "datasetRunId"
    >,
  ) {
    const { spanId, traceId } = observation.otelSpan.spanContext();

    this.create({
      ...data,
      traceId,
      observationId: spanId,
    });
  }

  /**
   * Creates a score for a trace using an OpenTelemetry span.
   *
   * This method automatically extracts the trace ID from the provided
   * span context and creates a trace-level score.
   *
   * @param observation - Object containing the OpenTelemetry span
   * @param data - Score data (traceId will be auto-populated)
   *
   * @example
   * ```typescript
   * import { startSpan } from '@langfuse/tracing';
   *
   * const span = startSpan({ name: "my-operation" });
   * langfuse.score.trace(
   *   { otelSpan: span },
   *   { name: "overall_quality", value: 0.88 }
   * );
   * ```
   */
  public trace(
    observation: { otelSpan: Span },
    data: Omit<
      ScoreBody,
      "traceId" | "sessionId" | "observationId" | "datasetRunId"
    >,
  ) {
    const { traceId } = observation.otelSpan.spanContext();

    this.create({
      ...data,
      traceId,
    });
  }

  /**
   * Creates a score for the currently active observation.
   *
   * This method automatically detects the active OpenTelemetry span and
   * creates an observation-level score. If no active span is found,
   * a warning is logged and the operation is skipped.
   *
   * @param data - Score data (traceId and observationId will be auto-populated)
   *
   * @example
   * ```typescript
   * import { startActiveSpan } from '@langfuse/tracing';
   *
   * startActiveSpan({ name: "my-operation" }, (span) => {
   *   // Inside the active span
   *   langfuse.score.activeObservation({
   *     name: "relevance",
   *     value: 0.95
   *   });
   * });
   * ```
   */
  public activeObservation(
    data: Omit<
      ScoreBody,
      "traceId" | "sessionId" | "observationId" | "datasetRunId"
    >,
  ) {
    const currentOtelSpan = trace.getActiveSpan();
    if (!currentOtelSpan) {
      this.logger.warn("No active span in context to score.");

      return;
    }

    const { spanId, traceId } = currentOtelSpan.spanContext();

    this.create({
      ...data,
      traceId,
      observationId: spanId,
    });
  }

  /**
   * Creates a score for the currently active trace.
   *
   * This method automatically detects the active OpenTelemetry span and
   * creates a trace-level score. If no active span is found,
   * a warning is logged and the operation is skipped.
   *
   * @param data - Score data (traceId will be auto-populated)
   *
   * @example
   * ```typescript
   * import { startActiveSpan } from '@langfuse/tracing';
   *
   * startActiveSpan({ name: "my-operation" }, (span) => {
   *   // Inside the active span
   *   langfuse.score.activeTrace({
   *     name: "user_satisfaction",
   *     value: 4,
   *     comment: "User rated 4 out of 5 stars"
   *   });
   * });
   * ```
   */
  public activeTrace(
    data: Omit<
      ScoreBody,
      "traceId" | "sessionId" | "observationId" | "datasetRunId"
    >,
  ) {
    const currentOtelSpan = trace.getActiveSpan();
    if (!currentOtelSpan) {
      this.logger.warn("No active span in context to score trace.");

      return;
    }

    const { traceId } = currentOtelSpan.spanContext();

    this.create({
      ...data,
      traceId,
    });
  }

  private async handleFlush() {
    try {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }

      const promises: Promise<IngestionResponse | void>[] = [];

      while (this.eventQueue.length > 0) {
        const batch = this.eventQueue.splice(0, MAX_BATCH_SIZE);

        promises.push(
          this.apiClient.ingestion
            .batch({ batch })
            .then((res) => {
              if (res.errors?.length > 0) {
                this.logger.error("Error ingesting scores:", res.errors);
              }
            })
            .catch((err) => {
              this.logger.error("Failed to export score batch:", err);
            }),
        );
      }

      await Promise.all(promises);
    } catch (err) {
      this.logger.error("Error flushing Score Manager: ", err);
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Flushes all pending score events to the Langfuse API.
   *
   * This method ensures all queued scores are sent immediately rather than
   * waiting for the automatic flush interval or batch size threshold.
   *
   * @returns Promise that resolves when all pending scores have been sent
   *
   * @example
   * ```typescript
   * langfuse.score.create({ name: "quality", value: 0.8 });
   * await langfuse.score.flush(); // Ensures the score is sent immediately
   * ```
   */
  public async flush() {
    return this.flushPromise ?? this.handleFlush();
  }

  /**
   * Gracefully shuts down the score manager by flushing all pending scores.
   *
   * This method should be called before your application exits to ensure
   * all score data is sent to Langfuse.
   *
   * @returns Promise that resolves when shutdown is complete
   *
   * @example
   * ```typescript
   * // Before application exit
   * await langfuse.score.shutdown();
   * ```
   */
  public async shutdown() {
    await this.flush();
  }
}
