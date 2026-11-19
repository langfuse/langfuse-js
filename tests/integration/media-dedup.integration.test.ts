import { startObservation } from "@langfuse/tracing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

const IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const OTHER_IMAGE = "data:image/png;base64,YW5vdGhlciBpbWFnZSBieXRlcw==";

type FetchCall = {
  url: string;
  resolve: (body: unknown) => void;
  reject: (err: unknown) => void;
};

/** Stub fetch with deferred /api/public/media responses so tests control upload timing. */
function stubMediaUploads() {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      const url = String(input);
      return new Promise((resolve, reject) => {
        const respond = (body: unknown) =>
          resolve({
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => body,
          } as Response);
        calls.push({ url, resolve: respond, reject });
      });
    }),
  );
  return {
    calls,
    mediaCalls: () => calls.filter((c) => c.url.includes("/api/public/media")),
  };
}

describe("Media upload deduplication", () => {
  let testEnv: TestEnvironment;
  let uploads: ReturnType<typeof stubMediaUploads>;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    uploads = stubMediaUploads();
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
    vi.unstubAllGlobals();
  });

  it("uploads a media once for all spans of a trace and tags every occurrence identically", async () => {
    const root = startObservation("root", { input: { image: IMAGE } });
    const child = startObservation(
      "child",
      { input: { image: IMAGE } },
      { parentSpanContext: root.otelSpan.spanContext() },
    );
    root.end();
    child.end();

    await waitForSpanExport(testEnv.mockExporter, 2);
    for (const call of uploads.mediaCalls())
      call.resolve({ uploadUrl: null, mediaId: "m" });
    await testEnv.spanProcessor.forceFlush();

    expect(uploads.mediaCalls()).toHaveLength(1);

    const rootInput = testEnv.mockExporter.getSpanAttributes("root")?.[
      "langfuse.observation.input"
    ] as string;
    const childInput = testEnv.mockExporter.getSpanAttributes("child")?.[
      "langfuse.observation.input"
    ] as string;
    expect(rootInput).not.toContain(IMAGE);
    expect(childInput).not.toContain(IMAGE);
    const tagPattern =
      /@@@langfuseMedia:type=image\/png\|id=[^|]+\|source=base64_data_uri@@@/;
    expect(rootInput).toMatch(tagPattern);
    expect(childInput).toMatch(tagPattern);
    expect(childInput.match(tagPattern)?.[0]).toBe(
      rootInput.match(tagPattern)?.[0],
    );
  });

  it("shares one in-flight upload between concurrent spans of a trace", async () => {
    const root = startObservation("root", { input: { image: IMAGE } });
    const child = startObservation(
      "child",
      { input: { image: IMAGE } },
      { parentSpanContext: root.otelSpan.spanContext() },
    );
    root.end();
    child.end();

    // Both spans are processed while the first upload is still in flight.
    await waitForSpanExport(testEnv.mockExporter, 2);
    expect(uploads.mediaCalls()).toHaveLength(1);

    for (const call of uploads.mediaCalls())
      call.resolve({ uploadUrl: null, mediaId: "m" });
    await testEnv.spanProcessor.forceFlush();
  });

  it("uploads a media once per trace", async () => {
    for (const name of ["first", "second"]) {
      const span = startObservation(name, { input: { image: IMAGE } });
      span.end();
      await waitForSpanExport(testEnv.mockExporter, name === "first" ? 1 : 2);
    }
    for (const call of uploads.mediaCalls())
      call.resolve({ uploadUrl: null, mediaId: "m" });
    await testEnv.spanProcessor.forceFlush();

    expect(uploads.mediaCalls()).toHaveLength(2);
  });

  it("keeps one upload per field so input and output each get their own link", async () => {
    const span = startObservation("io-span", {
      input: { image: IMAGE },
      output: { image: IMAGE },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);
    for (const call of uploads.mediaCalls())
      call.resolve({ uploadUrl: null, mediaId: "m" });
    await testEnv.spanProcessor.forceFlush();

    expect(uploads.mediaCalls()).toHaveLength(2);
  });

  it("uploads a different media independently", async () => {
    const span = startObservation("two-images", {
      input: { a: IMAGE, b: OTHER_IMAGE },
    });
    span.end();

    await waitForSpanExport(testEnv.mockExporter, 1);
    for (const call of uploads.mediaCalls())
      call.resolve({ uploadUrl: null, mediaId: "m" });
    await testEnv.spanProcessor.forceFlush();

    expect(uploads.mediaCalls()).toHaveLength(2);
  });

  it("retries on a later span after a failed upload", async () => {
    const first = startObservation("first", { input: { image: IMAGE } });
    first.end();
    await waitForSpanExport(testEnv.mockExporter, 1);
    uploads.mediaCalls()[0].reject(new Error("network down"));
    // Drain the upload promise chain so the failure has freed its dedup key.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    const second = startObservation("second", { input: { image: IMAGE } });
    second.end();
    await waitForSpanExport(testEnv.mockExporter, 2);
    for (const call of uploads.mediaCalls())
      call.resolve({ uploadUrl: null, mediaId: "m" });
    await testEnv.spanProcessor.forceFlush();

    expect(uploads.mediaCalls()).toHaveLength(2);
  });
});
