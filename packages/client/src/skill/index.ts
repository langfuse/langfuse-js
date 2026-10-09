import { LangfuseAPIClient, type unstable } from "@langfuse/core";

/** Select one immutable skill version. @public */
export type SkillVersionSelector = { name: string; version: number };

/** Select skills by pinned versions, names and label, or tag and label. @public */
export type SkillSelection =
  | SkillVersionSelector[]
  | { names: string[]; label: string; tag?: never }
  | { tag: string; label: string; names?: never };

/** A pinned skill version and its file content hashes. @public */
export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  version: number;
  tags: string[];
  files: Array<{ path: string; sha256Hash: string }>;
}

/** Skill manager configuration. @public */
export interface SkillManagerOptions {
  /** Maximum cached UTF-8 content bytes. Defaults to 20 MiB; zero disables caching. */
  contentCacheMaxBytes?: number;
}

/** Resolve skill versions and cache their immutable file contents. @public */
export class SkillManager {
  private readonly contentCache = new Map<
    string,
    { content: string; bytes: number }
  >();
  private readonly pendingContent = new Map<string, Promise<string>>();
  private readonly contentCacheMaxBytes: number;
  private cachedBytes = 0;
  private cacheGeneration = 0;

  /** @internal */
  constructor(
    private readonly apiClient: LangfuseAPIClient,
    options: SkillManagerOptions = {},
  ) {
    this.contentCacheMaxBytes =
      options.contentCacheMaxBytes ?? 20 * 1024 * 1024;
    if (
      !Number.isSafeInteger(this.contentCacheMaxBytes) ||
      this.contentCacheMaxBytes < 0
    ) {
      throw new Error(
        "contentCacheMaxBytes must be a non-negative safe integer.",
      );
    }
  }

  /** Resolve pinned manifests by skill name, without fetching file contents. */
  public async listManifests(
    selection: SkillSelection,
  ): Promise<Map<string, SkillManifest>> {
    const requests: Array<{ name: string; options: unstable.GetSkillRequest }> =
      [];
    if (Array.isArray(selection)) {
      for (const item of selection) {
        if (
          !item ||
          typeof item.name !== "string" ||
          !item.name.trim() ||
          !Number.isSafeInteger(item.version) ||
          item.version < 1
        ) {
          throw new Error(
            "Each skill selector needs a name and positive version.",
          );
        }
        requests.push({ name: item.name, options: { version: item.version } });
      }
    } else {
      if (
        !selection ||
        typeof selection.label !== "string" ||
        !selection.label.trim() ||
        (selection.names === undefined) === (selection.tag === undefined)
      ) {
        throw new Error(
          "Select a version list, names with a label, or a tag with a label.",
        );
      }
      const names = new Set<string>();
      if (selection.names !== undefined) {
        if (
          !Array.isArray(selection.names) ||
          selection.names.some(
            (name) => typeof name !== "string" || !name.trim(),
          )
        ) {
          throw new Error("Skill names must be an array of non-empty strings.");
        }
        for (const name of selection.names) names.add(name);
      } else {
        if (typeof selection.tag !== "string" || !selection.tag.trim()) {
          throw new Error("Skill tag must be a non-empty string.");
        }
        for (let page = 1; ; page++) {
          const response = await this.apiClient.unstable.skills.list({
            tag: selection.tag,
            page,
            limit: 100,
          });
          for (const skill of response.data) names.add(skill.name);
          if (!response.meta.hasNextPage) break;
        }
      }
      for (const name of names) {
        requests.push({ name, options: { label: selection.label } });
      }
    }
    const unique = new Map<string, unstable.GetSkillRequest>();
    for (const { name, options } of requests) {
      const previous = unique.get(name);
      if (previous && previous.version !== options.version) {
        throw new Error(`Multiple versions selected for skill ${name}.`);
      }
      unique.set(name, options);
    }
    const manifests = await Promise.all(
      Array.from(
        unique,
        async ([name, options]) =>
          [
            name,
            this.toManifest(
              await this.apiClient.unstable.skills.get(name, options),
            ),
          ] as const,
      ),
    );
    return new Map(manifests);
  }

  /** Warm all files (default), or only SKILL.md. Does not record agent loads. */
  public async preloadContent(
    manifests: ReadonlyMap<string, SkillManifest>,
    { files = "all" }: { files?: "all" | "entrypoints" } = {},
  ): Promise<void> {
    const hashes: string[] = [];
    for (const skill of manifests.values()) {
      for (const file of skill.files) {
        if (files === "all" || file.path === "SKILL.md") {
          hashes.push(file.sha256Hash);
        }
      }
    }
    await this.loadContent(hashes);
  }

  /** Read from cache, or fetch and cache a pinned file. Does not emit a load span. */
  public async getFileContent(
    manifest: SkillManifest,
    path: string,
  ): Promise<string> {
    const file = manifest.files.find((item) => item.path === path);
    if (!file) {
      throw new Error(
        `File ${path} is not in ${manifest.name} v${manifest.version}.`,
      );
    }
    const [content] = await this.loadContent([file.sha256Hash]);
    return content;
  }

  /** Clear cached content. Requests already in flight can still finish their reads. */
  public clearContentCache(): void {
    this.cacheGeneration++;
    this.contentCache.clear();
    this.cachedBytes = 0;
  }

  /** Create a version from file contents or existing content hashes. */
  public async create(
    request: unstable.CreateSkillVersionRequest,
  ): Promise<SkillManifest> {
    return this.toManifest(
      await this.apiClient.unstable.skills.createVersion(request),
    );
  }

  private toManifest(skill: unstable.SkillVersion): SkillManifest {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      tags: skill.tags,
      files: skill.files.map(({ path, sha256Hash }) => ({ path, sha256Hash })),
    };
  }

  private async loadContent(hashes: string[]): Promise<string[]> {
    const reads = new Map<string, Promise<string>>();
    const missing: string[] = [];
    for (const hash of new Set(hashes)) {
      const cached = this.contentCache.get(hash);
      if (cached) {
        this.contentCache.delete(hash);
        this.contentCache.set(hash, cached);
        reads.set(hash, Promise.resolve(cached.content));
      } else {
        const pending = this.pendingContent.get(hash);
        if (pending) reads.set(hash, pending);
        else missing.push(hash);
      }
    }
    const generation = this.cacheGeneration;
    for (let offset = 0; offset < missing.length; offset += 50) {
      const batch = missing.slice(offset, offset + 50);
      const request = Promise.resolve().then(() =>
        this.apiClient.unstable.skills.getFileContents({
          sha256Hashes: batch.join(","),
        }),
      );
      for (const hash of batch) {
        const pending = request
          .then((response) => {
            const file = response.data.find((item) => item.sha256Hash === hash);
            if (!file)
              throw new Error(`Langfuse did not return skill content ${hash}.`);
            if (generation === this.cacheGeneration)
              this.cacheContent(hash, file.content);
            return file.content;
          })
          .finally(() => this.pendingContent.delete(hash));
        this.pendingContent.set(hash, pending);
        reads.set(hash, pending);
      }
    }
    return Promise.all(hashes.map((hash) => reads.get(hash)!));
  }

  private cacheContent(hash: string, content: string): void {
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > this.contentCacheMaxBytes || this.contentCacheMaxBytes === 0)
      return;
    while (this.cachedBytes + bytes > this.contentCacheMaxBytes) {
      const oldest = this.contentCache.keys().next().value!;
      this.cachedBytes -= this.contentCache.get(oldest)!.bytes;
      this.contentCache.delete(oldest);
    }
    this.contentCache.set(hash, { content, bytes });
    this.cachedBytes += bytes;
  }
}
