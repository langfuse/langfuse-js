import { version } from "../package.json";

import {
  // JsonType,
  LangfuseCore,
  type LangfuseFetchOptions,
  type LangfuseFetchResponse,
  type LangfusePersistedProperty,
  LangfuseMemoryStorage,
  utils,
} from "langfuse-core";
import { type LangfuseOptions } from "./types";
import { fetch } from "./fetch";

// Required when users pass these as typed arguments
export {
  type LangfuseTraceClient,
  type LangfuseSpanClient,
  type LangfuseEventClient,
  type LangfuseGenerationClient,
} from "langfuse-core";

// The actual exported Nodejs API.
export default class Langfuse extends LangfuseCore {
  private _memoryStorage = new LangfuseMemoryStorage();

  private options: LangfuseOptions;

  constructor(params?: { publicKey?: string; secretKey?: string } & LangfuseOptions) {
    const { publicKey, secretKey, ...options } = utils.configLangfuseSDK(params);
    if (!secretKey) {
      throw new Error("secretKey is required");
    }
    utils.assert(secretKey, "[Langfuse] secretKey is required for instantiation");

    if (!publicKey) {
      throw new Error("publicKey is required");
    }
    utils.assert(publicKey, "[Langfuse] publicKey is required for instantiation");

    super({ publicKey, secretKey, ...options });

    this.options = options;
  }

  getPersistedProperty(key: LangfusePersistedProperty): any | undefined {
    return this._memoryStorage.getProperty(key);
  }

  setPersistedProperty(key: LangfusePersistedProperty, value: any | null): void {
    return this._memoryStorage.setProperty(key, value);
  }

  fetch(url: string, options: LangfuseFetchOptions): Promise<LangfuseFetchResponse> {
    return this.options.fetch ? this.options.fetch(url, options) : fetch(url, options);
  }

  getLibraryId(): string {
    return "langfuse-node";
  }
  getLibraryVersion(): string {
    return version;
  }
  getCustomUserAgent(): string {
    return `langfuse-node/${version}`;
  }
}
