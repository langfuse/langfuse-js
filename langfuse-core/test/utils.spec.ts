import { assert, removeTrailingSlash, generateUUID, configLangfuseSDK, convertHrTimeToTimestamp } from "../src/utils";
import {
  getCurrentIsoTimestamp,
  millisToHrTime,
  hrTimeToTimeStamp,
  timeInputToHrTime,
  HrTime,
  hrTime,
} from "../src/time";

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
  describe("high resolution timestamps", () => {
    it("creates hrtime", async () => {
      // jest.spyOn(performance, "timeOrigin").mockImplementation(() => 11.5);
      Object.defineProperty(performance, "timeOrigin", { value: 113.5, configurable: true });
      jest.spyOn(performance, "now").mockImplementation(() => 11.3);
      jest.setSystemTime(new Date(1716741267943));

      const output = getCurrentIsoTimestamp();
      console.log("hrTime", output);
      expect(output).toEqual("2024-05-26T16:34:28.181300000Z");
    });

    it("create iso timestamp", () => {
      const time = [1573513121, 123456] as HrTime;

      const output = hrTimeToTimeStamp(time);
      expect(output).toEqual("2019-11-11T22:58:41.000123456Z");
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
  });
});
