import { LangfuseCore } from "../src";
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

  describe("Headers", () => {
    it("should create a trace", async () => {
      langfuse.trace({
        name: "test-trace",
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      // cehck headers
      const options = mocks.fetch.mock.calls[0][1];
      expect(options.method).toBe("POST");
      expect(options.headers).toMatchObject({
        "Content-Type": "application/json",
        "X-Langfuse-Sdk-Name": "langfuse-js",
        "X-Langfuse-Sdk-Version": langfuse.getLibraryVersion(),
        "X-Langfuse-Sdk-Variant": langfuse.getLibraryId(),
      });
    });
  });
});
