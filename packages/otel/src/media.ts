import { getGlobalLogger, type MediaContentType } from "@langfuse/core";

import { getSha256HashFromBytes, isCryptoAvailable } from "./hash.js";

export type LangfuseMediaParams =
  | { source: "base64_data_uri"; base64DataUri: string }
  | {
      source: "bytes";
      contentBytes: Buffer;
      contentType: MediaContentType;
    };

/**
 * A class for wrapping media objects for upload to Langfuse.
 *
 * This class handles the preparation and formatting of media content for Langfuse,
 * supporting both base64 data URIs and raw content bytes.
 */
class LangfuseMedia {
  _contentBytes?: Buffer;
  _contentType?: MediaContentType;
  _source?: string;

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

  get id(): string | null {
    if (!this.contentSha256Hash) return null;

    const urlSafeContentHash = this.contentSha256Hash
      .replaceAll("+", "-")
      .replaceAll("/", "_");

    return urlSafeContentHash.slice(0, 22);
  }

  get contentLength(): number | undefined {
    return this._contentBytes?.length;
  }

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

  get tag(): string | null {
    if (!this._contentType || !this._source || !this.id) return null;

    return `@@@langfuseMedia:type=${this._contentType}|id=${this.id}|source=${this._source}@@@`;
  }

  get base64DataUri(): string | null {
    if (!this._contentBytes) return null;

    return `data:${this._contentType};base64,${Buffer.from(this._contentBytes).toString("base64")}`;
  }

  toJSON(): string | null {
    return this.base64DataUri;
  }
}

export { LangfuseMedia, type MediaContentType };
