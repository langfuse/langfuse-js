import type { LangfusePromptClient } from "./promptClients";

export const DEFAULT_PROMPT_CACHE_TTL_SECONDS = 60;

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
export class LangfusePromptCache {
  private _cache: Map<string, LangfusePromptCacheItem>;
  private _defaultTtlSeconds: number;
  private _refreshingKeys: Map<string, Promise<void>>;

  constructor() {
    this._cache = new Map<string, LangfusePromptCacheItem>();
    this._defaultTtlSeconds = DEFAULT_PROMPT_CACHE_TTL_SECONDS;
    this._refreshingKeys = new Map<string, Promise<void>>();
  }

  public getIncludingExpired(key: string): LangfusePromptCacheItem | null {
    return this._cache.get(key) ?? null;
  }

  public set(key: string, value: LangfusePromptClient, ttlSeconds?: number): void {
    const effectiveTtlSeconds = ttlSeconds ?? this._defaultTtlSeconds;
    this._cache.set(key, new LangfusePromptCacheItem(value, effectiveTtlSeconds));
  }

  public addRefreshingPromise(key: string, promise: Promise<any>): void {
    this._refreshingKeys.set(key, promise);
    promise
      .then(() => {
        this._refreshingKeys.delete(key);
      })
      .catch(() => {
        this._refreshingKeys.delete(key);
      });
  }

  public isRefreshing(key: string): boolean {
    return this._refreshingKeys.has(key);
  }

  public invalidate(promptName: string): void {
    console.log("invalidating", promptName, this._cache.keys());
    for (const key of this._cache.keys()) {
      if (key.startsWith(promptName)) {
        this._cache.delete(key);
      }
    }
  }
}
