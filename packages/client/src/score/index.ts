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

export class ScoreManager {
  private apiClient: LangfuseAPIClient;
  private eventQueue: IngestionEvent[] = [];
  private flushPromise: Promise<void> | null = null;
  private flushTimer: any = null;
  private flushAtCount: number;
  private flushIntervalSeconds: number;

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

  public async flush() {
    return this.flushPromise ?? this.handleFlush();
  }

  public async shutdown() {
    await this.flush();
  }
}
