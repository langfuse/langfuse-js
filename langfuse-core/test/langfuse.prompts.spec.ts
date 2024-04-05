import { ChatPromptTemplate } from "@langchain/core/prompts";

import { type GetLangfusePromptResponse } from "../src";
import { DEFAULT_PROMPT_CACHE_TTL_SECONDS } from "../src/prompts/promptCache";
import { ChatPromptClient, TextPromptClient } from "../src/prompts/promptClients";
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
    } as const,
  };

  // Currently the fetch API doesn't throw on client or server errors, but resolves with a response object
  const getPromptStatelessFailure: GetLangfusePromptResponse = {
    fetchResult: "failure",
    data: {
      message: "Prompt not found",
    },
  };

  jest.useFakeTimers();

  beforeEach(() => {
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
        isActive: true,
        config: {
          temperature: 0.5,
        },
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        isActive: true,
        prompt: "This is a prompt with a {{variable}}",
        name: "test-prompt",
        type: "text",
        config: { temperature: 0.5 },
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
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/prompts/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        isActive: true,
        prompt: [{ role: "system", content: "This is a prompt with a {{variable}}" }],
        name: "test-prompt",
        type: "chat",
        config: { temperature: 0.5 },
      });
    });

    it("should get a prompt name only", async () => {
      langfuse.getPromptStateless("test-prompt");

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/prompts?name=test-prompt");
      expect(options.method).toBe("GET");
    });

    it("should get a prompt with name and version", async () => {
      langfuse.getPromptStateless("test-prompt", 2);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/prompts?name=test-prompt&version=2");
      expect(options.method).toBe("GET");
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

    it("should refetch and return new prompt if cached one is expired according to custom TTL", async () => {
      const cacheTtlSeconds = Math.max(DEFAULT_PROMPT_CACHE_TTL_SECONDS - 20, 10);
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValue(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(cacheTtlSeconds * 1000 + 1);

      const result = await langfuse.getPrompt("test-prompt", undefined, { cacheTtlSeconds });
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      expect(result).toEqual(new TextPromptClient(getPromptStatelessSuccess.data));
    });

    it("should refetch and return new prompt if cached one is expired according to default TTL", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValue(getPromptStatelessSuccess);

      await langfuse.getPrompt("test-prompt", undefined);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(DEFAULT_PROMPT_CACHE_TTL_SECONDS * 1000 + 1);

      const result = await langfuse.getPrompt("test-prompt", undefined);
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

    it("should not HTML escape characters in prompt compile inputs", async () => {
      const promptClient = new TextPromptClient({
        name: "test",
        type: "text",
        version: 1,
        prompt: "This is a prompt with {{someJson}}",
        config: {
          model: "gpt-3.5-turbo-1106",
          temperature: 0,
        },
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
      });

      const prompt = promptClient.compile({ someJson: JSON.stringify({ foo: "bar" }) });
      expect(prompt).toEqual([{ role: "system", content: 'This is a prompt with {"foo":"bar"}' }]);
    });
  });
});
