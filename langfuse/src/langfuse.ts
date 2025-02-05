import {
  LangfuseCore,
  LangfuseWebStateless,
  type LangfuseFetchOptions,
  type LangfuseFetchResponse,
  type LangfusePersistedProperty,
  utils,
} from "langfuse-core";
import { type LangfuseStorage, getStorage } from "./storage";
import { LangfusePublicApi } from "./publicApi";
import { version } from "../package.json";
import { type LangfuseOptions } from "./types";

export type * from "./publicApi";
export type {
  LangfusePromptClient,
  ChatPromptClient,
  TextPromptClient,
  LangfusePromptRecord,
  LangfuseTraceClient,
  LangfuseSpanClient,
  LangfuseEventClient,
  LangfuseGenerationClient,
} from "langfuse-core";

// Required when users pass these as typed arguments
export { LangfuseMedia } from "langfuse-core";

export class Langfuse extends LangfuseCore {
  private _storage: LangfuseStorage;
  private _storageCache: any;
  private _storageKey: string;
  public api: LangfusePublicApi<null>["api"];

  constructor(params?: { publicKey?: string; secretKey?: string } & LangfuseOptions) {
    const langfuseConfig = utils.configLangfuseSDK(params);
    super(langfuseConfig);

    if (typeof window !== "undefined" && "Deno" in window === false) {
      this._storageKey = params?.persistence_name
        ? `lf_${params.persistence_name}`
        : `lf_${langfuseConfig.publicKey}_langfuse`;
      this._storage = getStorage(params?.persistence || "localStorage", window);
    } else {
      this._storageKey = `lf_${langfuseConfig.publicKey}_langfuse`;
      this._storage = getStorage("memory", undefined);
    }

    this.api = new LangfusePublicApi({
      baseUrl: this.baseUrl,
      baseApiParams: {
        headers: {
          "X-Langfuse-Sdk-Name": "langfuse-js",
          "X-Langfuse-Sdk-Version": this.getLibraryVersion(),
          "X-Langfuse-Sdk-Variant": this.getLibraryId(),
          "X-Langfuse-Sdk-Integration": this.sdkIntegration,
          "X-Langfuse-Public-Key": this.publicKey,
          ...this.additionalHeaders,
          ...this.constructAuthorizationHeader(this.publicKey, this.secretKey),
        },
      },
    }).api;
  }

  getPersistedProperty<T>(key: LangfusePersistedProperty): T | undefined {
    if (!this._storageCache) {
      this._storageCache = JSON.parse(this._storage.getItem(this._storageKey) || "{}") || {};
    }

    return this._storageCache[key];
  }

  setPersistedProperty<T>(key: LangfusePersistedProperty, value: T | null): void {
    if (!this._storageCache) {
      this._storageCache = JSON.parse(this._storage.getItem(this._storageKey) || "{}") || {};
    }

    if (value === null) {
      delete this._storageCache[key];
    } else {
      this._storageCache[key] = value;
    }

    this._storage.setItem(this._storageKey, JSON.stringify(this._storageCache));
  }

  fetch(url: string, options: LangfuseFetchOptions): Promise<LangfuseFetchResponse> {
    return fetch(url, options);
  }

  getLibraryId(): string {
    return "langfuse";
  }

  getLibraryVersion(): string {
    return version;
  }

  getCustomUserAgent(): void {
    return;
  }
}

export class LangfuseWeb extends LangfuseWebStateless {
  private _storage: LangfuseStorage;
  private _storageCache: any;
  private _storageKey: string;

  constructor(params?: Omit<LangfuseOptions, "secretKey">) {
    const langfuseConfig = utils.configLangfuseSDK(params, false);
    super(langfuseConfig);

    if (typeof window !== "undefined") {
      this._storageKey = params?.persistence_name
        ? `lf_${params.persistence_name}`
        : `lf_${langfuseConfig.publicKey}_langfuse`;
      this._storage = getStorage(params?.persistence || "localStorage", window);
    } else {
      this._storageKey = `lf_${langfuseConfig.publicKey}_langfuse`;
      this._storage = getStorage("memory", undefined);
    }
  }

  getPersistedProperty<T>(key: LangfusePersistedProperty): T | undefined {
    if (!this._storageCache) {
      this._storageCache = JSON.parse(this._storage.getItem(this._storageKey) || "{}") || {};
    }

    return this._storageCache[key];
  }

  setPersistedProperty<T>(key: LangfusePersistedProperty, value: T | null): void {
    if (!this._storageCache) {
      this._storageCache = JSON.parse(this._storage.getItem(this._storageKey) || "{}") || {};
    }

    if (value === null) {
      delete this._storageCache[key];
    } else {
      this._storageCache[key] = value;
    }

    this._storage.setItem(this._storageKey, JSON.stringify(this._storageCache));
  }

  fetch(url: string, options: LangfuseFetchOptions): Promise<LangfuseFetchResponse> {
    return fetch(url, options);
  }

  getLibraryId(): string {
    return "langfuse-frontend";
  }

  getLibraryVersion(): string {
    return version;
  }

  getCustomUserAgent(): void {
    return;
  }
}
