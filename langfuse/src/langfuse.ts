import {
  LangfuseCore,
  LangfuseWebStateless,
  type LangfuseFetchOptions,
  type LangfuseFetchResponse,
  type LangfusePersistedProperty,
  utils,
} from "langfuse-core";
import { type LangfuseStorage, getStorage } from "./storage";
import { version } from "../package.json";
import { type LangfuseOptions } from "./types";

// Required when users pass these as typed arguments
export {
  type LangfuseTraceClient,
  type LangfuseSpanClient,
  type LangfuseEventClient,
  type LangfuseGenerationClient,
} from "langfuse-core";

export class Langfuse extends LangfuseCore {
  private _storage: LangfuseStorage;
  private _storageCache: any;
  private _storageKey: string;

  /**
   * Creates a new Langfuse SDK instance.
   * @param {LangfuseOptions} params - The configuration options for the Langfuse SDK.
   * @returns {Langfuse} - The Langfuse SDK instance.
   */
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
