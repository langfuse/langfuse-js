import {
  generateUUID,
  LANGFUSE_SDK_NAME,
  LANGFUSE_SDK_VERSION,
  type IngestionEvent,
  type IngestionRequest,
} from "@langfuse/core";

import { LangfuseBrowserError } from "./errors.js";
import type {
  LangfuseBrowserOptions,
  LangfuseBrowserScoreBody,
  LangfuseBrowserScoreResult,
  LangfuseIngestionResponse,
} from "./types.js";
import {
  filterAdditionalHeaders,
  isIngestionResponse,
  parseErrorResponseBody,
  parseJsonResponse,
  removeTrailingSlash,
} from "./utils.js";

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const SDK_INTEGRATION = "browser";

type LangfuseScoreCreateEvent = Extract<
  IngestionEvent,
  { type: "score-create" }
> & {
  body: LangfuseBrowserScoreBody & { id: string };
};

export class LangfuseBrowser {
  private readonly publicKey: string;
  private readonly baseUrl: string;
  private readonly environment?: string;
  private readonly additionalHeaders?: Record<string, string>;
  private readonly fetch: typeof fetch;

  constructor(options: LangfuseBrowserOptions) {
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
   * Creates a score via the Langfuse ingestion API.
   *
   * The browser SDK sends scores immediately as single-event ingestion batches.
   */
  public async score(
    body: LangfuseBrowserScoreBody,
  ): Promise<LangfuseBrowserScoreResult> {
    const scoreId = body.id ?? generateUUID(globalThis);
    const event = this.createScoreEvent(scoreId, body);
    const response = await this.postIngestionBatch([event]);

    if (response.errors.length > 0) {
      throw new LangfuseBrowserError("Langfuse score ingestion failed.", {
        errors: response.errors,
        response,
      });
    }

    const hasSuccess = response.successes.some(
      (success) => success.id === event.id,
    );
    if (!hasSuccess) {
      throw new LangfuseBrowserError(
        "Langfuse score ingestion response did not include the created score event.",
        { response },
      );
    }

    return { id: scoreId };
  }

  private createScoreEvent(
    scoreId: string,
    body: LangfuseBrowserScoreBody,
  ): LangfuseScoreCreateEvent {
    return {
      id: generateUUID(globalThis),
      type: "score-create",
      timestamp: new Date().toISOString(),
      body: {
        ...body,
        id: scoreId,
        environment: body.environment ?? this.environment,
      },
    };
  }

  private async postIngestionBatch(
    batch: LangfuseScoreCreateEvent[],
  ): Promise<LangfuseIngestionResponse> {
    let response: Response;
    try {
      const fetchImplementation = this.fetch;
      const request: IngestionRequest = {
        batch,
        metadata: {
          batch_size: batch.length,
          sdk_name: LANGFUSE_SDK_NAME,
          sdk_version: LANGFUSE_SDK_VERSION,
          sdk_integration: SDK_INTEGRATION,
          public_key: this.publicKey,
        },
      };
      response = await fetchImplementation(
        `${this.baseUrl}/api/public/ingestion`,
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
          body: JSON.stringify(request),
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
        `Langfuse ingestion request failed with status ${response.status}.`,
        {
          status: response.status,
          response: responseBody,
        },
      );
    }

    const json = await parseJsonResponse(response);
    if (!isIngestionResponse(json)) {
      throw new LangfuseBrowserError(
        "Langfuse ingestion response had an unexpected shape.",
        { response: json },
      );
    }

    return json;
  }
}

export * from "./types.js";
export { LangfuseBrowserError } from "./errors.js";
