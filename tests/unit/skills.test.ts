import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getGlobalLogger } from "@langfuse/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverSkills } from "../../packages/otel/src/node/index.js";

describe("discoverSkills", () => {
  let cwd: string;
  let dir: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "langfuse-skills-"));
    dir = join(cwd, "skills");
    await mkdir(dir);
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(cwd, { recursive: true, force: true });
  });

  async function createSkill(name: string) {
    await mkdir(join(dir, name));
    await writeFile(join(dir, name, "SKILL.md"), "# Skill");
  }

  async function writeLock(directory: string, skills: unknown[]) {
    await writeFile(
      join(directory, "langfuse-skills.lock"),
      JSON.stringify({ lockVersion: 1, skills }),
    );
  }

  it("uses lockfile identities and falls back to directory names", async () => {
    await createSkill("installed");
    await createSkill("local");
    await createSkill(".hidden");
    await mkdir(join(dir, "empty"));
    await writeLock(dir, [
      { path: "installed", name: "customer-support", version: 2 },
    ]);

    expect(await discoverSkills({ dir })).toEqual([
      { name: "customer-support", version: 2 },
      { name: "local" },
    ]);
  });

  it("prefers the configured directory's lockfile over the working directory", async () => {
    await createSkill("support");
    await writeLock(dir, [{ path: "support", name: "support", version: 2 }]);
    await writeLock(cwd, [
      { path: "skills/support", name: "support", version: 1 },
    ]);

    expect(await discoverSkills({ dir })).toEqual([
      { name: "support", version: 2 },
    ]);
  });

  it("resolves fallback lockfile paths relative to the working directory", async () => {
    await createSkill("support");
    await writeLock(cwd, [
      { path: "skills/support", name: "support", version: 3 },
    ]);

    expect(await discoverSkills({ dir })).toEqual([
      { name: "support", version: 3 },
    ]);
  });

  it("keeps valid skills when entries are invalid or names are duplicated", async () => {
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => {});
    await createSkill("first");
    await createSkill("second");
    await createSkill("local");
    await createSkill("x".repeat(129));
    await writeLock(dir, [
      { path: "first", name: "support", version: 1 },
      { path: "second", name: "support", version: 1 },
      { path: "local", name: "invalid", version: 2_147_483_648 },
    ]);

    expect(await discoverSkills({ dir })).toEqual([
      { name: "support", version: 1 },
      { name: "local" },
    ]);
    expect(warn).toHaveBeenCalled();
  });

  it("returns an empty list for a missing directory", async () => {
    expect(await discoverSkills({ dir: join(cwd, "missing") })).toEqual([]);
  });

  it.each(["not json", '{"lockVersion":2,"skills":[]}'])(
    "rejects an invalid lockfile: %s",
    async (content) => {
      await writeFile(join(dir, "langfuse-skills.lock"), content);
      await expect(discoverSkills({ dir })).rejects.toThrow();
    },
  );
});
