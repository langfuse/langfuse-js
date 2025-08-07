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

export class PromptManager {
  private cache: LangfusePromptCache;
  private apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    const { apiClient } = params;

    this.apiClient = apiClient;
    this.cache = new LangfusePromptCache();
  }

  get logger() {
    return getGlobalLogger();
  }

  async create(
    body: CreateChatPromptBodyWithPlaceholders,
  ): Promise<ChatPromptClient>;
  async create(
    body: Omit<CreatePromptRequest.Text, "type"> & { type?: "text" },
  ): Promise<TextPromptClient>;
  async create(body: CreatePromptRequest.Chat): Promise<ChatPromptClient>;
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

  async get(
    name: string,
    options?: {
      version?: number;
      label?: string;
      cacheTtlSeconds?: number;
      fallback?: string;
      maxRetries?: number;
      type?: "text";
      fetchTimeoutMs?: number;
    },
  ): Promise<TextPromptClient>;
  async get(
    name: string,
    options?: {
      version?: number;
      label?: string;
      cacheTtlSeconds?: number;
      fallback?: ChatMessage[];
      maxRetries?: number;
      type: "chat";
      fetchTimeoutMs?: number;
    },
  ): Promise<ChatPromptClient>;
  async get(
    name: string,
    options?: {
      version?: number;
      label?: string;
      cacheTtlSeconds?: number;
      fallback?: ChatMessage[] | string;
      maxRetries?: number;
      type?: "chat" | "text";
      fetchTimeoutMs?: number;
    },
  ): Promise<LangfusePromptClient> {
    const cacheKey = this.cache.createKey({
      name,
      label: options?.label,
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
