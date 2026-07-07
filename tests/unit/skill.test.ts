import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { LangfuseSkillCache } from "../../packages/client/src/skill/skillCache.js";
import { SkillClient } from "../../packages/client/src/skill/skillClient.js";

// `Skill` is a type from the auto-generated `@langfuse/core` API client which is
// not present in this checkout yet. It is erased at runtime, so we build plain
// objects that satisfy its expected shape.
function makeSkill(overrides: Record<string, unknown> = {}): any {
  return {
    name: "my-skill",
    version: 1,
    description: "A test skill",
    instructions: "Hello {{name}}!",
    metadata: {},
    allowedTools: ["search"],
    labels: ["production"],
    tags: ["test"],
    commitMessage: "initial",
    ...overrides,
  };
}

describe("SkillClient", () => {
  it("exposes the skill fields", () => {
    const client = new SkillClient(makeSkill());

    expect(client.name).toBe("my-skill");
    expect(client.version).toBe(1);
    expect(client.description).toBe("A test skill");
    expect(client.instructions).toBe("Hello {{name}}!");
    expect(client.allowedTools).toEqual(["search"]);
    expect(client.labels).toEqual(["production"]);
    expect(client.tags).toEqual(["test"]);
    expect(client.commitMessage).toBe("initial");
    expect(client.isFallback).toBe(false);
  });

  it("compiles {{variable}} placeholders in instructions", () => {
    const client = new SkillClient(makeSkill());

    expect(client.compile({ name: "Alice" })).toBe("Hello Alice!");
  });

  it("leaves unreferenced placeholders empty when no variable is provided", () => {
    const client = new SkillClient(makeSkill());

    expect(client.compile()).toBe("Hello !");
  });

  it("does not escape HTML entities during substitution", () => {
    const client = new SkillClient(
      makeSkill({ instructions: "value: {{value}}" }),
    );

    expect(client.compile({ value: "<a> & 'b'" })).toBe("value: <a> & 'b'");
  });

  it("round-trips through toJSON", () => {
    const client = new SkillClient(makeSkill());
    const parsed = JSON.parse(client.toJSON());

    expect(parsed.name).toBe("my-skill");
    expect(parsed.instructions).toBe("Hello {{name}}!");
    expect(parsed.allowedTools).toEqual(["search"]);
    expect(parsed.isFallback).toBe(false);
  });
});

describe("LangfuseSkillCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds cache keys from name/version/label", () => {
    const cache = new LangfuseSkillCache();

    expect(cache.createKey({ name: "s" })).toBe("s-label:production");
    expect(cache.createKey({ name: "s", version: 3 })).toBe("s-version:3");
    expect(cache.createKey({ name: "s", label: "staging" })).toBe(
      "s-label:staging",
    );
  });

  it("returns a fresh (non-expired) item within its TTL", () => {
    const cache = new LangfuseSkillCache();
    const client = new SkillClient(makeSkill());
    const key = cache.createKey({ name: "my-skill" });

    cache.set(key, client, 60);

    const item = cache.getIncludingExpired(key);
    expect(item).not.toBeNull();
    expect(item?.isExpired).toBe(false);
    expect(item?.value).toBe(client);
  });

  it("marks an item expired once its TTL elapses", () => {
    const cache = new LangfuseSkillCache();
    const client = new SkillClient(makeSkill());
    const key = cache.createKey({ name: "my-skill" });

    cache.set(key, client, 1);

    vi.advanceTimersByTime(1_001);

    const item = cache.getIncludingExpired(key);
    expect(item?.isExpired).toBe(true);
    // Stale-while-revalidate still returns the cached value.
    expect(item?.value).toBe(client);
  });

  it("invalidates every key that shares the skill name prefix", () => {
    const cache = new LangfuseSkillCache();
    const client = new SkillClient(makeSkill());

    cache.set(cache.createKey({ name: "my-skill" }), client, 60);
    cache.set(cache.createKey({ name: "my-skill", version: 2 }), client, 60);
    cache.set(cache.createKey({ name: "other-skill" }), client, 60);

    cache.invalidate("my-skill");

    expect(
      cache.getIncludingExpired(cache.createKey({ name: "my-skill" })),
    ).toBeNull();
    expect(
      cache.getIncludingExpired(
        cache.createKey({ name: "my-skill", version: 2 }),
      ),
    ).toBeNull();
    expect(
      cache.getIncludingExpired(cache.createKey({ name: "other-skill" })),
    ).not.toBeNull();
  });

  it("tracks in-flight refresh promises", async () => {
    const cache = new LangfuseSkillCache();
    const key = cache.createKey({ name: "my-skill" });

    expect(cache.isRefreshing(key)).toBe(false);

    let resolveRefresh: () => void = () => {};
    const refresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    cache.addRefreshingPromise(key, refresh);

    expect(cache.isRefreshing(key)).toBe(true);

    resolveRefresh();
    await refresh;
    // Allow the .then() cleanup callback to run.
    await Promise.resolve();

    expect(cache.isRefreshing(key)).toBe(false);
  });
});
