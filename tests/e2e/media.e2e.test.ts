import { LangfuseClient } from "@langfuse/client";
import { resetGlobalLogger, LangfuseMedia } from "@langfuse/core";
import { startObservation } from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";

import {
  ServerAssertions,
  parseIO,
  pollUntil,
} from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

const MEDIA_REFERENCE_REGEX =
  /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/;

describe("Media E2E Tests", () => {
  let testEnv: ServerTestEnvironment;
  let assertions: ServerAssertions;

  const mockAudioBytes = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    0x24,
    0x00,
    0x00,
    0x00, // File size
    0x57,
    0x41,
    0x56,
    0x45, // "WAVE"
    0x66,
    0x6d,
    0x74,
    0x20, // "fmt "
    0x10,
    0x00,
    0x00,
    0x00, // Subchunk1Size
    0x01,
    0x00,
    0x01,
    0x00, // AudioFormat, NumChannels
    0x44,
    0xac,
    0x00,
    0x00, // SampleRate
    0x88,
    0x58,
    0x01,
    0x00, // ByteRate
    0x02,
    0x00,
    0x10,
    0x00, // BlockAlign, BitsPerSample
    0x64,
    0x61,
    0x74,
    0x61, // "data"
    0x00,
    0x00,
    0x00,
    0x00, // Subchunk2Size
  ]);

  beforeAll(() => {
    resetGlobalLogger();
  });

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    assertions = new ServerAssertions();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
    resetGlobalLogger();
  });

  async function exportSpan(
    name: string,
    audioData: string | LangfuseMedia,
  ): Promise<{ input: unknown; metadata: unknown }> {
    const span = startObservation(name, {
      input: { operation: "media processing test", audioData },
      metadata: {
        context: { nested: audioData },
        testType: "media-reference-replacement",
      },
    });
    span.update({
      output: { status: "processed" },
      metadata: { processingComplete: true },
    });
    span.end();

    await testEnv.spanProcessor.forceFlush();

    const observations = await assertions.waitForObservations(span.traceId);
    const observation = assertions.expectObservation(observations, name, {
      type: "SPAN",
    });

    return {
      input: parseIO(observation.input),
      metadata: observation.metadata,
    };
  }

  function mediaIdOf(value: unknown): string {
    const match = JSON.stringify(value).match(MEDIA_REFERENCE_REGEX);
    if (!match) {
      throw new Error(`No media reference found in ${JSON.stringify(value)}`);
    }
    return match[1];
  }

  async function expectMediaRoundTrip(
    createAudioData: () => string | LangfuseMedia,
    expectedDataUri: string,
  ) {
    const testId = nanoid(8);
    const rawBase64 = Buffer.from(mockAudioBytes).toString("base64");

    // Media in input and metadata is replaced with a reference string
    const first = await exportSpan(
      `media-processing-span-${testId}`,
      createAudioData(),
    );
    for (const value of [first.input, first.metadata]) {
      expect(JSON.stringify(value)).toMatch(MEDIA_REFERENCE_REGEX);
      expect(JSON.stringify(value)).not.toContain(rawBase64);
    }

    // References resolve back to the original data URI once the upload is done
    const langfuseClient = new LangfuseClient();
    const resolved = await pollUntil(
      () =>
        langfuseClient.media.resolveReferences({
          obj: first,
          resolveWith: "base64DataUri",
        }),
      (value) => !MEDIA_REFERENCE_REGEX.test(JSON.stringify(value)),
      "media references to resolve",
    );
    expect(JSON.stringify(resolved.input)).toContain(expectedDataUri);
    expect(JSON.stringify(resolved.metadata)).toContain(expectedDataUri);

    // The same content produces the same media reference
    const second = await exportSpan(
      `media-reuse-span-${testId}`,
      createAudioData(),
    );
    expect(mediaIdOf(second.input)).toBe(mediaIdOf(first.input));
    expect(mediaIdOf(second.metadata)).toBe(mediaIdOf(first.metadata));

    // Re-exporting the resolved data URI yields the same media reference again
    const resolvedAudioData = (resolved.input as { audioData: string })
      .audioData;
    const third = await exportSpan(
      `media-resolved-reuse-span-${testId}`,
      new LangfuseMedia({
        source: "base64_data_uri",
        base64DataUri: resolvedAudioData,
      }),
    );
    expect(mediaIdOf(third.input)).toBe(mediaIdOf(first.input));
  }

  describe("Media Reference Replacement", () => {
    it("replace media reference string in object when using base 64 data URIs", async () => {
      const base64DataUri = new LangfuseMedia({
        source: "bytes",
        contentBytes: Buffer.from(mockAudioBytes),
        contentType: "audio/wav",
      }).base64DataUri!;

      await expectMediaRoundTrip(() => base64DataUri, base64DataUri);
    }, 60_000);

    it("replace media reference string in object when using LangfuseMedia objects", async () => {
      const media = new LangfuseMedia({
        source: "bytes",
        contentBytes: Buffer.from(mockAudioBytes),
        contentType: "audio/wav",
      });

      await expectMediaRoundTrip(() => media, media.base64DataUri!);
    }, 60_000);
  });
});
