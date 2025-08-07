import {
  LangfuseAPIClient,
  ParsedMediaReference,
  MediaContentType,
  getGlobalLogger,
  uint8ArrayToBase64,
} from "@langfuse/core";

/**
 * Parameters for resolving media references in objects.
 *
 * @template T - The type of the object being processed
 * @public
 */
export type LangfuseMediaResolveMediaReferencesParams<T> = {
  /** The object to process for media references */
  obj: T;
  /** The format to resolve media references to (currently only "base64DataUri" is supported) */
  resolveWith: "base64DataUri";
  /** Maximum depth to traverse when processing nested objects (default: 10) */
  maxDepth?: number;
};

/**
 * Manager for media operations in Langfuse.
 *
 * Provides methods to resolve media references in objects by replacing
 * them with actual media content (e.g., base64 data URIs).
 *
 * @public
 */
export class MediaManager {
  private apiClient: LangfuseAPIClient;

  /**
   * Creates a new MediaManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

  /**
   * Replaces media reference strings in an object with base64 data URIs.
   *
   * This method recursively traverses an object looking for media reference strings
   * in the format "@@@langfuseMedia:...@@@". When found, it fetches the actual media
   * content from Langfuse and replaces the reference string with a base64 data URI.
   *
   * If fetching media content fails for a reference string, a warning is logged
   * and the reference string is left unchanged.
   *
   * @param params - Configuration object
   * @returns A deep copy of the input object with media references resolved
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
   * const result = await langfuse.media.resolveReferences({
   *   obj,
   *   resolveWith: "base64DataUri"
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
