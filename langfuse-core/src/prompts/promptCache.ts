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
