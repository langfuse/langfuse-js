import packageJson from "../package.json" with { type: "json" };

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const SDK_NAME = "javascript";
const SDK_VARIANT = "langfuse-browser";
const SDK_INTEGRATION = "DEFAULT";
const RESERVED_ADDITIONAL_HEADER_NAMES = new Set([
  "authorization",
  "content-type",
  "x-langfuse-public-key",
  "x-langfuse-sdk-name",
  "x-langfuse-sdk-version",
  "x-langfuse-sdk-variant",
  "x-langfuse-sdk-integration",
]);

type FetchLike = typeof fetch;

export type LangfuseScoreDataType =
  | "NUMERIC"
  | "BOOLEAN"
  | "CATEGORICAL"
  | "CORRECTION"
  | "TEXT";

export const LangfuseScoreDataType = {
  Numeric: "NUMERIC",
  Boolean: "BOOLEAN",
  Categorical: "CATEGORICAL",
  Correction: "CORRECTION",
  Text: "TEXT",
} as const;

export interface LangfuseBrowserOptions {
  /**
   * Langfuse public key obtained from the project settings.
   */
  publicKey: string;
  /**
   * Langfuse host.
   *
   * @defaultValue "https://cloud.langfuse.com"
   */
  baseUrl?: string;
  /**
   * Environment attached to scores when not provided on the score body.
   */
  environment?: string;
  /**
   * Additional HTTP headers sent with ingestion requests. SDK auth and
   * telemetry headers take precedence over these values.
   */
  additionalHeaders?: Record<string, string>;
  /**
   * Custom fetch implementation. Useful for tests and non-standard runtimes.
   */
  fetch?: FetchLike;
}

export interface LangfuseBrowserScoreBody {
  id?: string;
  traceId?: string;
  sessionId?: string;
  observationId?: string;
  datasetRunId?: string;
  name: string;
  environment?: string;
  queueId?: string;
  value: number | string;
  comment?: string;
  metadata?: unknown;
  dataType?: LangfuseScoreDataType;
  configId?: string;
}

export interface LangfuseBrowserScoreResult {
  id: string;
}

export interface LangfuseIngestionError {
  id: string;
  status: number;
  message?: string;
  error?: unknown;
}

export interface LangfuseIngestionSuccess {
  id: string;
  status: number;
}

export interface LangfuseIngestionResponse {
  successes: LangfuseIngestionSuccess[];
  errors: LangfuseIngestionError[];
}

type LangfuseScoreCreateEvent = {
  id: string;
  type: "score-create";
  timestamp: string;
  body: LangfuseBrowserScoreBody & { id: string };
};

export class LangfuseBrowserError extends Error {
  public readonly status?: number;
  public readonly response?: unknown;
  public readonly errors?: LangfuseIngestionError[];
  public readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      response?: unknown;
      errors?: LangfuseIngestionError[];
      originalError?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "LangfuseBrowserError";
    this.status = options.status;
    this.response = options.response;
    this.errors = options.errors;
    this.originalError = options.originalError;
  }
}

export class LangfuseBrowser {
  private readonly publicKey: string;
  private readonly baseUrl: string;
  private readonly environment?: string;
  private readonly additionalHeaders?: Record<string, string>;
  private readonly fetch: FetchLike;

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
    const scoreId = body.id ?? generateUUID();
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
      id: generateUUID(),
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
      response = await fetchImplementation(
        `${this.baseUrl}/api/public/ingestion`,
        {
          method: "POST",
          headers: {
            ...this.additionalHeaders,
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.publicKey}`,
            "X-Langfuse-Public-Key": this.publicKey,
            "X-Langfuse-Sdk-Name": SDK_NAME,
            "X-Langfuse-Sdk-Version": packageJson.version,
            "X-Langfuse-Sdk-Variant": SDK_VARIANT,
            "X-Langfuse-Sdk-Integration": SDK_INTEGRATION,
          },
          body: JSON.stringify({
            batch,
            metadata: {
              batch_size: batch.length,
              sdk_name: SDK_NAME,
              sdk_version: packageJson.version,
              sdk_variant: SDK_VARIANT,
              sdk_integration: SDK_INTEGRATION,
              public_key: this.publicKey,
            },
          }),
        },
      );
    } catch (error) {
      throw new LangfuseBrowserError("Failed to send score to Langfuse.", {
        originalError: error,
      });
    }

    const json = await parseJsonResponse(response);
    if (!response.ok) {
      throw new LangfuseBrowserError(
        `Langfuse ingestion request failed with status ${response.status}.`,
        {
          status: response.status,
          response: json,
        },
      );
    }

    if (!isIngestionResponse(json)) {
      throw new LangfuseBrowserError(
        "Langfuse ingestion response had an unexpected shape.",
        { response: json },
      );
    }

    return json;
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LangfuseBrowserError(
      "Langfuse ingestion response was not valid JSON.",
      {
        status: response.status,
        response: text,
        originalError: error,
      },
    );
  }
}

function isIngestionResponse(
  value: unknown,
): value is LangfuseIngestionResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "successes" in value &&
    "errors" in value &&
    Array.isArray((value as LangfuseIngestionResponse).successes) &&
    Array.isArray((value as LangfuseIngestionResponse).errors)
  );
}

function filterAdditionalHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !RESERVED_ADDITIONAL_HEADER_NAMES.has(name.toLowerCase()),
    ),
  );
}

function removeTrailingSlash(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === url.length ? url : url.slice(0, end);
}

function generateUUID(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  let timestamp = new Date().getTime();
  let performanceTimestamp =
    globalThis.performance?.now && globalThis.performance.now() * 1000;

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    let random = Math.random() * 16;
    if (timestamp > 0) {
      random = (timestamp + random) % 16 | 0;
      timestamp = Math.floor(timestamp / 16);
    } else {
      random = ((performanceTimestamp ?? 0) + random) % 16 | 0;
      performanceTimestamp = Math.floor((performanceTimestamp ?? 0) / 16);
    }

    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
