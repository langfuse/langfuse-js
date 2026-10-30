import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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

  it.each(["file", "symlink-loop"])(
    "returns an empty list when the skills directory is a %s",
    async (kind) => {
      const warn = vi
        .spyOn(getGlobalLogger(), "warn")
        .mockImplementation(() => {});
      const root = join(cwd, "broken-skills");
      if (kind === "file") await writeFile(root, "not a directory");
      else await symlink(root, root);

      expect(await discoverSkills({ dir: root })).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not read skills directory"),
        expect.anything(),
      );
    },
  );

  it.each(["directory", "SKILL.md"])(
    "skips a skill with a looping %s symlink and keeps valid skills",
    async (target) => {
      const warn = vi
        .spyOn(getGlobalLogger(), "warn")
        .mockImplementation(() => {});
      const broken = join(dir, "broken");
      if (target === "SKILL.md") await mkdir(broken);
      const link = target === "directory" ? broken : join(broken, target);
      await symlink(link, link);
      await createSkill("support");

      expect(await discoverSkills({ dir })).toEqual([{ name: "support" }]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(broken),
        expect.objectContaining({ code: "ELOOP" }),
      );
    },
  );

  it("accepts lockfiles with other integer versions", async () => {
    await createSkill("support");
    await writeFile(
      join(dir, "langfuse-skills.lock"),
      JSON.stringify({
        lockVersion: 2,
        skills: [{ path: "support", name: "managed", version: 4 }],
      }),
    );

    expect(await discoverSkills({ dir })).toEqual([
      { name: "managed", version: 4 },
    ]);
  });

  it.each(["not json", '{"lockVersion":"1","skills":[]}'])(
    "falls back to names for an invalid lockfile: %s",
    async (content) => {
      const warn = vi
        .spyOn(getGlobalLogger(), "warn")
        .mockImplementation(() => {});
      await createSkill("support");
      await writeLock(cwd, [
        { path: "skills/support", name: "other", version: 3 },
      ]);
      await writeFile(join(dir, "langfuse-skills.lock"), content);

      expect(await discoverSkills({ dir })).toEqual([{ name: "support" }]);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it.each(["directory", "unreadable", "symlink-loop"])(
    "falls back to names when the lockfile is %s",
    async (kind) => {
      const warn = vi
        .spyOn(getGlobalLogger(), "warn")
        .mockImplementation(() => {});
      await createSkill("support");
      const lock = join(dir, "langfuse-skills.lock");
      if (kind === "directory") await mkdir(lock);
      else if (kind === "symlink-loop") await symlink(lock, lock);
      else {
        await writeLock(dir, []);
        await chmod(lock, 0);
      }
      try {
        expect(await discoverSkills({ dir })).toEqual([{ name: "support" }]);
        expect(warn).toHaveBeenCalled();
      } finally {
        if (kind === "unreadable") await chmod(lock, 0o600);
      }
    },
  );

  it("discovers linked skill folders, entrypoints, and lockfiles", async () => {
    const target = join(cwd, "shared-skill");
    await mkdir(target);
    await writeFile(join(target, "SKILL.md"), "# Shared");
    await symlink(target, join(dir, "linked-directory"), "dir");
    await mkdir(join(dir, "linked-file"));
    await symlink(
      join(target, "SKILL.md"),
      join(dir, "linked-file", "SKILL.md"),
    );
    await symlink(join(cwd, "missing"), join(dir, "broken"), "dir");
    await symlink(target, join(dir, ".hidden"), "dir");
    await writeLock(cwd, [
      { path: "linked-directory", name: "managed", version: 2 },
    ]);
    await symlink(
      join(cwd, "langfuse-skills.lock"),
      join(dir, "langfuse-skills.lock"),
    );

    expect(await discoverSkills({ dir })).toEqual([
      { name: "managed", version: 2 },
      { name: "linked-file" },
    ]);
  });
});
