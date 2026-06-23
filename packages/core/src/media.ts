import { MediaContentType } from "./api/api/index.js";
import { getGlobalLogger } from "./logger/index.js";
import { base64ToBytes, bytesToBase64 } from "./utils.js";

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
      contentBytes: Uint8Array;
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
 *   contentBytes: new Uint8Array([72, 101, 108, 108, 111])
 *   contentType: "text/plain"
 * });
 *
 * console.log(media1.id); // Unique media ID
 * console.log(media1.tag); // Media reference tag
 * ```
 *
 * @public
 */
export class LangfuseMedia {
  _contentBytes?: Uint8Array;
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
  ): [Uint8Array | undefined, MediaContentType | undefined] {
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

      return [base64ToBytes(actualData), contentType as MediaContentType];
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
  async getId(): Promise<string | null> {
    const contentSha256Hash = await this.getSha256Hash();
    if (!contentSha256Hash) return null;

    const urlSafeContentHash = contentSha256Hash
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
  async getSha256Hash(): Promise<string | undefined> {
    if (!this._contentBytes) {
      return undefined;
    }

    try {
      const hash = await crypto.subtle.digest("SHA-256", this._contentBytes);

      return bytesToBase64(new Uint8Array(hash));
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
  async getTag(): Promise<string | null> {
    const id = await this.getId();

    if (!this._contentType || !this._source || !id) return null;

    return `@@@langfuseMedia:type=${this._contentType}|id=${id}|source=${this._source}@@@`;
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

    return `data:${this._contentType};base64,${bytesToBase64(this._contentBytes)}`;
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

/**
 * Parameters for constructing a {@link LangfuseMediaReference}.
 *
 * @public
 */
export type LangfuseMediaReferenceParams = {
  /** The unique Langfuse identifier of the media record */
  mediaId: string;
  /** The MIME type of the media record */
  contentType: string;
  /** The signed download URL of the media record */
  url: string;
  /** The expiry date and time (ISO 8601) of the signed download URL */
  urlExpiry?: string;
  /** The size of the media record in bytes */
  contentLength?: number;
  /**
   * The original `@@@langfuseMedia:…@@@` reference string. Used to losslessly
   * round-trip a resolved reference back through the API / tracing when a
   * fetched dataset item is re-used.
   */
  referenceString: string;
};

/**
 * A resolved reference to a media record stored in Langfuse.
 *
 * Returned in place of media reference strings when fetching dataset items via
 * `langfuse.dataset.get`. It holds the media metadata and a signed download
 * URL, and exposes helpers to fetch the content in the formats commonly
 * expected by LLM providers.
 *
 * The signed `url` is short-lived. Fetch the content promptly, or re-fetch the
 * dataset item if {@link LangfuseMediaReference.isUrlExpired} returns true.
 *
 * @example Feeding media to a provider
 * ```typescript
 * const dataset = await langfuse.dataset.get("visual-qa");
 *
 * for (const item of dataset.items) {
 *   const image = item.input.image as LangfuseMediaReference;
 *
 *   // OpenAI: { type: "input_image", image_url: await image.fetchDataUri() }
 *   // Anthropic: { source: { type: "base64", media_type: image.contentType, data: await image.fetchBase64() } }
 *   // Vercel AI SDK: { type: "image", image: await image.fetchBytes(), mediaType: image.contentType }
 * }
 * ```
 *
 * @public
 */
export class LangfuseMediaReference implements LangfuseMediaReferenceParams {
  readonly mediaId!: string;
  readonly contentType!: string;
  readonly url!: string;
  readonly urlExpiry?: string;
  readonly contentLength?: number;
  readonly referenceString!: string;

  constructor(params: LangfuseMediaReferenceParams) {
    Object.assign(this, params);
  }

  /**
   * Serializes to the original `@@@langfuseMedia:…@@@` reference string.
   *
   * This makes resolved references round-trip losslessly through anything that
   * serializes with `JSON.stringify` — the dataset item API, experiment/trace
   * span attributes — so a re-used item links back to its media instead of
   * persisting a JSON object with a soon-to-expire signed URL.
   */
  toJSON(): string {
    return this.referenceString;
  }

  /**
   * Returns whether the signed download URL is expired or near expiry.
   *
   * @param thresholdSeconds - Treat the URL as expired this many seconds before
   *   its actual expiry to account for clock skew and download time (default: 60).
   * @returns true if the URL is expired or within the threshold of expiry. If
   *   the expiry is unknown or unparseable, returns false.
   */
  isUrlExpired(thresholdSeconds = 60): boolean {
    if (!this.urlExpiry) {
      return false;
    }

    const expiryMs = Date.parse(this.urlExpiry);
    if (Number.isNaN(expiryMs)) {
      return false;
    }

    return expiryMs - Date.now() <= thresholdSeconds * 1000;
  }

  /**
   * Fetches the media content from the signed URL over the network.
   *
   * Useful for local evaluators / image libraries, manual base64 conversion, or
   * the Vercel AI SDK (`{ type: "image", image: await media.fetchBytes() }`).
   *
   * @returns The media content as raw bytes
   * @throws {Error} If the download fails
   */
  async fetchBytes(): Promise<Uint8Array> {
    const response = await fetch(this.url, { method: "GET", headers: {} });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch media ${this.mediaId}: HTTP ${response.status}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Fetches the media over the network and returns raw base64 (no data URI prefix).
   *
   * Useful for Anthropic (`{ source: { type: "base64", media_type: media.contentType, data: await media.fetchBase64() } }`)
   * or LangChain (`{ type: "image", base64: await media.fetchBase64(), mime_type: media.contentType }`).
   *
   * @returns The media content as a base64 string
   * @throws {Error} If the download fails
   */
  async fetchBase64(): Promise<string> {
    return bytesToBase64(await this.fetchBytes());
  }

  /**
   * Fetches the media over the network and returns a `data:<contentType>;base64,...` URI.
   *
   * Useful for OpenAI (`{ type: "input_image", image_url: await media.fetchDataUri() }`).
   *
   * @returns The media content as a base64 data URI
   * @throws {Error} If the download fails
   */
  async fetchDataUri(): Promise<string> {
    return `data:${this.contentType};base64,${await this.fetchBase64()}`;
  }
}
