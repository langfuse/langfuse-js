import type { Stats } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const LANGFUSE_SKILL_LOCK_FILE_NAME = "langfuse-skills.lock.json";

/** A skill found on disk, with its managed version when known. */
interface AvailableSkill {
  name: string;
  version?: number;
  directory: string;
}

/**
 * Read immediate skill subdirectories containing SKILL.md. No network calls.
 * CLI v1 locks provide names and versions; unlocked skills use directory names.
 * Installation records do not verify subsequent local edits.
 * @internal
 */
export async function readAvailableSkills(
  dir: string,
): Promise<Map<string, AvailableSkill>> {
  const root = resolve(dir);
  const available = new Map<string, AvailableSkill>();
  if (!(await statIfExists(root))) return available;
  const lockPath = await findCliLock(root);
  const locked = await readCliLock(lockPath);
  const skillDirEntries = await readdir(root, { withFileTypes: true });
  for (const candidate of skillDirEntries) {
    if (!candidate.isDirectory() || candidate.name.startsWith(".")) continue;
    const candidateDirectory = join(root, candidate.name);
    const skillMdStats = await statIfExists(
      join(candidateDirectory, "SKILL.md"),
    );
    if (!skillMdStats?.isFile()) continue;
    const identity = locked.get(candidateDirectory);
    const name = identity?.name ?? candidate.name;
    if (name.length > 128)
      throw new Error(`Skill name ${name} exceeds 128 characters.`);
    if (available.has(name)) throw new Error(`Duplicate skill name ${name}.`);
    available.set(name, { ...identity, name, directory: candidateDirectory });
  }
  return available;
}

async function findCliLock(directory: string): Promise<string | undefined> {
  const cwdLockPath = join(process.cwd(), LANGFUSE_SKILL_LOCK_FILE_NAME);
  if (await statIfExists(cwdLockPath)) {
    return cwdLockPath;
  }

  const skillsLockPath = join(directory, LANGFUSE_SKILL_LOCK_FILE_NAME);
  if (await statIfExists(skillsLockPath)) {
    return skillsLockPath;
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
    value.lockVersion !== 1 ||
    !Array.isArray(value.skills)
  )
    throw new Error(`Unsupported or invalid skill lockfile ${file}.`);
  for (const skill of value.skills) {
    if (!isValidLockedSkill(skill))
      throw new Error(`Invalid skill entry in ${file}.`);
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
    return await lstat(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}
