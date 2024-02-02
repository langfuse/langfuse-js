import { parseBody } from "./test-utils/test-utils";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";
import { LangfusePromptClient, DEFAULT_PROMPT_CACHE_TTL_SECONDS, type GetLangfusePromptResponse } from "../src";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  const getPromptStatelessSuccess: GetLangfusePromptResponse = {
    fetchResult: "success",
    data: {
      name: "test-prompt",
      prompt: "This is a prompt with a {{variable}}",
      version: 1,
    },
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
      langfuse.createPromptStateless({
        name: "test-prompt",
        prompt: "This is a prompt with a {{variable}}",
        isActive: true,
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
      });
    });

    it("should get a prompt name only", async () => {
      langfuse.getPromptStateless("test-prompt");

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/prompts/?name=test-prompt");
      expect(options.method).toBe("GET");
    });

    it("should get a prompt with name and version", async () => {
      langfuse.getPromptStateless("test-prompt", 2);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/prompts/?name=test-prompt&version=2");
      expect(options.method).toBe("GET");
    });

    it("should fetch and cache a prompt when not in cache", async () => {
      const mockGetPromptStateless = jest
        .spyOn(langfuse, "getPromptStateless")
        .mockResolvedValueOnce(getPromptStatelessSuccess);
      const result = await langfuse.getPrompt("test-prompt");

      expect(mockGetPromptStateless).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new LangfusePromptClient(getPromptStatelessSuccess.data));
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

      expect(result).toEqual(new LangfusePromptClient(getPromptStatelessSuccess.data));
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

      expect(result).toEqual(new LangfusePromptClient(getPromptStatelessSuccess.data));
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

      expect(result).toEqual(new LangfusePromptClient(getPromptStatelessSuccess.data));
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

      expect(result).toEqual(new LangfusePromptClient(getPromptStatelessSuccess.data));
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

      expect(result).toEqual(new LangfusePromptClient(getPromptStatelessSuccess.data));
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

      expect(result1).toEqual(new LangfusePromptClient(versionChangedPrompt.data));

      // Return cached value on subsequent calls
      mockGetPromptStateless.mockResolvedValue(versionChangedPrompt);
      const result2 = await langfuse.getPrompt("test-prompt", newPromptVersion);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(2);

      expect(result2).toEqual(new LangfusePromptClient(versionChangedPrompt.data));

      // Refetch if cache has expired
      jest.advanceTimersByTime(DEFAULT_PROMPT_CACHE_TTL_SECONDS * 1000 + 1);
      mockGetPromptStateless.mockResolvedValue(versionChangedPrompt);
      const result3 = await langfuse.getPrompt("test-prompt", newPromptVersion);
      expect(mockGetPromptStateless).toHaveBeenCalledTimes(3);

      expect(result3).toEqual(new LangfusePromptClient(versionChangedPrompt.data));
    });
  });
});
