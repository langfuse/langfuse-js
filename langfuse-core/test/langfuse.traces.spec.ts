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

  describe("traces", () => {
    it("should create a trace", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.trace({
        name: "test-trace",
        sessionId: "123456789",
        input: {
          hello: "world",
        },
        output: {
          hello: "world",
        },
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = mocks.fetch.mock.calls[0];
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/ingestion$/);
      expect(options.method).toBe("POST");
      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              id: expect.any(String),
              name: "test-trace",
              sessionId: "123456789",
              input: {
                hello: "world",
              },
              output: {
                hello: "world",
              },
            },
          },
        ],
      });
    });

    it("should create an empty trace", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.trace();

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              id: expect.any(String),
            },
          },
        ],
      });
    });

    it("should allow overridding the id", async () => {
      langfuse.trace({
        id: "123456789",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toEqual({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              id: "123456789",
              timestamp: expect.any(String),
            },
          },
        ],
        metadata: {
          batch_size: 1,
          public_key: "pk-lf-111",
          sdk_integration: "DEFAULT",
          sdk_name: "langfuse-js",
          sdk_variant: "langfuse-core-tests",
          sdk_version: "2.0.0-alpha.2",
        },
      });
    });

    it("test all params", async () => {
      jest.setSystemTime(new Date("2022-01-01"));

      langfuse.trace({
        name: "test-trace",
        id: "123456789",
        metadata: {
          test: "test",
          mira: {
            hello: "world",
          },
        },
        version: "1.0.0",
        tags: ["tag1", "tag2"],
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      const body = parseBody(mocks.fetch.mock.calls[0]);
      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              name: "test-trace",
              id: "123456789",
              metadata: {
                test: "test",
                mira: {
                  hello: "world",
                },
              },
              version: "1.0.0",
              tags: ["tag1", "tag2"],
            },
          },
        ],
      });
    });

    it("should update trace via additional POST (upserts)", async () => {
      const trace = langfuse.trace({
        name: "test-trace",
      });

      trace.update({
        userId: "123456789",
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      const body = parseBody(mocks.fetch.mock.calls[1]);
      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              id: trace.id,
              userId: "123456789",
            },
          },
        ],
      });
    });
  });

  describe("trace release", () => {
    it("should add env LANGFUSE_RELEASE as release to trace", async () => {
      process.env.LANGFUSE_RELEASE = "v1.0.0-alpha.1";
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
      });

      langfuse.trace({
        name: "test-trace",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v1.0.0-alpha.1",
            },
          },
        ],
      });
    });

    it("should check common release envs", async () => {
      process.env.RENDER_GIT_COMMIT = "v1.0.0-alpha.200";
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
      });
      delete process.env.RENDER_GIT_COMMIT;

      langfuse.trace({
        name: "test-trace",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v1.0.0-alpha.200",
            },
          },
        ],
      });
    });

    it("should prefer LANGFUSE_RELEASE over common release envs", async () => {
      process.env.LANGFUSE_RELEASE = "v1.0.0-alpha.10";
      process.env.RENDER_GIT_COMMIT = "v1.0.0-alpha.20";
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
      });
      delete process.env.RENDER_GIT_COMMIT;

      langfuse.trace({
        name: "test-trace",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v1.0.0-alpha.10",
            },
          },
        ],
      });
    });

    it("should add release to trace if set in constructor", async () => {
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
        release: "v2",
      });

      langfuse.trace({
        name: "test-trace",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v2",
            },
          },
        ],
      });
    });

    it("should add release to trace if set in trace", async () => {
      langfuse.trace({
        name: "test-trace",
        release: "v5",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v5",
            },
          },
        ],
      });
    });

    it("should not add release to trace if not set", async () => {
      langfuse.trace({
        name: "test-trace",
      });
      const body = parseBody(mocks.fetch.mock.calls[0]);
      expect(body["batch"][0]).not.toHaveProperty("release");
    });

    it("should allow overridding the release in constructor", async () => {
      process.env.LANGFUSE_RELEASE = "v1";
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
        release: "v4",
      });

      langfuse.trace({
        name: "test-trace",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v4",
            },
          },
        ],
      });
    });

    it("should allow overridding the release in trace", async () => {
      process.env.LANGFUSE_RELEASE = "v1";
      [langfuse, mocks] = createTestClient({
        publicKey: "pk-lf-111",
        secretKey: "sk-lf-111",
        flushAt: 1,
        release: "v2",
      });

      langfuse.trace({
        name: "test-trace",
        release: "v3",
      });

      const body = parseBody(mocks.fetch.mock.calls[0]);

      expect(body).toMatchObject({
        batch: [
          {
            id: expect.any(String),
            timestamp: expect.any(String),
            type: "trace-create",
            body: {
              release: "v3",
            },
          },
        ],
      });
    });
  });
});
