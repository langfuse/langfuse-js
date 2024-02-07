import {
  assert,
  removeTrailingSlash,
  generateUUID,
  currentISOTime,
  currentTimestamp,
  configLangfuseSDK,
} from "../src/utils";

describe("utils", () => {
  describe("assert", () => {
    it("should throw on falsey values", () => {
      [false, "", null, undefined, 0].forEach((x) => {
        expect(() => assert(x, "error")).toThrow("error");
      });
    });
    it("should not throw on truthy values", () => {
      [true, "string", 1, {}].forEach((x) => {
        expect(() => assert(x, "error")).not.toThrow("error");
      });
    });
  });
  describe("removeTrailingSlash", () => {
    it("should removeSlashes", () => {
      expect(removeTrailingSlash("me////")).toEqual("me");
      expect(removeTrailingSlash("me/wat///")).toEqual("me/wat");
      expect(removeTrailingSlash("me/")).toEqual("me");
      expect(removeTrailingSlash("/me")).toEqual("/me");
    });
  });
  describe("generateUUID", () => {
    it("should generate something that looks like a UUID", () => {
      const REGEX = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

      for (let i = 0; i < 1000; i++) {
        expect(generateUUID(globalThis)).toMatch(REGEX);
      }
    });
  });
  describe("currentTimestamp", () => {
    it("should get the timestamp", () => {
      expect(currentTimestamp()).toEqual(Date.now());
    });
  });
  describe("currentISOTime", () => {
    it("should get the iso time", () => {
      jest.setSystemTime(new Date("2022-01-01"));
      expect(currentISOTime()).toEqual("2022-01-01T00:00:00.000Z");
    });
  });

  describe("configLangfuseSDK", () => {
    beforeEach(() => {
      process.env.LANGFUSE_PUBLIC_KEY = "envPublicKey";
      process.env.LANGFUSE_SECRET_KEY = "envSecretKey";
      process.env.LANGFUSE_BASEURL = "http://example.com";
    });

    afterEach(() => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASEURL;
    });

    it("should return the publicKey from the environment variables if not provided", () => {
      const config = configLangfuseSDK({ secretKey: "1234" });
      expect(config).toEqual({ publicKey: "envPublicKey", secretKey: "1234", baseUrl: "http://example.com" });
    });

    it("should return the secretKey from the environment variables if not provided", () => {
      const config = configLangfuseSDK({ publicKey: "1234" });
      expect(config).toEqual({ publicKey: "1234", secretKey: "envSecretKey", baseUrl: "http://example.com" });
    });

    it("should return the options from the input params if provided", () => {
      const config = configLangfuseSDK({
        publicKey: "1234",
        secretKey: "5678",
        baseUrl: "http://localhost:9999",
      });
      expect(config).toEqual({ publicKey: "1234", secretKey: "5678", baseUrl: "http://localhost:9999" });
    });

    it("should return nothing if nothing is provided", () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASEURL;

      const config = configLangfuseSDK({});
      expect(config).toEqual({});
    });

    it("should log error if neither keys nor env variables are provided", () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASEURL;

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const config = configLangfuseSDK({});

      expect(consoleSpy).toHaveBeenCalledWith(
        "publicKey is required, but was not provided. It can be provided as an argument or as an environment variable LANGFUSE_PUBLIC_KEY."
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "secretKey is required, but was not provided. It can be provided as an argument or as an environment variable LANGFUSE_SECRET_KEY."
      );

      consoleSpy.mockRestore();
    });
  });
});
