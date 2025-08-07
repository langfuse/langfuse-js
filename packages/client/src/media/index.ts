import {
  LangfuseAPIClient,
  ParsedMediaReference,
  MediaContentType,
  getGlobalLogger,
  uint8ArrayToBase64,
} from "@langfuse/core";

export type LangfuseMediaResolveMediaReferencesParams<T> = {
  obj: T;
  resolveWith: "base64DataUri";
  maxDepth?: number;
};

export class MediaManager {
  private apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
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
   * @param params.resolveWith - The representation of the media content to replace the media reference string with. Currently only "base64DataUri" is supported.
   * @param params.maxDepth - Optional. Default is 10. The maximum depth to traverse the object.
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
  public async resolveReferences<T>(
    params: LangfuseMediaResolveMediaReferencesParams<T>,
  ): Promise<T> {
    const { obj, maxDepth = 10 } = params;

    const traverse = async <T>(obj: T, depth: number): Promise<T> => {
      if (depth > maxDepth) {
        return obj;
      }

      // Handle string with potential media references
      if (typeof obj === "string") {
        const regex = /@@@langfuseMedia:.+?@@@/g;
        const referenceStringMatches = obj.match(regex);
        if (!referenceStringMatches) {
          return obj;
        }

        let result = obj;
        const referenceStringToMediaContentMap = new Map<string, string>();

        await Promise.all(
          referenceStringMatches.map(async (referenceString) => {
            try {
              const parsedMediaReference =
                MediaManager.parseReferenceString(referenceString);
              const mediaData = await this.apiClient.media.get(
                parsedMediaReference.mediaId,
              );
              const mediaContent = await fetch(mediaData.url, {
                method: "GET",
                headers: {},
              });
              if (mediaContent.status !== 200) {
                throw new Error("Failed to fetch media content");
              }

              const uint8Content = new Uint8Array(
                await mediaContent.arrayBuffer(),
              );

              const base64MediaContent = uint8ArrayToBase64(uint8Content);
              const base64DataUri = `data:${mediaData.contentType};base64,${base64MediaContent}`;

              referenceStringToMediaContentMap.set(
                referenceString,
                base64DataUri,
              );
            } catch (error) {
              getGlobalLogger().warn(
                "Error fetching media content for reference string",
                referenceString,
                error,
              );
            }
          }),
        );

        for (const [
          referenceString,
          base64MediaContent,
        ] of referenceStringToMediaContentMap.entries()) {
          result = result.replaceAll(referenceString, base64MediaContent) as T &
            string;
        }

        return result;
      }

      // Handle arrays
      if (Array.isArray(obj)) {
        return Promise.all(
          obj.map(async (item) => await traverse(item, depth + 1)),
        ) as Promise<T>;
      }

      // Handle objects
      if (typeof obj === "object" && obj !== null) {
        return Object.fromEntries(
          await Promise.all(
            Object.entries(obj).map(async ([key, value]) => [
              key,
              await traverse(value, depth + 1),
            ]),
          ),
        );
      }

      return obj;
    };

    return traverse(obj, 0);
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
  public static parseReferenceString(
    referenceString: string,
  ): ParsedMediaReference {
    const prefix = "@@@langfuseMedia:";
    const suffix = "@@@";

    if (!referenceString.startsWith(prefix)) {
      throw new Error(
        "Reference string does not start with '@@@langfuseMedia:type='",
      );
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

    if (
      !("type" in parsedData && "id" in parsedData && "source" in parsedData)
    ) {
      throw new Error("Missing required fields in reference string");
    }

    return {
      mediaId: parsedData["id"],
      source: parsedData["source"],
      contentType: parsedData["type"] as MediaContentType,
    };
  }
}
