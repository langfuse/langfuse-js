import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";

import { type GetLangfusePromptResponse } from "../src";
import { DEFAULT_PROMPT_CACHE_TTL_SECONDS } from "../src/prompts/promptCache";
import { ChatPromptClient, TextPromptClient } from "../src/prompts/promptClients";
import type { ChatMessage, ChatMessageWithPlaceholders } from "../src/types";
import { ChatMessageType } from "../src/types";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";
import { parseBody } from "./test-utils/test-utils";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  const getPromptStatelessSuccess = {
    fetchResult: "success" as const,
    data: {
      name: "test-prompt",
      prompt: "This is a prompt with a {{variable}}",
      type: "text",
      version: 1,
      config: {
        temperature: 0.5,
      },
      labels: ["production"] as string[],
      tags: ["tag1", "tag2"] as string[],
    } as const,
  };

  // Currently the fetch API doesn't throw on client or server errors, but resolves with a response object
  const getPromptStatelessFailure: GetLangfusePromptResponse = {
    fetchResult: "failure",
    data: {
      message: "Prompt not found",
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.LANGFUSE_RELEASE;
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });

    jest.setSystemTime(new Date("2022-01-01"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("prompts", () => {
    it("should create a prompt", async () => {
      await langfuse.createPrompt({
        name: "test-prompt",
        prompt: "This is a prompt with a {{variable}}",
        labels: ["production"],
        config: {
          temperature: 0.5,
        },
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/v2\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        prompt: "This is a prompt with a {{variable}}",
        name: "test-prompt",
        type: "text",
        config: { temperature: 0.5 },
        labels: ["production"],
      });
    });

    it("should create a prompt with isActive for backward compat", async () => {
      await langfuse.createPrompt({
        name: "test-prompt",
        prompt: "This is a prompt with a {{variable}}",
        isActive: true,
        config: {
          temperature: 0.5,
        },
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/v2\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        prompt: "This is a prompt with a {{variable}}",
        name: "test-prompt",
        type: "text",
        config: { temperature: 0.5 },
        labels: ["production"],
      });
    });

    it("should create a chat prompt", async () => {
      await langfuse.createPrompt({
        name: "test-prompt",
        type: "chat",
        prompt: [{ role: "system", content: "This is a prompt with a {{variable}}" }],
        isActive: true,
        config: {
          temperature: 0.5,
        },
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/v2\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        isActive: true,
        prompt: [{ role: "system", content: "This is a prompt with a {{variable}}" }],
        name: "test-prompt",
        type: "chat",
        config: { temperature: 0.5 },
        labels: ["production"],
      });
    });

    it("should create a chat prompt with placeholders", async () => {
      await langfuse.createPrompt({
        name: "test-prompt-placeholder",
        type: "chat",
        prompt: [
          { role: "system", content: "This is a prompt with a {{variable}}" },
          { type: ChatMessageType.Placeholder, name: "history" },
          { role: "assistant", content: "Hi {{name}}" },
        ],
        isActive: true,
        config: {
          temperature: 0.5,
        },
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/v2\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        isActive: true,
        prompt: [
          { role: "system", content: "This is a prompt with a {{variable}}" },
          { type: ChatMessageType.Placeholder, name: "history" },
          { role: "assistant", content: "Hi {{name}}" },
        ],
        name: "test-prompt-placeholder",
        type: "chat",
        config: { temperature: 0.5 },
        labels: ["production"],
      });
    });

    it("should create prompt with tags", async () => {
      await langfuse.createPrompt({
        name: "test-prompt",
        prompt: "This is a prompt with a {{variable}}",
        tags: ["tag1", "tag2"],
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/v2\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        name: "test-prompt",
        type: "text",
        tags: ["tag1", "tag2"],
      });
    });

    it("should get a prompt name only", async () => {
      langfuse.getPromptStateless("test-prompt");

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/v2/prompts/test-prompt");
      expect(options.method).toBe("GET");
    });

    it("should get a prompt with name and version", async () => {
      langfuse.getPromptStateless("test-prompt", 2);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/v2/prompts/test-prompt?version=2");
      expect(options.method).toBe("GET");
    });
    it("should retry if custom request timeout is exceeded", async () => {
      jest.useRealTimers();

      const fetch = jest.spyOn(langfuse, "fetch").mockImplementation(async (url, options) => {
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.signal?.aborted).toBe(false);

        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          options.signal?.addEventListener("abort", () => {
            const elapsedTime = Date.now() - startTime;
            console.log("Request aborted after", elapsedTime, "ms");
            expect(elapsedTime).toBeGreaterThanOrEqual(250);
            expect(elapsedTime).toBeLessThan(450); // Allow some buffer for timing variations
            reject(new Error("AbortError: Request aborted"));
          });

          // Simulate a fetch delay
          setTimeout(() => {
            resolve({
              status: 200,
              json: async () => ({ status: "200" }),
              text: async () => "ok",
              arrayBuffer: async () => new Uint8Array(),
            });
          }, 1000);
        });
      });

      await expect(
        langfuse.getPrompt("test-prompt", undefined, { fetchTimeoutMs: 300, maxRetries: 2 })
      ).rejects.toThrow("Network error while fetching Langfuse");
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("should fetch and cache a prompt when not in cache", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);
      const result = await langfuse.getPrompt("test-prompt");

      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));
    });

    it("should throw an error if nothing in cache and fetch fails", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessFailure);

      expect(async () => await langfuse.getPrompt("test-prompt")).rejects.toThrow();
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
    });

    it("should return cached prompt if not expired", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt");
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);

      const result = await langfuse.getPrompt("test-prompt");
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);

      expect(result).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));
    });

    it("should return cached prompt if not expired according to custom TTL", async () => {
      const cacheTtlSeconds = Math.max(DEFAULT_PROMPT_CACHE_TTL_SECONDS - 20, 10);
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValue(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(cacheTtlSeconds * 1000 - 1);

      const cachedResult = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1); // Should not refetch
      expect(cachedResult).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));
    });

    it("should always fetch latest version of prompt if cacheTtlSeconds is 0", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);

      // First call to getPrompt
      const result1 = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds: 0 });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));

      // Mock a change in the prompt
      const updatedPrompt = {
        ...getPromptStatelessSuccess,
        data: {
          ...getPromptStatelessSuccess.data,
          version: getPromptStatelessSuccess.data.version + 1,
          prompt: "This is an updated prompt with a {{variable}}",
        },
      };
      mockGetPromptStateless.mockResolvedValueOnce(updatedPrompt);

      // Second call to getPrompt
      const result2 = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds: 0 });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);
      expect(result2).toEqual(new TextPromptClient(updatedPrompt.data));

      // Verify that the prompt has been updated
      expect(result2.version).toBe(result1.version + 1);
      expect(result2.prompt).not.toBe(result1.prompt);

      // Mock another change in the prompt for the third call
      const furtherUpdatedPrompt = {
        ...updatedPrompt,
        data: {
          ...updatedPrompt.data,
          version: 3,
          prompt: "This is a further updated prompt with a {{variable}}",
        },
      };
      mockGetPromptStateless.mockResolvedValueOnce(furtherUpdatedPrompt);

      // Third call to getPrompt
      const result3 = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds: 0 });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(3);
      expect(result3).toEqual(new TextPromptClient(furtherUpdatedPrompt.data));

      // Verify that the prompt has been updated to version 3
      expect(result3.version).toBe(3);
      expect(result3.prompt).toBe("This is a further updated prompt with a {{variable}}");
      expect(result3.version).toBeGreaterThan(result2.version);
      expect(result3.prompt).not.toBe(result2.prompt);
    });

    it("should return stale prompt immediately if cached one is expired according to default TTL and add to refresh promise map", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValue(getPromptStatelessSuccess);

      const result = await langfuse.getPrompt("test-prompt", undefined);

      // update the version of the returned mocked prompt
      const updatedPrompt = {
        ...getPromptStatelessSuccess,
        data: {
          ...getPromptStatelessSuccess.data,
          version: getPromptStatelessSuccess.data.version + 1,
        },
      };
      mockGetPromptStateless.mockResolvedValue(updatedPrompt);

      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(DEFAULT_PROMPT_CACHE_TTL_SECONDS * 1000 + 1);

      // Accessing private methods using a workaround
      const cacheKey = langfuse["_getPromptCacheKey"]({ name: "test-prompt" });

      const staleResult = await langfuse.getPrompt("test-prompt", undefined);
      expect(langfuse["_promptCache"].isRefreshing(cacheKey)).toBe(true);

      // create more stale requests to check that only one refresh is triggered
      await langfuse.getPrompt("test-prompt", undefined);
      await langfuse.getPrompt("test-prompt", undefined);
      await langfuse.getPrompt("test-prompt", undefined);
      await langfuse.getPrompt("test-prompt", undefined);

      expect(staleResult.version).toBe(result.version);
      expect(staleResult).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));

      // wait for the refresh to complete
      await langfuse["_promptCache"]["_refreshingKeys"].get(cacheKey);
      expect(langfuse["_promptCache"].isRefreshing(cacheKey)).toBe(false);

      // check that the prompt has been updated
      const updatedResult = await langfuse.getPrompt("test-prompt", undefined);
      expect(updatedResult.version).toBe(result.version + 1);

      // Should only have refetched once despite multiple calls
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      // final check for returned prompt
      expect(updatedResult).toEqual(new TextPromptClient(updatedPrompt.data));
    });

    it("should return expired prompt if refetch fails", async () => {
      const cacheTtlSeconds = Math.max(DEFAULT_PROMPT_CACHE_TTL_SECONDS - 20, 10);
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(cacheTtlSeconds * 1000 + 1);

      mockGetPromptStateless.mockResolvedValueOnce(getPromptStatelessFailure);
      const result = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      expect(result).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));
    });

    it("should return expired prompt if refetch fails", async () => {
      const cacheTtlSeconds = Math.max(DEFAULT_PROMPT_CACHE_TTL_SECONDS - 20, 10);
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(cacheTtlSeconds * 1000 + 1);

      mockGetPromptStateless.mockResolvedValueOnce(getPromptStatelessFailure);
      const result = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      expect(result).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));
    });

    it("should fetch new prompt if version changes", async () => {
      const newPromptVersion = getPromptStatelessSuccess.data.version - 1;
      const versionChangedPrompt = {
        ...getPromptStatelessSuccess,
        data: {
          ...getPromptStatelessSuccess.data,
          version: getPromptStatelessSuccess.data.version - 1,
        },
      };
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt", undefined);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);

      mockGetPromptStateless.mockResolvedValue(versionChangedPrompt);
      const result1 = await langfuse.getPrompt("test-prompt", newPromptVersion);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      expect(result1).toEqual(new TextPromptClient(versionChangedPrompt.data));

      // Return cached value on subsequent calls
      mockGetPromptStateless.mockResolvedValue(versionChangedPrompt);
      const result2 = await langfuse.getPrompt("test-prompt", newPromptVersion);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      expect(result2).toEqual(new TextPromptClient(versionChangedPrompt.data));

      // Refetch if cache has expired
      jest.advanceTimersByTime(DEFAULT_PROMPT_CACHE_TTL_SECONDS * 1000 + 1);
      mockGetPromptStateless.mockResolvedValue(versionChangedPrompt);
      const result3 = await langfuse.getPrompt("test-prompt", newPromptVersion);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(3);

      expect(result3).toEqual(new TextPromptClient(versionChangedPrompt.data));
    });

    it("should correctly get langchain prompt format", async () => {
      const testPrompts = [
        {
          prompt: "This is a {{test}}",
          values: { test: "test" },
          expected: "Human: This is a test",
        }, // test simple input argument
        {
          prompt: "This is a {{test}}. And this is a {{test}}",
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        }, // test single input arguments multiple times
        {
          prompt: "This is a {{test}}. And this is a {{test2}}",
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test2",
        }, // test multiple input arguments
        {
          prompt: "This is a test. And this is a test",
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        }, // test no arguments
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
        const langchainPrompt = ChatPromptTemplate.fromTemplate(langfusePrompt.getLangchainPrompt());

        // Assertions
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
        }, // test system role
        {
          prompt: [{ role: "assistant", content: "This is a {{test}}" }],
          values: { test: "test" },
          expected: "AI: This is a test",
        }, // test assistant role
        {
          prompt: [{ role: "user", content: "This is a {{test}}" }],
          values: { test: "test" },
          expected: "Human: This is a test",
        }, // test simple input argument
        {
          prompt: [{ role: "user", content: "This is a {{test}}. And this is a {{test}}" }],
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        }, // test single input arguments multiple times
        {
          prompt: [{ role: "user", content: "This is a {{test}}. And this is a {{test2}}" }],
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test2",
        }, // test multiple input arguments
        {
          prompt: [{ role: "user", content: "This is a test. And this is a test" }],
          values: { test: "test", test2: "test2" },
          expected: "Human: This is a test. And this is a test",
        }, // test no arguments
      ];

      for (let i = 0; i < testPrompts.length; i++) {
        const testPrompt = testPrompts[i].prompt;
        const values = testPrompts[i].values;
        const expected = testPrompts[i].expected;

        // Create a new prompt
        const langfusePrompt = new ChatPromptClient({
          name: `test_${i}`,
          version: 1,
          prompt: testPrompt,
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
          langfusePrompt.getLangchainPrompt().map((m) => [m.role, m.content])
        );

        // Assertions
        const message = await langchainPrompt.format(values);
        expect(message).toBe(expected);
      }
    });

    it("should not HTML escape characters in test prompt compile inputs", async () => {
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

      const prompt = promptClient.compile({ someJson: JSON.stringify({ foo: "bar" }) });
      expect(prompt).toBe('This is a prompt with {"foo":"bar"}');
    });

    it("should not HTML escape characters in chat prompt compile inputs", async () => {
      const promptClient = new ChatPromptClient({
        name: "test",
        type: "chat",
        version: 1,
        prompt: [{ role: "system", content: "This is a prompt with {{someJson}}" }],
        config: {
          model: "gpt-3.5-turbo-1106",
          temperature: 0,
        },
        labels: [],
        tags: [],
      });

      const prompt = promptClient.compile({ someJson: JSON.stringify({ foo: "bar" }) });
      expect(prompt).toEqual([{ role: "system", content: 'This is a prompt with {"foo":"bar"}' }]);
    });

    describe("prompt compilation", () => {
      const createMockPrompt = (prompt: (ChatMessage | ChatMessageWithPlaceholders)[]): any => ({
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
            { type: "placeholder", name: "examples" },
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

        it("should not change getter without placeholders", () => {
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

          const compiled = client.compile({ role: "helpful", task: "coding" }, placeholders);

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
            expected: ["You are a helpful assistant", "Show coding", "Help me with coding", "Show ABC"],
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
                expect(result[i]).toHaveProperty("type", ChatMessageType.Placeholder);
                expect(result[i]).toHaveProperty("name", expectedItem.name);
              }
            });
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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
        const formattedPrompt = await langchainPrompt.format({ animal: "cat", location: "Paris" });

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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
        const formattedPrompt = await langchainPrompt.format({ user_name: "Alice", user_age: 25 });

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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
        const formattedPrompt = await langchainPrompt.format({ test_var: "value" });

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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
        const formattedPrompt = await langchainPrompt.format({ message: "Hello world" });

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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
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
        const langchainPrompt = PromptTemplate.fromTemplate(langchainPromptString);
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
          prompt: chatMessages,
        });

        const langchainMessages = prompt.getLangchainPrompt();
        const langchainPrompt = ChatPromptTemplate.fromMessages(langchainMessages.map((m) => [m.role, m.content]));
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
