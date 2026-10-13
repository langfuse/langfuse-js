import {
  generateUUID,
  LANGFUSE_SDK_NAME,
  LANGFUSE_SDK_VERSION,
  type CreateScoreRequest,
} from "@langfuse/core";

import { LangfuseBrowserError } from "./errors.js";
import type {
  LangfuseBrowserClientOptions,
  LangfuseBrowserScoreBody,
  LangfuseBrowserScoreResult,
} from "./types.js";
import {
  filterAdditionalHeaders,
  isCreateScoreResponse,
  parseErrorResponseBody,
  parseJsonResponse,
  removeTrailingSlash,
} from "./utils.js";

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const SDK_INTEGRATION = "browser";

export class LangfuseBrowserClient {
  private readonly publicKey: string;
  private readonly baseUrl: string;
  private readonly environment?: string;
  private readonly additionalHeaders?: Record<string, string>;
  private readonly fetch: typeof fetch;

  constructor(options: LangfuseBrowserClientOptions) {
    if (!options.publicKey) {
      throw new LangfuseBrowserError("Langfuse publicKey is required.");
    }

    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!fetchImplementation) {
      throw new LangfuseBrowserError(
        "No fetch implementation available. Pass a fetch implementation in the LangfuseBrowser options.",
      );
    }

    this.publicKey = options.publicKey;
    this.baseUrl = removeTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.environment = options.environment;
    this.additionalHeaders = filterAdditionalHeaders(options.additionalHeaders);
    this.fetch = options.fetch ?? fetchImplementation.bind(globalThis);
  }

  /**
   * Creates a score via `POST /api/public/scores`.
   *
   * The browser SDK sends each score immediately as a single request.
   */
  public async score(
    body: LangfuseBrowserScoreBody,
  ): Promise<LangfuseBrowserScoreResult> {
    const score = {
      ...body,
      id: body.id ?? generateUUID(globalThis),
      environment: body.environment ?? this.environment,
      timestamp: new Date().toISOString(),
    } as CreateScoreRequest;

    let response: Response;
    try {
      const fetchImplementation = this.fetch;
      response = await fetchImplementation(
        `${this.baseUrl}/api/public/scores`,
        {
          method: "POST",
          headers: {
            ...this.additionalHeaders,
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.publicKey}`,
            "X-Langfuse-Public-Key": this.publicKey,
            "X-Langfuse-Sdk-Name": LANGFUSE_SDK_NAME,
            "X-Langfuse-Sdk-Version": LANGFUSE_SDK_VERSION,
            "X-Langfuse-Sdk-Integration": SDK_INTEGRATION,
          },
          body: JSON.stringify(score),
        },
      );
    } catch (error) {
      throw new LangfuseBrowserError("Failed to send score to Langfuse.", {
        originalError: error,
      });
    }

    if (!response.ok) {
      const responseBody = await parseErrorResponseBody(response);
      throw new LangfuseBrowserError(
        `Langfuse score request failed with status ${response.status}.`,
        {
          status: response.status,
          response: responseBody,
        },
      );
    }

    const json = await parseJsonResponse(response);
    if (!isCreateScoreResponse(json)) {
      throw new LangfuseBrowserError(
        "Langfuse score response had an unexpected shape.",
        { response: json },
      );
    }

    return { id: json.id };
  }
}

export * from "./types.js";
export { LangfuseBrowserError } from "./errors.js";
