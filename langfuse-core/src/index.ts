import {
  type LangfuseFetchOptions,
  type LangfuseFetchResponse,
  type LangfuseQueueItem,
  type LangfuseCoreOptions,
  LangfusePersistedProperty,
  type CreateLangfuseTraceBody,
  type LangfuseObject,
  type CreateLangfuseEventBody,
  type CreateLangfuseSpanBody,
  type CreateLangfuseGenerationBody,
  type CreateLangfuseScoreBody,
  type UpdateLangfuseSpanBody,
  type UpdateLangfuseGenerationBody,
  type GetLangfuseDatasetParams,
  type GetLangfuseDatasetResponse,
  type CreateLangfuseDatasetRunItemBody,
  type CreateLangfuseDatasetRunItemResponse,
  type CreateLangfuseDatasetBody,
  type CreateLangfuseDatasetResponse,
  type CreateLangfuseDatasetItemBody,
  type CreateLangfuseDatasetItemResponse,
  type GetLangfuseDatasetRunResponse,
  type GetLangfuseDatasetRunParams,
  type DeferRuntime,
  type IngestionReturnType,
  type SingleIngestionEvent,
  type CreateLangfusePromptResponse,
  type CreateLangfusePromptBody,
  type GetLangfusePromptResponse,
  type PromptInput,
  type CreatePromptBody,
  type CreateChatPromptBody,
  type CreateTextPromptBody,
  type GetLangfuseDatasetItemsQuery,
  type GetLangfuseDatasetItemsResponse,
  type GetLangfuseDatasetRunsQuery,
  type GetLangfuseDatasetRunsResponse,
  type GetLangfuseTracesQuery,
  type GetLangfuseTracesResponse,
  type GetLangfuseObservationsQuery,
  type GetLangfuseObservationsResponse,
  type GetLangfuseObservationResponse,
  type GetLangfuseTraceResponse,
  type ChatMessage,
  type GetLangfuseSessionsQuery,
  type GetLangfuseSessionsResponse,
} from "./types";
import {
  generateUUID,
  removeTrailingSlash,
  retriable,
  type RetriableOptions,
  safeSetTimeout,
  getEnv,
  currentISOTime,
  encodeQueryParams,
} from "./utils";

export * as utils from "./utils";
import { SimpleEventEmitter } from "./eventemitter";
import { getCommonReleaseEnvs } from "./release-env";
import { ChatPromptClient, TextPromptClient, type LangfusePromptClient } from "./prompts/promptClients";
import { LangfusePromptCache } from "./prompts/promptCache";
export { LangfuseMemoryStorage } from "./storage-memory";

export type IngestionBody = SingleIngestionEvent["body"];
export * from "./prompts/promptClients";

class LangfuseFetchHttpError extends Error {
  name = "LangfuseFetchHttpError";
  body: string | undefined;

  constructor(
    public response: LangfuseFetchResponse,
    body: string
  ) {
    super("HTTP error while fetching Langfuse: " + response.status + " and body: " + body);
  }
}

class LangfuseFetchNetworkError extends Error {
  name = "LangfuseFetchNetworkError";

  constructor(public error: unknown) {
    super("Network error while fetching Langfuse", error instanceof Error ? { cause: error } : {});
  }
}

function isLangfuseFetchError(err: any): boolean {
  return typeof err === "object" && (err.name === "LangfuseFetchHttpError" || err.name === "LangfuseFetchNetworkError");
}

// Constants for URLs
const SUPPORT_URL = "https://langfuse.com/support";
const API_DOCS_URL = "https://api.reference.langfuse.com";
const RBAC_DOCS_URL = "https://langfuse.com/docs/rbac";
const RATE_LIMITS_URL = "https://langfuse.com/faq/all/api-limits";
const NPM_PACKAGE_URL = "https://www.npmjs.com/package/langfuse";

// Error messages
const updatePromptResponse = `Make sure to keep your SDK updated, refer to ${NPM_PACKAGE_URL} for details.`;
const defaultErrorResponse = `Unexpected error occurred. Please check your request and contact support: ${SUPPORT_URL}.`;

// Error response map
const errorResponseByCode = new Map<number, string>([
  // Internal error category: 5xx errors, 404 error
  [500, `Internal server error occurred. Please contact support: ${SUPPORT_URL}`],
  [501, `Not implemented. Please check your request and contact support: ${SUPPORT_URL}.`],
  [502, `Bad gateway. Please try again later and contact support: ${SUPPORT_URL}.`],
  [503, `Service unavailable. Please try again later and contact support if the error persists: ${SUPPORT_URL}.`],
  [504, "Gateway timeout. Please try again later and contact support: ${SUPPORT_URL}."],
  [
    404,
    `Internal error occurred. Likely caused by race condition, please escalate to support if seen in high volume: ${SUPPORT_URL}`,
  ],

  // Client error category: 4xx errors, excluding 404
  [
    400,
    `Bad request. Please check your request for any missing or incorrect parameters. Refer to our API docs: ${API_DOCS_URL} for details.`,
  ],
  [401, `Unauthorized. Please check your public/private host settings.`],
  [403, `Forbidden. Please check your access control settings. Refer to our RBAC docs: ${RBAC_DOCS_URL} for details.`],
  [
    429,
    `Rate limit exceeded. Please try again later. For more information on rate limits please see: ${RATE_LIMITS_URL}`,
  ],
]);

// Returns a user-friendly error message based on the HTTP status code
function getErrorResponseByCode(code: number | undefined): string {
  if (!code) {
    return `${defaultErrorResponse} ${updatePromptResponse}`;
  }

  const errorResponse = errorResponseByCode.get(code) || defaultErrorResponse;
  return `${code}: ${errorResponse} ${updatePromptResponse}`;
}

function isLangfuseFetchHttpError(error: any): error is LangfuseFetchHttpError {
  return typeof error === "object" && error.name === "LangfuseFetchHttpError";
}

function isLangfuseFetchNetworkError(error: any): error is LangfuseFetchNetworkError {
  return typeof error === "object" && error.name === "LangfuseFetchNetworkError";
}

function logIngestionError(error: unknown): void {
  if (isLangfuseFetchHttpError(error)) {
    const code = error.response.status;
    const errorResponse = getErrorResponseByCode(code);
    console.error("[Langfuse SDK] Error while flushing Langfuse.", errorResponse);
  } else if (isLangfuseFetchNetworkError(error)) {
    console.error("[Langfuse SDK] Network error while flushing Langfuse.", error);
  } 
  else {
    console.error("[Langfuse SDK] Unknown error while flushing Langfuse.", error);
  }
}

abstract class LangfuseCoreStateless {
  // options
  private secretKey: string | undefined;
  private publicKey: string;
  baseUrl: string;
  private flushAt: number;
  private flushInterval: number;
  private requestTimeout: number;
  private removeDebugCallback?: () => void;
  private debugMode: boolean = false;
  private pendingPromises: Record<string, Promise<any>> = {};
  private release: string | undefined;
  private sdkIntegration: string;
  private enabled: boolean;

  // internal
  protected _events = new SimpleEventEmitter();
  protected _flushTimer?: any;
  protected _retryOptions: RetriableOptions;

  // Abstract methods to be overridden by implementations
  abstract fetch(url: string, options: LangfuseFetchOptions): Promise<LangfuseFetchResponse>;
  abstract getLibraryId(): string;
  abstract getLibraryVersion(): string;

  // This is our abstracted storage. Each implementation should handle its own
  abstract getPersistedProperty<T>(key: LangfusePersistedProperty): T | undefined;
  abstract setPersistedProperty<T>(key: LangfusePersistedProperty, value: T | null): void;

  constructor(params: LangfuseCoreOptions) {
    const { publicKey, secretKey, enabled, ...options } = params;

    this.enabled = enabled === false ? false : true;
    this.publicKey = publicKey ?? "";
    this.secretKey = secretKey;
    this.baseUrl = removeTrailingSlash(options?.baseUrl || "https://cloud.langfuse.com");
    this.flushAt = options?.flushAt ? Math.max(options?.flushAt, 1) : 15;
    this.flushInterval = options?.flushInterval ?? 10000;
    this.release = options?.release ?? getEnv("LANGFUSE_RELEASE") ?? getCommonReleaseEnvs() ?? undefined;

    this._retryOptions = {
      retryCount: options?.fetchRetryCount ?? 3,
      retryDelay: options?.fetchRetryDelay ?? 3000,
      retryCheck: isLangfuseFetchError,
    };
    this.requestTimeout = options?.requestTimeout ?? 10000; // 10 seconds

    this.sdkIntegration = options?.sdkIntegration ?? "DEFAULT";
  }

  getSdkIntegration(): string {
    return this.sdkIntegration;
  }

  protected getCommonEventProperties(): any {
    return {
      $lib: this.getLibraryId(),
      $lib_version: this.getLibraryVersion(),
    };
  }

  on(event: string, cb: (...args: any[]) => void): () => void {
    return this._events.on(event, cb);
  }

  debug(enabled: boolean = true): void {
    this.removeDebugCallback?.();

    this.debugMode = enabled;

    if (enabled) {
      this.removeDebugCallback = this.on("*", (event, payload) =>
        console.log("Langfuse Debug", event, JSON.stringify(payload))
      );
    }
  }

  /***
   *** Handlers for each object type
   ***/
  protected traceStateless(body: CreateLangfuseTraceBody): string {
    const { id: bodyId, timestamp: bodyTimestamp, release: bodyRelease, ...rest } = body;

    const id = bodyId ?? generateUUID();
    const release = bodyRelease ?? this.release;

    const parsedBody: CreateLangfuseTraceBody = {
      id,
      release,
      timestamp: bodyTimestamp ?? new Date(),
      ...rest,
    };
    this.enqueue("trace-create", parsedBody);
    return id;
  }

  protected eventStateless(body: CreateLangfuseEventBody): string {
    const { id: bodyId, startTime: bodyStartTime, ...rest } = body;

    const id = bodyId ?? generateUUID();

    const parsedBody: CreateLangfuseEventBody = {
      id,
      startTime: bodyStartTime ?? new Date(),
      ...rest,
    };
    this.enqueue("event-create", parsedBody);
    return id;
  }

  protected spanStateless(body: CreateLangfuseSpanBody): string {
    const { id: bodyId, startTime: bodyStartTime, ...rest } = body;

    const id = bodyId || generateUUID();

    const parsedBody: CreateLangfuseSpanBody = {
      id,
      startTime: bodyStartTime ?? new Date(),
      ...rest,
    };
    this.enqueue("span-create", parsedBody);
    return id;
  }

  protected generationStateless(
    body: Omit<CreateLangfuseGenerationBody, "promptName" | "promptVersion"> & PromptInput
  ): string {
    const { id: bodyId, startTime: bodyStartTime, prompt, ...rest } = body;
    const promptDetails =
      prompt && !prompt.isFallback ? { promptName: prompt.name, promptVersion: prompt.version } : {};

    const id = bodyId || generateUUID();

    const parsedBody: CreateLangfuseGenerationBody = {
      id,
      startTime: bodyStartTime ?? new Date(),
      ...promptDetails,
      ...rest,
    };

    this.enqueue("generation-create", parsedBody);
    return id;
  }

  protected scoreStateless(body: CreateLangfuseScoreBody): string {
    const { id: bodyId, ...rest } = body;

    const id = bodyId || generateUUID();

    const parsedBody: CreateLangfuseScoreBody = {
      id,
      ...rest,
    };
    this.enqueue("score-create", parsedBody);
    return id;
  }

  protected updateSpanStateless(body: UpdateLangfuseSpanBody): string {
    this.enqueue("span-update", body);
    return body.id;
  }

  protected updateGenerationStateless(
    body: Omit<UpdateLangfuseGenerationBody, "promptName" | "promptVersion"> & PromptInput
  ): string {
    const { prompt, ...rest } = body;
    const promptDetails =
      prompt && !prompt.isFallback ? { promptName: prompt.name, promptVersion: prompt.version } : {};

    const parsedBody: UpdateLangfuseGenerationBody = {
      ...promptDetails,
      ...rest,
    };
    this.enqueue("generation-update", parsedBody);
    return body.id;
  }

  protected async _getDataset(name: GetLangfuseDatasetParams["datasetName"]): Promise<GetLangfuseDatasetResponse> {
    const encodedName = encodeURIComponent(name);
    return this.fetch(
      `${this.baseUrl}/api/public/v2/datasets/${encodedName}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  protected async _getDatasetItems(query: GetLangfuseDatasetItemsQuery): Promise<GetLangfuseDatasetItemsResponse> {
    const params = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    return this.fetch(
      `${this.baseUrl}/api/public/dataset-items?${params}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  async fetchTraces(query?: GetLangfuseTracesQuery): Promise<GetLangfuseTracesResponse> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/traces?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    );
    // destructure the response into data and meta to be explicit about the shape of the response and add type-warnings in case the API changes
    const { data, meta } = (await res.json()) as GetLangfuseTracesResponse;
    return { data, meta };
  }

  async fetchTrace(traceId: string): Promise<{ data: GetLangfuseTraceResponse }> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/traces/${traceId}`,
      this._getFetchOptions({ method: "GET" })
    );

    const trace = (await res.json()) as GetLangfuseTraceResponse;
    return { data: trace };
  }

  async fetchObservations(query?: GetLangfuseObservationsQuery): Promise<GetLangfuseObservationsResponse> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/observations?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    );
    // destructure the response into data and meta to be explicit about the shape of the response and add type-warnings in case the API changes
    const { data, meta } = (await res.json()) as GetLangfuseObservationsResponse;
    return { data, meta };
  }

  async fetchObservation(observationId: string): Promise<{ data: GetLangfuseObservationResponse }> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/observations/${observationId}`,
      this._getFetchOptions({ method: "GET" })
    );
    const observation = (await res.json()) as GetLangfuseObservationResponse;
    return { data: observation };
  }

  async fetchSessions(query?: GetLangfuseSessionsQuery): Promise<GetLangfuseSessionsResponse> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/sessions?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    );
    // destructure the response into data and meta to be explicit about the shape of the response and add type-warnings in case the API changes
    const { data, meta } = (await res.json()) as GetLangfuseSessionsResponse;
    return { data, meta };
  }

  async getDatasetRun(params: GetLangfuseDatasetRunParams): Promise<GetLangfuseDatasetRunResponse> {
    const encodedDatasetName = encodeURIComponent(params.datasetName);
    const encodedRunName = encodeURIComponent(params.runName);
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${encodedDatasetName}/runs/${encodedRunName}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  async getDatasetRuns(
    datasetName: string,
    query?: GetLangfuseDatasetRunsQuery
  ): Promise<GetLangfuseDatasetRunsResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${encodeURIComponent(datasetName)}/runs?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  async createDatasetRunItem(body: CreateLangfuseDatasetRunItemBody): Promise<CreateLangfuseDatasetRunItemResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/dataset-run-items`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  /**
   * Creates a dataset. Upserts the dataset if it already exists.
   *
   * @param dataset Can be either a string (name) or an object with name, description and metadata
   * @returns A promise that resolves to the response of the create operation.
   */
  async createDataset(
    dataset:
      | string // name
      | {
          name: string;
          description?: string;
          metadata?: any;
        }
  ): Promise<CreateLangfuseDatasetResponse> {
    const body: CreateLangfuseDatasetBody = typeof dataset === "string" ? { name: dataset } : dataset;
    return this.fetch(
      `${this.baseUrl}/api/public/datasets`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  /**
   * Creates a dataset item. Upserts the item if it already exists.
   * @param body The body of the dataset item to be created.
   * @returns A promise that resolves to the response of the create operation.
   */
  async createDatasetItem(body: CreateLangfuseDatasetItemBody): Promise<CreateLangfuseDatasetItemResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/dataset-items`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  async getDatasetItem(id: string): Promise<CreateLangfuseDatasetItemResponse> {
    return this.fetch(`${this.baseUrl}/api/public/dataset-items/${id}`, this._getFetchOptions({ method: "GET" })).then(
      (res) => res.json()
    );
  }

  protected _parsePayload(response: any): any {
    try {
      return JSON.parse(response);
    } catch {
      return response;
    }
  }

  async createPromptStateless(body: CreateLangfusePromptBody): Promise<CreateLangfusePromptResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/v2/prompts`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  async getPromptStateless(
    name: string,
    version?: number,
    label?: string,
    maxRetries?: number,
    requestTimeout?: number // this will override the default requestTimeout for fetching prompts. Together with maxRetries, it can be used to fetch prompts fast when the first fetch is slow.
  ): Promise<GetLangfusePromptResponse> {
    const encodedName = encodeURIComponent(name);
    const params = new URLSearchParams();

    // Add parameters only if they are provided
    if (version && label) {
      throw new Error("Provide either version or label, not both.");
    }

    if (version) {
      params.append("version", version.toString());
    }

    if (label) {
      params.append("label", label);
    }

    const url = `${this.baseUrl}/api/public/v2/prompts/${encodedName}${params.size ? "?" + params : ""}`;

    const boundedMaxRetries = this._getBoundedMaxRetries({ maxRetries, defaultMaxRetries: 2, maxRetriesUpperBound: 4 });
    const retryOptions = { ...this._retryOptions, retryCount: boundedMaxRetries, retryDelay: 500 };
    const retryLogger = (string: string): void =>
      this._events.emit("retry", string + ", " + url + ", " + JSON.stringify(retryOptions));

    return retriable(
      async () => {
        const res = await this.fetch(url, this._getFetchOptions({ method: "GET", fetchTimeout: requestTimeout })).catch(
          (e) => {
            if (e.name === "AbortError") {
              throw new LangfuseFetchNetworkError("Fetch request timed out");
            }
            throw new LangfuseFetchNetworkError(e);
          }
        );

        const data = await res.json();

        if (res.status >= 500) {
          throw new LangfuseFetchHttpError(res, JSON.stringify(data));
        }

        return { fetchResult: res.status === 200 ? "success" : "failure", data };
      },
      retryOptions,
      retryLogger
    );
  }

  private _getBoundedMaxRetries(params: {
    maxRetries?: number;
    defaultMaxRetries?: number;
    maxRetriesUpperBound?: number;
  }): number {
    const defaultMaxRetries = Math.max(params.defaultMaxRetries ?? 2, 0);
    const maxRetriesUpperBound = Math.max(params.maxRetriesUpperBound ?? 4, 0);

    if (params.maxRetries === undefined) {
      return defaultMaxRetries;
    }

    return Math.min(Math.max(params.maxRetries, 0), maxRetriesUpperBound);
  }

  /***
   *** QUEUEING AND FLUSHING
   ***/
  protected enqueue(type: LangfuseObject, body: any): void {
    try {
      if (!this.enabled) {
        return;
      }

      try {
        JSON.stringify(body);
      } catch (e) {
        console.error(`[Langfuse SDK] Event Body for ${type} is not JSON-serializable: ${e}`);
        this._events.emit("error", `Event Body for ${type} is not JSON-serializable: ${e}`);

        return;
      }

      const queue = this.getPersistedProperty<LangfuseQueueItem[]>(LangfusePersistedProperty.Queue) || [];

      queue.push({
        id: generateUUID(),
        type,
        timestamp: currentISOTime(),
        body,
        metadata: undefined,
      });
      this.setPersistedProperty<LangfuseQueueItem[]>(LangfusePersistedProperty.Queue, queue);

      this._events.emit(type, body);

      // Flush queued events if we meet the flushAt length
      if (queue.length >= this.flushAt) {
        this.flush();
      }

      if (this.flushInterval && !this._flushTimer) {
        this._flushTimer = safeSetTimeout(() => this.flush(), this.flushInterval);
      }
    } catch (e) {
      logIngestionError(e);
      this._events.emit("error", e);
    }
  }

  /**
   * Asynchronously flushes all events that are not yet sent to the server.
   * This function always resolves, even if there were errors when flushing.
   * Errors are emitted as "error" events and the promise resolves.
   *
   * @returns {Promise<void>} A promise that resolves when the flushing is completed.
   */
  flushAsync(): Promise<void> {
    return new Promise((resolve, _reject) => {
      try {
        this.flush((err, data) => {
          if (err) {
            logIngestionError(err);
            resolve();
          } else {
            resolve(data);
          }
        });
        // safeguard against unexpected synchronous errors
      } catch (e) {
        console.error("[Langfuse SDK] Error while flushing Langfuse", e);
      }
    });
  }

  // Flushes all events that are not yet sent to the server
  flush(callback?: (err?: any, data?: any) => void): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }

    const queue = this.getPersistedProperty<LangfuseQueueItem[]>(LangfusePersistedProperty.Queue) || [];

    if (!queue.length) {
      return callback?.();
    }

    const items = queue.splice(0, this.flushAt);
    this.setPersistedProperty<LangfuseQueueItem[]>(LangfusePersistedProperty.Queue, queue);

    const MAX_MSG_SIZE = 1_000_000;
    const BATCH_SIZE_LIMIT = 2_500_000;

    this.processQueueItems(items, MAX_MSG_SIZE, BATCH_SIZE_LIMIT);

    const promiseUUID = generateUUID();

    const done = (err?: any): void => {
      if (err) {
        this._events.emit("error", err);
      }
      callback?.(err, items);
      this._events.emit("flush", items);
    };

    const payload = JSON.stringify({
      batch: items,
      metadata: {
        batch_size: items.length,
        sdk_integration: this.sdkIntegration,
        sdk_version: this.getLibraryVersion(),
        sdk_variant: this.getLibraryId(),
        public_key: this.publicKey,
        sdk_name: "langfuse-js",
      },
    }); // implicit conversion also of dates to strings

    const url = `${this.baseUrl}/api/public/ingestion`;

    const fetchOptions = this._getFetchOptions({
      method: "POST",
      body: payload,
    });

    const requestPromise = this.fetchWithRetry(url, fetchOptions)
      .then(() => done())
      .catch((err) => {
        done(err);
      });
    this.pendingPromises[promiseUUID] = requestPromise;
    requestPromise.finally(() => {
      delete this.pendingPromises[promiseUUID];
    });
  }

  public processQueueItems(
    queue: LangfuseQueueItem[],
    MAX_MSG_SIZE: number,
    BATCH_SIZE_LIMIT: number
  ): { processedItems: LangfuseQueueItem[]; remainingItems: LangfuseQueueItem[] } {
    let totalSize = 0;
    const processedItems: LangfuseQueueItem[] = [];
    const remainingItems: LangfuseQueueItem[] = [];

    for (let i = 0; i < queue.length; i++) {
      try {
        const itemSize = new Blob([JSON.stringify(queue[i])]).size;

        // discard item if it exceeds the maximum size per event
        if (itemSize > MAX_MSG_SIZE) {
          console.warn(`Item exceeds size limit (size: ${itemSize}), dropping item.`);
          continue;
        }

        // if adding the next item would exceed the batch size limit, stop processing
        if (totalSize + itemSize >= BATCH_SIZE_LIMIT) {
          console.debug(`hit batch size limit (size: ${totalSize + itemSize})`);
          remainingItems.push(...queue.slice(i));
          console.log(`Remaining items: ${remainingItems.length}`);
          console.log(`processes items: ${processedItems.length}`);
          break;
        }

        // only add the item if it passes both requirements
        totalSize += itemSize;
        processedItems.push(queue[i]);
      } catch (error) {
        console.error(`[Langfuse SDK] ${error}`);
        remainingItems.push(...queue.slice(i));
        break;
      }
    }

    return { processedItems, remainingItems };
  }

  _getFetchOptions(p: {
    method: LangfuseFetchOptions["method"];
    body?: LangfuseFetchOptions["body"];
    fetchTimeout?: number;
  }): LangfuseFetchOptions {
    const fetchOptions: LangfuseFetchOptions = {
      method: p.method,
      headers: {
        "Content-Type": "application/json",
        "X-Langfuse-Sdk-Name": "langfuse-js",
        "X-Langfuse-Sdk-Version": this.getLibraryVersion(),
        "X-Langfuse-Sdk-Variant": this.getLibraryId(),
        "X-Langfuse-Sdk-Integration": this.sdkIntegration,
        "X-Langfuse-Public-Key": this.publicKey,
        ...this.constructAuthorizationHeader(this.publicKey, this.secretKey),
      },
      body: p.body,
      ...(p.fetchTimeout !== undefined ? { signal: AbortSignal.timeout(p.fetchTimeout) } : {}),
    };

    return fetchOptions;
  }

  private constructAuthorizationHeader(
    publicKey: string,
    secretKey?: string
  ): {
    Authorization: string;
  } {
    if (secretKey === undefined) {
      return { Authorization: "Bearer " + publicKey };
    } else {
      const encodedCredentials =
        typeof btoa === "function"
          ? // btoa() is available, the code is running in a browser or edge environment
            btoa(publicKey + ":" + secretKey)
          : // btoa() is not available, the code is running in Node.js
            Buffer.from(publicKey + ":" + secretKey).toString("base64");

      return { Authorization: "Basic " + encodedCredentials };
    }
  }

  private async fetchWithRetry(
    url: string,
    options: LangfuseFetchOptions,
    retryOptions?: RetriableOptions
  ): Promise<LangfuseFetchResponse> {
    (AbortSignal as any).timeout ??= function timeout(ms: number) {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), ms);
      return ctrl.signal;
    };

    return await retriable(
      async () => {
        let res: LangfuseFetchResponse<IngestionReturnType> | null = null;
        try {
          res = await this.fetch(url, {
            signal: AbortSignal.timeout(this.requestTimeout),
            ...options,
          });
        } catch (e) {
          // fetch will only throw on network errors or on timeouts
          throw new LangfuseFetchNetworkError(e);
        }

        if (res.status < 200 || res.status >= 400) {
          const body = await res.json();
          throw new LangfuseFetchHttpError(res, JSON.stringify(body));
        }
        const returnBody = await res.json();
        if (res.status === 207 && returnBody.errors.length > 0) {
          throw new LangfuseFetchHttpError(res, JSON.stringify(returnBody.errors));
        }

        return res;
      },
      { ...this._retryOptions, ...retryOptions },
      (string) => this._events.emit("retry", string + ", " + url + ", " + JSON.stringify(options))
    );
  }

  async shutdownAsync(): Promise<void> {
    clearTimeout(this._flushTimer);
    try {
      await this.flushAsync();
      await Promise.all(
        Object.values(this.pendingPromises).map((x) =>
          x.catch(() => {
            // ignore errors as we are shutting down and can't deal with them anyways.
          })
        )
      );
      // flush again in case there are new events that were added while we were waiting for the pending promises to resolve
      await this.flushAsync();
    } catch (e) {
      console.error("[Langfuse SDK] Error while shutting down Langfuse", e);
    }
  }

  shutdown(): void {
    console.warn(
      "shutdown() is deprecated. It does not wait for all events to be processed. Please use shutdownAsync() instead."
    );
    void this.shutdownAsync();
  }

  protected async awaitAllQueuedAndPendingRequests(): Promise<void> {
    clearTimeout(this._flushTimer);
    await this.flushAsync();
    await Promise.all(Object.values(this.pendingPromises));
  }
}

export abstract class LangfuseWebStateless extends LangfuseCoreStateless {
  constructor(params: Omit<LangfuseCoreOptions, "secretKey">) {
    const { flushAt, flushInterval, publicKey, enabled, ...rest } = params;
    let isObservabilityEnabled = enabled === false ? false : true;

    if (!isObservabilityEnabled) {
      console.warn("Langfuse is disabled. No observability data will be sent to Langfuse.");
    } else if (!publicKey) {
      isObservabilityEnabled = false;
      console.warn(
        "Langfuse public key not passed to constructor and not set as 'LANGFUSE_PUBLIC_KEY' environment variable. No observability data will be sent to Langfuse."
      );
    }

    super({
      ...rest,
      publicKey,
      flushAt: flushAt ?? 1,
      flushInterval: flushInterval ?? 0,
      enabled: isObservabilityEnabled,
    });
  }

  async score(body: CreateLangfuseScoreBody): Promise<this> {
    this.scoreStateless(body);
    await this.awaitAllQueuedAndPendingRequests();
    return this;
  }
}

export abstract class LangfuseCore extends LangfuseCoreStateless {
  private _promptCache: LangfusePromptCache;

  constructor(params: LangfuseCoreOptions) {
    const { publicKey, secretKey, enabled } = params;
    let isObservabilityEnabled = enabled === false ? false : true;

    if (!isObservabilityEnabled) {
      console.warn("Langfuse is disabled. No observability data will be sent to Langfuse.");
    } else if (!secretKey) {
      isObservabilityEnabled = false;
      console.warn(
        "Langfuse secret key was not passed to constructor or not set as 'LANGFUSE_SECRET_KEY' environment variable. No observability data will be sent to Langfuse."
      );
    } else if (!publicKey) {
      isObservabilityEnabled = false;
      console.warn(
        "Langfuse public key was not passed to constructor or not set as 'LANGFUSE_PUBLIC_KEY' environment variable. No observability data will be sent to Langfuse."
      );
    }

    super({ ...params, enabled: isObservabilityEnabled });
    this._promptCache = new LangfusePromptCache();
  }

  trace(body?: CreateLangfuseTraceBody): LangfuseTraceClient {
    const id = this.traceStateless(body ?? {});
    const t = new LangfuseTraceClient(this, id);
    if (getEnv("DEFER") && body) {
      try {
        const deferRuntime = getEnv<DeferRuntime>("__deferRuntime");
        if (deferRuntime) {
          deferRuntime.langfuseTraces([
            {
              id: id,
              name: body.name || "",
              url: t.getTraceUrl(),
            },
          ]);
        }
      } catch {}
    }
    return t;
  }

  span(body: CreateLangfuseSpanBody): LangfuseSpanClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.spanStateless({ ...body, traceId });
    return new LangfuseSpanClient(this, id, traceId);
  }

  generation(
    body: Omit<CreateLangfuseGenerationBody, "promptName" | "promptVersion"> & PromptInput
  ): LangfuseGenerationClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.generationStateless({ ...body, traceId });
    return new LangfuseGenerationClient(this, id, traceId);
  }

  event(body: CreateLangfuseEventBody): LangfuseEventClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.eventStateless({ ...body, traceId });
    return new LangfuseEventClient(this, id, traceId);
  }

  score(body: CreateLangfuseScoreBody): this {
    this.scoreStateless(body);
    return this;
  }

  async getDataset(
    name: string,
    options?: {
      fetchItemsPageSize: number;
    }
  ): Promise<{
    id: string;
    name: string;
    description?: string;
    metadata?: any;
    projectId: string;
    items: Array<{
      id: string;
      input?: any;
      expectedOutput?: any;
      metadata?: any;
      sourceObservationId?: string | null;
      link: (
        obj: LangfuseObjectClient,
        runName: string,
        runArgs?: {
          description?: string;
          metadata?: any;
        }
      ) => Promise<{ id: string }>;
    }>;
  }> {
    const dataset = await this._getDataset(name);
    const items: GetLangfuseDatasetItemsResponse["data"] = [];

    let page = 1;
    while (true) {
      const itemsResponse = await this._getDatasetItems({
        datasetName: name,
        limit: options?.fetchItemsPageSize ?? 50,
        page,
      });
      items.push(...itemsResponse.data);
      if (itemsResponse.meta.totalPages <= page) {
        break;
      }
      page++;
    }

    const returnDataset = {
      ...dataset,
      description: dataset.description ?? undefined,
      metadata: dataset.metadata ?? undefined,
      items: items.map((item) => ({
        ...item,
        link: async (
          obj: LangfuseObjectClient,
          runName: string,
          runArgs?: {
            description?: string;
            metadata?: any;
          }
        ) => {
          await this.awaitAllQueuedAndPendingRequests();
          const data = await this.createDatasetRunItem({
            runName,
            datasetItemId: item.id,
            observationId: obj.observationId,
            traceId: obj.traceId,
            runDescription: runArgs?.description,
            metadata: runArgs?.metadata,
          });
          return data;
        },
      })),
    };

    return returnDataset;
  }

  async createPrompt(body: CreateChatPromptBody): Promise<ChatPromptClient>;
  async createPrompt(body: CreateTextPromptBody): Promise<TextPromptClient>;
  async createPrompt(body: CreatePromptBody): Promise<LangfusePromptClient> {
    const labels = body.labels ?? [];

    const promptResponse =
      body.type === "chat" // necessary to get types right here
        ? await this.createPromptStateless({
            ...body,
            labels: body.isActive ? [...new Set([...labels, "production"])] : labels, // backward compatibility for isActive
          })
        : await this.createPromptStateless({
            ...body,
            type: body.type ?? "text",
            labels: body.isActive ? [...new Set([...labels, "production"])] : labels, // backward compatibility for isActive
          });

    if (promptResponse.type === "chat") {
      return new ChatPromptClient(promptResponse);
    }

    return new TextPromptClient(promptResponse);
  }

  async getPrompt(
    name: string,
    version?: number,
    options?: {
      label?: string;
      cacheTtlSeconds?: number;
      fallback?: string;
      maxRetries?: number;
      type?: "text";
      fetchTimeoutMs?: number;
    }
  ): Promise<TextPromptClient>;
  async getPrompt(
    name: string,
    version?: number,
    options?: {
      label?: string;
      cacheTtlSeconds?: number;
      fallback?: ChatMessage[];
      maxRetries?: number;
      type: "chat";
      fetchTimeoutMs?: number;
    }
  ): Promise<ChatPromptClient>;
  async getPrompt(
    name: string,
    version?: number,
    options?: {
      label?: string;
      cacheTtlSeconds?: number;
      fallback?: ChatMessage[] | string;
      maxRetries?: number;
      type?: "chat" | "text";
      fetchTimeoutMs?: number;
    }
  ): Promise<LangfusePromptClient> {
    const cacheKey = this._getPromptCacheKey({ name, version, label: options?.label });
    const cachedPrompt = this._promptCache.getIncludingExpired(cacheKey);
    if (!cachedPrompt) {
      try {
        return await this._fetchPromptAndUpdateCache({
          name,
          version,
          label: options?.label,
          cacheTtlSeconds: options?.cacheTtlSeconds,
          maxRetries: options?.maxRetries,
          fetchTimeout: options?.fetchTimeoutMs,
        });
      } catch (err) {
        if (options?.fallback) {
          const sharedFallbackParams = {
            name,
            version: version ?? 0,
            labels: options.label ? [options.label] : [],
            cacheTtlSeconds: options?.cacheTtlSeconds,
            config: {},
            tags: [],
          };

          if (options.type === "chat") {
            return new ChatPromptClient(
              {
                ...sharedFallbackParams,
                type: "chat",
                prompt: options.fallback as ChatMessage[],
              },
              true
            );
          } else {
            return new TextPromptClient(
              {
                ...sharedFallbackParams,
                type: "text",
                prompt: options.fallback as string,
              },
              true
            );
          }
        }

        throw err;
      }
    }

    if (cachedPrompt.isExpired) {
      // If the cache is not currently being refreshed, start refreshing it and register the promise in the cache
      if (!this._promptCache.isRefreshing(cacheKey)) {
        const refreshPromptPromise = this._fetchPromptAndUpdateCache({
          name,
          version,
          label: options?.label,
          cacheTtlSeconds: options?.cacheTtlSeconds,
          maxRetries: options?.maxRetries,
          fetchTimeout: options?.fetchTimeoutMs,
        }).catch(() => {
          console.warn(
            `Failed to refresh prompt cache '${cacheKey}', stale cache will be used until next refresh succeeds.`
          );
        });
        this._promptCache.addRefreshingPromise(cacheKey, refreshPromptPromise);
      }

      return cachedPrompt.value;
    }

    return cachedPrompt.value;
  }

  private _getPromptCacheKey(params: { name: string; version?: number; label?: string }): string {
    const { name, version, label } = params;
    const parts = [name];

    if (version !== undefined) {
      parts.push("version:" + version.toString());
    } else if (label !== undefined) {
      parts.push("label:" + label);
    } else {
      parts.push("label:production");
    }

    return parts.join("-");
  }

  private async _fetchPromptAndUpdateCache(params: {
    name: string;
    version?: number;
    cacheTtlSeconds?: number;
    label?: string;
    maxRetries?: number;
    fetchTimeout?: number;
  }): Promise<LangfusePromptClient> {
    const cacheKey = this._getPromptCacheKey(params);

    try {
      const { name, version, cacheTtlSeconds, label, maxRetries, fetchTimeout } = params;

      const { data, fetchResult } = await this.getPromptStateless(name, version, label, maxRetries, fetchTimeout);
      if (fetchResult === "failure") {
        throw Error(data.message ?? "Internal error while fetching prompt");
      }

      let prompt: LangfusePromptClient;
      if (data.type === "chat") {
        prompt = new ChatPromptClient(data);
      } else {
        prompt = new TextPromptClient(data);
      }

      this._promptCache.set(cacheKey, prompt, cacheTtlSeconds);

      return prompt;
    } catch (error) {
      console.error(`[Langfuse SDK] Error while fetching prompt '${cacheKey}':`, error);

      throw error;
    }
  }

  _updateSpan(body: UpdateLangfuseSpanBody): this {
    this.updateSpanStateless(body);
    return this;
  }

  _updateGeneration(body: UpdateLangfuseGenerationBody): this {
    this.updateGenerationStateless(body);
    return this;
  }
}

export abstract class LangfuseObjectClient {
  public readonly client: LangfuseCore;
  public readonly id: string; // id of item itself
  public readonly traceId: string; // id of trace, if traceClient this is the same as id
  public readonly observationId: string | null; // id of observation, if observationClient this is the same as id, if traceClient this is null

  constructor({
    client,
    id,
    traceId,
    observationId,
  }: {
    client: LangfuseCore;
    id: string;
    traceId: string;
    observationId: string | null;
  }) {
    this.client = client;
    this.id = id;
    this.traceId = traceId;
    this.observationId = observationId;
  }

  event(body: Omit<CreateLangfuseEventBody, "traceId" | "parentObservationId">): LangfuseEventClient {
    return this.client.event({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  span(body: Omit<CreateLangfuseSpanBody, "traceId" | "parentObservationId">): LangfuseSpanClient {
    return this.client.span({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  generation(
    body: Omit<CreateLangfuseGenerationBody, "traceId" | "parentObservationId" | "promptName" | "promptVersion"> &
      PromptInput
  ): LangfuseGenerationClient {
    return this.client.generation({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  score(body: Omit<CreateLangfuseScoreBody, "traceId" | "parentObservationId">): this {
    this.client.score({
      ...body,
      traceId: this.traceId,
      observationId: this.observationId,
    });
    return this;
  }

  getTraceUrl(): string {
    return `${this.client.baseUrl}/trace/${this.traceId}`;
  }
}

export class LangfuseTraceClient extends LangfuseObjectClient {
  constructor(client: LangfuseCore, traceId: string) {
    super({ client, id: traceId, traceId, observationId: null });
  }

  update(body: Omit<CreateLangfuseTraceBody, "id">): this {
    this.client.trace({
      ...body,
      id: this.id,
    });
    return this;
  }
}

abstract class LangfuseObservationClient extends LangfuseObjectClient {
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super({ client, id, traceId, observationId: id });
  }
}

export class LangfuseSpanClient extends LangfuseObservationClient {
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super(client, id, traceId);
  }

  update(body: Omit<UpdateLangfuseSpanBody, "id" | "traceId">): this {
    this.client._updateSpan({
      ...body,
      id: this.id,
      traceId: this.traceId,
    });
    return this;
  }

  end(body?: Omit<UpdateLangfuseSpanBody, "id" | "endTime" | "traceId">): this {
    this.client._updateSpan({
      ...body,
      id: this.id,
      traceId: this.traceId,
      endTime: new Date(),
    });
    return this;
  }
}

export class LangfuseGenerationClient extends LangfuseObservationClient {
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super(client, id, traceId);
  }

  update(
    body: Omit<UpdateLangfuseGenerationBody, "id" | "traceId" | "promptName" | "promptVersion"> & PromptInput
  ): this {
    this.client._updateGeneration({
      ...body,
      id: this.id,
      traceId: this.traceId,
    });
    return this;
  }

  end(
    body?: Omit<UpdateLangfuseGenerationBody, "id" | "traceId" | "endTime" | "promptName" | "promptVersion"> &
      PromptInput
  ): this {
    this.client._updateGeneration({
      ...body,
      id: this.id,
      traceId: this.traceId,
      endTime: new Date(),
    });
    return this;
  }
}

export class LangfuseEventClient extends LangfuseObservationClient {
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super(client, id, traceId);
  }
}

export * from "./types";
export * from "./openapi/server";
