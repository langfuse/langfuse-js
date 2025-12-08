import {
  LangfuseAPIClient,
  LangfuseMedia,
  LangfuseOtelSpanAttributes,
  Logger,
  base64ToBytes,
  getGlobalLogger,
} from "@langfuse/core";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";

export class MediaService {
  private pendingMediaUploads: Set<Promise<void>> = new Set();
  private apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

  get logger(): Logger {
    return getGlobalLogger();
  }

  public async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingMediaUploads));
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

    // Handle media from Vercel AI SDK
    if (span.instrumentationScope.name === "ai") {
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
                    // FilePart
                    if (part["data"] != null && part["mediaType"] != null) {
                      base64Content = part["data"];
                    }

                    //ImagePart
                    if (
                      part["image"] != null &&
                      part["mediaType"] != null &&
                      !part["image"].startsWith("http") // skip URLs
                    ) {
                      base64Content = part["image"];
                    }

                    if (!base64Content) continue;

                    const media = new LangfuseMedia({
                      contentType: part["mediaType"],
                      contentBytes: base64ToBytes(base64Content),
                      source: "bytes",
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
                      field: "input",
                    });

                    // Replace original attribute with media escaped attribute
                    mediaReplacedValue = mediaReplacedValue.replaceAll(
                      base64Content,
                      langfuseMediaTag,
                    );
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
    }
  }

  private scheduleUpload(params: {
    span: ReadableSpan;
    field: string;
    media: LangfuseMedia;
  }) {
    const { span, field, media } = params;

    const uploadPromise: Promise<void> = this.handleUpload({
      media,
      traceId: span.spanContext().traceId,
      observationId: span.spanContext().spanId,
      field,
    }).catch((err) => {
      this.logger.error("Media upload failed with error: ", err);
    });

    this.pendingMediaUploads.add(uploadPromise);

    uploadPromise.finally(() => {
      this.pendingMediaUploads.delete(uploadPromise);
    });
  }

  private async handleUpload({
    media,
    traceId,
    observationId,
    field,
  }: {
    media: LangfuseMedia;
    traceId: string;
    observationId?: string;
    field: string;
  }): Promise<void> {
    try {
      const contentSha256Hash = await media.getSha256Hash();

      if (
        !media.contentLength ||
        !media._contentType ||
        !contentSha256Hash ||
        !media._contentBytes
      ) {
        return;
      }

      const { uploadUrl, mediaId } = await this.apiClient.media.getUploadUrl({
        contentLength: media.contentLength,
        traceId,
        observationId,
        field,
        contentType: media._contentType,
        sha256Hash: contentSha256Hash,
      });

      if (!uploadUrl) {
        this.logger.debug(
          `Media status: Media with ID ${mediaId} already uploaded. Skipping duplicate upload.`,
        );

        return;
      }

      const clientSideMediaId = await media.getId();
      if (clientSideMediaId !== mediaId) {
        this.logger.error(
          `Media integrity error: Media ID mismatch between SDK (${clientSideMediaId}) and Server (${mediaId}). Upload cancelled. Please check media ID generation logic.`,
        );

        return;
      }

      this.logger.debug(`Uploading media ${mediaId}...`);

      const startTime = Date.now();

      const uploadResponse = await this.uploadWithBackoff({
        uploadUrl,
        contentBytes: media._contentBytes,
        contentType: media._contentType,
        contentSha256Hash: contentSha256Hash,
        maxRetries: 3,
        baseDelay: 1000,
      });

      if (!uploadResponse) {
        throw Error("Media upload process failed");
      }

      await this.apiClient.media.patch(mediaId, {
        uploadedAt: new Date().toISOString(),
        uploadHttpStatus: uploadResponse.status,
        uploadHttpError: await uploadResponse.text(),
        uploadTimeMs: Date.now() - startTime,
      });

      this.logger.debug(`Media upload status reported for ${mediaId}`);
    } catch (err) {
      this.logger.error(`Error processing media item: ${err}`);
    }
  }

  private async uploadWithBackoff(params: {
    uploadUrl: string;
    contentType: string;
    contentSha256Hash: string;
    contentBytes: Uint8Array;
    maxRetries: number;
    baseDelay: number;
  }) {
    const {
      uploadUrl,
      contentType,
      contentSha256Hash,
      contentBytes,
      maxRetries,
      baseDelay,
    } = params;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let parsedHostname: string;

        try {
          parsedHostname = new URL(uploadUrl).hostname;
        } catch {
          parsedHostname = "";
        }

        const isSelfHostedGcsBucket = parsedHostname === "storage.googleapis.com" ||
          parsedHostname.endsWith(".storage.googleapis.com");

        const headers = isSelfHostedGcsBucket
          ? { "Content-Type": contentType }
          : {
              "Content-Type": contentType,
              "x-amz-checksum-sha256": contentSha256Hash,
              "x-ms-blob-type": "BlockBlob",
            };

        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          body: contentBytes,
          headers,
        });

        if (
          attempt < maxRetries &&
          uploadResponse.status !== 200 &&
          uploadResponse.status !== 201
        ) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`);
        }

        return uploadResponse;
      } catch (e) {
        if (attempt === maxRetries) {
          throw e;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;

        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }
  }
}
