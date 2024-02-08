/**
 * @jest-environment jsdom
 */

// import { LangfuseWeb } from '../'
import { utils } from "langfuse-core";
import { LangfuseWeb } from "../index";
import { LANGFUSE_BASEURL } from "../../integration-test/integration-utils";

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

      if (url.startsWith("https://cloud-fail.langfuse.com")) {
        return {
          status: 404,
          json: () => Promise.resolve(res),
        };
      }

      return {
        status: 200,
        json: () => Promise.resolve(res),
      };
    });
  });

  describe("instantiation", () => {
    it("instantiates with env variables", async () => {
      const langfuse = new LangfuseWeb();

      const options = langfuse._getFetchOptions({ method: "POST", body: "test" });

      expect(langfuse.baseUrl).toEqual(LANGFUSE_BASEURL);

      expect(options).toMatchObject({
        headers: {
          "Content-Type": "application/json",
          "X-Langfuse-Sdk-Name": "langfuse-js",
          "X-Langfuse-Sdk-Variant": "langfuse-frontend",
          "X-Langfuse-Public-Key": process.env.LANGFUSE_PUBLIC_KEY,
          Authorization: `Bearer ${process.env.LANGFUSE_PUBLIC_KEY}`,
        },
        body: "test",
      });
    });

    it("instantiates with constructor variables", async () => {
      const langfuse = new LangfuseWeb({ publicKey: "test", baseUrl: "http://example.com" });

      const options = langfuse._getFetchOptions({ method: "POST", body: "test" });

      expect(langfuse.baseUrl).toEqual("http://example.com");
      expect(options).toMatchObject({
        headers: {
          "Content-Type": "application/json",
          "X-Langfuse-Sdk-Name": "langfuse-js",
          "X-Langfuse-Sdk-Variant": "langfuse-frontend",
          "X-Langfuse-Public-Key": "test",
          Authorization: "Bearer test",
        },
        body: "test",
      });
    });

    it("instantiates with without mandatory variables", async () => {
      const LANGFUSE_PUBLIC_KEY = String(process.env.LANGFUSE_PUBLIC_KEY);
      const LANGFUSE_SECRET_KEY = String(process.env.LANGFUSE_SECRET_KEY);
      const LANGFUSE_BASEURL = String(process.env.LANGFUSE_BASEURL);

      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASEURL;

      expect(() => new LangfuseWeb()).toThrow();

      process.env.LANGFUSE_PUBLIC_KEY = LANGFUSE_PUBLIC_KEY;
      process.env.LANGFUSE_SECRET_KEY = LANGFUSE_SECRET_KEY;
      process.env.LANGFUSE_BASEURL = LANGFUSE_BASEURL;
    });

    it("should initialise", async () => {
      const langfuse = new LangfuseWeb({
        publicKey: "pk",
        flushAt: 10,
      });
      expect(langfuse.baseUrl).toEqual(LANGFUSE_BASEURL);

      const id = utils.generateUUID();
      const score = langfuse.score({
        id,
        name: "test",
        traceId: "test-trace-1",
        value: 200,
        comment: "test comment",
        observationId: "test-observation-id",
      });

      expect(score).toBeInstanceOf(Promise);

      await score;

      expect(fetch).toHaveBeenCalledTimes(1);

      expect(fetch).toHaveBeenCalledWith(
        `${LANGFUSE_BASEURL}/api/public/ingestion`,
        expect.objectContaining({
          body: expect.stringContaining(
            JSON.stringify({
              id,
              name: "test",
              traceId: "test-trace-1",
              value: 200,
              comment: "test comment",
              observationId: "test-observation-id",
            })
          ),
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Langfuse-Public-Key": "pk",
            Authorization: "Bearer pk",
            "X-Langfuse-Sdk-Name": "langfuse-js",
            "X-Langfuse-Sdk-Version": langfuse.getLibraryVersion(),
            "X-Langfuse-Sdk-Variant": langfuse.getLibraryId(),
          }),
          signal: expect.anything(),
        })
      );
    });

    it("should log error if score was not created", async () => {
      const langfuse = new LangfuseWeb({
        publicKey: "pk",
        baseUrl: "https://cloud-fail.langfuse.com", // this will fail with 404
        flushAt: 10,
        fetchRetryCount: 2,
        fetchRetryDelay: 2,
      });
      expect(langfuse.baseUrl).toEqual("https://cloud-fail.langfuse.com");

      const id = utils.generateUUID();
      await langfuse.score({
        id,
        name: "test",
        traceId: "test-trace-1",
        value: 200,
        comment: "test comment",
        observationId: "test-observation-id",
      });

      // should not throw error

      // 1 call + 2 retries
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("score is the only available object", async () => {
      const langfuse = new LangfuseWeb({ publicKey: "pk" });

      expect(langfuse).toHaveProperty("score");

      expect(langfuse).not.toHaveProperty("trace");
      expect(langfuse).not.toHaveProperty("observation");
      expect(langfuse).not.toHaveProperty("span");
      expect(langfuse).not.toHaveProperty("event");
      expect(langfuse).not.toHaveProperty("generation");
    });
  });
});
