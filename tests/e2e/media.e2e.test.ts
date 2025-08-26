import { LangfuseClient } from "@langfuse/client";
import { resetGlobalLogger, LangfuseMedia } from "@langfuse/core";
import { startObservation } from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";

import { ServerAssertions } from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

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

  describe("Media Reference Replacement", () => {
    it("replace media reference string in object when using base 64 data URIs", async () => {
      const testId = nanoid(8);
      const spanName = `media-processing-span-${testId}`;

      // Create base64 data URI from mock audio bytes
      const base64DataUri = new LangfuseMedia({
        source: "bytes",
        contentBytes: Buffer.from(mockAudioBytes),
        contentType: "audio/wav",
      }).base64DataUri;

      // Create span with LangfuseMedia in metadata (should use toJSON to convert to media reference)
      const span = startObservation(spanName, {
        input: {
          operation: "media processing test",
          audioData: base64DataUri,
        },
        metadata: {
          context: {
            nested: base64DataUri,
          },
          testType: "media-reference-replacement",
        },
      });

      span.update({
        output: { status: "processed" },
        metadata: { processingComplete: true },
      });
      span.end();

      // Force flush to send spans to server
      await testEnv.spanProcessor.forceFlush();

      // Wait for server-side ingestion processing
      await waitForServerIngestion(2000);

      // Fetch the trace from Langfuse server
      const trace = await assertions.fetchTrace(span.traceId);

      // Find the span observation
      const observation = assertions.expectObservationExists(trace, spanName, {
        type: "SPAN",
      });

      // Check that media reference was created in both input and metadata
      if (observation.input) {
        const inputStr = JSON.stringify(observation.input);

        // Should contain Langfuse media reference in input
        expect(inputStr).toMatch(
          /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
        );

        // Should not contain the original base64 data
        expect(inputStr).not.toContain(
          Buffer.from(mockAudioBytes).toString("base64"),
        );
      } else {
        throw new Error("Span input is missing");
      }

      const metadataStr = JSON.stringify(observation.metadata);

      // Should contain Langfuse media reference in metadata
      expect(metadataStr).toMatch(
        /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
      );

      // Should not contain the original base64 data
      expect(metadataStr).not.toContain(
        Buffer.from(mockAudioBytes).toString("base64"),
      );

      // Test media resolution back to base64 data URI
      const langfuseClient = new LangfuseClient();

      // Wait longer for media upload to complete
      await waitForServerIngestion(5000);

      const mediaResolvedTrace = await langfuseClient.media.resolveReferences({
        obj: trace,
        resolveWith: "base64DataUri",
      });

      // Check that the resolved trace has the original base64 data back
      if (mediaResolvedTrace.observations) {
        const resolvedSpanObs = mediaResolvedTrace.observations.find(
          (obs: any) => obs.name === spanName,
        );

        if (resolvedSpanObs?.input) {
          const resolvedInputStr = JSON.stringify(resolvedSpanObs.input);

          // Should contain the original base64 data URI
          expect(resolvedInputStr).toContain(base64DataUri);

          // Should not contain the media reference anymore
          expect(resolvedInputStr).not.toMatch(
            /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
          );
        }

        if (resolvedSpanObs?.metadata) {
          const resolvedMetadataStr = JSON.stringify(resolvedSpanObs.metadata);

          // Should contain the original base64 data URI
          expect(resolvedMetadataStr).toContain(base64DataUri);

          // Should not contain the media reference anymore
          expect(resolvedMetadataStr).not.toMatch(
            /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
          );
        }
      }

      // Additional test: Create a second span with the same media to verify consistency
      const span2Name = `media-reuse-span-${testId}`;
      const span2 = startObservation(span2Name, {
        input: {
          operation: "media reuse test",
          audioData: base64DataUri, // Same data URI should produce same reference
        },
        metadata: {
          context: {
            nested: base64DataUri, // Same data URI should produce same reference
          },
        },
      });
      span2.end();

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      // Fetch the second trace
      const trace2 = await assertions.fetchTrace(span2.traceId);
      const span2Obs = assertions.expectObservationExists(trace2, span2Name, {
        type: "SPAN",
      });

      // Both spans should have the same media reference (same content, same reference)
      if (
        observation.input &&
        span2Obs.input &&
        observation.metadata &&
        span2Obs.metadata
      ) {
        const input1 = JSON.stringify(observation.input);
        const input2 = JSON.stringify(span2Obs.input);

        const inputRef1 = input1.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );
        const inputRef2 = input2.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );

        if (inputRef1 && inputRef2) {
          expect(inputRef1[1]).toEqual(inputRef2[1]); // Same media ID in input
        } else {
          throw new Error("Media references not found in both spans' input");
        }

        const metadata1 = JSON.stringify(observation.metadata);
        const metadata2 = JSON.stringify(span2Obs.metadata);

        const metaRef1 = metadata1.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );
        const metaRef2 = metadata2.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );

        if (metaRef1 && metaRef2) {
          expect(metaRef1[1]).toEqual(metaRef2[1]); // Same media ID in metadata
        } else {
          throw new Error("Media references not found in both spans' metadata");
        }
      }

      // Final test: Use resolved media to create a third trace and verify consistency
      if (mediaResolvedTrace.observations) {
        const resolvedSpanObs = mediaResolvedTrace.observations.find(
          (obs: any) => obs.name === spanName,
        );

        if (resolvedSpanObs?.input?.audioData) {
          const resolvedAudioData = resolvedSpanObs.input.audioData;

          const span3Name = `media-resolved-reuse-span-${testId}`;
          const span3 = startObservation(span3Name, {
            input: {
              operation: "media resolved reuse test",
              audioData: new LangfuseMedia({
                source: "base64_data_uri",
                base64DataUri: resolvedAudioData,
              }),
            },
            metadata: {
              context: {
                nested: new LangfuseMedia({
                  source: "base64_data_uri",
                  base64DataUri: resolvedAudioData,
                }),
              },
            },
          });

          span3.end();

          await testEnv.spanProcessor.forceFlush();
          await waitForServerIngestion(2000);

          // Fetch the third trace
          const trace3 = await assertions.fetchTrace(span3.traceId);
          const span3Obs = assertions.expectObservationExists(
            trace3,
            span3Name,
            {
              type: "SPAN",
            },
          );

          // Should have the same media reference as the original spans
          if (span3Obs.input && observation.input) {
            const input3 = JSON.stringify(span3Obs.input);
            const input1 = JSON.stringify(observation.input);

            const inputRef3 = input3.match(
              /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
            );
            const inputRef1 = input1.match(
              /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
            );

            if (inputRef3 && inputRef1) {
              expect(inputRef3[1]).toEqual(inputRef1[1]); // Same media ID
            }
          }
        }
      }
    }, 30_000); // Increased timeout for the full round-trip test

    it("replace media reference string in object when using LangfuseMedia objects", async () => {
      const testId = nanoid(8);
      const spanName = `media-processing-span-${testId}`;

      // Create base64 data URI from mock audio bytes
      const media = new LangfuseMedia({
        source: "bytes",
        contentBytes: Buffer.from(mockAudioBytes),
        contentType: "audio/wav",
      });

      // Create span with LangfuseMedia in metadata (should use toJSON to convert to media reference)
      const span = startObservation(spanName, {
        input: {
          operation: "media processing test",
          audioData: media,
        },
        metadata: {
          context: {
            nested: media,
          },
          testType: "media-reference-replacement",
        },
      });

      span.update({
        output: { status: "processed" },
        metadata: { processingComplete: true },
      });
      span.end();

      // Force flush to send spans to server
      await testEnv.spanProcessor.forceFlush();

      // Wait for server-side ingestion processing
      await waitForServerIngestion(2000);

      // Fetch the trace from Langfuse server
      const trace = await assertions.fetchTrace(span.traceId);

      // Find the span observation
      const observation = assertions.expectObservationExists(trace, spanName, {
        type: "SPAN",
      });

      // Check that media reference was created in both input and metadata
      if (observation.input) {
        const inputStr = JSON.stringify(observation.input);

        // Should contain Langfuse media reference in input
        expect(inputStr).toMatch(
          /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
        );

        // Should not contain the original base64 data
        expect(inputStr).not.toContain(
          Buffer.from(mockAudioBytes).toString("base64"),
        );
      } else {
        throw new Error("Span input is missing");
      }

      const metadataStr = JSON.stringify(observation.metadata);

      // Should contain Langfuse media reference in metadata
      expect(metadataStr).toMatch(
        /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
      );

      // Should not contain the original base64 data
      expect(metadataStr).not.toContain(
        Buffer.from(mockAudioBytes).toString("base64"),
      );

      // Test media resolution back to base64 data URI
      const langfuseClient = new LangfuseClient();

      // Wait longer for media upload to complete
      await waitForServerIngestion(5000);

      const mediaResolvedTrace = await langfuseClient.media.resolveReferences({
        obj: trace,
        resolveWith: "base64DataUri",
      });

      // Check that the resolved trace has the original base64 data back
      if (mediaResolvedTrace.observations) {
        const resolvedSpanObs = mediaResolvedTrace.observations.find(
          (obs: any) => obs.name === spanName,
        );

        if (resolvedSpanObs?.input) {
          const resolvedInputStr = JSON.stringify(resolvedSpanObs.input);

          // Should contain the original base64 data URI
          expect(resolvedInputStr).toContain(media.base64DataUri);

          // Should not contain the media reference anymore
          expect(resolvedInputStr).not.toMatch(
            /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
          );
        }

        if (resolvedSpanObs?.metadata) {
          const resolvedMetadataStr = JSON.stringify(resolvedSpanObs.metadata);

          // Should contain the original base64 data URI
          expect(resolvedMetadataStr).toContain(media.base64DataUri);

          // Should not contain the media reference anymore
          expect(resolvedMetadataStr).not.toMatch(
            /@@@langfuseMedia:type=audio\/wav\|id=.+\|source=base64_data_uri@@@/,
          );
        }
      }

      // Additional test: Create a second span with the same media to verify consistency
      const span2Name = `media-reuse-span-${testId}`;
      const span2 = startObservation(span2Name, {
        input: {
          operation: "media reuse test",
          audioData: media, // Same data URI should produce same reference
        },
        metadata: {
          context: {
            nested: media, // Same data URI should produce same reference
          },
        },
      });
      span2.end();

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      // Fetch the second trace
      const trace2 = await assertions.fetchTrace(span2.traceId);
      const span2Obs = assertions.expectObservationExists(trace2, span2Name, {
        type: "SPAN",
      });

      // Both spans should have the same media reference (same content, same reference)
      if (
        observation.input &&
        span2Obs.input &&
        observation.metadata &&
        span2Obs.metadata
      ) {
        const input1 = JSON.stringify(observation.input);
        const input2 = JSON.stringify(span2Obs.input);

        const inputRef1 = input1.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );
        const inputRef2 = input2.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );

        if (inputRef1 && inputRef2) {
          expect(inputRef1[1]).toEqual(inputRef2[1]); // Same media ID in input
        } else {
          throw new Error("Media references not found in both spans' input");
        }

        const metadata1 = JSON.stringify(observation.metadata);
        const metadata2 = JSON.stringify(span2Obs.metadata);

        const metaRef1 = metadata1.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );
        const metaRef2 = metadata2.match(
          /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
        );

        if (metaRef1 && metaRef2) {
          expect(metaRef1[1]).toEqual(metaRef2[1]); // Same media ID in metadata
        } else {
          throw new Error("Media references not found in both spans' metadata");
        }
      }

      // Final test: Use resolved media to create a third trace and verify consistency
      if (mediaResolvedTrace.observations) {
        const resolvedSpanObs = mediaResolvedTrace.observations.find(
          (obs: any) => obs.name === spanName,
        );

        if (resolvedSpanObs?.input?.audioData) {
          const resolvedAudioData = resolvedSpanObs.input.audioData;

          const span3Name = `media-resolved-reuse-span-${testId}`;
          const span3 = startObservation(span3Name, {
            input: {
              operation: "media resolved reuse test",
              audioData: new LangfuseMedia({
                source: "base64_data_uri",
                base64DataUri: resolvedAudioData,
              }),
            },
            metadata: {
              context: {
                nested: new LangfuseMedia({
                  source: "base64_data_uri",
                  base64DataUri: resolvedAudioData,
                }),
              },
            },
          });

          span3.end();

          await testEnv.spanProcessor.forceFlush();
          await waitForServerIngestion(2000);

          // Fetch the third trace
          const trace3 = await assertions.fetchTrace(span3.traceId);
          const span3Obs = assertions.expectObservationExists(
            trace3,
            span3Name,
            {
              type: "SPAN",
            },
          );

          // Should have the same media reference as the original spans
          if (span3Obs.input && observation.input) {
            const input3 = JSON.stringify(span3Obs.input);
            const input1 = JSON.stringify(observation.input);

            const inputRef3 = input3.match(
              /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
            );
            const inputRef1 = input1.match(
              /@@@langfuseMedia:type=audio\/wav\|id=([^|]+)\|source=base64_data_uri@@@/,
            );

            if (inputRef3 && inputRef1) {
              expect(inputRef3[1]).toEqual(inputRef1[1]); // Same media ID
            }
          }
        }
      }
    }, 30_000); // Increased timeout for the full round-trip test
  });
});
