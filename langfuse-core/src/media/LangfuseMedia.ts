import { type LangfuseCore } from "../index";

let fs: any = null;
let cryptoModule: any = null;

if (typeof process !== "undefined" && process.versions?.node) {
  // Use wrapper to prevent bundlers from trying to resolve the dynamic import
  // Otherwise, the import will be incorrectly resolved as a static import even though it's dynamic
  // Test for browser environment would fail because the import will be incorrectly resolved as a static import and fs and crypto will be unavailable
  const dynamicImport = (module: string): Promise<any> => {
    return import(/* webpackIgnore: true */ module);
  };

  // Node
  Promise.all([dynamicImport("fs"), dynamicImport("crypto")])
    .then(([importedFs, importedCrypto]) => {
      fs = importedFs;
      cryptoModule = importedCrypto;
    })
    .catch(); // Errors are handled on runtime
} else if (typeof crypto !== "undefined") {
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

  /**
   * Replaces the media reference strings in an object with base64 data URIs for the media content.
   *
   * This method recursively traverses an object (up to a maximum depth of 10) looking for media reference strings
   * in the format "@@@langfuseMedia:...@@@". When found, it fetches the actual media content using the provided
   * Langfuse client and replaces the reference string with a base64 data URI.
   *
   * If fetching media content fails for a reference string, a warning is logged and the reference string is left unchanged.
   *
   * @param params - Configuration object
   * @param params.obj - The object to process. Can be a primitive value, array, or nested object
   * @param params.langfuseClient - Langfuse client instance used to fetch media content
   * @param params.resolveWith - Optional. Default is "base64DataUri". The type of data to replace the media reference string with. Currently only "base64DataUri" is supported.
   *
   * @returns A deep copy of the input object with all media references replaced with base64 data URIs where possible
   *
   * @example
   * ```typescript
   * const obj = {
   *   image: "@@@langfuseMedia:type=image/jpeg|id=123|source=bytes@@@",
   *   nested: {
   *     pdf: "@@@langfuseMedia:type=application/pdf|id=456|source=bytes@@@"
   *   }
   * };
   *
   * const result = await LangfuseMedia.resolveMediaReferences({
   *   obj,
   *   langfuseClient
   * });
   *
   * // Result:
   * // {
   * //   image: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
   * //   nested: {
   * //     pdf: "data:application/pdf;base64,JVBERi0xLjcK..."
   * //   }
   * // }
   * ```
   */
  public static async resolveMediaReferences<T>(params: {
    obj: T;
    langfuseClient: LangfuseCore;
    resolveWith?: "base64DataUri";
  }): Promise<T> {
    const { obj, langfuseClient } = params;
    const MAX_DEPTH = 10;

    async function traverse<T>(obj: T, depth: number): Promise<T> {
      if (depth > MAX_DEPTH) {
        return obj;
      }

      // Handle string with potential media references
      if (typeof obj === "string") {
        const regex = /@@@langfuseMedia:.+@@@/g;
        const referenceStringMatches = obj.match(regex);
        if (!referenceStringMatches) {
          return obj;
        }

        let result = obj;
        const referenceStringToMediaContentMap = new Map<string, string>();

        await Promise.all(
          referenceStringMatches.map(async (referenceString) => {
            try {
              const parsedMediaReference = LangfuseMedia.parseReferenceString(referenceString);
              const mediaData = await langfuseClient.getMediaById(parsedMediaReference.mediaId);
              const mediaContent = await langfuseClient.fetch(mediaData.url, { method: "GET", headers: {} });
              const base64MediaContent = Buffer.from(await mediaContent.arrayBuffer()).toString("base64");
              const base64DataUri = `data:${mediaData.contentType};base64,${base64MediaContent}`;

              referenceStringToMediaContentMap.set(referenceString, base64DataUri);
            } catch (error) {
              console.warn("Error fetching media content for reference string", referenceString, error);
              // Do not replace the reference string if there's an error
            }
          })
        );

        for (const [referenceString, base64MediaContent] of referenceStringToMediaContentMap.entries()) {
          result = result.replaceAll(referenceString, base64MediaContent) as T & string;
        }

        return result;
      }

      // Handle arrays
      if (Array.isArray(obj)) {
        return Promise.all(obj.map(async (item) => await traverse(item, depth + 1))) as Promise<T>;
      }

      // Handle objects
      if (typeof obj === "object" && obj !== null) {
        return Object.fromEntries(
          await Promise.all(Object.entries(obj).map(async ([key, value]) => [key, await traverse(value, depth + 1)]))
        );
      }

      return obj;
    }

    return traverse(obj, 0);
  }
}

export { LangfuseMedia, type MediaContentType, type ParsedMediaReference };
