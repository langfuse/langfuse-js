import { parseBody } from "./test-utils/test-utils";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  jest.useFakeTimers();

  beforeEach(() => {
    delete process.env.LANGFUSE_RELEASE;
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });
  });

  describe("prompts", () => {
    it("should create a prompt", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

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
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.getPromptStateless("test-prompt");

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/prompts/?name=test-prompt");
      expect(options.method).toBe("GET");
    });

    it("should get a prompt with name and version", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.getPromptStateless("test-prompt", 2);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toEqual("https://cloud.langfuse.com/api/public/prompts/?name=test-prompt&version=2");
      expect(options.method).toBe("GET");
    });
  });
});
