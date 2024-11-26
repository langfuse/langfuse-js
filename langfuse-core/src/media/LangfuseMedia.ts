let fs: any = null;
let cryptoModule: any = null;

if (typeof process !== "undefined" && process.versions?.node) {
  // Node
  try {
    fs = require("fs");
    cryptoModule = require("crypto");
  } catch (error) {
    console.error("Error loading crypto or fs module", error);
  }
} else if (typeof crypto !== "undefined") {
  // Edge Runtime, Cloudflare Workers, etc.
  cryptoModule = crypto;
}

import { type MediaContentType } from "../types";

interface ParsedMediaReference {
  mediaId: string;
  source: string;
  contentType: MediaContentType;
}

/**
 * A class for wrapping media objects for upload to Langfuse.
 *
 * This class handles the preparation and formatting of media content for Langfuse,
 * supporting both base64 data URIs and raw content bytes.
 */
class LangfuseMedia {
  obj?: object;

  _contentBytes?: Buffer;
  _contentType?: MediaContentType;
  _source?: string;
  _mediaId?: string;

  constructor(params: {
    obj?: object;
    base64DataUri?: string;
    contentType?: MediaContentType;
    contentBytes?: Buffer;
    filePath?: string;
  }) {
    const { obj, base64DataUri, contentType, contentBytes, filePath } = params;

    this.obj = obj;
    this._mediaId = undefined;

    if (base64DataUri) {
      const [contentBytesParsed, contentTypeParsed] = this.parseBase64DataUri(base64DataUri);
      this._contentBytes = contentBytesParsed;
      this._contentType = contentTypeParsed;
      this._source = "base64_data_uri";
    } else if (contentBytes && contentType) {
      this._contentBytes = contentBytes;
      this._contentType = contentType;
      this._source = "bytes";
    } else if (filePath && contentType) {
      if (!fs) {
        throw new Error("File system support is not available in this environment");
      }

      if (!fs.existsSync(filePath)) {
        throw new Error(`File at path ${filePath} does not exist`);
      }

      this._contentBytes = this.readFile(filePath);
      this._contentType = this._contentBytes ? contentType : undefined;
      this._source = this._contentBytes ? "file" : undefined;
    } else {
      console.error("base64DataUri, or contentBytes and contentType, or filePath must be provided to LangfuseMedia");
    }
  }

  private readFile(filePath: string): Buffer | undefined {
    try {
      if (!fs) {
        throw new Error("File system support is not available in this environment");
      }

      return fs.readFileSync(filePath);
    } catch (error) {
      console.error(`Error reading file at path ${filePath}`, error);
      return undefined;
    }
  }

  private parseBase64DataUri(data: string): [Buffer | undefined, MediaContentType | undefined] {
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

      return [Buffer.from(actualData, "base64"), contentType as MediaContentType];
    } catch (error) {
      console.error("Error parsing base64 data URI", error);
      return [undefined, undefined];
    }
  }

  get contentLength(): number | undefined {
    return this._contentBytes?.length;
  }

  get contentSha256Hash(): string | undefined {
    if (!this._contentBytes) {
      return undefined;
    }

    if (!cryptoModule) {
      console.error("Crypto support is not available in this environment");
      return undefined;
    }

    const sha256Hash = cryptoModule.createHash("sha256").update(this._contentBytes).digest("base64");
    return sha256Hash;
  }

  toJSON(): string | undefined {
    if (!this._contentType || !this._source || !this._mediaId) {
      return `<Upload handling failed for LangfuseMedia of type ${this._contentType}>`;
    }

    return `@@@langfuseMedia:type=${this._contentType}|id=${this._mediaId}|source=${this._source}@@@`;
  }

  /**
   * Parses a media reference string into a ParsedMediaReference.
   *
   * Example reference string:
   *     "@@@langfuseMedia:type=image/jpeg|id=some-uuid|source=base64DataUri@@@"
   *
   * @param referenceString - The reference string to parse.
   * @returns An object with the mediaId, source, and contentType.
   *
   * @throws Error if the reference string is invalid or missing required fields.
   */
  public static parseReferenceString(referenceString: string): ParsedMediaReference {
    const prefix = "@@@langfuseMedia:";
    const suffix = "@@@";

    if (!referenceString.startsWith(prefix)) {
      throw new Error("Reference string does not start with '@@@langfuseMedia:type='");
    }

    if (!referenceString.endsWith(suffix)) {
      throw new Error("Reference string does not end with '@@@'");
    }

    const content = referenceString.slice(prefix.length, -suffix.length);

    const pairs = content.split("|");
    const parsedData: { [key: string]: string } = {};

    for (const pair of pairs) {
      const [key, value] = pair.split("=", 2);
      parsedData[key] = value;
    }

    if (!("type" in parsedData && "id" in parsedData && "source" in parsedData)) {
      throw new Error("Missing required fields in reference string");
    }

    return {
      mediaId: parsedData["id"],
      source: parsedData["source"],
      contentType: parsedData["type"] as MediaContentType,
    };
  }
}

export { LangfuseMedia, type MediaContentType, type ParsedMediaReference };
