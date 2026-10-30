import type { Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { getGlobalLogger, SkillReference } from "@langfuse/core";

const LANGFUSE_SKILL_LOCK_FILE_NAME = "langfuse-skills.lock";

/** Options for discovering installed skills on the local filesystem. */
export interface DiscoverSkillsOptions {
  /**
   * Directory containing skill subdirectories. Absolute paths and paths relative
   * to the working directory are supported. The CLI lockfile is checked in this
   * directory first, then in the working directory.
   */
  dir: string;
}

/**
 * Discover immediate skill subdirectories containing SKILL.md. No network calls.
 * CLI locks provide names and versions; unlocked skills use directory names.
 * Installation records do not verify subsequent local edits.
 * Symlinks are followed. Missing directories return an empty list; unreadable
 * ones warn and return an empty list.
 * Unreadable or malformed locks warn and fall back to directory names.
 */
export async function discoverSkills({
  dir,
}: DiscoverSkillsOptions): Promise<SkillReference[]> {
  const root = resolve(dir);
  const available = new Map<string, SkillReference>();
  let skillDirEntries: string[];
  try {
    if (!(await statIfExists(root))) return [];
    skillDirEntries = (await readdir(root)).sort();
  } catch (error) {
    getGlobalLogger().warn(
      `Could not read skills directory ${root}. No skills discovered.`,
      error,
    );
    return [];
  }
  let locked = new Map<string, SkillReference>();
  try {
    const lockPath = await findCliLock(root);
    locked = await readCliLock(lockPath);
  } catch (error) {
    getGlobalLogger().warn(
      `Could not read skill lockfile for ${root}. Using directory names without versions.`,
      error,
    );
  }
  for (const entryName of skillDirEntries) {
    if (entryName.startsWith(".")) continue;
    const candidateDirectory = join(root, entryName);
    try {
      const directoryStats = await statIfExists(candidateDirectory);
      if (!directoryStats?.isDirectory()) continue;
      const skillMdStats = await statIfExists(
        join(candidateDirectory, "SKILL.md"),
      );
      if (!skillMdStats?.isFile()) continue;
    } catch (error) {
      getGlobalLogger().warn(
        `Skipping skill directory ${candidateDirectory}: could not inspect files.`,
        error,
      );
      continue;
    }
    const identity = locked.get(candidateDirectory);
    const name = identity?.name ?? entryName;
    if (name.length > 128) {
      getGlobalLogger().warn(
        `Skipping skill ${name}: name exceeds 128 characters.`,
      );
      continue;
    }
    if (available.has(name)) {
      getGlobalLogger().warn(`Skipping duplicate skill name ${name}.`);
      continue;
    }
    available.set(name, { ...identity, name });
  }
  return Array.from(available.values());
}

async function findCliLock(directory: string): Promise<string | undefined> {
  const skillsLockPath = join(directory, LANGFUSE_SKILL_LOCK_FILE_NAME);
  if (await statIfExists(skillsLockPath)) {
    return skillsLockPath;
  }

  const cwdLockPath = join(process.cwd(), LANGFUSE_SKILL_LOCK_FILE_NAME);
  if (await statIfExists(cwdLockPath)) {
    return cwdLockPath;
  }

  return undefined;
}

async function readCliLock(
  file: string | undefined,
): Promise<Map<string, { name: string; version: number }>> {
  const locked = new Map<string, { name: string; version: number }>();
  if (!file) return locked;
  const stat = await statIfExists(file);
  if (!stat) return locked;
  if (!stat.isFile()) throw new Error(`Invalid skill lockfile ${file}.`);
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (
    !isRecord(value) ||
    !Number.isInteger(value.lockVersion) ||
    !Array.isArray(value.skills)
  )
    throw new Error(`Unsupported or invalid skill lockfile ${file}.`);
  for (const skill of value.skills) {
    if (!isValidLockedSkill(skill)) {
      getGlobalLogger().warn(`Skipping invalid skill entry in ${file}.`);
      continue;
    }
    locked.set(resolve(dirname(file), skill.path), {
      name: skill.name,
      version: skill.version,
    });
  }
  return locked;
}

function isValidLockedSkill(
  skill: unknown,
): skill is { path: string; name: string; version: number } {
  return (
    isRecord(skill) &&
    typeof skill.path === "string" &&
    skill.path.length > 0 &&
    typeof skill.name === "string" &&
    skill.name.length > 0 &&
    skill.name.length <= 128 &&
    typeof skill.version === "number" &&
    Number.isInteger(skill.version) &&
    skill.version >= 1 &&
    skill.version <= 2_147_483_647
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

async function statIfExists(path: string): Promise<Stats | undefined> {
  try {
    return await stat(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}
