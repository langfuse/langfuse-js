import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let mocks: LangfuseCoreTestClientMocks;

  beforeEach(() => {
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
    });
  });

  describe("init", () => {
    it("should initialise", () => {
      expect(langfuse.baseUrl).toEqual("https://cloud.langfuse.com");
    });

    it("should throw if missing api key", () => {
      expect(() =>
        createTestClient({
          publicKey: undefined as unknown as string,
          secretKey: "secret key",
        })
      ).toThrowError("You must pass your Langfuse project's api public key.");

      expect(() =>
        createTestClient({
          publicKey: "public key",
          secretKey: undefined as unknown as string,
        })
      ).toThrowError("You must pass your Langfuse project's api secret key.");

      expect(() =>
        createTestClient({
          publicKey: undefined as unknown as string,
          secretKey: undefined as unknown as string,
        })
      ).toThrowError("You must pass your Langfuse project's api public key.");
    });

    it("should initialise default options", () => {
      expect(langfuse as any).toMatchObject({
        secretKey: "sk-lf-111",
        publicKey: "pk-lf-111",
        baseUrl: "https://cloud.langfuse.com",
        flushAt: 20,
        flushInterval: 10000,
      });
    });

    it("overwrites defaults with options", () => {
      [langfuse, mocks] = createTestClient({
        publicKey: "pk",
        secretKey: "sk",
        baseUrl: "https://a.com",
        flushAt: 1,
        flushInterval: 2,
      });

      expect(langfuse).toMatchObject({
        secretKey: "sk",
        publicKey: "pk",
        baseUrl: "https://a.com",
        flushAt: 1,
        flushInterval: 2,
      });
    });

    it("should keep the flushAt option above zero", () => {
      [langfuse, mocks] = createTestClient({
        secretKey: "sk",
        publicKey: "pk",
        flushAt: -2,
      }) as any;
      expect((langfuse as any).flushAt).toEqual(1);
    });

    it("should remove trailing slashes from `baseUrl`", () => {
      [langfuse, mocks] = createTestClient({
        secretKey: "sk",
        publicKey: "pk",
        baseUrl: "http://my-local-langfuse.com///",
      });

      expect((langfuse as any).baseUrl).toEqual("http://my-local-langfuse.com");
    });
  });
});
