import {
  LangfuseCore,
  LangfuseWebStateless,
  type LangfuseFetchOptions,
  type LangfuseFetchResponse,
  type LangfusePersistedProperty,
} from "../../langfuse-core/src";
import { type LangfuseStorage, getStorage } from "./storage";
import { version } from "../package.json";
import { type LangfuseOptions } from "./types";
import dotenv from 'dotenv';

dotenv.config();

// Required when users pass these as typed arguments
export {
  type LangfuseTraceClient,
  type LangfuseSpanClient,
  type LangfuseEventClient,
  type LangfuseGenerationClient,
} from "../../langfuse-core/src";

export class Langfuse extends LangfuseCore {
  private _storage: LangfuseStorage;
  private _storageCache: any;
  private _storageKey: string;

  constructor(params?: { publicKey: string; secretKey: string } & LangfuseOptions) {
    // if params are not provided and environment variables exist, then retrieve data from the environment variables. 
    if (!params) {
      if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
        params = { publicKey: process.env.LANGFUSE_PUBLIC_KEY, secretKey: process.env.LANGFUSE_SECRET_KEY }
      }
      else {
        throw new Error("You must pass your Langfuse project's api public key and secret key either within the constructor or as environment variables ");
      }
    }

    if (!params.publicKey && process.env.LANGFUSE_PUBLIC_KEY) {
      params.publicKey = process.env.LANGFUSE_PUBLIC_KEY
    }

    if (!params.secretKey && process.env.LANGFUSE_SECRET_KEY) {
      params.secretKey = process.env.LANGFUSE_SECRET_KEY
    }

    if (!params.baseUrl && process.env.LANGFUSE_HOST) {
      params.baseUrl = process.env.LANGFUSE_HOST
    }

    super(params);

    const { publicKey, secretKey, ...options } = params;

    if (typeof window !== "undefined" && "Deno" in window === false) {
      this._storageKey = options?.persistence_name ? `lf_${options.persistence_name}` : `lf_${publicKey}_langfuse`;
      this._storage = getStorage(options?.persistence || "localStorage", window);
    } else {
      this._storageKey = `lf_${publicKey}_langfuse`;
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

  constructor(params?: { publicKey: string } & LangfuseOptions) {
    // if params are not provided and environment variables exist, then retrieve data from the environment variables. 
    if (!params) {
      if (process.env.LANGFUSE_PUBLIC_KEY) {
        params = { publicKey: process.env.LANGFUSE_PUBLIC_KEY }
      }
      else if (process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY) {
        params = { publicKey: process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY }
      }
      else {
        throw new Error("You must pass your Langfuse project's api public key either within the constructor or as environment variables ");
      }
    }

    if (!params.publicKey && process.env.LANGFUSE_PUBLIC_KEY) {
      params.publicKey = process.env.LANGFUSE_PUBLIC_KEY
    }
    else if (!params.publicKey && process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY) {
      params.publicKey = process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY;
    }

    if (!params.baseUrl && process.env.LANGFUSE_HOST) {
      params.baseUrl = process.env.LANGFUSE_HOST
    }

    super(params);

    const { publicKey, ...options } = params;

    if (typeof window !== "undefined") {
      this._storageKey = options?.persistence_name ? `lf_${options.persistence_name}` : `lf_${publicKey}_langfuse`;
      this._storage = getStorage(options?.persistence || "localStorage", window);
    } else {
      this._storageKey = `lf_${publicKey}_langfuse`;
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
