/**
 * @jest-environment jsdom
 */

// import { Langfuse } from '../'
import { Langfuse } from "../index";

describe("langfuseWeb", () => {
  let fetch: jest.Mock;
  jest.useRealTimers();

  beforeEach(() => {
    (global as any).fetch = fetch = jest.fn(async (url) => {
      let res: any = { status: "ok" };

      // Can add more mocks here
      if (url.includes("traces")) {
        res = {
          ...res,
        };
      }

      return {
        status: 200,
        json: () => Promise.resolve(res),
      };
    });
  });

  describe("init", () => {
    it("should initialise", () => {
      const langfuse = new Langfuse({
        publicKey: "pk",
        secretKey: "sk",
        flushAt: 1,
      });
      expect(langfuse.baseUrl).toEqual("https://cloud.langfuse.com");

      langfuse.trace({ name: "test-trace-1" });

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("correct trace", async () => {
      const langfuse = new Langfuse({
        publicKey: "pk",
        secretKey: "sk",
        flushAt: 1,
      });

      langfuse.trace({ name: "test-trace-1", id: "test-id" });

      expect(fetch).toHaveBeenCalledWith("https://cloud.langfuse.com/api/public/traces", {
        body: JSON.stringify({
          id: "test-id",
          name: "test-trace-1",
        }),
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Basic " + Buffer.from("pk:sk").toString("base64"),
          "X-Langfuse-Sdk-Name": "langfuse-js",
          "X-Langfuse-Sdk-Version": langfuse.getLibraryVersion(),
          "X-Langfuse-Sdk-Variant": langfuse.getLibraryId(),
          "X-Langfuse-Public-Key": "pk",
        }),
        signal: expect.anything(),
      });
    });

    it("check env", () => {
      const langfuse = new Langfuse();
      expect(langfuse.baseUrl).toEqual(process.env.LANGFUSE_HOST);
    });

  });
});
