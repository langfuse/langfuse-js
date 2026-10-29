import { getGlobalLogger } from "@langfuse/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

/**
 * Logs a one-time hint when span export is rejected with HTTP 403, the
 * response an organization API key gets when no project is named. Stays
 * silent when a project ID is configured, as the hint would not apply.
 *
 * @internal
 */
export class MissingProjectHintSpanExporter implements SpanExporter {
  private readonly delegate: SpanExporter;
  private hasLoggedHint: boolean;

  constructor(delegate: SpanExporter, params: { projectId?: string }) {
    this.delegate = delegate;
    this.hasLoggedHint = Boolean(params.projectId);
  }

  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    this.delegate.export(spans, (result) => {
      const status = (result.error as { code?: unknown } | undefined)?.code;
      if (status === 403 && !this.hasLoggedHint) {
        this.hasLoggedHint = true;
        getGlobalLogger().error(
          "Span export was rejected with HTTP 403. If you are using an organization API key, set the projectId option or the LANGFUSE_PROJECT_ID environment variable to the target project.",
        );
      }
      resultCallback(result);
    });
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
