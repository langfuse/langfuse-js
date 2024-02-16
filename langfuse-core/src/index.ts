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
} from "./types";
import {
  assert,
  generateUUID,
  removeTrailingSlash,
  retriable,
  type RetriableOptions,
  safeSetTimeout,
  getEnv,
  currentISOTime,
} from "./utils";
import mustache from "mustache";

export * as utils from "./utils";
import { SimpleEventEmitter } from "./eventemitter";
import { getCommonReleaseEnvs } from "./release-env";
export { LangfuseMemoryStorage } from "./storage-memory";

export type IngestionBody = SingleIngestionEvent["body"];

export const DEFAULT_PROMPT_CACHE_TTL_SECONDS = 60;

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
  private sdkIntegration: "DEFAULT" | "LANGCHAIN" | string;

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

  constructor(params: { publicKey: string; secretKey?: string } & LangfuseCoreOptions) {
    const { publicKey, secretKey, ...options } = params;
    assert(publicKey, "You must pass your Langfuse project's api public key.");

    this.publicKey = publicKey;
    this.secretKey = secretKey;
    this.baseUrl = removeTrailingSlash(options?.baseUrl || "https://cloud.langfuse.com");
    this.flushAt = options?.flushAt ? Math.max(options?.flushAt, 1) : 20;
    this.flushInterval = options?.flushInterval ?? 10000;
    this.release = options?.release ?? getEnv("LANGFUSE_RELEASE") ?? getCommonReleaseEnvs() ?? undefined;

    this._retryOptions = {
      retryCount: options?.fetchRetryCount ?? 3,
      retryDelay: options?.fetchRetryDelay ?? 3000,
      retryCheck: isLangfuseFetchError,
    };
    this.requestTimeout = options?.requestTimeout ?? 10000; // 10 seconds

    this.sdkIntegration = options?.sdkIntegration ?? ("DEFAULT" as const);
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
    return this.fetch(`${this.baseUrl}/api/public/datasets/${name}`, this._getFetchOptions({ method: "GET" })).then(
      (res) => res.json()
    );
  }

  async getDatasetRun(params: GetLangfuseDatasetRunParams): Promise<GetLangfuseDatasetRunResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/datasets/${params.datasetName}/runs/${params.runName}`,
      this._getFetchOptions({ method: "GET" })
    ).then((res) => res.json());
  }

  async createDatasetRunItem(body: CreateLangfuseDatasetRunItemBody): Promise<CreateLangfuseDatasetRunItemResponse> {
    return this.fetch(
      `${this.baseUrl}/api/public/dataset-run-items`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  async createDataset(name: string): Promise<CreateLangfuseDatasetResponse> {
    const body: CreateLangfuseDatasetBody = { name };
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
      `${this.baseUrl}/api/public/prompts`,
      this._getFetchOptions({ method: "POST", body: JSON.stringify(body) })
    ).then((res) => res.json());
  }

  async getPromptStateless(name: string, version?: number): Promise<GetLangfusePromptResponse> {
    const url = `${this.baseUrl}/api/public/prompts?name=${name}` + (version ? `&version=${version}` : "");
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

        console.log(`Item: ${queue[i].id}, Size: ${itemSize}`);

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
  constructor(params: { publicKey: string } & LangfuseCoreOptions) {
    const { flushAt, flushInterval, ...rest } = params;
    super({
      ...rest,
      flushAt: flushAt ?? 1,
      flushInterval: flushInterval ?? 0,
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

  constructor(params: { publicKey: string; secretKey: string } & LangfuseCoreOptions) {
    assert(params.publicKey, "You must pass your Langfuse project's api public key.");
    assert(params.secretKey, "You must pass your Langfuse project's api secret key.");
    super(params);
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

  async getDataset(name: string): Promise<{
    id: string;
    name: string;
    projectId: string;
    items: Array<{
      id: string;
      input: any;
      expectedOutput?: any;
      sourceObservationId?: string | null;
      link: (obj: LangfuseObservationClient, runName: string) => Promise<{ id: string }>;
    }>;
  }> {
    const { items, ...dataset } = await this._getDataset(name);

    const returnDataset = {
      ...dataset,
      items: items.map((item) => ({
        ...item,
        link: async (obj: LangfuseObservationClient, runName: string) => {
          await this.awaitAllQueuedAndPendingRequests();
          const data = await this.createDatasetRunItem({
            runName,
            datasetItemId: item.id,
            observationId: obj.id,
          });
          return data;
        },
      })),
    };

    return returnDataset;
  }

  async createPrompt(body: CreateLangfusePromptBody): Promise<LangfusePromptClient> {
    const prompt = await this.createPromptStateless(body);
    return new LangfusePromptClient(prompt);
  }

  async getPrompt(
    name: string,
    version?: number,
    options?: { cacheTtlSeconds?: number }
  ): Promise<LangfusePromptClient> {
    const cacheKey = this._getPromptCacheKey(name, version);
    const cachedPrompt = this._promptCache.getIncludingExpired(cacheKey);

    if (!cachedPrompt) {
      return await this._fetchPromptAndUpdateCache(name, version, options?.cacheTtlSeconds);
    }

    if (cachedPrompt.isExpired) {
      return await this._fetchPromptAndUpdateCache(name, version, options?.cacheTtlSeconds).catch(() => {
        console.warn(`Returning expired prompt cache for '${name}-${version ?? "latest"}' due to fetch error`);

        return cachedPrompt.value;
      });
    }

    return cachedPrompt.value;
  }

  private _getPromptCacheKey(name: string, version?: number): string {
    return `${name}-${version ?? "latest"}`;
  }

  private async _fetchPromptAndUpdateCache(
    name: string,
    version?: number,
    cacheTtlSeconds?: number
  ): Promise<LangfusePromptClient> {
    try {
      const { data, fetchResult } = await this.getPromptStateless(name, version);
      if (fetchResult === "failure") {
        throw Error(data.message ?? "Internal error while fetching prompt");
      }

      const prompt = new LangfusePromptClient(data);
      this._promptCache.set(this._getPromptCacheKey(name, version), prompt, cacheTtlSeconds);

      return prompt;
    } catch (error) {
      console.error(`Error while fetching prompt '${name}-${version ?? "latest"}':`, error);

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
  public readonly id: string;
  public readonly traceId: string;
  public readonly observationId: string | null;

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

export class LangfusePromptClient {
  private promptResponse: CreateLangfusePromptResponse;
  public readonly name: string;
  public readonly version: number;
  public readonly prompt: string;

  constructor(prompt: CreateLangfusePromptResponse) {
    this.promptResponse = prompt;
    this.name = prompt.name;
    this.version = prompt.version;
    this.prompt = prompt.prompt;
  }

  compile(variables?: { [key: string]: string }): string {
    return mustache.render(this.promptResponse.prompt, variables ?? {});
  }
}

class LangfusePromptCacheItem {
  private _expiry: number;

  constructor(
    public value: LangfusePromptClient,
    ttlSeconds: number
  ) {
    this._expiry = Date.now() + ttlSeconds * 1000;
  }

  get isExpired(): boolean {
    return Date.now() > this._expiry;
  }
}

class LangfusePromptCache {
  private _cache: Map<string, LangfusePromptCacheItem>;
  private _defaultTtlSeconds: number;

  constructor() {
    this._cache = new Map<string, LangfusePromptCacheItem>();
    this._defaultTtlSeconds = DEFAULT_PROMPT_CACHE_TTL_SECONDS;
  }

  public getIncludingExpired(key: string): LangfusePromptCacheItem | null {
    return this._cache.get(key) ?? null;
  }

  public set(key: string, value: LangfusePromptClient, ttlSeconds?: number): void {
    const effectiveTtlSeconds = ttlSeconds ?? this._defaultTtlSeconds;
    this._cache.set(key, new LangfusePromptCacheItem(value, effectiveTtlSeconds));
  }
}

export * from "./types";
export * from "./openapi/server";
