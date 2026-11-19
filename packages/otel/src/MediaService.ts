import {
  LangfuseAPIClient,
  LangfuseMedia,
  LangfuseOtelSpanAttributes,
  Logger,
  base64ToBytes,
  getGlobalLogger,
  uploadMedia,
} from "@langfuse/core";
import type { MediaContentType } from "@langfuse/core";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";

export class MediaService {
  private pendingMediaUploads: Set<Promise<void>> = new Set();
  // One upload per (trace, field, media tag): spans that replay the same media
  // share the upload instead of requesting one upload URL per span. A failed
  // upload drops its key so a later span retries it, and flush() clears the map
  // to bound memory in long-lived processes.
  private uploadByKey: Map<string, Promise<void>> = new Map();
  private apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

  get logger(): Logger {
    return getGlobalLogger();
  }

  public async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingMediaUploads));
    this.uploadByKey.clear();
  }

  public async process(span: ReadableSpan) {
    const mediaAttributes = [
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      LangfuseOtelSpanAttributes.TRACE_INPUT,
      LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
      LangfuseOtelSpanAttributes.TRACE_OUTPUT,
      LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
      LangfuseOtelSpanAttributes.TRACE_METADATA,
    ];

    for (const mediaAttribute of mediaAttributes) {
      const mediaRelevantAttributeKeys = Object.keys(span.attributes).filter(
        (attributeName) => attributeName.startsWith(mediaAttribute),
      );

      for (const key of mediaRelevantAttributeKeys) {
        const value = span.attributes[key];

        if (typeof value !== "string") {
          this.logger.warn(
            `Span attribute ${mediaAttribute} is not a stringified object. Skipping media handling.`,
          );

          continue;
        }

        // Find media base64 data URI
        let mediaReplacedValue = value;
        const regex = /data:[^;]+;base64,[A-Za-z0-9+/]+=*/g;
        const foundMedia = [...new Set(value.match(regex) ?? [])];

        if (foundMedia.length === 0) continue;

        for (const mediaDataUri of foundMedia) {
          // For each media, create media tag and initiate upload
          const media = new LangfuseMedia({
            base64DataUri: mediaDataUri,
            source: "base64_data_uri",
          });

          const langfuseMediaTag = await media.getTag();

          if (!langfuseMediaTag) {
            this.logger.warn(
              "Failed to create Langfuse media tag. Skipping media item.",
            );

            continue;
          }

          this.scheduleUpload({
            span,
            media,
            tag: langfuseMediaTag,
            field: mediaAttribute.includes("input")
              ? "input"
              : mediaAttribute.includes("output")
                ? "output"
                : "metadata", // todo: make more robust
          });

          // Replace original attribute with media escaped attribute
          mediaReplacedValue = mediaReplacedValue.replaceAll(
            mediaDataUri,
            langfuseMediaTag,
          );
        }

        span.attributes[key] = mediaReplacedValue;
      }
    }

    // Handle media from Vercel AI SDK v6 and AI SDK v7.
    if (["ai", "gen_ai"].includes(span.instrumentationScope.name)) {
      const aiSDKMediaAttributes = ["ai.prompt.messages", "ai.prompt"];

      for (const mediaAttribute of aiSDKMediaAttributes) {
        const value = span.attributes[mediaAttribute];

        if (!value || typeof value !== "string") {
          continue;
        }

        // Find media base64 data URI
        let mediaReplacedValue = value;

        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            for (const message of parsed) {
              if (Array.isArray(message["content"])) {
                const contentParts = message["content"];

                for (const part of contentParts) {
                  if (part["type"] === "file") {
                    let base64Content: string | null = null;
                    const mediaType = part["mediaType"];
                    // FilePart
                    if (
                      typeof part["data"] === "string" &&
                      !part["data"].startsWith("http") // skip URL strings
                    ) {
                      base64Content = part["data"];
                    }

                    //ImagePart
                    if (
                      typeof part["image"] === "string" &&
                      !part["image"].startsWith("http") // skip URLs
                    ) {
                      base64Content = part["image"];
                    }

                    if (!base64Content || typeof mediaType !== "string") {
                      continue;
                    }

                    mediaReplacedValue = await this.replaceBytesMedia({
                      span,
                      mediaReplacedValue,
                      base64Content,
                      contentType: mediaType,
                      field: "input",
                    });
                  }
                }
              }
            }
          }

          span.attributes[mediaAttribute] = mediaReplacedValue;
        } catch (err) {
          this.logger.warn(
            `Failed to handle media for AI SDK attribute ${mediaAttribute} for span ${span.spanContext().spanId}`,
            err,
          );
        }
      }

      // Handle media from AI SDK v7 OpenTelemetry semantic-convention
      // attributes emitted by @ai-sdk/otel.
      const aiSDKV7MediaAttributes = [
        { attribute: "gen_ai.input.messages", field: "input" },
        { attribute: "gen_ai.output.messages", field: "output" },
      ] as const;

      for (const { attribute, field } of aiSDKV7MediaAttributes) {
        const value = span.attributes[attribute];

        if (!value || typeof value !== "string") {
          continue;
        }

        let mediaReplacedValue = value;

        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            for (const message of parsed) {
              if (!Array.isArray(message["parts"])) {
                continue;
              }

              for (const part of message["parts"]) {
                const content = part["content"];
                const mediaType = part["mime_type"];

                if (
                  part["type"] !== "blob" ||
                  typeof content !== "string" ||
                  !content ||
                  typeof mediaType !== "string" ||
                  content.startsWith("http")
                ) {
                  continue;
                }

                const normalizedContent = normalizeBase64Content(content);

                if (!normalizedContent) {
                  continue;
                }

                mediaReplacedValue = await this.replaceBytesMedia({
                  span,
                  mediaReplacedValue,
                  base64Content: normalizedContent.base64Content,
                  contentToReplace: content,
                  contentType: mediaType,
                  field,
                });
              }
            }
          }

          span.attributes[attribute] = mediaReplacedValue;
        } catch (err) {
          this.logger.warn(
            `Failed to handle media for AI SDK v7 attribute ${attribute} for span ${span.spanContext().spanId}`,
            err,
          );
        }
      }
    }
  }

  private async replaceBytesMedia(params: {
    span: ReadableSpan;
    mediaReplacedValue: string;
    base64Content: string;
    contentToReplace?: string;
    contentType: string;
    field: string;
  }): Promise<string> {
    const media = new LangfuseMedia({
      contentType: params.contentType as MediaContentType,
      contentBytes: base64ToBytes(params.base64Content),
      source: "bytes",
    });

    const langfuseMediaTag = await media.getTag();

    if (!langfuseMediaTag) {
      this.logger.warn(
        "Failed to create Langfuse media tag. Skipping media item.",
      );

      return params.mediaReplacedValue;
    }

    this.scheduleUpload({
      span: params.span,
      media,
      tag: langfuseMediaTag,
      field: params.field,
    });

    return params.mediaReplacedValue.replaceAll(
      params.contentToReplace ?? params.base64Content,
      langfuseMediaTag,
    );
  }

  private scheduleUpload(params: {
    span: ReadableSpan;
    field: string;
    media: LangfuseMedia;
    tag: string;
  }) {
    const { span, field, media, tag } = params;
    const key = `${span.spanContext().traceId}|${field}|${tag}`;
    if (this.uploadByKey.has(key)) return;

    const uploadPromise: Promise<void> = uploadMedia({
      apiClient: this.apiClient,
      media,
      traceId: span.spanContext().traceId,
      observationId: span.spanContext().spanId,
      field,
      logger: this.logger,
    })
      .catch((err) => {
        this.uploadByKey.delete(key);
        this.logger.error("Media upload failed with error: ", err);
      })
      .finally(() => {
        this.pendingMediaUploads.delete(uploadPromise);
      });

    this.uploadByKey.set(key, uploadPromise);
    this.pendingMediaUploads.add(uploadPromise);
  }
}

function normalizeBase64Content(
  content: string,
): { base64Content: string } | undefined {
  if (!content.startsWith("data:")) {
    return { base64Content: content };
  }

  const base64Start = content.indexOf(";base64,");

  if (base64Start === -1) {
    return;
  }

  const base64Content = content.slice(base64Start + ";base64,".length);

  if (!base64Content) {
    return;
  }

  return { base64Content };
}
