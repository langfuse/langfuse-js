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
} from "./types";
import {
  generateUUID,
  removeTrailingSlash,
  retriable,
  type RetriableOptions,
  safeSetTimeout,
  getEnv,
  currentISOTime,
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

    const id = bodyId || generateUUID();

    const parsedBody: CreateLangfuseGenerationBody = {
      id,
      startTime: bodyStartTime ?? new Date(),
      ...(prompt ? { promptName: prompt.name, promptVersion: prompt.version } : {}),
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
    const parsedBody: UpdateLangfuseGenerationBody = {
      ...(prompt ? { promptName: prompt.name, promptVersion: prompt.version } : {}),
      ...rest,
    };
    this.enqueue("generation-update", parsedBody);
    return body.id;
  }

  protected async _getDataset(name: GetLangfuseDatasetParams["datasetName"]): Promise<GetLangfuseDatasetResponse> {
    const encodedName = encodeURIComponent(name);
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${encodedName}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  async getDatasetRun(params: GetLangfuseDatasetRunParams): Promise<GetLangfuseDatasetRunResponse> {
    const encodedDatasetName = encodeURIComponent(params.datasetName);
    const encodedRunName = encodeURIComponent(params.runName);
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${encodedDatasetName}/runs/${encodedRunName}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  async createDatasetRunItem(body: CreateLangfuseDatasetRunItemBody): Promise<CreateLangfuseDatasetRunItemResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/dataset-run-items`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

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

  async getPromptStateless(name: string, version?: number, label?: string): Promise<GetLangfusePromptResponse> {
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

    return this.fetch(url, this._getFetchOptions({ method: "GET" })).then(async (res) => {
      const data = await res.json();

      return { fetchResult: res.status === 200 ? "success" : "failure", data };
    });
  }

  /***
   *** QUEUEING AND FLUSHING
   ***/
  protected enqueue(type: LangfuseObject, body: any): void {
    try {
      if (!this.enabled) {
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

  /**
   * Creates a new trace. This trace will be used to group all subsequent events, spans, and generations.
   * If no traceId is provided, a new traceId will be generated.
   *
   * @param {CreateLangfuseTraceBody} [body] The body of the trace to be created.
   * @returns {LangfuseTraceClient} The trace client used to manipulate the trace.
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
   * Creates a new span. This span will be wrapped in a new trace if no traceId is provided.
   *
   * @param {CreateLangfuseSpanBody} body The body of the span to be created.
   * @returns {LangfuseSpanClient} The span client used to manipulate the span.
   */
  span(body: CreateLangfuseSpanBody): LangfuseSpanClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.spanStateless({ ...body, traceId });
    return new LangfuseSpanClient(this, id, traceId);
  }

  /**
   * Creates a new generation. This generation will be wrapped in a new trace if no traceId is provided.
   *
   * @param {Omit<CreateLangfuseGenerationBody, "promptName" | "promptVersion"> & PromptInput} body - The body of the generation to be created. The promptName and promptVersion are required.
   * @returns {LangfuseGenerationClient} The generation client used to manipulate the generation.
   */
  generation(
    body: Omit<CreateLangfuseGenerationBody, "promptName" | "promptVersion"> & PromptInput
  ): LangfuseGenerationClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.generationStateless({ ...body, traceId });
    return new LangfuseGenerationClient(this, id, traceId);
  }

  /**
   * Creates a new event. This event will be wrapped in a new trace if no traceId is provided.
   *
   * @param {CreateLangfuseEventBody} body - The body of the event to be created.
   * @returns {LangfuseEventClient} The event client used to manipulate the event.
   */
  event(body: CreateLangfuseEventBody): LangfuseEventClient {
    const traceId = body.traceId || this.traceStateless({ name: body.name });
    const id = this.eventStateless({ ...body, traceId });
    return new LangfuseEventClient(this, id, traceId);
  }

  /**
   * Creates a new score. This score will be wrapped in a new trace if no traceId is provided.
   *
   * @param {CreateLangfuseScoreBody} body - The body of the score to be created.
   * @returns {LangfuseCore} The LangfuseCore instance.
   */
  score(body: CreateLangfuseScoreBody): this {
    this.scoreStateless(body);
    return this;
  }

  /**
   * Gets a dataset.
   *
   * @param {string} name - The name of the dataset.
   * @returns {Promise<{id: string, name: string, description?: string, metadata?: any, projectId: string, items: Array<{id: string, input?: any, expectedOutput?: any, metadata?: any, sourceObservationId?: string | null, link: (obj: LangfuseObjectClient, runName: string, runArgs?: {description?: string, metadata?: any}) => Promise<{id: string}>}>}>} A promise that resolves to the response of the get operation.
   */
  async getDataset(name: string): Promise<{
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
    const { items, ...dataset } = await this._getDataset(name);

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
   * @returns {Promise<ChatPromptClient | TextPromptClient | LangfusePromptClient>} A promise that resolves to the response of the create operation.
   */
  async createPrompt(body: CreateChatPromptBody): Promise<ChatPromptClient>;
  async createPrompt(body: CreateTextPromptBody): Promise<TextPromptClient>;
  async createPrompt(body: CreatePromptBody): Promise<LangfusePromptClient> {
    const labels = body.labels ?? [];

    const promptResponse = await this.createPromptStateless({
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
   * @param {{label?: string, cacheTtlSeconds?: number, type?: "chat" | "text"}} [options] - The options for the prompt.
   * @returns {Promise<TextPromptClient | ChatPromptClient | LangfusePromptClient>}  A promise that resolves to the response of the get operation.
   */
  async getPrompt(
    name: string,
    version?: number,
    options?: { label?: string; cacheTtlSeconds?: number; type?: "text" }
  ): Promise<TextPromptClient>;
  async getPrompt(
    name: string,
    version?: number,
    options?: { label?: string; cacheTtlSeconds?: number; type: "chat" }
  ): Promise<ChatPromptClient>;
  async getPrompt(
    name: string,
    version?: number,
    options?: { label?: string; cacheTtlSeconds?: number; type?: "chat" | "text" }
  ): Promise<LangfusePromptClient> {
    const cacheKey = this._getPromptCacheKey({ name, version, label: options?.label });
    const cachedPrompt = this._promptCache.getIncludingExpired(cacheKey);

    if (!cachedPrompt) {
      return await this._fetchPromptAndUpdateCache({
        name,
        version,
        label: options?.label,
        cacheTtlSeconds: options?.cacheTtlSeconds,
      });
    }

    if (cachedPrompt.isExpired) {
      return await this._fetchPromptAndUpdateCache({
        name,
        version,
        label: options?.label,
        cacheTtlSeconds: options?.cacheTtlSeconds,
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
  }): Promise<LangfusePromptClient> {
    const cacheKey = this._getPromptCacheKey(params);

    try {
      const { name, version, cacheTtlSeconds, label } = params;

      const { data, fetchResult } = await this.getPromptStateless(name, version, label);
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

  /**
   * Updates the object with the given body.
   *
   * @param {Omit<CreateLangfuseEventBody, "traceId" | "parentObservationId">} body - The body of the object to be updated.
   * @returns {LangfuseEventClient} The object client.
   */
  event(body: Omit<CreateLangfuseEventBody, "traceId" | "parentObservationId">): LangfuseEventClient {
    return this.client.event({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  /**
   * Updates the object with the given body.
   *
   * @param {Omit<CreateLangfuseSpanBody, "traceId" | "parentObservationId">} body - The body of the object to be updated.
   * @returns {LangfuseSpanClient} The object client.
   */
  span(body: Omit<CreateLangfuseSpanBody, "traceId" | "parentObservationId">): LangfuseSpanClient {
    return this.client.span({
      ...body,
      traceId: this.traceId,
      parentObservationId: this.observationId,
    });
  }

  /**
   * Updates the object with the given body.
   *
   * @param {Omit<CreateLangfuseGenerationBody, "traceId" | "parentObservationId" | "promptName" | "promptVersion"> & PromptInput} body - The body of the object to be updated.
   * @returns {LangfuseGenerationClient} The object client.
   */
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

  /**
   * Updates the object with the given body.
   *
   * @param {Omit<CreateLangfuseScoreBody, "traceId" | "parentObservationId">} body - The body of the object to be updated.
   * @returns {LangfuseCore} The LangfuseCore instance.
   */
  score(body: Omit<CreateLangfuseScoreBody, "traceId" | "parentObservationId">): this {
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

export class LangfuseTraceClient extends LangfuseObjectClient {
  constructor(client: LangfuseCore, traceId: string) {
    super({ client, id: traceId, traceId, observationId: null });
  }

  /**
   * Updates the trace with the given body.
   *
   * @param {Omit<CreateLangfuseTraceBody, "id">} body - The body of the trace to be updated.
   * @returns {LangfuseTraceClient} The trace client.
   */
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

  /**
   * Updates the span with the given body.
   *
   * @param {Omit<UpdateLangfuseSpanBody, "id" | "traceId">} body - The body of the span to be updated.
   * @returns {LangfuseSpanClient} The span client.
   */
  update(body: Omit<UpdateLangfuseSpanBody, "id" | "traceId">): this {
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
   * @param {Omit<UpdateLangfuseSpanBody, "id" | "endTime" | "traceId">} body - The body of the span to be ended.
   * @returns {LangfuseSpanClient} The span client.
   */
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

  /**
   * Updates the generation with the given body.
   *
   * @param {Omit<UpdateLangfuseGenerationBody, "id" | "traceId" | "promptName" | "promptVersion"> & PromptInput} body - The body of the generation to be updated.
   * @returns {LangfuseGenerationClient} The generation client.
   */
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

  /**
   * Ends the generation with the given body.
   *
   * @param {Omit<UpdateLangfuseGenerationBody, "id" | "traceId" | "endTime" | "promptName" | "promptVersion"> & PromptInput} body - The body of the generation to be ended.
   * @returns {LangfuseGenerationClient} The generation client.
   */
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
