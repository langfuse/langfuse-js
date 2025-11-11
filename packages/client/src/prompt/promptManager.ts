import {
  CreatePromptRequest,
  getGlobalLogger,
  LangfuseAPIClient,
  PlaceholderMessage,
  Prompt,
  ChatMessage,
} from "@langfuse/core";

import { LangfusePromptCache } from "./promptCache.js";
import {
  ChatPromptClient,
  TextPromptClient,
  LangfusePromptClient,
} from "./promptClients.js";
import {
  ChatMessageType,
  CreateChatPromptBodyWithPlaceholders,
} from "./types.js";

/**
 * Manager for prompt operations in Langfuse.
 *
 * Provides methods to create, retrieve, and manage prompts with built-in caching
 * for optimal performance. Supports both text and chat prompts with variable
 * substitution and placeholder functionality.
 *
 * @public
 */
export class PromptManager {
  private cache: LangfusePromptCache;
  private apiClient: LangfuseAPIClient;

  /**
   * Creates a new PromptManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { apiClient: LangfuseAPIClient }) {
    const { apiClient } = params;

    this.apiClient = apiClient;
    this.cache = new LangfusePromptCache();
  }

  get logger() {
    return getGlobalLogger();
  }

  /**
   * Creates a new prompt in Langfuse.
   *
   * @param body - The prompt data to create (chat prompt)
   * @returns Promise that resolves to a ChatPromptClient
   */
  async create(
    body: CreateChatPromptBodyWithPlaceholders,
  ): Promise<ChatPromptClient>;

  /**
   * Creates a new prompt in Langfuse.
   *
   * @param body - The prompt data to create (text prompt)
   * @returns Promise that resolves to a TextPromptClient
   */
  async create(
    body: Omit<CreatePromptRequest.Text, "type"> & { type?: "text" },
  ): Promise<TextPromptClient>;

  /**
   * Creates a new prompt in Langfuse.
   *
   * @param body - The prompt data to create (chat prompt)
   * @returns Promise that resolves to a ChatPromptClient
   */
  async create(body: CreatePromptRequest.Chat): Promise<ChatPromptClient>;

  /**
   * Creates a new prompt in Langfuse.
   *
   * Supports both text and chat prompts. Chat prompts can include placeholders
   * for dynamic content insertion.
   *
   * @param body - The prompt data to create
   * @returns Promise that resolves to the appropriate prompt client
   *
   * @example
   * ```typescript
   * // Create a text prompt
   * const textPrompt = await langfuse.prompt.create({
   *   name: "greeting",
   *   prompt: "Hello {{name}}!",
   *   type: "text"
   * });
   *
   * // Create a chat prompt
   * const chatPrompt = await langfuse.prompt.create({
   *   name: "conversation",
   *   type: "chat",
   *   prompt: [
   *     { role: "system", content: "You are a helpful assistant." },
   *     { role: "user", content: "{{user_message}}" }
   *   ]
   * });
   * ```
   */
  async create(
    body:
      | CreatePromptRequest.Chat
      | (Omit<CreatePromptRequest.Text, "type"> & { type?: "text" })
      | CreateChatPromptBodyWithPlaceholders,
  ): Promise<LangfusePromptClient> {
    const requestBody: CreatePromptRequest =
      body.type === "chat"
        ? {
            ...body,
            prompt: body.prompt.map((item) => {
              if ("type" in item && item.type === ChatMessageType.Placeholder) {
                return {
                  type: ChatMessageType.Placeholder,
                  name: (item as PlaceholderMessage).name,
                };
              } else {
                // Handle regular ChatMessage (without type field) from API
                return { type: ChatMessageType.ChatMessage, ...item };
              }
            }),
          }
        : {
            ...body,
            type: body.type ?? "text",
          };

    const promptResponse = await this.apiClient.prompts.create(requestBody);

    if (promptResponse.type === "chat") {
      return new ChatPromptClient(promptResponse);
    }

    return new TextPromptClient(promptResponse);
  }

  /**
   * Updates the labels of an existing prompt version.
   *
   * @param params - Update parameters
   * @param params.name - Name of the prompt to update
   * @param params.version - Version number of the prompt to update
   * @param params.newLabels - New labels to apply to the prompt version
   *
   * @returns Promise that resolves to the updated prompt
   *
   * @example
   * ```typescript
   * const updatedPrompt = await langfuse.prompt.update({
   *   name: "my-prompt",
   *   version: 1,
   *   newLabels: ["production", "v2"]
   * });
   * ```
   */
  async update(params: {
    name: string;
    version: number;
    newLabels: string[];
  }): Promise<Prompt> {
    const { name, version, newLabels } = params;

    const newPrompt = await this.apiClient.promptVersion.update(name, version, {
      newLabels,
    });

    this.cache.invalidate(name);

    return newPrompt;
  }

  /**
   * Retrieves a text prompt by name.
   *
   * @param name - Name of the prompt to retrieve
   * @param options - Optional retrieval configuration
   * @returns Promise that resolves to a TextPromptClient
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
      /** Fallback text content if prompt fetch fails */
      fallback?: string;
      /** Maximum retry attempts for failed requests */
      maxRetries?: number;
      /** Specify text prompt type */
      type?: "text";
      /** Request timeout in milliseconds */
      fetchTimeoutMs?: number;
    },
  ): Promise<TextPromptClient>;

  /**
   * Retrieves a chat prompt by name.
   *
   * @param name - Name of the prompt to retrieve
   * @param options - Optional retrieval configuration
   * @returns Promise that resolves to a ChatPromptClient
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
      /** Fallback chat messages if prompt fetch fails */
      fallback?: ChatMessage[];
      /** Maximum retry attempts for failed requests */
      maxRetries?: number;
      /** Specify chat prompt type */
      type: "chat";
      /** Request timeout in milliseconds */
      fetchTimeoutMs?: number;
    },
  ): Promise<ChatPromptClient>;

  /**
   * Retrieves a prompt by name with intelligent caching.
   *
   * This method implements sophisticated caching behavior:
   * - Fresh prompts are returned immediately from cache
   * - Expired prompts are returned from cache while being refreshed in background
   * - Cache misses trigger immediate fetch with optional fallback support
   *
   * @param name - Name of the prompt to retrieve
   * @param options - Optional retrieval configuration
   * @returns Promise that resolves to the appropriate prompt client
   *
   * @example
   * ```typescript
   * // Get latest version with caching
   * const prompt = await langfuse.prompt.get("my-prompt");
   *
   * // Get specific version
   * const v2Prompt = await langfuse.prompt.get("my-prompt", {
   *   version: 2
   * });
   *
   * // Get with label filter
   * const prodPrompt = await langfuse.prompt.get("my-prompt", {
   *   label: "production"
   * });
   *
   * // Get with fallback
   * const promptWithFallback = await langfuse.prompt.get("my-prompt", {
   *   type: "text",
   *   fallback: "Hello {{name}}!"
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
      /** Fallback content if prompt fetch fails */
      fallback?: ChatMessage[] | string;
      /** Maximum retry attempts for failed requests */
      maxRetries?: number;
      /** Prompt type (auto-detected if not specified) */
      type?: "chat" | "text";
      /** Request timeout in milliseconds */
      fetchTimeoutMs?: number;
    },
  ): Promise<LangfusePromptClient> {
    const cacheKey = this.cache.createKey({
      name,
      label: options?.label,
      version: options?.version,
    });
    const cachedPrompt = this.cache.getIncludingExpired(cacheKey);
    if (!cachedPrompt || options?.cacheTtlSeconds === 0) {
      try {
        return await this.fetchPromptAndUpdateCache({
          name,
          version: options?.version,
          label: options?.label,
          cacheTtlSeconds: options?.cacheTtlSeconds,
          maxRetries: options?.maxRetries,
          fetchTimeoutMs: options?.fetchTimeoutMs,
        });
      } catch (err) {
        if (options?.fallback) {
          const sharedFallbackParams = {
            name,
            version: options?.version ?? 0,
            labels: options.label ? [options.label] : [],
            cacheTtlSeconds: options?.cacheTtlSeconds,
            config: {},
            tags: [],
          };

          if (options.type === "chat") {
            return new ChatPromptClient(
              {
                ...sharedFallbackParams,
                type: "chat",
                prompt: (options.fallback as ChatMessage[]).map((msg) => ({
                  type: ChatMessageType.ChatMessage,
                  ...msg,
                })),
              },
              true,
            );
          } else {
            return new TextPromptClient(
              {
                ...sharedFallbackParams,
                type: "text",
                prompt: options.fallback as string,
              },
              true,
            );
          }
        }

        throw err;
      }
    }

    if (cachedPrompt.isExpired) {
      // If the cache is not currently being refreshed, start refreshing it and register the promise in the cache
      if (!this.cache.isRefreshing(cacheKey)) {
        const refreshPromptPromise = this.fetchPromptAndUpdateCache({
          name,
          version: options?.version,
          label: options?.label,
          cacheTtlSeconds: options?.cacheTtlSeconds,
          maxRetries: options?.maxRetries,
          fetchTimeoutMs: options?.fetchTimeoutMs,
        }).catch(() => {
          this.logger.warn(
            `Failed to refresh prompt cache '${cacheKey}', stale cache will be used until next refresh succeeds.`,
          );
        });
        this.cache.addRefreshingPromise(cacheKey, refreshPromptPromise);
      }

      return cachedPrompt.value;
    }

    return cachedPrompt.value;
  }

  private async fetchPromptAndUpdateCache(params: {
    name: string;
    version?: number;
    cacheTtlSeconds?: number;
    label?: string;
    maxRetries?: number;
    fetchTimeoutMs?: number;
  }): Promise<LangfusePromptClient> {
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

      const data = await this.apiClient.prompts.get(
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

      let prompt: LangfusePromptClient;
      if (data.type === "chat") {
        prompt = new ChatPromptClient(data);
      } else {
        prompt = new TextPromptClient(data);
      }

      this.cache.set(cacheKey, prompt, cacheTtlSeconds);

      return prompt;
    } catch (error) {
      this.logger.error(`Error fetching prompt '${cacheKey}':`, error);

      throw error;
    }
  }
}
