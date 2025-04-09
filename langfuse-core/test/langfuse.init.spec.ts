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

    it("should initialise in disabled state with missing api key or enabled flag set to false", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const disabledClient = createTestClient({
        publicKey: "public key",
        secretKey: "secret key",
        enabled: false,
      });

      expect((disabledClient[0] as any).enabled).toBe(false);

      const noPublicKeyClient = createTestClient({
        publicKey: undefined as unknown as string,
        secretKey: "secret key",
      });

      expect((noPublicKeyClient[0] as any).enabled).toBe(false);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        1,
        "Langfuse public key was not passed to constructor or not set as 'LANGFUSE_PUBLIC_KEY' environment variable. No observability data will be sent to Langfuse."
      );

      const noSecretKeyClient = createTestClient({
        publicKey: "public key",
        secretKey: undefined as unknown as string,
      });
      expect(consoleSpy).toHaveBeenNthCalledWith(
        2,
        "Langfuse secret key was not passed to constructor or not set as 'LANGFUSE_SECRET_KEY' environment variable. No observability data will be sent to Langfuse."
      );

      expect((noSecretKeyClient[0] as any).enabled).toBe(false);

      const noKeysClient = createTestClient({
        publicKey: undefined as unknown as string,
        secretKey: undefined as unknown as string,
      });

      expect((noKeysClient[0] as any).enabled).toBe(false);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        3,
        "Langfuse secret key was not passed to constructor or not set as 'LANGFUSE_SECRET_KEY' environment variable. No observability data will be sent to Langfuse."
      );
    });

    it("should initialise default options", () => {
      expect(langfuse as any).toMatchObject({
        secretKey: "sk-lf-111",
        publicKey: "pk-lf-111",
        baseUrl: "https://cloud.langfuse.com",
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
