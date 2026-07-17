import {
  getGlobalLogger,
  LangfuseAPIClient,
  Skill,
  SkillMetaListResponse,
  CreateSkillRequest,
} from "@langfuse/core";

import { LangfuseSkillCache } from "./skillCache.js";
import { SkillClient } from "./skillClient.js";

/**
 * Manager for skill operations in Langfuse.
 *
 * Provides methods to create, retrieve, list, update, and delete skills with
 * built-in caching for optimal performance. Skills bundle instructions,
 * metadata, and a set of allowed tools that an agent may use.
 *
 * @public
 */
export class SkillManager {
  private cache: LangfuseSkillCache;
  private apiClient: LangfuseAPIClient;

  /**
   * Creates a new SkillManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { apiClient: LangfuseAPIClient }) {
    const { apiClient } = params;

    this.apiClient = apiClient;
    this.cache = new LangfuseSkillCache();
  }

  get logger() {
    return getGlobalLogger();
  }

  /**
   * Creates a new skill in Langfuse.
   *
   * @param body - The skill data to create
   * @returns Promise that resolves to a SkillClient
   *
   * @example
   * ```typescript
   * const skill = await langfuse.skill.create({
   *   name: "summarizer",
   *   description: "Summarizes documents",
   *   instructions: "Summarize the following document: {{document}}",
   *   allowedTools: ["search"],
   *   labels: ["production"],
   * });
   * ```
   */
  async create(body: CreateSkillRequest): Promise<SkillClient> {
    const skillResponse = await this.apiClient.skills.create(body);

    return new SkillClient(skillResponse);
  }

  /**
   * Updates the labels of an existing skill version.
   *
   * @param params - Update parameters
   * @param params.name - Name of the skill to update
   * @param params.version - Version number of the skill to update
   * @param params.newLabels - New labels to apply to the skill version
   *
   * @returns Promise that resolves to the updated skill
   *
   * @example
   * ```typescript
   * const updatedSkill = await langfuse.skill.update({
   *   name: "my-skill",
   *   version: 1,
   *   newLabels: ["production", "v2"]
   * });
   * ```
   */
  async update(params: {
    name: string;
    version: number;
    newLabels: string[];
  }): Promise<Skill> {
    const { name, version, newLabels } = params;

    const newSkill = await this.apiClient.skillVersion.update(name, version, {
      newLabels,
    });

    this.cache.invalidate(name);

    return newSkill;
  }

  /**
   * Lists skills with optional filtering.
   *
   * @param query - Optional filtering and pagination parameters
   * @returns Promise that resolves to the list of skill metadata
   *
   * @example
   * ```typescript
   * const skills = await langfuse.skill.list({ label: "production" });
   * ```
   */
  async list(query?: {
    /** Filter by skill name */
    name?: string;
    /** Filter by label */
    label?: string;
    /** Filter by tag */
    tag?: string;
    /** Page number for pagination */
    page?: number;
    /** Number of items per page */
    limit?: number;
    /** Filter for skills updated on or after this timestamp */
    fromUpdatedAt?: string;
    /** Filter for skills updated on or before this timestamp */
    toUpdatedAt?: string;
  }): Promise<SkillMetaListResponse> {
    return await this.apiClient.skills.list(query ?? {});
  }

  /**
   * Delete skill versions. If neither version nor label is specified, all versions of the skill are deleted.
   *
   * The Langfuse SDK skill cache is invalidated for all cached versions with the specified name.
   *
   * @param name - Name of the skill to delete
   * @param options - Optional deletion configuration
   * @param options.version - Optional version to delete. If specified, deletes only this specific version
   * @param options.label - Optional label to filter deletion. If specified, deletes all skill versions with this label
   *
   * @returns Promise that resolves when deletion is complete
   *
   * @throws {LangfuseAPI.NotFoundError} If the skill does not exist
   * @throws {LangfuseAPI.Error} If the API request fails
   *
   * @example
   * ```typescript
   * // Delete all versions of a skill
   * await langfuse.skill.delete("my-skill");
   *
   * // Delete specific version
   * await langfuse.skill.delete("my-skill", { version: 2 });
   *
   * // Delete all versions with a specific label
   * await langfuse.skill.delete("my-skill", { label: "staging" });
   * ```
   */
  async delete(
    name: string,
    options?: {
      /** Optional version to delete. If specified, deletes only this specific version */
      version?: number;
      /** Optional label to filter deletion. If specified, deletes all skill versions with this label */
      label?: string;
    },
  ): Promise<void> {
    await this.apiClient.skills.delete(name, {
      version: options?.version,
      label: options?.label,
    });

    this.cache.invalidate(name);
  }

  /**
   * Retrieves a skill by name with intelligent caching.
   *
   * This method implements sophisticated caching behavior:
   * - Fresh skills are returned immediately from cache
   * - Expired skills are returned from cache while being refreshed in background
   * - Cache misses trigger immediate fetch with optional fallback support
   *
   * @param name - Name of the skill to retrieve
   * @param options - Optional retrieval configuration
   * @returns Promise that resolves to a SkillClient
   *
   * @example
   * ```typescript
   * // Get latest version with caching
   * const skill = await langfuse.skill.get("my-skill");
   *
   * // Get specific version
   * const v2Skill = await langfuse.skill.get("my-skill", { version: 2 });
   *
   * // Get with label filter
   * const prodSkill = await langfuse.skill.get("my-skill", {
   *   label: "production"
   * });
   *
   * // Get with fallback instructions
   * const skillWithFallback = await langfuse.skill.get("my-skill", {
   *   fallback: "Summarize the following document: {{document}}"
   * });
   * ```
   */
  async get(
    name: string,
    options?: {
      /** Specific version to retrieve (defaults to latest) */
      version?: number;
      /** Label to filter by */
      label?: string;
      /** Cache TTL in seconds (0 to disable caching) */
      cacheTtlSeconds?: number;
      /** Fallback instructions if skill fetch fails */
      fallback?: string;
      /** Maximum retry attempts for failed requests */
      maxRetries?: number;
      /** Request timeout in milliseconds */
      fetchTimeoutMs?: number;
    },
  ): Promise<SkillClient> {
    const cacheKey = this.cache.createKey({
      name,
      label: options?.label,
      version: options?.version,
    });
    const cachedSkill = this.cache.getIncludingExpired(cacheKey);
    if (!cachedSkill || options?.cacheTtlSeconds === 0) {
      try {
        return await this.fetchSkillAndUpdateCache({
          name,
          version: options?.version,
          label: options?.label,
          cacheTtlSeconds: options?.cacheTtlSeconds,
          maxRetries: options?.maxRetries,
          fetchTimeoutMs: options?.fetchTimeoutMs,
        });
      } catch (err) {
        if (options?.fallback) {
          const fallbackSkill: Skill = {
            name,
            version: options?.version ?? 0,
            description: "",
            instructions: options.fallback,
            metadata: {},
            allowedTools: [],
            labels: options.label ? [options.label] : [],
            tags: [],
          };

          return new SkillClient(fallbackSkill, true);
        }

        throw err;
      }
    }

    if (cachedSkill.isExpired) {
      // If the cache is not currently being refreshed, start refreshing it and register the promise in the cache
      if (!this.cache.isRefreshing(cacheKey)) {
        const refreshSkillPromise = this.fetchSkillAndUpdateCache({
          name,
          version: options?.version,
          label: options?.label,
          cacheTtlSeconds: options?.cacheTtlSeconds,
          maxRetries: options?.maxRetries,
          fetchTimeoutMs: options?.fetchTimeoutMs,
        }).catch(() => {
          this.logger.warn(
            `Failed to refresh skill cache '${cacheKey}', stale cache will be used until next refresh succeeds.`,
          );
        });
        this.cache.addRefreshingPromise(cacheKey, refreshSkillPromise);
      }

      return cachedSkill.value;
    }

    return cachedSkill.value;
  }

  private async fetchSkillAndUpdateCache(params: {
    name: string;
    version?: number;
    cacheTtlSeconds?: number;
    label?: string;
    maxRetries?: number;
    fetchTimeoutMs?: number;
  }): Promise<SkillClient> {
    const cacheKey = this.cache.createKey(params);

    try {
      const {
        name,
        version,
        cacheTtlSeconds,
        label,
        maxRetries,
        fetchTimeoutMs,
      } = params;

      const data = await this.apiClient.skills.get(
        name,
        {
          version,
          label,
        },
        {
          maxRetries,
          timeoutInSeconds: fetchTimeoutMs ? fetchTimeoutMs / 1_000 : undefined,
        },
      );

      const skill = new SkillClient(data);

      this.cache.set(cacheKey, skill, cacheTtlSeconds);

      return skill;
    } catch (error) {
      this.logger.error(`Error fetching skill '${cacheKey}':`, error);

      throw error;
    }
  }
}
