import { LangfuseAPIClient } from "./api/Client.js";
import { Logger, getGlobalLogger } from "./logger/index.js";
import { LangfuseMedia } from "./media.js";

/**
 * Parameters for {@link uploadMedia}.
 *
 * @internal
 */
export type UploadMediaParams = {
  /** The API client used to request the upload URL and report completion. */
  apiClient: LangfuseAPIClient;
  /** The media to upload. */
  media: LangfuseMedia;
  /**
   * The trace the media belongs to. Omit for media that is not associated with
   * a trace (e.g. dataset item media).
   */
  traceId?: string;
  /** The observation the media belongs to, if any. */
  observationId?: string;
  /**
   * The trace / observation field the media is associated with (`input`,
   * `output`, or `metadata`). Ignored when {@link traceId} is omitted.
   */
  field?: string;
  /** Logger to use. Defaults to the global logger. */
  logger?: Logger;
  /** Maximum number of upload retries on transient failures. Defaults to 3. */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff. Defaults to 1000. */
  baseDelay?: number;
};

/**
 * Uploads a {@link LangfuseMedia} to Langfuse.
 *
 * Requests a presigned upload URL, uploads the content with exponential-backoff
 * retries, and reports completion. The media may be associated with a trace /
 * observation (pass {@link UploadMediaParams.traceId}) or stand alone (e.g.
 * dataset item media), in which case the trace context is omitted.
 *
 * If the media has already been uploaded (server returns no upload URL), this
 * resolves without re-uploading.
 *
 * @throws {Error} If required media fields are missing or the upload fails after
 *   all retries.
 * @internal
 */
export async function uploadMedia(params: UploadMediaParams): Promise<void> {
  const {
    apiClient,
    media,
    traceId,
    observationId,
    field,
    maxRetries = 3,
    baseDelay = 1000,
  } = params;
  const logger = params.logger ?? getGlobalLogger();

  const contentSha256Hash = await media.getSha256Hash();

  if (
    !media.contentLength ||
    !media._contentType ||
    !contentSha256Hash ||
    !media._contentBytes
  ) {
    throw new Error("Cannot upload media: media content is incomplete.");
  }

  const { uploadUrl, mediaId } = await apiClient.media.getUploadUrl({
    contentLength: media.contentLength,
    traceId,
    observationId,
    field,
    contentType: media._contentType,
    sha256Hash: contentSha256Hash,
  });

  if (!uploadUrl) {
    logger.debug(
      `Media status: Media with ID ${mediaId} already uploaded. Skipping duplicate upload.`,
    );

    return;
  }

  const clientSideMediaId = await media.getId();
  if (clientSideMediaId !== mediaId) {
    throw new Error(
      `Media integrity error: Media ID mismatch between SDK (${clientSideMediaId}) and Server (${mediaId}). Upload cancelled.`,
    );
  }

  logger.debug(`Uploading media ${mediaId}...`);

  const startTime = Date.now();

  const uploadResponse = await uploadWithBackoff({
    uploadUrl,
    contentBytes: media._contentBytes,
    contentType: media._contentType,
    contentSha256Hash,
    maxRetries,
    baseDelay,
  });

  if (!uploadResponse) {
    throw new Error("Media upload process failed");
  }

  // Determine success before reading the body: response.text() can only be
  // consumed once, and the patch call below consumes it.
  const uploadSucceeded =
    uploadResponse.status === 200 || uploadResponse.status === 201;

  await apiClient.media.patch(mediaId, {
    uploadedAt: new Date().toISOString(),
    uploadHttpStatus: uploadResponse.status,
    uploadHttpError: await uploadResponse.text(),
    uploadTimeMs: Date.now() - startTime,
  });

  logger.debug(`Media upload status reported for ${mediaId}`);

  // uploadWithBackoff returns the response from the final attempt even when its
  // status is not 2xx. Throw so callers (e.g. dataset item creation) do not
  // proceed as if the bytes were durably stored.
  if (!uploadSucceeded) {
    throw new Error(
      `Media upload failed with HTTP ${uploadResponse.status} after ${maxRetries} retries.`,
    );
  }
}

async function uploadWithBackoff(params: {
  uploadUrl: string;
  contentType: string;
  contentSha256Hash: string;
  contentBytes: Uint8Array;
  maxRetries: number;
  baseDelay: number;
}): Promise<Response | undefined> {
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

      const isSelfHostedGcsBucket =
        parsedHostname === "storage.googleapis.com" ||
        parsedHostname.endsWith(".storage.googleapis.com");

      const headers: Record<string, string> = isSelfHostedGcsBucket
        ? { "Content-Type": contentType }
        : {
            "Content-Type": contentType,
            "x-amz-checksum-sha256": contentSha256Hash,
            "x-ms-blob-type": "BlockBlob",
          };

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        // Recent fetch typings narrow BodyInit to an ArrayBuffer-backed view,
        // while Uint8Array now defaults to Uint8Array<ArrayBufferLike>. The
        // media bytes are always ArrayBuffer-backed, so assert the narrower type.
        body: contentBytes as Uint8Array<ArrayBuffer>,
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

  return undefined;
}
