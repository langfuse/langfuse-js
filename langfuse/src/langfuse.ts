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
import { type LangfuseWebOptions, type LangfuseOptions } from "./types";

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
   * Langfuse client constructor.
   *
   * @param {LangfuseOptions} params - LangfuseOptions object to configure the Langfuse client.
   * @returns {Langfuse} - Langfuse client instance.
   */
  constructor(params?: LangfuseOptions) {
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

/**
 * LangfuseWeb client
 * The langfuse JS/TS SDK can be used to report scores client-side directly from the browser. It is commonly used to ingest scores into Langfuse which are based on implicit user interactions and feedback.
 * Hint for Next.js users: you need to prefix the public key with NEXT_PUBLIC_ to expose it in the frontend.
 *
 * @param {LangfuseWebOptions} params - LangfuseWebOptions object to configure the LangfuseWeb client.
 * @returns {LangfuseWeb} - LangfuseWeb client instance.
 *
 * @example
 * ```typescript
 * import { LangfuseWeb } from "langfuse";
 *
 * const langfuseWeb = new LangfuseWeb({
 *   publicKey: "pk-lf-...",
 *   baseUrl: "https://cloud.langfuse.com", // 🇪🇺 EU region
 *   // baseUrl: "https://us.cloud.langfuse.com", // 🇺🇸 US region
 * });
 *
 * // React example
 * const handleUserFeedback = async (value: number) => {
 *   await langfuseWeb.score({
 *     traceId: props.traceId,
 *     name: "user_feedback",
 *     value,
 *   });
 * };
 *
 * return (
 *   <div>
 *     <button onClick={() => handleUserFeedback(1)}>👍</button>
 *     <button onClick={() => handleUserFeedback(0)}>👎</button>
 *   </div>
 * );
 * ```
 *
 * ```vue
 * // Vue example
 * <template>
 *   <div>
 *     <button @click="handleUserFeedback(1)">👍</button>
 *     <button @click="handleUserFeedback(0)">👎</button>
 *   </div>
 * </template>
 *
 * <script>
 *   import { LangfuseWeb } from "langfuse";
 *
 *   export default {
 *     props: {
 *       traceId: {
 *         type: String,
 *         required: true,
 *       },
 *     },
 *     data() {
 *       return {
 *         langfuseWeb: null,
 *       };
 *     },
 *     created() {
 *       this.langfuseWeb = new LangfuseWeb({
 *         publicKey: process.env.VUE_APP_LANGFUSE_PUBLIC_KEY,
 *         baseUrl: "https://cloud.langfuse.com", // 🇪🇺 EU region
 *         // baseUrl: "https://us.cloud.langfuse.com", // 🇺🇸 US region
 *       });
 *     },
 *     methods: {
 *       async handleUserFeedback(value) {
 *         await this.langfuseWeb.score({
 *           traceId: this.traceId,
 *           name: "user_feedback",
 *           value,
 *         });
 *       },
 *     },
 *   };
 * </script>
 * ```
 *
 * ```typescript
 * // Score example
 * // pass traceId and observationId to front end
 * await langfuseWeb.score({
 *   traceId: message.traceId,
 *   observationId: message.observationId,
 *   name: "user-feedback",
 *   value: 1,
 *   comment: "I like how personalized the response is",
 * });
 * ```
 */
export class LangfuseWeb extends LangfuseWebStateless {
  private _storage: LangfuseStorage;
  private _storageCache: any;
  private _storageKey: string;

  constructor(params?: LangfuseWebOptions) {
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
