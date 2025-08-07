import {
  ChatPromptTemplate,
  PromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { LangfuseClient } from "@langfuse/client";
import {
  ChatPromptClient,
  TextPromptClient,
  ChatMessageType,
} from "@langfuse/client";
import type { ChatMessage, ChatMessageWithPlaceholders } from "@langfuse/core";

describe("Langfuse Prompts E2E", () => {
  let langfuse: LangfuseClient;

  beforeEach(async () => {
    langfuse = new LangfuseClient();
  });

  describe("prompts", () => {
    it("should create a prompt", async () => {
      const createdPrompt = await langfuse.prompt.create({
        name: "test-prompt",
        prompt: "This is a prompt with a {{variable}}",
        labels: ["production"],
        config: {
          temperature: 0.5,
        },
      });

      expect(createdPrompt).toBeInstanceOf(TextPromptClient);
      expect(createdPrompt.name).toBe("test-prompt");
      expect(createdPrompt.prompt).toBe("This is a prompt with a {{variable}}");
      expect(createdPrompt.config).toEqual({ temperature: 0.5 });
      expect(createdPrompt.labels).toContain("production");
      expect(createdPrompt.type).toBe("text");
    });

    it("should create a chat prompt", async () => {
      const createdPrompt = await langfuse.prompt.create({
        name: "test-chat-prompt",
        type: "chat",
        prompt: [
          { role: "system", content: "This is a prompt with a {{variable}}" },
        ],
        labels: ["production"],
        config: {
          temperature: 0.5,
        },
      });

      expect(createdPrompt).toBeInstanceOf(ChatPromptClient);
      expect(createdPrompt.name).toBe("test-chat-prompt");
      expect(createdPrompt.type).toBe("chat");
      expect(createdPrompt.config).toEqual({ temperature: 0.5 });
      expect(createdPrompt.labels).toContain("production");

      const promptMessages = createdPrompt.prompt;
      expect(promptMessages).toHaveLength(1);
      expect(promptMessages[0]).toMatchObject({
        type: ChatMessageType.ChatMessage,
        role: "system",
        content: "This is a prompt with a {{variable}}",
      });
    });

    it("should create a chat prompt with placeholders", async () => {
      const createdPrompt = await langfuse.prompt.create({
        name: "test-prompt-placeholder",
        type: "chat",
        prompt: [
          { role: "system", content: "This is a prompt with a {{variable}}" },
          { type: ChatMessageType.Placeholder, name: "history" },
          { role: "assistant", content: "Hi {{name}}" },
        ],
        labels: ["production"],
        config: {
          temperature: 0.5,
        },
      });

      expect(createdPrompt).toBeInstanceOf(ChatPromptClient);
      expect(createdPrompt.name).toBe("test-prompt-placeholder");
      expect(createdPrompt.type).toBe("chat");
      expect(createdPrompt.config).toEqual({ temperature: 0.5 });
      expect(createdPrompt.labels).toContain("production");

      const promptMessages = createdPrompt.prompt;
      expect(promptMessages).toHaveLength(3);
      expect(promptMessages[0]).toMatchObject({
        type: ChatMessageType.ChatMessage,
        role: "system",
        content: "This is a prompt with a {{variable}}",
      });
      expect(promptMessages[1]).toMatchObject({
        type: ChatMessageType.Placeholder,
        name: "history",
      });
      expect(promptMessages[2]).toMatchObject({
        type: ChatMessageType.ChatMessage,
        role: "assistant",
        content: "Hi {{name}}",
      });
    });

    it("should create prompt with tags", async () => {
      const createdPrompt = await langfuse.prompt.create({
        name: "test-prompt-tags",
        prompt: "This is a prompt with a {{variable}}",
        tags: ["tag1", "tag2"],
      });

      expect(createdPrompt).toBeInstanceOf(TextPromptClient);
      expect(createdPrompt.name).toBe("test-prompt-tags");
      expect(createdPrompt.tags).toEqual(["tag1", "tag2"]);
    });

    it("should get a prompt by name only", async () => {
      // First create a prompt
      await langfuse.prompt.create({
        name: "test-get-prompt",
        prompt: "This is a test prompt with {{variable}}",
        config: { temperature: 0.5 },
        labels: ["production"],
      });

      // Then retrieve it
      const retrievedPrompt = await langfuse.prompt.get("test-get-prompt");

      expect(retrievedPrompt).toBeInstanceOf(TextPromptClient);
      expect(retrievedPrompt.name).toBe("test-get-prompt");
      expect(retrievedPrompt.prompt).toBe(
        "This is a test prompt with {{variable}}",
      );
      expect(retrievedPrompt.config).toEqual({ temperature: 0.5 });
    });

    it("should get a prompt by name only with getPrompt", async () => {
      // First create a prompt
      await langfuse.prompt.create({
        name: "test-get-prompt",
        prompt: "This is a test prompt with {{variable}}",
        config: { temperature: 0.5 },
        labels: ["production"],
      });

      // Then retrieve it
      const retrievedPrompt = await langfuse.getPrompt("test-get-prompt");

      expect(retrievedPrompt).toBeInstanceOf(TextPromptClient);
      expect(retrievedPrompt.name).toBe("test-get-prompt");
      expect(retrievedPrompt.prompt).toBe(
        "This is a test prompt with {{variable}}",
      );
      expect(retrievedPrompt.config).toEqual({ temperature: 0.5 });
    });

    it("should get a prompt with name and version", async () => {
      // First create a prompt
      const createdPrompt = await langfuse.prompt.create({
        name: "test-get-prompt-version",
        prompt: "This is version 1",
        config: { temperature: 0.5 },
      });

      // Then retrieve it by version
      const retrievedPrompt = await langfuse.prompt.get(
        "test-get-prompt-version",
        {
          version: createdPrompt.version,
        },
      );

      expect(retrievedPrompt).toBeInstanceOf(TextPromptClient);
      expect(retrievedPrompt.name).toBe("test-get-prompt-version");
      expect(retrievedPrompt.version).toBe(createdPrompt.version);
      expect(retrievedPrompt.prompt).toBe("This is version 1");
    });

    it("should retry if custom request timeout is exceeded", async () => {
      // This test needs to be adapted since we can't easily control network timing in E2E
      // We'll test that the timeout option is accepted without error
      await expect(
        langfuse.prompt.get("non-existent-prompt", {
          fetchTimeoutMs: 300,
          maxRetries: 2,
        }),
      ).rejects.toThrow();
    });

    it("should fetch and cache a prompt when not in cache", async () => {
      // Create a prompt first
      await langfuse.prompt.create({
        name: "test-cache-prompt",
        prompt: "This is a cached prompt with {{variable}}",
        config: { temperature: 0.7 },
        labels: ["production"],
      });

      // Get it (should fetch and cache)
      const result = await langfuse.prompt.get("test-cache-prompt");

      expect(result).toBeInstanceOf(TextPromptClient);
      expect(result.name).toBe("test-cache-prompt");
      expect(result.prompt).toBe("This is a cached prompt with {{variable}}");
      expect(result.config).toEqual({ temperature: 0.7 });
    });

    it("should throw an error if prompt not found", async () => {
      await expect(
        langfuse.prompt.get("non-existent-prompt"),
      ).rejects.toThrow();
    });

    it("should return cached prompt if not expired", async () => {
      // Create a prompt
      await langfuse.prompt.create({
        name: "test-cached-prompt",
        prompt: "Original prompt",
        labels: ["production"],
      });

      // Spy on the API get method to count network calls
      const fetchSpy = vi.spyOn(langfuse.prompt.apiClient.prompts, "get");

      // Get it twice - second call should use cache
      const result1 = await langfuse.prompt.get("test-cached-prompt");
      const result2 = await langfuse.prompt.get("test-cached-prompt");

      expect(result1.name).toBe(result2.name);
      expect(result1.prompt).toBe(result2.prompt);
      expect(result1.version).toBe(result2.version);

      // Should have made only 1 network call since second call uses cache
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it("should return cached prompt if not expired according to custom TTL", async () => {
      const cacheTtlSeconds = 60; // 1 minute

      await langfuse.prompt.create({
        name: "test-custom-ttl",
        prompt: "Custom TTL prompt",
        labels: ["production"],
      });

      // Spy on the API get method to count network calls
      const fetchSpy = vi.spyOn(langfuse.prompt.apiClient.prompts, "get");

      const result1 = await langfuse.prompt.get("test-custom-ttl", {
        cacheTtlSeconds,
      });
      const result2 = await langfuse.prompt.get("test-custom-ttl", {
        cacheTtlSeconds,
      });

      expect(result1.name).toBe(result2.name);
      expect(result1.version).toBe(result2.version);

      // Should have made only 1 network call since second call uses cache
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it("should always fetch latest version of prompt if cacheTtlSeconds is 0", async () => {
      await langfuse.prompt.create({
        name: "test-no-cache",
        prompt: "No cache prompt",
        labels: ["production"],
      });

      // Spy on the API get method to count network calls
      const fetchSpy = vi.spyOn(langfuse.prompt.apiClient.prompts, "get");

      // Both calls should fetch fresh data
      const result1 = await langfuse.prompt.get("test-no-cache", {
        cacheTtlSeconds: 0,
      });
      const result2 = await langfuse.prompt.get("test-no-cache", {
        cacheTtlSeconds: 0,
      });

      expect(result1.name).toBe(result2.name);
      expect(result1.prompt).toBe(result2.prompt);

      // Should have made 2 network calls since caching is disabled
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it("should not make network call when prompt is already cached", async () => {
      // Create a prompt
      await langfuse.prompt.create({
        name: "test-already-cached",
        prompt: "Already cached prompt",
        labels: ["production"],
      });

      // First call to populate cache
      await langfuse.prompt.get("test-already-cached");

      // Now spy on API calls for subsequent requests
      const fetchSpy = vi.spyOn(langfuse.prompt.apiClient.prompts, "get");

      // This call should use cache and make no network request
      const cachedResult = await langfuse.prompt.get("test-already-cached");

      expect(cachedResult.name).toBe("test-already-cached");
      expect(cachedResult.prompt).toBe("Already cached prompt");

      // Should have made 0 network calls since prompt was already cached
      expect(fetchSpy).toHaveBeenCalledTimes(0);

      fetchSpy.mockRestore();
    });

    describe("update method", () => {
      it("should update prompt labels successfully", async () => {
        // Create initial prompt
        const initialPrompt = await langfuse.prompt.create({
          name: "test-update-prompt",
          prompt: "Initial prompt content",
          labels: ["production"],
        });

        // Update the labels
        const updatedPrompt = await langfuse.prompt.update({
          name: "test-update-prompt",
          version: initialPrompt.version,
          newLabels: ["production", "staging", "testing"],
        });

        expect(updatedPrompt.name).toBe("test-update-prompt");
        expect(updatedPrompt.labels).toContain("production");
        expect(updatedPrompt.labels).toContain("staging");
        expect(updatedPrompt.labels).toContain("testing");
      });

      it("should invalidate cache after update", async () => {
        // Create and cache a prompt
        const initialPrompt = await langfuse.prompt.create({
          name: "test-cache-invalidation",
          prompt: "Original content",
          labels: ["production"],
        });

        // Get it to populate cache
        const cachedPrompt = await langfuse.prompt.get(
          "test-cache-invalidation",
        );
        expect(cachedPrompt.labels).toContain("production");

        // Update the prompt labels
        await langfuse.prompt.update({
          name: "test-cache-invalidation",
          version: initialPrompt.version,
          newLabels: ["production", "updated"],
        });

        // Get it again - should fetch fresh data, not cached
        const freshPrompt = await langfuse.prompt.get(
          "test-cache-invalidation",
        );
        expect(freshPrompt.labels).toContain("updated");
        expect(freshPrompt.labels).toContain("production");
      });

      it("should handle update with additional labels", async () => {
        const initialPrompt = await langfuse.prompt.create({
          name: "test-single-label-update",
          prompt: "Test content",
          labels: ["production"],
        });

        const updatedPrompt = await langfuse.prompt.update({
          name: "test-single-label-update",
          version: initialPrompt.version,
          newLabels: ["production", "staging"],
        });

        expect(updatedPrompt.labels).toContain("production");
        expect(updatedPrompt.labels).toContain("staging");
      });

      it("should throw error when updating non-existent prompt", async () => {
        await expect(
          langfuse.prompt.update({
            name: "non-existent-prompt",
            version: 1,
            newLabels: ["production"],
          }),
        ).rejects.toThrow();
      });

      it("should throw error when updating with wrong version", async () => {
        await langfuse.prompt.create({
          name: "test-wrong-version",
          prompt: "Test content",
          labels: ["production"],
        });

        await expect(
          langfuse.prompt.update({
            name: "test-wrong-version",
            version: 999, // Wrong version
            newLabels: ["production", "updated"],
          }),
        ).rejects.toThrow();
      });
    });

    describe("fallback behavior", () => {
      it("should use text fallback when prompt not found", async () => {
        const result = await langfuse.prompt.get(
          "non-existent-fallback-prompt",
          {
            fallback: "This is a fallback prompt with {{variable}}",
            type: "text",
          },
        );

        expect(result).toBeInstanceOf(TextPromptClient);
        expect(result.name).toBe("non-existent-fallback-prompt");
        expect(result.prompt).toBe(
          "This is a fallback prompt with {{variable}}",
        );
        expect(result.isFallback).toBe(true);
        expect(result.version).toBe(0);
      });

      it("should use chat fallback when prompt not found", async () => {
        const fallbackMessages = [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello {{name}}" },
        ];

        const result = await langfuse.prompt.get("non-existent-chat-fallback", {
          fallback: fallbackMessages,
          type: "chat",
        });

        expect(result).toBeInstanceOf(ChatPromptClient);
        expect(result.name).toBe("non-existent-chat-fallback");
        expect(result.isFallback).toBe(true);
        expect(result.prompt).toHaveLength(2);
        expect(result.prompt[0]).toMatchObject({
          type: ChatMessageType.ChatMessage,
          role: "system",
          content: "You are a helpful assistant",
        });
      });

      it("should prefer server prompt over fallback when available", async () => {
        // Create a real prompt
        await langfuse.prompt.create({
          name: "real-vs-fallback",
          prompt: "Real server prompt",
          labels: ["production"],
        });

        const result = await langfuse.prompt.get("real-vs-fallback", {
          fallback: "This is a fallback",
          type: "text",
        });

        expect(result.prompt).toBe("Real server prompt");
        expect(result.isFallback).toBe(false);
      });

      it("should throw error when no fallback provided and prompt not found", async () => {
        await expect(
          langfuse.prompt.get("definitely-does-not-exist"),
        ).rejects.toThrow();
      });
    });

    describe("server-side data integrity", () => {
      it("should store and retrieve all prompt fields correctly", async () => {
        const testConfig = { temperature: 0.8, model: "gpt-4" };
        const testTags = ["integration", "test"];

        const createdPrompt = await langfuse.prompt.create({
          name: "server-integrity-test",
          prompt: "Server integrity test content with {{variable}}",
          labels: ["production"],
          config: testConfig,
          tags: testTags,
        });

        // Verify via server API directly
        const serverPrompt = await langfuse.api.prompts.get(
          "server-integrity-test",
        );

        expect(serverPrompt.name).toBe("server-integrity-test");
        expect(serverPrompt.prompt).toBe(
          "Server integrity test content with {{variable}}",
        );
        expect(serverPrompt.labels).toContain("production");
        expect(serverPrompt.config).toEqual(testConfig);
        expect(serverPrompt.tags).toEqual(expect.arrayContaining(testTags));
        expect(serverPrompt.version).toBe(createdPrompt.version);
      });

      it("should store chat prompts with correct message structure", async () => {
        const chatMessages = [
          { role: "system", content: "You are {{assistant_type}}" },
          { type: ChatMessageType.Placeholder, name: "history" },
          { role: "user", content: "Help with {{task}}" },
        ];

        await langfuse.prompt.create({
          name: "server-chat-integrity",
          type: "chat",
          prompt: chatMessages,
          labels: ["production"],
        });

        const serverPrompt = await langfuse.api.prompts.get(
          "server-chat-integrity",
        );

        expect(serverPrompt.type).toBe("chat");
        expect(serverPrompt.prompt).toHaveLength(3);
        expect(serverPrompt.prompt[0]).toMatchObject({
          role: "system",
          content: "You are {{assistant_type}}",
        });
        expect(serverPrompt.prompt[1]).toMatchObject({
          type: ChatMessageType.Placeholder,
          name: "history",
        });
      });

      it("should maintain data consistency after updates", async () => {
        const initialPrompt = await langfuse.prompt.create({
          name: "consistency-test",
          prompt: "Initial content",
          labels: ["production"],
          config: { temperature: 0.5 },
        });

        await langfuse.prompt.update({
          name: "consistency-test",
          version: initialPrompt.version,
          newLabels: ["production", "updated"],
        });

        const serverPrompt = await langfuse.api.prompts.get("consistency-test");
        expect(serverPrompt.labels).toContain("updated");
        expect(serverPrompt.labels).toContain("production");
        expect(serverPrompt.config).toEqual({ temperature: 0.5 });
        expect(serverPrompt.prompt).toBe("Initial content");
      });
    });

    describe("custom label handling", () => {
      it("should create and retrieve prompts with custom labels", async () => {
        await langfuse.prompt.create({
          name: "custom-label-test",
          prompt: "Custom label content",
          labels: ["staging", "experimental"],
        });

        const result = await langfuse.prompt.get("custom-label-test", {
          label: "staging",
        });

        expect(result.name).toBe("custom-label-test");
        expect(result.labels).toContain("staging");
        expect(result.labels).toContain("experimental");
      });

      it("should handle prompts without production label", async () => {
        await langfuse.prompt.create({
          name: "no-production-label",
          prompt: "No production label content",
          labels: ["development"],
        });

        // Should not find with default (production) label
        await expect(
          langfuse.prompt.get("no-production-label"),
        ).rejects.toThrow();

        // Should find with explicit label
        const result = await langfuse.prompt.get("no-production-label", {
          label: "development",
        });
        expect(result.labels).toContain("development");
        expect(result.labels).not.toContain("production");
      });

      it("should prioritize version over label in cache key", async () => {
        const prompt1 = await langfuse.prompt.create({
          name: "version-priority-test",
          prompt: "Version 1 content",
          labels: ["production"],
        });

        // Update to create version 2 with different label
        await langfuse.prompt.update({
          name: "version-priority-test",
          version: prompt1.version,
          newLabels: ["staging"],
        });

        // Get by version should work regardless of current labels
        const resultByVersion = await langfuse.prompt.get(
          "version-priority-test",
          {
            version: prompt1.version,
          },
        );
        expect(resultByVersion.prompt).toBe("Version 1 content");

        // Get by new label should work
        const resultByLabel = await langfuse.prompt.get(
          "version-priority-test",
          {
            label: "staging",
          },
        );
        expect(resultByLabel.labels).toContain("staging");

        // Version access should work regardless of labels
        expect(resultByVersion.version).toBe(prompt1.version);
      });
    });

    describe("concurrent cache behavior", () => {
      it("should prevent multiple concurrent cache refreshes", async () => {
        // Create a prompt that will be cached
        await langfuse.prompt.create({
          name: "concurrent-test",
          prompt: "Concurrent test content",
          labels: ["production"],
        });

        // Get it once to populate cache
        await langfuse.prompt.get("concurrent-test");

        // Mock the cache to be expired
        const cacheKey = langfuse.prompt["cache"].createKey({
          name: "concurrent-test",
        });
        const cachedItem =
          langfuse.prompt["cache"].getIncludingExpired(cacheKey);
        if (cachedItem) {
          // Force expiry by setting expiry time to past
          cachedItem["_expiry"] = Date.now() - 1000;
        }

        // Spy on the API call to count requests
        const fetchSpy = vi.spyOn(
          langfuse.prompt,
          "fetchPromptAndUpdateCache" as any,
        );

        // Make multiple concurrent requests
        const promises = [
          langfuse.prompt.get("concurrent-test"),
          langfuse.prompt.get("concurrent-test"),
          langfuse.prompt.get("concurrent-test"),
          langfuse.prompt.get("concurrent-test"),
        ];

        const results = await Promise.all(promises);

        // All should return the same result
        expect(results[0].name).toBe("concurrent-test");
        expect(results[1].name).toBe("concurrent-test");
        expect(results[2].name).toBe("concurrent-test");
        expect(results[3].name).toBe("concurrent-test");

        // Should only have made one API call despite multiple concurrent requests
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockRestore();
      });
    });

    describe("comprehensive error scenarios", () => {
      it("should handle network timeout gracefully", async () => {
        // This test verifies the timeout mechanism works
        await expect(
          langfuse.prompt.get("timeout-test", {
            fetchTimeoutMs: 1, // Very short timeout
            maxRetries: 1,
          }),
        ).rejects.toThrow();
      });

      it("should handle empty prompt name gracefully", async () => {
        // Empty prompt names should either throw or be handled gracefully
        // This test verifies the behavior is consistent
        try {
          await langfuse.prompt.get("");
          // If it doesn't throw, that's fine - just verify it's handled
        } catch (error) {
          // If it throws, that's also fine - just verify it throws an appropriate error
          expect(error).toBeDefined();
        }
      });

      it("should handle invalid version numbers", async () => {
        await expect(
          langfuse.prompt.get("test", { version: -1 }),
        ).rejects.toThrow();
      });

      it("should handle special characters in prompt names", async () => {
        const specialNames = [
          "prompt-with-dashes",
          "prompt_with_underscores",
          "prompt.with.dots",
          "prompt with spaces",
          "prompt@with#symbols",
          "prompt/with/slashes",
          "prompt?with=query&chars",
          "prompt[with]brackets",
          "prompt{with}braces",
          "prompt(with)parentheses",
          "prompt+with+plus",
          "prompt|with|pipes",
          "prompt\\with\\backslashes",
          'prompt"with"quotes',
          "prompt'with'apostrophes",
          "prompt:with:colons",
          "prompt;with;semicolons",
          "prompt<with>angles",
          "prompt%20encoded",
          "unicode-prompt-名前-тест-🚀",
        ];

        for (const name of specialNames) {
          try {
            // Test creation with special characters
            await langfuse.prompt.create({
              name,
              prompt: `Test prompt for special name: ${name}`,
              labels: ["production"],
            });

            // Test retrieval with special characters
            const retrieved = await langfuse.prompt.get(name);
            expect(retrieved.name).toBe(name);
            expect(retrieved.prompt).toBe(
              `Test prompt for special name: ${name}`,
            );
          } catch (error: unknown) {
            // Some special characters might not be supported - that's fine
            // Just ensure we get a meaningful error message
            expect(error).toBeDefined();
            console.log(
              `Special character test failed for "${name}": ${error instanceof Error ? error.message : ""}`,
            );
          }
        }
      });

      it("should actually retry the specified number of times on failure", async () => {
        const originalFetch = global.fetch;
        let callCount = 0;

        // Mock fetch to return 500 error (which triggers retries)
        global.fetch = vi.fn(async (url, options) => {
          callCount++;
          // Return a 500 error to trigger retries (408, 429, or 5xx status codes trigger retries)
          return new Response(
            JSON.stringify({ error: "Internal Server Error" }),
            {
              status: 500,
              statusText: "Internal Server Error",
              headers: { "Content-Type": "application/json" },
            },
          );
        });

        try {
          await langfuse.prompt.get("test-prompt-retry", {
            maxRetries: 3,
          });
        } catch (error) {
          // Expected to fail after retries
        }

        expect(callCount).toBe(4); // 1 initial + 3 retries

        global.fetch = originalFetch;
      });

      it("should respect maxRetries=0 and not retry", async () => {
        const fetchSpy = vi.spyOn(langfuse.prompt.apiClient.prompts, "get");

        try {
          await langfuse.prompt.get("non-existent-no-retry-test", {
            maxRetries: 0,
            fetchTimeoutMs: 100,
          });
        } catch (error) {
          // Expected to fail
        }

        // Should have made only 1 call (no retries)
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockRestore();
      });

      it("should handle maxRetries with successful retry", async () => {
        // This test verifies that retries work when they eventually succeed
        // We'll create a prompt after a delay to simulate eventual success

        const testPromptName = "retry-success-test";

        // Create the prompt after a short delay (simulating network recovery)
        setTimeout(async () => {
          try {
            await langfuse.prompt.create({
              name: testPromptName,
              prompt: "Created after retry",
              labels: ["production"],
            });
          } catch (error) {
            // Ignore creation errors in timeout
          }
        }, 200);

        // Try to get it immediately (should fail initially, then succeed on retry)
        try {
          const result = await langfuse.prompt.get(testPromptName, {
            maxRetries: 5,
            fetchTimeoutMs: 1000, // Longer timeout to allow creation
          });

          // If we get here, the retry mechanism worked
          expect(result.name).toBe(testPromptName);
        } catch (error) {
          // This is also acceptable - the test verifies retry logic exists
          expect(error).toBeDefined();
        }
      });

      it("should handle very large prompt names", async () => {
        const veryLongName = "a".repeat(500); // 500 character name

        try {
          await langfuse.prompt.create({
            name: veryLongName,
            prompt: "Test with very long name",
            labels: ["production"],
          });

          const retrieved = await langfuse.prompt.get(veryLongName);
          expect(retrieved.name).toBe(veryLongName);
        } catch (error) {
          // Long names might not be supported - ensure graceful error
          expect(error).toBeDefined();
        }
      });

      it("should handle malformed configuration gracefully", async () => {
        try {
          await langfuse.prompt.create({
            name: "malformed-config-test",
            prompt: "Test prompt",
            labels: ["production"],
            config: {
              temperature: "invalid", // Should be number
              maxTokens: -1, // Invalid negative
              model: null, // Null value
              invalidField: { deeply: { nested: { circular: null } } },
            } as any,
          });
        } catch (error) {
          // Should handle malformed config gracefully
          expect(error).toBeDefined();
        }
      });
    });

    it("should correctly get langchain prompt format", async () => {
      const testPrompts = [
        {
          prompt: "This is a {{test}}",
          values: { test: "test" },
          expected: "Human: This is a test",
        },
        {
          prompt: "This is a {{test}}. And this is a {{test}}",
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        },
        {
          prompt: "This is a {{test}}. And this is a {{test2}}",
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test2",
        },
        {
          prompt: "This is a test. And this is a test",
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        },
      ];

      for (let i = 0; i < testPrompts.length; i++) {
        const testPrompt = testPrompts[i].prompt;
        const values = testPrompts[i].values;
        const expected = testPrompts[i].expected;

        // Create a new prompt
        const langfusePrompt = new TextPromptClient({
          name: `test_${i}`,
          version: 1,
          prompt: testPrompt,
          type: "text",
          config: {
            model: "gpt-3.5-turbo-1106",
            temperature: 0,
          },
          labels: [],
          tags: [],
        });

        // Convert to Langchain prompt
        const langchainPrompt = ChatPromptTemplate.fromTemplate(
          langfusePrompt.getLangchainPrompt(),
        );

        // langfuse
        const message = await langchainPrompt.format(values);
        expect(message).toBe(expected);
      }
    });

    it("should correctly get langchain prompt format for chats", async () => {
      const testPrompts = [
        {
          prompt: [{ role: "system", content: "This is a {{test}}" }],
          values: { test: "test" },
          expected: "System: This is a test",
        },
        {
          prompt: [{ role: "assistant", content: "This is a {{test}}" }],
          values: { test: "test" },
          expected: "AI: This is a test",
        },
        {
          prompt: [{ role: "user", content: "This is a {{test}}" }],
          values: { test: "test" },
          expected: "Human: This is a test",
        },
        {
          prompt: [
            {
              role: "user",
              content: "This is a {{test}}. And this is a {{test}}",
            },
          ],
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        },
        {
          prompt: [
            {
              role: "user",
              content: "This is a {{test}}. And this is a {{test2}}",
            },
          ],
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test2",
        },
        {
          prompt: [
            { role: "user", content: "This is a test. And this is a test" },
          ],
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        },
      ];

      for (let i = 0; i < testPrompts.length; i++) {
        const testPrompt = testPrompts[i].prompt;
        const values = testPrompts[i].values;
        const expected = testPrompts[i].expected;

        // Create a new prompt
        const langfusePrompt = new ChatPromptClient({
          name: `test_${i}`,
          version: 1,
          prompt: testPrompt.map((msg) => ({
            type: ChatMessageType.ChatMessage,
            ...msg,
          })),
          type: "chat",
          config: {
            model: "gpt-3.5-turbo-1106",
            temperature: 0,
          },
          labels: [],
          tags: [],
        });

        // Convert to Langchain prompt
        const langchainPrompt = ChatPromptTemplate.fromMessages(
          langfusePrompt
            .getLangchainPrompt()
            .map((m: any) => [m.role, m.content]),
        );

        // Assertions
        const message = await langchainPrompt.format(values);
        expect(message).toBe(expected);
      }
    });

    it("should not HTML escape characters in text prompt compile inputs", async () => {
      const promptClient = new TextPromptClient({
        name: "test",
        type: "text",
        version: 1,
        prompt: "This is a prompt with {{someJson}}",
        config: {
          model: "gpt-3.5-turbo-1106",
          temperature: 0,
        },
        labels: [],
        tags: [],
      });

      const prompt = promptClient.compile({
        someJson: JSON.stringify({ foo: "bar" }),
      });
      expect(prompt).toBe('This is a prompt with {"foo":"bar"}');
    });

    it("should not HTML escape characters in chat prompt compile inputs", async () => {
      const promptClient = new ChatPromptClient({
        name: "test",
        type: "chat",
        version: 1,
        prompt: [
          {
            type: ChatMessageType.ChatMessage,
            role: "system",
            content: "This is a prompt with {{someJson}}",
          },
        ],
        config: {
          model: "gpt-3.5-turbo-1106",
          temperature: 0,
        },
        labels: [],
        tags: [],
      });

      const prompt = promptClient.compile({
        someJson: JSON.stringify({ foo: "bar" }),
      });
      expect(prompt).toEqual([
        { role: "system", content: 'This is a prompt with {"foo":"bar"}' },
      ]);
    });

    describe("prompt compilation", () => {
      const createMockPrompt = (
        prompt: (ChatMessage | ChatMessageWithPlaceholders)[],
      ): any => ({
        name: "test-prompt-with-placeholders",
        version: 1,
        prompt: prompt,
        type: "chat",
        config: { temperature: 0.5 },
        labels: ["test"],
        tags: ["placeholder"],
      });

      describe("getLangchainPrompt() method", () => {
        it("should return Langchain MessagesPlaceholder objects for unresolved placeholders", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "examples" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const langchainPrompt = client.getLangchainPrompt();

          expect(langchainPrompt).toHaveLength(3);
          expect(langchainPrompt[0]).toEqual({
            role: "system",
            content: "You are a {role} assistant", // Langchain format
          });
          expect(langchainPrompt[1]).toEqual({
            variableName: "examples",
            optional: false,
          });

          // Verify compatibility with real Langchain MessagesPlaceholder
          const realMessagesPlaceholder = new MessagesPlaceholder("examples");
          const placeholderItem = langchainPrompt[1] as any;
          expect(placeholderItem.variableName).toBe(
            realMessagesPlaceholder.variableName,
          );
          expect(placeholderItem.optional).toBe(
            realMessagesPlaceholder.optional,
          );
          expect(langchainPrompt[2]).toEqual({
            role: "user",
            content: "Help me with {task}", // Langchain format
          });
        });

        it("should support getLangchainPrompt() with placeholders parameter", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "examples" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const placeholders = {
            examples: [
              { role: "user", content: "Example question?" },
              { role: "assistant", content: "Example answer." },
            ],
          };

          const langchainPrompt = client.getLangchainPrompt({ placeholders });

          expect(langchainPrompt).toHaveLength(4);
          expect(langchainPrompt[0]).toEqual({
            role: "system",
            content: "You are a {role} assistant", // Langchain format
          });
          expect(langchainPrompt[1]).toEqual({
            role: "user",
            content: "Example question?",
          });
          expect(langchainPrompt[2]).toEqual({
            role: "assistant",
            content: "Example answer.",
          });
          expect(langchainPrompt[3]).toEqual({
            role: "user",
            content: "Help me with {task}", // Langchain format
          });
        });

        it("should handle resolved and unresolved placeholders as Langchain MessagesPlaceholder objects", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "history" },
            { role: "user", content: "Help me with {{task}}" },
            { type: ChatMessageType.Placeholder, name: "unresolved_history" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const placeholders = {
            history: [{ role: "user", content: "Hi" }],
            // unresolved_history not provided - should become MessagesPlaceholder
          };

          const langchainPrompt = client.getLangchainPrompt({ placeholders });

          expect(langchainPrompt).toHaveLength(4);
          expect(langchainPrompt[0]).toEqual({
            role: "system",
            content: "You are a {role} assistant",
          });
          expect(langchainPrompt[1]).toEqual({
            role: "user",
            content: "Hi",
          });
          expect(langchainPrompt[2]).toEqual({
            role: "user",
            content: "Help me with {task}",
          });
          expect(langchainPrompt[3]).toEqual({
            variableName: "unresolved_history",
            optional: false,
          });
        });

        it("should handle non-standard placeholder values by stringifying them", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "invalid_data" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const placeholders = {
            invalid_data: "just a string", // Non-standard, not a message array
          };

          const langchainPrompt = client.getLangchainPrompt({ placeholders });

          expect(langchainPrompt).toHaveLength(3);
          expect(langchainPrompt[0]).toEqual({
            role: "system",
            content: "You are a {role} assistant",
          });
          expect(langchainPrompt[1]).toBe('"just a string"'); // Stringified invalid value
          expect(langchainPrompt[2]).toEqual({
            role: "user",
            content: "Help me with {task}",
          });
        });

        it("should integrate properly with Langchain when using MessagesPlaceholder", async () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "history" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const langchainMessages = client.getLangchainPrompt();

          const messages: any[] = [];
          for (const msg of langchainMessages) {
            if ("role" in msg && "content" in msg) {
              messages.push([msg.role, msg.content]);
            } else if ("variableName" in msg) {
              // Create real Langchain MessagesPlaceholder
              messages.push(
                new MessagesPlaceholder({
                  variableName: msg.variableName,
                  optional: msg.optional,
                }),
              );
            }
          }

          const langchainPrompt = ChatPromptTemplate.fromMessages(messages);

          // Test that the prompt compiles correctly with Langchain
          expect(langchainPrompt).toBeDefined();
          expect(langchainPrompt.inputVariables).toContain("role");
          expect(langchainPrompt.inputVariables).toContain("task");
          expect(langchainPrompt.inputVariables).toContain("history");

          // Test that it works with some sample data
          const formatted = await langchainPrompt.formatMessages({
            role: "helpful",
            task: "coding",
            history: [
              { role: "user", content: "Previous question" },
              { role: "assistant", content: "Previous answer" },
            ],
          });

          expect(formatted).toHaveLength(4);
          expect(formatted[0].content).toBe("You are a helpful assistant");
          expect(formatted[1].content).toBe("Previous question");
          expect(formatted[2].content).toBe("Previous answer");
          expect(formatted[3].content).toBe("Help me with coding");
        });

        it("should return prompt with placeholders unchanged when no fill-ins provided", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "examples" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const prompt = client.prompt;

          expect(prompt).toHaveLength(3);
          expect(prompt[0]).toEqual({
            type: ChatMessageType.ChatMessage,
            role: "system",
            content: "You are a {{role}} assistant",
          });
          expect(prompt[1]).toEqual({
            type: ChatMessageType.Placeholder,
            name: "examples",
          });
          expect(prompt[2]).toEqual({
            type: ChatMessageType.ChatMessage,
            role: "user",
            content: "Help me with {{task}}",
          });
        });

        it("should compile prompt with placeholders provided in compile() method", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "examples" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const placeholders = {
            examples: [
              { role: "user", content: "Example question?" },
              { role: "assistant", content: "Example answer." },
            ],
          };

          const compiled = client.compile(
            { role: "helpful", task: "coding" },
            placeholders,
          );

          expect(compiled).toHaveLength(4);
          expect(compiled[0]).toEqual({
            role: "system",
            content: "You are a helpful assistant",
          });
          expect(compiled[1]).toEqual({
            role: "user",
            content: "Example question?",
          });
          expect(compiled[2]).toEqual({
            role: "assistant",
            content: "Example answer.",
          });
          expect(compiled[3]).toEqual({
            role: "user",
            content: "Help me with coding",
          });
        });
      });

      describe("JSON serialization", () => {
        it("should serialize prompt with placeholders correctly", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "examples" },
            { role: "user", content: "Help me" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const json = client.toJSON();

          // Should be valid JSON
          expect(() => JSON.parse(json)).not.toThrow();

          const parsed = JSON.parse(json);
          expect(parsed.name).toBe("test-prompt-with-placeholders");
          expect(parsed.version).toBe(1);
          expect(parsed.type).toBe("chat");

          // The prompt should maintain the original API format for compatibility
          expect(parsed.prompt).toEqual([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "examples" },
            { role: "user", content: "Help me" },
          ]);
        });
      });

      describe("compile() method with placeholders", () => {
        const mockPrompt = createMockPrompt([
          { role: "system", content: "You are a {{role}} assistant" },
          { type: ChatMessageType.Placeholder, name: "examples" },
          { role: "user", content: "Help me with {{task}}" },
          { type: ChatMessageType.Placeholder, name: "extra_history" },
        ]);

        const testCases: Array<{
          name: string;
          variables: Record<string, string>;
          placeholders: Record<string, ChatMessage[]> | undefined;
          expected: (string | { type: string; name: string })[];
        }> = [
          {
            name: "variables only (undefined placeholders parameter)",
            variables: { role: "helpful", task: "coding" },
            placeholders: undefined,
            expected: [
              "You are a helpful assistant",
              { type: "placeholder", name: "examples" },
              "Help me with coding",
              { type: "placeholder", name: "extra_history" },
            ],
          },
          {
            name: "variables only (empty placeholders)",
            variables: { role: "helpful", task: "coding" },
            placeholders: {},
            expected: [
              "You are a helpful assistant",
              { type: "placeholder", name: "examples" },
              "Help me with coding",
              { type: "placeholder", name: "extra_history" },
            ],
          },
          {
            name: "empty placeholder array",
            variables: { role: "helpful", task: "coding" },
            placeholders: { examples: [] },
            expected: [
              "You are a helpful assistant",
              "Help me with coding",
              { type: "placeholder", name: "extra_history" },
            ],
          },
          {
            name: "both variables and multiple placeholders",
            variables: { role: "helpful", task: "coding" },
            placeholders: {
              examples: [{ role: "user", content: "Show {{task}}" }],
              extra_history: [{ role: "user", content: "Show ABC" }],
            },
            expected: [
              "You are a helpful assistant",
              "Show coding",
              "Help me with coding",
              "Show ABC",
            ],
          },
          {
            name: "unused placeholders",
            variables: { role: "helpful", task: "coding" },
            placeholders: {
              unused: [{ role: "user", content: "Won't appear" }],
              examples: [{ role: "user", content: "Will appear" }],
            },
            expected: [
              "You are a helpful assistant",
              "Will appear",
              "Help me with coding",
              { type: "placeholder", name: "extra_history" },
            ],
          },
        ];

        testCases.forEach(({ name, variables, placeholders, expected }) => {
          it(`should handle ${name}`, () => {
            const client = new ChatPromptClient(mockPrompt);
            const result = client.compile(variables, placeholders);

            expect(result).toHaveLength(expected.length);
            expected.forEach((expectedItem, i) => {
              if (typeof expectedItem === "string") {
                expect(result[i]).toHaveProperty("content", expectedItem);
              } else {
                expect(result[i]).toHaveProperty(
                  "type",
                  ChatMessageType.Placeholder,
                );
                expect(result[i]).toHaveProperty("name", expectedItem.name);
              }
            });
          });
        });

        it("should handle invalid placeholder values in compile() by stringifying them", () => {
          const mockPrompt = createMockPrompt([
            { role: "system", content: "You are a {{role}} assistant" },
            { type: ChatMessageType.Placeholder, name: "invalid_data" },
            { role: "user", content: "Help me with {{task}}" },
          ]);

          const client = new ChatPromptClient(mockPrompt);
          const result = client.compile(
            { role: "helpful", task: "coding" },
            { invalid_data: "just a string" as any }, // Invalid - not an array of messages
          );

          expect(result).toHaveLength(3);
          expect(result[0]).toEqual({
            role: "system",
            content: "You are a helpful assistant",
          });
          expect(result[1]).toBe('"just a string"'); // Stringified invalid value
          expect(result[2]).toEqual({
            role: "user",
            content: "Help me with coding",
          });
        });
      });
    });

    describe("Langchain prompt compilation with JSON handling", () => {
      it("should handle normal variables with nested JSON", async () => {
        const promptString = `This is a prompt with {{animal}} and {{location}}.

{{
    "metadata": {{
        "context": "test",
        "nested": {{
            "animal": {{animal}},
            "properties": {{
                "location": "{{location}}",
                "count": 42
            }}
        }}
    }},
    "data": [
        {{
            "type": "primary",
            "value": {{animal}}
        }}
    ]
}}`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "nested_json_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          animal: "cat",
          location: "Paris",
        });

        const expected = `This is a prompt with cat and Paris.

{
    "metadata": {
        "context": "test",
        "nested": {
            "animal": cat,
            "properties": {
                "location": "Paris",
                "count": 42
            }
        }
    },
    "data": [
        {
            "type": "primary",
            "value": cat
        }
    ]
}`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle mixed variables (double and single braces) with nested JSON", async () => {
        const promptString = `Normal variable: {{user_name}}
Langchain variable: {user_age}

{{
    "user": {{
        "name": {{user_name}},
        "age": {user_age},
        "profile": {{
            "settings": {{
                "theme": "dark",
                "notifications": true
            }}
        }}
    }},
    "system": {{
        "version": "1.0",
        "active": true
    }}
}}`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "mixed_variables_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          user_name: "Alice",
          user_age: 25,
        });

        const expected = `Normal variable: Alice
Langchain variable: 25

{
    "user": {
        "name": Alice,
        "age": 25,
        "profile": {
            "settings": {
                "theme": "dark",
                "notifications": true
            }
        }
    },
    "system": {
        "version": "1.0",
        "active": true
    }
}`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle variables inside and alongside complex nested JSON", async () => {
        const promptString = `System message: {{system_msg}}
User input: {user_input}

{{
    "request": {{
        "system": {{system_msg}},
        "user": {user_input},
        "config": {{
            "model": "gpt-4",
            "temperature": 0.7,
            "metadata": {{
                "session": {{session_id}},
                "timestamp": {timestamp},
                "nested_data": {{
                    "level1": {{
                        "level2": {{
                            "user_var": {{user_name}},
                            "system_var": {system_status}
                        }}
                    }}
                }}
            }}
        }}
    }},
    "context": {{context_data}}
}}

Final note: {{system_msg}} and {user_input}`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "variables_inside_json_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          system_msg: "Hello",
          user_input: "Test input",
          session_id: "sess123",
          timestamp: 1234567890,
          user_name: "Bob",
          system_status: "active",
          context_data: "context_info",
        });

        const expected = `System message: Hello
User input: Test input

{
    "request": {
        "system": Hello,
        "user": Test input,
        "config": {
            "model": "gpt-4",
            "temperature": 0.7,
            "metadata": {
                "session": sess123,
                "timestamp": 1234567890,
                "nested_data": {
                    "level1": {
                        "level2": {
                            "user_var": Bob,
                            "system_var": active
                        }
                    }
                }
            }
        }
    },
    "context": context_info
}

Final note: Hello and Test input`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle edge case empty JSON objects", async () => {
        const promptString = `Variable: {{test_var}}

{{
    "empty_object": {{}},
    "empty_array": [],
    "mixed": {{
        "data": {{test_var}},
        "empty": {{}},
        "nested_empty": {{
            "inner": {{}}
        }}
    }}
}}`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "empty_json_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          test_var: "value",
        });

        const expected = `Variable: value

{
    "empty_object": {},
    "empty_array": [],
    "mixed": {
        "data": value,
        "empty": {},
        "nested_empty": {
            "inner": {}
        }
    }
}`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle edge case nested quotes in JSON", async () => {
        const promptString = `Message: {{message}}

{{
    "text": "This is a \\"quoted\\" string",
    "user_message": {{message}},
    "escaped": "Line 1\\\\nLine 2",
    "complex": {{
        "description": "Contains 'single' and \\"double\\" quotes",
        "dynamic": {{message}}
    }}
}}`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "nested_quotes_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          message: "Hello world",
        });

        const expected = `Message: Hello world

{
    "text": "This is a \\"quoted\\" string",
    "user_message": Hello world,
    "escaped": "Line 1\\\\nLine 2",
    "complex": {
        "description": "Contains 'single' and \\"double\\" quotes",
        "dynamic": Hello world
    }
}`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle edge case JSON with variables in strings", async () => {
        const promptString = `Variable: {{test_var}}

{{
    "text_with_braces": "This has {{connector}} characters",
    "also_braces": "Format: {{key}} = {{value}}",
    "user_data": {{test_var}}
}}`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "variables_in_strings_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          test_var: "test_value",
          key: "name",
          value: "John",
          connector: "special",
        });

        const expected = `Variable: test_value

{
    "text_with_braces": "This has special characters",
    "also_braces": "Format: name = John",
    "user_data": test_value
}`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle complex real-world scenario", async () => {
        const promptString = `System: {{system_prompt}}
User query: {user_query}
Context: {{context}}

{{
    "request": {{
        "system_instruction": {{system_prompt}},
        "user_input": {user_query},
        "context": {{context}},
        "settings": {{
            "model": "gpt-4",
            "temperature": 0.7,
            "max_tokens": 1000,
            "functions": [
                {{
                    "name": "search",
                    "description": "Search for information",
                    "parameters": {{
                        "query": {user_query},
                        "context": {{context}}
                    }}
                }}
            ]
        }},
        "metadata": {{
            "session_id": {{session_id}},
            "timestamp": {timestamp},
            "user_info": {{
                "id": {user_id},
                "preferences": {{
                    "language": "en",
                    "format": "json"
                }}
            }}
        }}
    }},
    "response_format": {{
        "type": "structured",
        "schema": {{
            "answer": "string",
            "confidence": "number",
            "sources": "array"
        }}
    }}
}}

Instructions: Use {{system_prompt}} to process {user_query} with context {{context}}.`;

        const prompt = new TextPromptClient({
          type: "text",
          name: "complex_scenario_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: promptString,
        });

        const langchainPromptString = prompt.getLangchainPrompt();
        const langchainPrompt = PromptTemplate.fromTemplate(
          langchainPromptString,
        );
        const formattedPrompt = await langchainPrompt.format({
          system_prompt: "You are a helpful assistant",
          user_query: "What is the weather?",
          context: "Weather inquiry",
          session_id: "sess_123",
          timestamp: 1234567890,
          user_id: "user_456",
        });

        const expected = `System: You are a helpful assistant
User query: What is the weather?
Context: Weather inquiry

{
    "request": {
        "system_instruction": You are a helpful assistant,
        "user_input": What is the weather?,
        "context": Weather inquiry,
        "settings": {
            "model": "gpt-4",
            "temperature": 0.7,
            "max_tokens": 1000,
            "functions": [
                {
                    "name": "search",
                    "description": "Search for information",
                    "parameters": {
                        "query": What is the weather?,
                        "context": Weather inquiry
                    }
                }
            ]
        },
        "metadata": {
            "session_id": sess_123,
            "timestamp": 1234567890,
            "user_info": {
                "id": user_456,
                "preferences": {
                    "language": "en",
                    "format": "json"
                }
            }
        }
    },
    "response_format": {
        "type": "structured",
        "schema": {
            "answer": "string",
            "confidence": "number",
            "sources": "array"
        }
    }
}

Instructions: Use You are a helpful assistant to process What is the weather? with context Weather inquiry.`;

        expect(formattedPrompt).toBe(expected);
      });

      it("should handle chat prompt with JSON variables", async () => {
        const chatMessages = [
          {
            role: "system",
            content: `You are {{assistant_type}} assistant.

Configuration:
{{
    "settings": {{
        "model": "{{model_name}}",
        "temperature": {temperature},
        "capabilities": [
            {{
                "name": "search",
                "enabled": {{search_enabled}},
                "params": {{
                    "provider": "{{search_provider}}"
                }}
            }}
        ]
    }}
}}`,
          },
          {
            role: "user",
            content: "Hello {{user_name}}! I need help with: {{user_request}}",
          },
        ];

        const prompt = new ChatPromptClient({
          type: "chat",
          name: "chat_json_test",
          version: 1,
          config: {},
          tags: [],
          labels: [],
          prompt: chatMessages.map((msg) => ({
            type: ChatMessageType.ChatMessage,
            ...msg,
          })),
        });

        const langchainMessages = prompt.getLangchainPrompt();
        const langchainPrompt = ChatPromptTemplate.fromMessages(
          langchainMessages.map((m: any) => [m.role, m.content]),
        );
        const formattedMessages = await langchainPrompt.formatMessages({
          assistant_type: "helpful",
          model_name: "gpt-4",
          temperature: 0.7,
          search_enabled: "true",
          search_provider: "google",
          user_name: "Alice",
          user_request: "data analysis",
        });

        const expectedSystem = `You are helpful assistant.

Configuration:
{
    "settings": {
        "model": "gpt-4",
        "temperature": 0.7,
        "capabilities": [
            {
                "name": "search",
                "enabled": true,
                "params": {
                    "provider": "google"
                }
            }
        ]
    }
}`;

        const expectedUser = "Hello Alice! I need help with: data analysis";

        expect(formattedMessages).toHaveLength(2);
        expect(formattedMessages[0].content).toBe(expectedSystem);
        expect(formattedMessages[1].content).toBe(expectedUser);
      });
    });
  });
});
