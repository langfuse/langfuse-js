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
  type CreateLangfuseGeneration,
  type CreateLangfuseEvent,
  type CreateLangfuseGenerationWithoutParent,
  type CreateLangfuseSpan,
  type CreateLangfuseScore,
  type UpdateLangfuseGeneration,
  type UpdateLangfuseSpan,
  type EndLangfuseSpan,
  type EndLangfuseGeneration,
  type UpdateLangfuseTrace,
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
/**
 * The core stateless class for interacting with the Langfuse SDK.
 *
 * @property {string} baseUrl - Langfuse API baseUrl (https://cloud.langfuse.com by default). Can be set via LANGFUSE_BASEURL environment variable.
 */
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

  /**
   * Listen to error events.
   * The SDK does not throw errors to protect your application process.
   * @param {string} event - The event to listen to.
   * @param {Function} cb - The callback to be called when the event is emitted.
   * @returns {Function} A function to remove the listener.
   * @example
   * ```typescript
   * langfuse.on("error", (error) => {
   *  // Whatever you want to do with the error
   *  console.error(error);
   * });
   * ```
   **/
  on(event: string, cb: (...args: any[]) => void): () => void {
    return this._events.on(event, cb);
  }

  /**
   * Enable debugging to get detailed logs of what's happening in the SDK.
   * The SDK does not throw errors to protect your application process
   * @param {boolean} [enabled] - Whether to enable debugging or not. Defaults to true.
   * @returns {void}
   * @example
   * ```typescript
   * langfuse.debug();
   *
   * // Explicitly disable debugging
   * langfuse.debug(false);
   * ```
   */
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
    const { id: bodyId, release: bodyRelease, ...rest } = body;

    const id = bodyId ?? generateUUID();
    const release = bodyRelease ?? this.release;

    const parsedBody: CreateLangfuseTraceBody = {
      id,
      release,
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

  /**
   * Fetch list of traces, supports filters and pagination
   * @param {GetLangfuseTracesQuery} query - The query to filter and paginate the traces.
   * @returns {Promise<GetLangfuseTracesResponse>} A promise that resolves to the response containing the traces.
   * @example
   * ```typescript
   * const traces = await langfuse.fetchTraces();
   * ```
   */
  async fetchTraces(query?: GetLangfuseTracesQuery): Promise<GetLangfuseTracesResponse> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/traces?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    );
    // destructure the response into data and meta to be explicit about the shape of the response and add type-warnings in case the API changes
    const { data, meta } = (await res.json()) as GetLangfuseTracesResponse;
    return { data, meta };
  }

  /**
   * Fetch a trace by id
   *
   * @param {string} traceId - The id of the trace to fetch.
   * @returns {Promise<{ data: GetLangfuseTraceResponse }>} A promise that resolves to the response containing the trace.
   * @example
   * ```typescript
   * const trace = await langfuse.fetchTrace("<traceId>");
   * ```
   * */
  async fetchTrace(traceId: string): Promise<{ data: GetLangfuseTraceResponse }> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/traces/${traceId}`,
      this._getFetchOptions({ method: "GET" })
    );

    const trace = (await res.json()) as GetLangfuseTraceResponse;
    return { data: trace };
  }

  /**
   * Fetch list of observations, supports filters and pagination
   * @param {GetLangfuseObservationsQueryDoc} query - The query to filter and paginate the observations.
   * @returns {Promise<GetLangfuseObservationsResponse>} A promise that resolves to the response containing the observations.
   * @example
   * ```typescript
   * const observations = await langfuse.fetchObservations();
   * ```
   * */
  async fetchObservations(query?: GetLangfuseObservationsQuery): Promise<GetLangfuseObservationsResponse> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/observations?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    );
    // destructure the response into data and meta to be explicit about the shape of the response and add type-warnings in case the API changes
    const { data, meta } = (await res.json()) as GetLangfuseObservationsResponse;
    return { data, meta };
  }

  /**
   * Fetch an observation by id
   *
   * @param {string} observationId - The id of the observation to fetch.
   * @returns {Promise<{ data: GetLangfuseObservationResponse }>} A promise that resolves to the response containing the observation.
   * @example
   * ```typescript
   * const observation = await langfuse.fetchObservation("<observationId>");
   * ```
   * */
  async fetchObservation(observationId: string): Promise<{ data: GetLangfuseObservationResponse }> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/observations/${observationId}`,
      this._getFetchOptions({ method: "GET" })
    );
    const observation = (await res.json()) as GetLangfuseObservationResponse;
    return { data: observation };
  }

  /**
   * Fetch list of sessions, supports filters and pagination
   * @param {GetLangfuseSessionsQuery} query - The query to filter and paginate the sessions.
   * @returns {Promise<GetLangfuseSessionsResponse>} A promise that resolves to the response containing the sessions.
   * @example
   * ```typescript
   * const sessions = await langfuse.fetchSessions();
   * ```
   * */
  async fetchSessions(query?: GetLangfuseSessionsQuery): Promise<GetLangfuseSessionsResponse> {
    const res = await this.fetch(
      `${this.baseUrl}/api/public/sessions?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    );
    // destructure the response into data and meta to be explicit about the shape of the response and add type-warnings in case the API changes
    const { data, meta } = (await res.json()) as GetLangfuseSessionsResponse;
    return { data, meta };
  }

  /**
   * Get a dataset run by name.
   * @param {GetLangfuseDatasetRunParams} params - The parameters to get the dataset run.
   * @returns {Promise<GetLangfuseDatasetRunResponse>} A promise that resolves to the response containing the dataset run.
   *
   * @example
   * ```typescript
   * const datasetRun = await langfuse.getDatasetRun({
   *  datasetName: "<dataset_name>",
   *  runName: "<run_name>",
   * });
   *
   */
  async getDatasetRun(params: GetLangfuseDatasetRunParams): Promise<GetLangfuseDatasetRunResponse> {
    const encodedDatasetName = encodeURIComponent(params.datasetName);
    const encodedRunName = encodeURIComponent(params.runName);
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${encodedDatasetName}/runs/${encodedRunName}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  /**
   * Get a dataset by name.
   * @param {string} datasetName - The name of the dataset.
   * @returns {Promise<GetLangfuseDatasetResponse>} A promise that resolves to the response containing the dataset.
   * @example
   * ```typescript
   * const dataset = await langfuse.getDataset("<dataset_name>");
   * ```
   */
  async getDatasetRuns(
    datasetName: string,
    query?: GetLangfuseDatasetRunsQuery
  ): Promise<GetLangfuseDatasetRunsResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${encodeURIComponent(datasetName)}/runs?${encodeQueryParams(query)}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  /**
   * Creates a dataset run item.
   * @param {CreateLangfuseDatasetRunItemBody} body - The body of the dataset run item to be created.
   * @returns {Promise<CreateLangfuseDatasetRunItemResponse>} A promise that resolves to the response containing the newly created dataset run item.
   * @example
   * ```typescript
   * const newRuntItem = langfuse.createDatasetRunItem({
   *  dataseItemId: "<dataset_item_id>",
   *  runName: "<run_name>",
   *  runDescription: "My first run",
   *  metadata: {
   *    model: "llama3",
   *  },
   * });
   */
  async createDatasetRunItem(body: CreateLangfuseDatasetRunItemBody): Promise<CreateLangfuseDatasetRunItemResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/dataset-run-items`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  /**
   * Creates a dataset.
   * @param {string | {name: string, description?: string, metadata?: any}} dataset - The name of the dataset or the body of the dataset to be created.
   * @returns {Promise<CreateLangfuseDatasetResponse>} A promise that resolves to the response containing the newly created dataset.
   * @example
   * ```typescript
   * langfuse.createDataset({
   *  name: "<dataset_name>",
   *  // optional description
   *  description: "My first dataset",
   *  // optional metadata
   *  metadata: {
   *    author: "Alice",
   *    date: "2022-01-01",
   *    type: "benchmark",
   *  },
   * });
   * ```
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
   * Creates a dataset item. If the item already exists, it updates the item.
   * @param {CreateLangfuseDatasetItemBody} body The body of the dataset item to be created.
   * @returns A promise that resolves to the response containing the newly created dataset item.
   * @example
   * ```typescript
   * langfuse.createDatasetItem({
   *  datasetName: "<dataset_name>",
   *  // any JS object or value
   *  input: {
   *    text: "hello world",
   *  },
   *  // any JS object or value, optional
   *  expectedOutput: {
   *    text: "hello world",
   *  },
   *  // metadata, optional
   *  metadata: {
   *    model: "llama3",
   *  },
   * });
   * ```
   */
  async createDatasetItem(body: CreateLangfuseDatasetItemBody): Promise<CreateLangfuseDatasetItemResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/dataset-items`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  /**
   * Get the dataset item with the given id.
   * @param {string} id The id of the dataset item.
   * @returns {Promise<CreateLangfuseDatesetItemResponse>} A promise that resolves to the response containing the dataset item.
   *
   * @example
   * ```typescript
   * const dataset = await langfuse.getDatasetItem("<datasetItemId>");
   * ```
   */
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
    maxRetries?: number
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
        const res = await this.fetch(url, this._getFetchOptions({ method: "GET" })).catch((e) => {
          throw new LangfuseFetchNetworkError(e);
        });

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
        console.error(`Event Body for ${type} is not JSON-serializable: ${e}`);
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
      this._events.emit("error", e);
    }
  }

  /**
   * Flush the internal event queue to the Langfuse API. It returns a promise that resolves when the queue is empty.
   * It should be called when the application shuts down.
   * @returns {Promise<void>} A promise that resolves when the flushing is completed.
   * @example
   * ```typescript
   * await langfuse.flushAsync();
   * ```
   */
  flushAsync(): Promise<void> {
    return new Promise((resolve, _reject) => {
      try {
        this.flush((err, data) => {
          if (err) {
            console.error("Error while flushing Langfuse", err);
            resolve();
          } else {
            resolve(data);
          }
        });
      } catch (e) {
        console.error("Error while flushing Langfuse", e);
      }
    });
  }

  /**
   * Flush the internal event queue to the Langfuse API. Optionally uses a callback to notify when the queue is empty.
   * It should be called when the application shuts down.
   * @param {Function} [callback] - A callback that is called when the flushing is completed.
   * @returns {void}
   * @example
   * ```typescript
   * langfuse.flush((err, data) => {
   *   if (err) {
   *     console.error("Error while flushing Langfuse", err);
   *   } else {
   *     console.log("Flushing completed", data);
   *   }
   * });
   * ```
   */
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
        console.error(error);
        remainingItems.push(...queue.slice(i));
        break;
      }
    }

    return { processedItems, remainingItems };
  }

  _getFetchOptions(p: {
    method: LangfuseFetchOptions["method"];
    body?: LangfuseFetchOptions["body"];
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
            signal: (AbortSignal as any).timeout(this.requestTimeout),
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

  /**
   * Initiate a graceful shutdown of the Langfuse SDK, ensuring all events are sent to Langfuse API and all consumer Threads are terminated.
   *
   * @returns {Promise<void>} A promise that resolves when the shutdown is completed.
   */
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
      console.error("Error while shutting down Langfuse", e);
    }
  }

  /**
   * Initiate a graceful shutdown of the Langfuse SDK, ensuring all events are sent to Langfuse API and all consumer Threads are terminated.
   *
   * @deprecated Please use shutdownAsync() instead.
   */
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

/**
 * The core class for interacting with the Langfuse SDK.
 * This class provides methods to create traces, spans, events, generations, and scores.
 * It also handles the configuration and initialization of the SDK.
 * You can initialize the SDK via the constructor or by setting the environment variables.
 *
 * @example
 * ```typescript
 * // Initialize the SDK via the constructor
 * import { Langfuse } from "langfuse";
 *
 * const langfuse = new Langfuse({
 *  secretKey: "sk-lf-...",
 *  publicKey: "pk-lf-...",
 *  baseUrl: "https://cloud.langfuse.com", // 🇪🇺 EU region
 *  release: "v1.0.0",
 *  requestTimeout: 10000,
 * });
 * ```
 *
 * @example
 * ```bash
 * # Alternatively, set the SDK's environment variables
 * LANGFUSE_SECRET_KEY="sk-lf-...";
 * LANGFUSE_PUBLIC_KEY="pk-lf-...";
 * LANGFUSE_BASEURL="https://cloud.langfuse.com"; # 🇪🇺 EU region
 * # LANGFUSE_BASEURL="https://us.cloud.langfuse.com"; # 🇺🇸 US region
 * ```
 * @example
 * ```typescript
 * // Initialize the SDK via the environment variables
 * import { Langfuse } from "langfuse";
 * const langfuse = new Langfuse();
 * ```
 *
 * @class
 * @extends LangfuseCoreStateless
 */
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

  /**
   * Creates a new trace. This trace will be used to group all subsequent events, spans, and generations.
   * If no traceId is provided, a new traceId will be generated.
   * @param {CreateLangfuseTraceBody} [body] The body of the trace to be created.
   * @returns {LangfuseTraceClient} The created trace.
   * @example
   * ```typescript
   * // Example trace creation
   * const trace = langfuse.trace({
   *  name: "chat-app-session",
   *  userId: "user__935d7d1d-8625-4ef4-8651-544613e7bd22",
   *  metadata: { user: "user@langfuse.com" },
   *  tags: ["production"],
   * });
   *
   * // Example update, same params as create, cannot change id
   * trace.update({
   *  metadata: {
   *    tag: "long-running",
   *  },
   * });
   *
   * // Properties
   * trace.id; // string
   * // Create observations
   * trace.event({});
   * trace.span({});
   * trace.generation({});
   *
   * // Add scores
   * trace.score({});
   * ```
   */
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

  /**
   * Creates a span.
   * A span represents durations of units of work in a trace. Usually, you want to add a span nested within a trace. Optionally you can nest it within another observation by providing a parentObservationId.
   * If no traceId is provided, a new trace is created just for this span.
   * @param {CreateLangfuseSpanBody} body The body of the span to be created.
   * @returns {LangfuseSpanClient} The span client used to manipulate the span.
   * @example
   * ```typescript
   * // Example span creation
   * const span = trace.span({
   *  name: "embedding-retrieval",
   *  input: {
   *    userInput: "How does Langfuse work?",
   *  },
   * });
   *
   * // Example update
   * span.update({
   *  metadata: {
   *    httpRoute: "/api/retrieve-doc",
   *    embeddingModel: "bert-base-uncased",
   *  },
   * });
   *
   * // Application code
   * const retrievedDocs = await retrieveDoc("How does Langfuse work?");
   *
   * // Example end - sets endTime, optionally pass a body
   * span.end({
   *  output: {retrievedDocs,
   * },
   * });
   *
   * // Properties
   * span.id; // string
   * span.traceId; // string
   * span.parentObservationId; // string | undefined
   *
   * // Create children
   * span.event({});
   * span.span({});
   * span.generation({});
   *
   * // Add scores
   * span.score({});
   *```
   */
  span(body: CreateLangfuseSpanBody): LangfuseSpanClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.spanStateless({ ...body, traceId });
    return new LangfuseSpanClient(this, id, traceId);
  }

  /**
   * Create a generation.
   * A generation is a span that is used to log generations of AI models. They contain additional metadata about the model, the prompt/completion, the cost of executing the model and are specifically rendered in the langfuse UI.
   * Usually, you want to add a generation nested within a trace. Optionally you can nest it within another observation by providing a parentObservationId.
   * If no traceId is provided, a new trace is created just for this generation.
   * @param {CreateLangfuseGeneration} body - The body of the generation to be created. The promptName and promptVersion are required.
   * @returns {LangfuseGenerationClient} The created generation.
   * @example
   * ```typescript
   * // Example generation creation
   * const generation = trace.generation({
   *  name: "chat-completion",
   *  model: "gpt-3.5-turbo",
   *  modelParameters: {
   *    temperature: 0.9,
   *    maxTokens: 2000,
   *  },
   *  input: messages,
   * });
   *
   * // Application code
   * const chatCompletion = await llm.respond(prompt);
   *
   * // Example update
   * generation.update({
   *  completionStartTime: new Date(),
   * });
   *
   * // Example end - sets endTime, optionally pass a body
   * generation.end({
   *  output: chatCompletion,
   * });
   *
   * // Properties
   * generation.id; // string
   * generation.traceId; // string
   * generation.parentObservationId; // string | undefined
   *
   * // Create children
   * generation.event({});
   * generation.span({});
   * generation.generation({});
   *
   * // Add scores
   * generation.score({});
   * ```
   */
  generation(body: CreateLangfuseGeneration): LangfuseGenerationClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.generationStateless({ ...body, traceId });
    return new LangfuseGenerationClient(this, id, traceId);
  }

  /**
   * Create an event.
   * An event represents a discrete event in a trace. Usually, you want to add an event nested within a trace. Optionally, you can nest it within another observation by providing a parentObservationId.
   * If no traceId is provided, a new trace is created just for this event.
   * @param {CreateLangfuseEventBody} body - The body of the event to be created.
   * @returns {LangfuseEventClient} The created event.
   * @example
   * ```typescript
   * // Example event
   * const event = trace.event({
   *  name: "get-user-profile",
   *  metadata: {
   *    attempt: 2,
   *    httpRoute: "/api/retrieve-person",
   *  },
   *  input: {
   *    userId: "user__935d7d1d-8625-4ef4-8651-544613e7bd22",
   *  },
   *  output: {
   *    firstName: "Maxine",
   *    lastName: "Simons",
   *    email: "maxine.simons@langfuse.com",
   *  },
   * });
   *
   * // Properties
   * event.id; // string
   * event.traceId; // string
   * event.parentObservationId; // string | undefined
   *
   * // Create children
   * event.event({});
   * event.span({});
   * event.generation({});
   *
   * // Add scores
   * event.score({});
   * ```
   */
  event(body: CreateLangfuseEventBody): LangfuseEventClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.eventStateless({ ...body, traceId });
    return new LangfuseEventClient(this, id, traceId);
  }

  /**
   * Create a score. Scores are used to evaluate executions/traces.
   * They are attached to a single trace. If the score relates to a specific step of the trace, the score can optionally also be attached to the observation to enable evaluating it specifically.
   * @param {CreateLangfuseScoreBody} body - The body of the score to be created.
   * @returns {LangfuseCore} Either the associated observation (if observationId is provided) or the trace (if observationId is not provided).
   * @example
   * ```typescript
   * await langfuse.score({
   *  traceId: message.traceId,
   *  observationId: message.generationId,
   *  name: "quality",
   *  value: 1,
   *  comment: "Factually correct",
   * });
   *
   * // alternatively
   * trace.score({});
   * span.score({});
   * event.score({});
   * generation.score({});
   * ```
   */
  score(body: CreateLangfuseScoreBody): this {
    this.scoreStateless(body);
    return this;
  }

  /**
   * Fetch a dataset by its name.
   *
   * @param {string} name - The name of the dataset.
   * @param {{fetchItemsPageSize: number}} [options] - The options for fetching the dataset items.
   * @returns {Promise<{
   *  id: string,
   *  name: string,
   *  description?: string,
   *  metadata?: any,
   *  projectId: string,
   *  items: Array<{
   *    id: string,
   *    input?: any,
   *    expectedOutput?: any,
   *    metadata?: any,
   *    sourceObservationId?: string | null,
   *    link: (
   *      obj: LangfuseObjectClient,
   *      runName: string,
   *      runArgs?: {
   *        description?: string,
   *        metadata?: any
   *      }
   *    ) => Promise<{id: string}>,
   *  }>
   * }>} A promise that resolves to the response containing the dataset.
   * @example
   * ```typescript
   * const dataset = await langfuse.getDataset("<dataset_name>");
   * ```
   */
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

  /**
   * Creates a prompt. Upserts the prompt if it already exists.
   * The type of the prompt is determined by the body.
   * If the body has a type of "chat", a ChatPromptClient is returned.
   * If the body has a type of "text", a TextPromptClient is returned.
   * If the body has no type, a LangfusePromptClient is returned.
   * The prompt is also cached for future use.
   *
   * @param {CreateChatPromptBody | CreateTextPromptBody | CreatePromptBody} body - The body of the prompt to be created.
   * @returns {Promise<ChatPromptClient | TextPromptClient | LangfusePromptClient>} A promise that resolves to a ChatPromptClient, TextPromptClient, or LangfusePromptClient depending on the type of the prompt created.
   */
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

  /**
   * Gets a prompt. The prompt is also cached for future use.
   * If the prompt is not found, a 404 error is returned.
   * If the prompt is found, a 200 success is returned.
   * If the prompt is found but has no data, a 204 success is returned.
   *
   * @param {string} name - The name of the prompt.
   * @param {number} [version] - The version of the prompt.
   * @param {{label?: string, cacheTtlSeconds?: number, fallback?: string, maxRetries?: number, type?: "chat" | "text"}} [options] - The options for the prompt.
   * @returns {Promise<TextPromptClient | ChatPromptClient | LangfusePromptClient>} A promise that resolves to a TextPromptClient, ChatPromptClient, or LangfusePromptClient depending on the type of the prompt.
   * @example
   * ```typescript
   * const prompt = await langfuse.getPrompt(
   *   "example-prompt",
   *   1,
   *   { label: "production", type: "text" }
   * );
   * ```
   */
  async getPrompt(
    name: string,
    version?: number,
    options?: { label?: string; cacheTtlSeconds?: number; fallback?: string; maxRetries?: number; type?: "text" }
  ): Promise<TextPromptClient>;
  async getPrompt(
    name: string,
    version?: number,
    options?: { label?: string; cacheTtlSeconds?: number; fallback?: ChatMessage[]; maxRetries?: number; type: "chat" }
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
      return await this._fetchPromptAndUpdateCache({
        name,
        version,
        label: options?.label,
        cacheTtlSeconds: options?.cacheTtlSeconds,
        maxRetries: options?.maxRetries,
      }).catch(() => {
        console.warn(
          `Returning expired prompt cache for '${this._getPromptCacheKey({
            name,
            version,
            label: options?.label,
          })}' due to fetch error`
        );

        return cachedPrompt.value;
      });
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
  }): Promise<LangfusePromptClient> {
    const cacheKey = this._getPromptCacheKey(params);

    try {
      const { name, version, cacheTtlSeconds, label, maxRetries } = params;

      const { data, fetchResult } = await this.getPromptStateless(name, version, label, maxRetries);
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
      console.error(`Error while fetching prompt '${cacheKey}':`, error);

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

/**
 * A client for interacting with Langfuse objects.
 *
 * @property {LangfuseCore} client - The LangfuseCore instance.
 * @property {string} id - The ID of the item.
 * @property {string} traceId - The ID of the trace.
 * @property {string | null} observationId - The ID of the observation.
 *
 * @class
 */
export abstract class LangfuseObjectClient {
  public readonly client: LangfuseCore;
  public readonly id: string; // id of item itself
  public readonly traceId: string; // id of trace, if traceClient this is the same as id
  public readonly observationId: string | null; // id of observation, if observationClient this is the same as id, if traceClient this is null

  /**
   * Creates an instance of LangfuseObjectClient.
   *
   * @param {Object} params - The parameters for creating a LangfuseObjectClient.
   * @param {LangfuseCore} params.client - The LangfuseCore instance.
   * @param {string} params.id - The ID of the item.
   * @param {string} params.traceId - The ID of the trace.
   * @param {string | null} params.observationId - The ID of the observation.
   */
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

  /**
   * Creates an event.
   *
   * An event represents a discrete event in a trace. Usually, you want to add a event nested within a trace by passing a traceId.
   * Optionally you can nest it within another observation by providing a parentObservationId.
   *
   * @param {CreateLangfuseEvent} body - The body of the event to be created.
   * @returns {LangfuseEventClient} The created event.
   *
   * @example
   * ```typescript
   * // Example event
   * const event = trace.event({
   *  name: "get-user-profile",
   *  metadata: {
   *    attempt: 2,
   *    httpRoute: "/api/retrieve-person",
   *    input: {
   *      userId: "user__935d7d1d-8625-4ef4-8651-544613e7bd22",
   *    },
   *  },
   *  input: {
   *    userId: "user__935d7d1d-8625-4ef4-8651-544613e7bd22",
   *  },
   *  output: {
   *    firstName: "Maxine",
   *    lastName: "Simons",
   *    email: "maxine.simons@langfuse.com",
   *  },
   * });
   * // Properties
   * event.id; // string
   * event.traceId; // string
   * event.parentObservationId; // string | undefined
   *
   * // Create children
   * event.event({});
   * event.span({});
   * event.generation({});
   *
   * // Add scores
   * event.score({});
   * ```
   *
   */
  event(body: CreateLangfuseEvent): LangfuseEventClient {
    return this.client.event({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  /**
   * Creates a span.
   *
   * A span represents durations of units of work in a trace. Usually, you want to add a span nested within a trace by passing a traceId.
   * Optionally you can nest it within another observation by providing a parentObservationId.
   *
   * If no traceId is provided, a new trace is created just for this span.
   *
   * @param {CreateLangfuseSpan} body - The body of the span to be created.
   * @returns {LangfuseSpanClient} The created span.
   */
  span(body: CreateLangfuseSpan): LangfuseSpanClient {
    return this.client.span({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  /**
   * Creates a generation.
   *
   * A generation is a span that is used to log generations of AI models. They contain additional metadata about the model, the prompt/completion, the cost of executing the model and are specifically rendered in the langfuse UI.
   * Usually, you want to add a generation nested within a trace. Optionally you can nest it within another observation by providing a parentObservationId.
   *
   * If no traceId is provided, a new trace is created just for this generation.
   *
   * @param {CreateLangfuseGenerationWithoutParent} body - The body of the generation to be created.
   * @returns {LangfuseGenerationClient} The created generation
   */
  generation(body: CreateLangfuseGenerationWithoutParent): LangfuseGenerationClient {
    return this.client.generation({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  /**
   * Create a score attached to a trace (and optionally an observation).
   *
   * Scores store evaluation metrics in Langfuse. They are always related to a trace and can be attached to specific observations within a trace.
   *
   * @param {CreateLangfuseScore} body - The body of the score to be created.
   * @returns {LangfuseObjectClient} Either the associated observation (if parentObservationId is provided) or the trace (if parentObservationId is not provided).
   */
  score(body: CreateLangfuseScore): this {
    this.client.score({
      ...body,
      traceId: this.traceId,
      observationId: this.observationId,
    });
    return this;
  }

  /**
   * Gets the URL of the object.
   *
   * @returns {string} The URL of the object.
   */
  getTraceUrl(): string {
    return `${this.client.baseUrl}/trace/${this.traceId}`;
  }
}

/**
 * A client for interacting with Langfuse traces.
 * A trace is a collection of spans, events, generations, and scores.
 *
 * @property {string} id - The ID of the trace.
 * @property {LangfuseCore} client - The LangfuseCore instance.
 * @property {string} traceId - The ID of the trace.
 * @property {string | null} observationId - The ID of the observation.
 * @returns {LangfuseTraceClient} The trace client.
 * @class
 * @extends LangfuseObjectClient
 */
export class LangfuseTraceClient extends LangfuseObjectClient {
  /**
   * Creates an instance of LangfuseTraceClient.
   *
   * @param {LangfuseCore} client - The LangfuseCore instance.
   * @param {string} traceId - The ID of the trace.
   * @returns {LangfuseTraceClient} The trace client.
   */
  constructor(client: LangfuseCore, traceId: string) {
    super({ client, id: traceId, traceId, observationId: null });
  }

  /**
   * Updates the trace with the given body.
   *
   * @param {UpdateLangfuseTrace} body - The body of the trace to be updated.
   * @returns {LangfuseTraceClient} The trace client.
   */
  update(body: UpdateLangfuseTrace): this {
    this.client.trace({
      ...body,
      id: this.id,
    });
    return this;
  }
}

/**
 * A client for interacting with Langfuse observations.
 *
 * @class
 * @extends LangfuseObjectClient
 */
abstract class LangfuseObservationClient extends LangfuseObjectClient {
  /**
   * Creates an instance of LangfuseObservationClient.
   *
   * @param {LangfuseCore} client - The LangfuseCore instance.
   * @param {string} id - The ID of the observation.
   * @param {string} traceId - The ID of the trace.
   */
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super({ client, id, traceId, observationId: id });
  }
}

/**
 * A client for interacting with Langfuse spans.
 *
 * @class
 * @extends LangfuseObservationClient
 */
export class LangfuseSpanClient extends LangfuseObservationClient {
  /**
   * Creates an instance of LangfuseSpanClient.
   *
   * @param {LangfuseCore} client - The LangfuseCore instance.
   * @param {string} id - The ID of the span.
   * @param {string} traceId - The ID of the trace.
   */
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super(client, id, traceId);
  }

  /**
   * Updates the span with the given body.
   *
   * @param {UpdateLangfuseSpan} body - The body of the span to be updated.
   * @returns {LangfuseSpanClient} The span client.
   */
  update(body: UpdateLangfuseSpan): this {
    this.client._updateSpan({
      ...body,
      id: this.id,
      traceId: this.traceId,
    });
    return this;
  }

  /**
   * Ends the span with the given body.
   *
   * @param {EndLangfuseSpan} body - The body of the span to be ended.
   * @returns {LangfuseSpanClient} The span client.
   */
  end(body?: EndLangfuseSpan): this {
    this.client._updateSpan({
      ...body,
      id: this.id,
      traceId: this.traceId,
      endTime: new Date(),
    });
    return this;
  }
}

/**
 * A client for interacting with Langfuse generations.
 *
 * @class
 * @extends LangfuseObservationClient
 */
export class LangfuseGenerationClient extends LangfuseObservationClient {
  /**
   * Creates an instance of LangfuseGenerationClient.
   *
   * @param {LangfuseCore} client - The LangfuseCore instance.
   * @param {string} id - The ID of the generation.
   * @param {string} traceId - The ID of the trace.
   */
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super(client, id, traceId);
  }

  /**
   * Updates the generation with the given body.
   *
   * @param {UpdateLangfuseGeneration} body - The body of the generation to be updated.
   * @returns {LangfuseGenerationClient} The generation client.
   */
  update(body: UpdateLangfuseGeneration): this {
    this.client._updateGeneration({
      ...body,
      id: this.id,
      traceId: this.traceId,
    });
    return this;
  }

  /**
   * Ends the generation with the given body.
   *
   * @param {EndLangfuseGeneration} body - The body of the generation to be ended.
   * @returns {LangfuseGenerationClient} The generation client.
   */
  end(body?: EndLangfuseGeneration): this {
    this.client._updateGeneration({
      ...body,
      id: this.id,
      traceId: this.traceId,
      endTime: new Date(),
    });
    return this;
  }
}

/**
 * A client for interacting with Langfuse events.
 *
 * @class
 * @extends LangfuseObservationClient
 */
export class LangfuseEventClient extends LangfuseObservationClient {
  /**
   * Creates an instance of LangfuseEventClient.
   *
   * @param {LangfuseCore} client - The LangfuseCore instance.
   * @param {string} id - The ID of the event.
   * @param {string} traceId - The ID of the trace.
   */
  constructor(client: LangfuseCore, id: string, traceId: string) {
    super(client, id, traceId);
  }
}

export * from "./types";
export * from "./openapi/server";
