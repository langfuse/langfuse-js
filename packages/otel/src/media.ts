import { getGlobalLogger, type MediaContentType } from "@langfuse/core";

import { getSha256HashFromBytes, isCryptoAvailable } from "./hash.js";

/**
 * Parameters for creating a LangfuseMedia instance.
 *
 * Supports two input formats:
 * - Base64 data URI (e.g., "data:image/png;base64,...")
 * - Raw bytes with explicit content type
 *
 * @public
 */
export type LangfuseMediaParams =
  | {
      /** Indicates the media is provided as a base64 data URI */
      source: "base64_data_uri";
      /** The complete base64 data URI string */
      base64DataUri: string;
    }
  | {
      /** Indicates the media is provided as raw bytes */
      source: "bytes";
      /** The raw content bytes */
      contentBytes: Buffer;
      /** The MIME type of the content */
      contentType: MediaContentType;
    };

/**
 * A class for wrapping media objects for upload to Langfuse.
 *
 * This class handles the preparation and formatting of media content for Langfuse,
 * supporting both base64 data URIs and raw content bytes. It automatically:
 * - Parses base64 data URIs to extract content type and bytes
 * - Generates SHA-256 hashes for content integrity
 * - Creates unique media IDs based on content hash
 * - Formats media references for embedding in traces
 *
 * @example
 * ```typescript
 * // From base64 data URI
 * const media1 = new LangfuseMedia({
 *   source: "base64_data_uri",
 *   base64DataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
 * });
 *
 * // From raw bytes
 * const media2 = new LangfuseMedia({
 *   source: "bytes",
 *   contentBytes: Buffer.from("Hello World"),
 *   contentType: "text/plain"
 * });
 *
 * console.log(media1.id); // Unique media ID
 * console.log(media1.tag); // Media reference tag
 * ```
 *
 * @public
 */
class LangfuseMedia {
  _contentBytes?: Buffer;
  _contentType?: MediaContentType;
  _source?: string;

  /**
   * Creates a new LangfuseMedia instance.
   *
   * @param params - Media parameters specifying the source and content
   *
   * @example
   * ```typescript
   * // Create from base64 data URI
   * const media = new LangfuseMedia({
   *   source: "base64_data_uri",
   *   base64DataUri: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
   * });
   * ```
   */
  constructor(params: LangfuseMediaParams) {
    const { source } = params;

    this._source = source;

    if (source === "base64_data_uri") {
      const [contentBytesParsed, contentTypeParsed] = this.parseBase64DataUri(
        params.base64DataUri,
      );
      this._contentBytes = contentBytesParsed;
      this._contentType = contentTypeParsed;
    } else {
      this._contentBytes = params.contentBytes;
      this._contentType = params.contentType;
    }
  }

  /**
   * Parses a base64 data URI to extract content bytes and type.
   *
   * @param data - The base64 data URI string
   * @returns Tuple of [contentBytes, contentType] or [undefined, undefined] on error
   * @private
   */
  private parseBase64DataUri(
    data: string,
  ): [Buffer | undefined, MediaContentType | undefined] {
    try {
      if (!data || typeof data !== "string") {
        throw new Error("Data URI is not a string");
      }

      if (!data.startsWith("data:")) {
        throw new Error("Data URI does not start with 'data:'");
      }

      const [header, actualData] = data.slice(5).split(",", 2);
      if (!header || !actualData) {
        throw new Error("Invalid URI");
      }

      const headerParts = header.split(";");
      if (!headerParts.includes("base64")) {
        throw new Error("Data is not base64 encoded");
      }

      const contentType = headerParts[0];
      if (!contentType) {
        throw new Error("Content type is empty");
      }

      return [
        Buffer.from(actualData, "base64"),
        contentType as MediaContentType,
      ];
    } catch (error) {
      getGlobalLogger().error("Error parsing base64 data URI", error);
      return [undefined, undefined];
    }
  }

  /**
   * Gets a unique identifier for this media based on its content hash.
   *
   * The ID is derived from the first 22 characters of the URL-safe base64-encoded
   * SHA-256 hash of the content.
   *
   * @returns The unique media ID, or null if hash generation failed
   *
   * @example
   * ```typescript
   * const media = new LangfuseMedia({...});
   * console.log(media.id); // "A1B2C3D4E5F6G7H8I9J0K1"
   * ```
   */
  get id(): string | null {
    if (!this.contentSha256Hash) return null;

    const urlSafeContentHash = this.contentSha256Hash
      .replaceAll("+", "-")
      .replaceAll("/", "_");

    return urlSafeContentHash.slice(0, 22);
  }

  /**
   * Gets the length of the media content in bytes.
   *
   * @returns The content length in bytes, or undefined if no content is available
   */
  get contentLength(): number | undefined {
    return this._contentBytes?.length;
  }

  /**
   * Gets the SHA-256 hash of the media content.
   *
   * The hash is used for content integrity verification and generating unique media IDs.
   * Returns undefined if crypto is not available or hash generation fails.
   *
   * @returns The base64-encoded SHA-256 hash, or undefined if unavailable
   */
  get contentSha256Hash(): string | undefined {
    if (!this._contentBytes || !isCryptoAvailable) {
      return undefined;
    }

    try {
      return getSha256HashFromBytes(this._contentBytes);
    } catch (error) {
      getGlobalLogger().warn(
        "[Langfuse] Failed to generate SHA-256 hash for media content:",
        error,
      );

      return undefined;
    }
  }

  /**
   * Gets the media reference tag for embedding in trace data.
   *
   * The tag format is: `@@@langfuseMedia:type=<contentType>|id=<mediaId>|source=<source>@@@`
   * This tag can be embedded in trace attributes and will be replaced with actual
   * media content when the trace is viewed in Langfuse.
   *
   * @returns The media reference tag, or null if required data is missing
   *
   * @example
   * ```typescript
   * const media = new LangfuseMedia({...});
   * console.log(media.tag);
   * // "@@@langfuseMedia:type=image/png|id=A1B2C3D4E5F6G7H8I9J0K1|source=base64_data_uri@@@"
   * ```
   */
  get tag(): string | null {
    if (!this._contentType || !this._source || !this.id) return null;

    return `@@@langfuseMedia:type=${this._contentType}|id=${this.id}|source=${this._source}@@@`;
  }

  /**
   * Gets the media content as a base64 data URI.
   *
   * @returns The complete data URI string, or null if no content is available
   *
   * @example
   * ```typescript
   * const media = new LangfuseMedia({...});
   * console.log(media.base64DataUri);
   * // "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB..."
   * ```
   */
  get base64DataUri(): string | null {
    if (!this._contentBytes) return null;

    return `data:${this._contentType};base64,${Buffer.from(this._contentBytes).toString("base64")}`;
  }

  /**
   * Serializes the media to JSON (returns the base64 data URI).
   *
   * @returns The base64 data URI, or null if no content is available
   */
  toJSON(): string | null {
    return this.base64DataUri;
  }
}

export { LangfuseMedia, type MediaContentType };
