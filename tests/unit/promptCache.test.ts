import { describe, expect, it } from "vitest";

import { LangfusePromptCache } from "../../packages/client/src/prompt/promptCache.js";
import type { LangfusePromptClient } from "../../packages/client/src/prompt/promptClients.js";

function makeCachedPrompt(key: string): LangfusePromptClient {
  return { name: key } as LangfusePromptClient;
}

function seededCache(): {
  cache: LangfusePromptCache;
  fooKeys: string[];
  foobarKeys: string[];
} {
  const cache = new LangfusePromptCache();
  const fooKeys = [
    cache.createKey({ name: "foo", label: "production" }),
    cache.createKey({ name: "foo", version: 1 }),
  ];
  const foobarKeys = [
    cache.createKey({ name: "foobar", label: "production" }),
    cache.createKey({ name: "foobar", version: 2 }),
  ];

  for (const key of [...fooKeys, ...foobarKeys]) {
    cache.set(key, makeCachedPrompt(key));
  }

  return { cache, fooKeys, foobarKeys };
}

function valueAt(cache: LangfusePromptCache, key: string) {
  return cache.getIncludingExpired(key)?.value ?? null;
}

describe("LangfusePromptCache.invalidate", () => {
  it("leaves a name that only shares the invalidated name as a prefix cached", () => {
    const { cache, fooKeys, foobarKeys } = seededCache();

    cache.invalidate("foo");

    for (const key of fooKeys) {
      expect(valueAt(cache, key), `${key} should be invalidated`).toBeNull();
    }
    for (const key of foobarKeys) {
      expect(valueAt(cache, key), `${key} should survive`).not.toBeNull();
    }
  });

  it("still invalidates every cached version of the exact name (control)", () => {
    const { cache, fooKeys, foobarKeys } = seededCache();

    cache.invalidate("foobar");

    for (const key of foobarKeys) {
      expect(valueAt(cache, key), `${key} should be invalidated`).toBeNull();
    }
    for (const key of fooKeys) {
      expect(valueAt(cache, key), `${key} should survive`).not.toBeNull();
    }
  });
});
