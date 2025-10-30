/**
 * Comprehensive tests for propagateAttributes functionality.
 *
 * This module tests the propagateAttributes function that allows setting
 * trace-level attributes (userId, sessionId, version, metadata) that automatically propagate
 * to all child spans within the context.
 */

import {
  LangfuseOtelContextKeys,
  LangfuseOtelSpanAttributes,
  getPropagatedAttributesFromContext,
} from "@langfuse/core";
import { propagateAttributes, startObservation } from "@langfuse/tracing";
import {
  context as otelContext,
  trace as otelTrace,
  propagation,
  ROOT_CONTEXT,
} from "@opentelemetry/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForSpanExport,
  type TestEnvironment,
} from "./helpers/testSetup.js";

describe("propagateAttributes", () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
  });

  afterEach(async () => {
    await teardownTestEnvironment(testEnv);
  });

  describe("Basic Propagation", () => {
    it("should propagate userId to child spans", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ userId: "user_123" }, () => {
          const child1 = startObservation("child-1");
          child1.end();

          const child2 = startObservation("child-2");
          child2.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      expect(child1?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user_123",
      );
      expect(child2?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user_123",
      );
    });

    it("should propagate sessionId to child spans", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ sessionId: "session_abc" }, () => {
          const child1 = startObservation("child-1");
          child1.end();

          const child2 = startObservation("child-2");
          child2.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      expect(
        child1?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("session_abc");
      expect(
        child2?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("session_abc");
    });

    it("should propagate version to child spans", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ version: "v1.2.3" }, () => {
          const child1 = startObservation("child-1");
          child1.end();

          const child2 = startObservation("child-2");
          child2.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      expect(child1?.attributes[LangfuseOtelSpanAttributes.VERSION]).toBe(
        "v1.2.3",
      );
      expect(child2?.attributes[LangfuseOtelSpanAttributes.VERSION]).toBe(
        "v1.2.3",
      );
    });

    it("should propagate metadata to child spans", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            metadata: { experiment: "variant_a", version: "1.0" },
          },
          () => {
            const child1 = startObservation("child-1");
            child1.end();

            const child2 = startObservation("child-2");
            child2.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      expect(
        child1?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.experiment`
        ],
      ).toBe("variant_a");
      expect(
        child1?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.version`
        ],
      ).toBe("1.0");
      expect(
        child2?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.experiment`
        ],
      ).toBe("variant_a");
      expect(
        child2?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.version`
        ],
      ).toBe("1.0");
    });

    it("should propagate all attributes together", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "user_123",
            sessionId: "session_abc",
            version: "v2.0.0",
            metadata: { experiment: "test", env: "prod" },
          },
          () => {
            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user_123",
      );
      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("session_abc");
      expect(child?.attributes[LangfuseOtelSpanAttributes.VERSION]).toBe(
        "v2.0.0",
      );
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.experiment`
        ],
      ).toBe("test");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.env`],
      ).toBe("prod");
    });

    it("should maintain return value", async () => {
      const tracer = otelTrace.getTracer("test");

      const returnValue = await propagateAttributes(
        { userId: "user_123" },
        async () => {
          return await tracer.startActiveSpan("parent", async (parentSpan) => {
            const child1 = startObservation("child-1");
            child1.end();

            const child2 = startObservation("child-2");
            child2.end();
            parentSpan.end();

            return "hello";
          });
        },
      );

      expect(returnValue).toBe("hello");

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      expect(child1?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user_123",
      );
      expect(child2?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user_123",
      );
    });

    it("should propagate all attributes together (async)", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        await propagateAttributes(
          {
            userId: "user_123",
            sessionId: "session_abc",
            metadata: { experiment: "test", env: "prod" },
          },
          async () => {
            await new Promise((resolve) => setTimeout(resolve));
            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user_123",
      );
      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("session_abc");
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.experiment`
        ],
      ).toBe("test");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.env`],
      ).toBe("prod");
    });
  });

  describe("Tags Propagation", () => {
    it("should propagate tags to child spans", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["production", "experiment-a"] }, () => {
          const child1 = startObservation("child-1");
          child1.end();

          const child2 = startObservation("child-2");
          child2.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      expect(child1?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual(
        ["production", "experiment-a"],
      );
      expect(child2?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual(
        ["production", "experiment-a"],
      );
    });

    it("should merge tags from multiple propagateAttributes calls", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["tag1", "tag2"] }, () => {
          propagateAttributes({ tags: ["tag3", "tag4"] }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // Child should have all four tags merged
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual(
        expect.arrayContaining(["tag1", "tag2", "tag3", "tag4"]),
      );
      expect(
        (child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS] as string[])
          ?.length,
      ).toBe(4);
    });

    it("should deduplicate tags when merging", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["tag1", "tag2"] }, () => {
          propagateAttributes({ tags: ["tag2", "tag3"] }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // Should have unique tags only: tag1, tag2, tag3
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual(
        expect.arrayContaining(["tag1", "tag2", "tag3"]),
      );
      expect(
        (child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS] as string[])
          ?.length,
      ).toBe(3);
    });

    it("should merge tags across nested contexts", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["outer", "shared"] }, () => {
          const spanOuter1 = startObservation("span-outer-1");
          spanOuter1.end();

          propagateAttributes({ tags: ["inner", "shared"] }, () => {
            const spanInner = startObservation("span-inner");
            spanInner.end();
          });

          const spanOuter2 = startObservation("span-outer-2");
          spanOuter2.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 4);
      const spans = testEnv.mockExporter.exportedSpans;
      const spanOuter1 = spans.find((s) => s.name === "span-outer-1");
      const spanInner = spans.find((s) => s.name === "span-inner");
      const spanOuter2 = spans.find((s) => s.name === "span-outer-2");

      // spanOuter1: ["outer", "shared"]
      expect(
        spanOuter1?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS],
      ).toEqual(expect.arrayContaining(["outer", "shared"]));
      expect(
        (
          spanOuter1?.attributes[
            LangfuseOtelSpanAttributes.TRACE_TAGS
          ] as string[]
        )?.length,
      ).toBe(2);

      // spanInner: ["outer", "shared", "inner"] - "shared" deduplicated
      expect(
        spanInner?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS],
      ).toEqual(expect.arrayContaining(["outer", "shared", "inner"]));
      expect(
        (
          spanInner?.attributes[
            LangfuseOtelSpanAttributes.TRACE_TAGS
          ] as string[]
        )?.length,
      ).toBe(3);

      // spanOuter2: ["outer", "shared"] - restored to outer context
      expect(
        spanOuter2?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS],
      ).toEqual(expect.arrayContaining(["outer", "shared"]));
      expect(
        (
          spanOuter2?.attributes[
            LangfuseOtelSpanAttributes.TRACE_TAGS
          ] as string[]
        )?.length,
      ).toBe(2);
    });

    it("should handle empty tags array", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["tag1"] }, () => {
          propagateAttributes({ tags: [] }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // Should still have tag1 from outer context
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
        "tag1",
      ]);
    });

    it("should propagate tags in baggage mode", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          { tags: ["tag1", "tag2", "tag3"], asBaggage: true },
          () => {
            const currentContext = otelContext.active();
            const baggage = propagation.getBaggage(currentContext);

            expect(baggage).toBeDefined();
            const entries = Array.from(baggage!.getAllEntries());
            const tagsEntry = entries.find(([key]) => key === "langfuse_tags");

            expect(tagsEntry).toBeDefined();
            // Tags should be comma-separated in baggage
            expect(tagsEntry?.[1].value).toBe("tag1,tag2,tag3");

            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
        "tag1",
        "tag2",
        "tag3",
      ]);
    });

    it("should merge tags in baggage mode", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["tag1"], asBaggage: true }, () => {
          propagateAttributes({ tags: ["tag2"], asBaggage: true }, () => {
            const currentContext = otelContext.active();
            const baggage = propagation.getBaggage(currentContext);

            expect(baggage).toBeDefined();
            const entries = Array.from(baggage!.getAllEntries());
            const tagsEntry = entries.find(([key]) => key === "langfuse_tags");

            expect(tagsEntry).toBeDefined();
            // Merged tags should be comma-separated
            expect(tagsEntry?.[1].value).toBe("tag1,tag2");

            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual(
        expect.arrayContaining(["tag1", "tag2"]),
      );
    });

    it("should drop tags over 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const longTag = "x".repeat(201);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ tags: ["valid-tag", longTag] }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
        "valid-tag",
      ]);
    });

    it("should propagate tags with other attributes", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "user123",
            sessionId: "session456",
            tags: ["production", "test"],
            metadata: { env: "prod" },
          },
          () => {
            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user123",
      );
      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("session456");
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_TAGS]).toEqual([
        "production",
        "test",
      ]);
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.env`],
      ).toBe("prod");
    });
  });

  describe("Metadata Merging", () => {
    it("should merge metadata from multiple propagateAttributes calls", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ metadata: { key1: "value1" } }, () => {
          propagateAttributes({ metadata: { key2: "value2" } }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // Child should have both key1 and key2
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key2`],
      ).toBe("value2");
    });

    it("should allow metadata values to be overwritten by subsequent calls", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ metadata: { key1: "value1" } }, () => {
          propagateAttributes({ metadata: { key1: "value2" } }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // Newer value should override
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value2");
    });

    it("should preserve existing metadata when adding new keys", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ metadata: { existing: "value" } }, () => {
          const child1 = startObservation("child-1");
          child1.end();

          propagateAttributes({ metadata: { new: "value2" } }, () => {
            const child2 = startObservation("child-2");
            child2.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const child1 = spans.find((s) => s.name === "child-1");
      const child2 = spans.find((s) => s.name === "child-2");

      // child1 should only have "existing"
      expect(
        child1?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.existing`
        ],
      ).toBe("value");
      expect(
        child1?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.new`],
      ).toBeUndefined();

      // child2 should have both "existing" and "new"
      expect(
        child2?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.existing`
        ],
      ).toBe("value");
      expect(
        child2?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.new`],
      ).toBe("value2");
    });

    it("should merge metadata across nested contexts", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          { metadata: { level: "outer", shared: "outer" } },
          () => {
            const spanOuter1 = startObservation("span-outer-1");
            spanOuter1.end();

            propagateAttributes(
              { metadata: { shared: "inner", extra: "inner" } },
              () => {
                const spanInner = startObservation("span-inner");
                spanInner.end();
              },
            );

            // Back to outer context
            const spanOuter2 = startObservation("span-outer-2");
            spanOuter2.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 4);
      const spans = testEnv.mockExporter.exportedSpans;
      const spanOuter1 = spans.find((s) => s.name === "span-outer-1");
      const spanInner = spans.find((s) => s.name === "span-inner");
      const spanOuter2 = spans.find((s) => s.name === "span-outer-2");

      // spanOuter1: {level: "outer", shared: "outer"}
      expect(
        spanOuter1?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.level`
        ],
      ).toBe("outer");
      expect(
        spanOuter1?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.shared`
        ],
      ).toBe("outer");
      expect(
        spanOuter1?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.extra`
        ],
      ).toBeUndefined();

      // spanInner: {level: "outer", shared: "inner", extra: "inner"}
      expect(
        spanInner?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.level`
        ],
      ).toBe("outer");
      expect(
        spanInner?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.shared`
        ],
      ).toBe("inner");
      expect(
        spanInner?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.extra`
        ],
      ).toBe("inner");

      // spanOuter2: {level: "outer", shared: "outer"} (restored)
      expect(
        spanOuter2?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.level`
        ],
      ).toBe("outer");
      expect(
        spanOuter2?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.shared`
        ],
      ).toBe("outer");
      expect(
        spanOuter2?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.extra`
        ],
      ).toBeUndefined();
    });

    it("should merge metadata from multiple sequential calls in same context", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ metadata: { key1: "value1" } }, () => {
          propagateAttributes({ metadata: { key2: "value2" } }, () => {
            propagateAttributes({ metadata: { key3: "value3" } }, () => {
              const child = startObservation("child");
              child.end();
            });
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // All three keys should be present
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key2`],
      ).toBe("value2");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key3`],
      ).toBe("value3");
    });

    it("should handle empty metadata object in merge", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ metadata: { key1: "value1" } }, () => {
          propagateAttributes({ metadata: {} }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // key1 should still be present
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
    });

    it("should handle undefined metadata in subsequent calls", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ metadata: { key1: "value1" } }, () => {
          propagateAttributes({ userId: "user123" }, () => {
            const child = startObservation("child");
            child.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // Both metadata and userId should be present
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user123",
      );
    });

    it("should merge metadata after some keys were dropped due to validation", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            metadata: { valid: "ok", invalid: "x".repeat(201) },
          },
          () => {
            propagateAttributes({ metadata: { additional: "value" } }, () => {
              const child = startObservation("child");
              child.end();
            });
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // valid and additional should be present, invalid should be dropped
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.valid`],
      ).toBe("ok");
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.additional`
        ],
      ).toBe("value");
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.invalid`
        ],
      ).toBeUndefined();
    });

    it("should merge metadata while updating other attributes", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          { userId: "user1", metadata: { key1: "value1" } },
          () => {
            propagateAttributes(
              { userId: "user2", metadata: { key2: "value2" } },
              () => {
                const child = startObservation("child");
                child.end();
              },
            );
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // userId should be user2 (overwritten), both metadata keys should be present
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user2",
      );
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key2`],
      ).toBe("value2");
    });

    it("should merge metadata when only metadata is being updated", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "user1",
            sessionId: "session1",
            metadata: { key1: "value1" },
          },
          () => {
            propagateAttributes({ metadata: { key2: "value2" } }, () => {
              const child = startObservation("child");
              child.end();
            });
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      // All attributes should be present with merged metadata
      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user1",
      );
      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("session1");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key2`],
      ).toBe("value2");
    });
  });

  describe("Validation", () => {
    it("should drop userId over 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const longUserId = "x".repeat(201);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ userId: longUserId }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID],
      ).toBeUndefined();
    });

    it("should accept userId exactly 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const userId200 = "x".repeat(200);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ userId: userId200 }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        userId200,
      );
    });

    it("should drop sessionId over 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const longSessionId = "y".repeat(201);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ sessionId: longSessionId }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBeUndefined();
    });

    it("should drop version over 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const longVersion = "v".repeat(201);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ version: longVersion }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[LangfuseOtelSpanAttributes.VERSION],
      ).toBeUndefined();
    });

    it("should accept version exactly 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const version200 = "v".repeat(200);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ version: version200 }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.VERSION]).toBe(
        version200,
      );
    });

    it("should drop metadata values over 200 characters", async () => {
      const tracer = otelTrace.getTracer("test");
      const longValue = "z".repeat(201);

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            metadata: { key: longValue },
          },
          () => {
            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key`],
      ).toBeUndefined();
    });

    it("should drop non-string userId", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ userId: 12345 as any }, () => {
          const child = startObservation("child");
          child.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID],
      ).toBeUndefined();
    });

    it("should keep valid metadata and drop invalid", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            metadata: {
              valid_key: "valid_value",
              invalid_key: "x".repeat(201),
              another_valid: "ok",
            },
          },
          () => {
            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.valid_key`
        ],
      ).toBe("valid_value");
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.another_valid`
        ],
      ).toBe("ok");
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.invalid_key`
        ],
      ).toBeUndefined();
    });
  });

  describe("Baggage Propagation", () => {
    it("should merge metadata in baggage mode", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          { metadata: { key1: "value1" }, asBaggage: true },
          () => {
            propagateAttributes(
              { metadata: { key2: "value2" }, asBaggage: true },
              () => {
                const currentContext = otelContext.active();
                const baggage = propagation.getBaggage(currentContext);

                expect(baggage).toBeDefined();
                const entries = Array.from(baggage!.getAllEntries());
                const baggageKeys = entries.map(([key]) => key);

                // Both metadata keys should be in baggage
                expect(baggageKeys).toContain("langfuse_metadata_key1");
                expect(baggageKeys).toContain("langfuse_metadata_key2");

                const key1Entry = entries.find(
                  ([key]) => key === "langfuse_metadata_key1",
                );
                expect(key1Entry?.[1].value).toBe("value1");

                const key2Entry = entries.find(
                  ([key]) => key === "langfuse_metadata_key2",
                );
                expect(key2Entry?.[1].value).toBe("value2");

                // Child span should also have both metadata keys
                const child = startObservation("child");
                child.end();
              },
            );
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(
        child?.attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key2`],
      ).toBe("value2");
    });

    it("should set baggage when asBaggage=true", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "user_123",
            sessionId: "session_abc",
            version: "v2.0",
            metadata: { env: "test", region: "us-east" },
            asBaggage: true,
          },
          () => {
            // Get current context and inspect baggage
            const currentContext = otelContext.active();
            const baggage = propagation.getBaggage(currentContext);

            expect(baggage).toBeDefined();
            const entries = Array.from(baggage!.getAllEntries());

            // Check baggage keys exist
            const baggageKeys = entries.map(([key]) => key);
            expect(baggageKeys).toContain("langfuse_user_id");
            expect(baggageKeys).toContain("langfuse_session_id");
            expect(baggageKeys).toContain("langfuse_version");
            expect(baggageKeys).toContain("langfuse_metadata_env");
            expect(baggageKeys).toContain("langfuse_metadata_region");

            // Check baggage values
            const userIdEntry = entries.find(
              ([key]) => key === "langfuse_user_id",
            );
            expect(userIdEntry?.[1].value).toBe("user_123");

            const sessionIdEntry = entries.find(
              ([key]) => key === "langfuse_session_id",
            );
            expect(sessionIdEntry?.[1].value).toBe("session_abc");

            const versionEntry = entries.find(
              ([key]) => key === "langfuse_version",
            );
            expect(versionEntry?.[1].value).toBe("v2.0");

            const envEntry = entries.find(
              ([key]) => key === "langfuse_metadata_env",
            );
            expect(envEntry?.[1].value).toBe("test");
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 1);
    });

    it("should propagate attributes from baggage to child spans", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "baggage_user",
            sessionId: "baggage_session",
            version: "v1.0-baggage",
            metadata: { source: "baggage" },
            asBaggage: true,
          },
          () => {
            const child = startObservation("child");
            child.end();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 2);
      const spans = testEnv.mockExporter.exportedSpans;
      const child = spans.find((s) => s.name === "child");

      expect(child?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "baggage_user",
      );
      expect(
        child?.attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID],
      ).toBe("baggage_session");
      expect(child?.attributes[LangfuseOtelSpanAttributes.VERSION]).toBe(
        "v1.0-baggage",
      );
      expect(
        child?.attributes[
          `${LangfuseOtelSpanAttributes.TRACE_METADATA}.source`
        ],
      ).toBe("baggage");
    });

    it("should not set baggage when asBaggage=false (default)", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "user_123",
            sessionId: "session_abc",
          },
          () => {
            const currentContext = otelContext.active();
            const baggage = propagation.getBaggage(currentContext);

            expect(baggage).toBeUndefined();
          },
        );
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 1);
    });
  });

  describe("Nesting and Context Isolation", () => {
    it("should allow nested contexts with different values", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ userId: "user1" }, () => {
          const span1 = startObservation("span-1");
          span1.end();

          propagateAttributes({ userId: "user2" }, () => {
            const span2 = startObservation("span-2");
            span2.end();
          });
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 3);
      const spans = testEnv.mockExporter.exportedSpans;
      const span1 = spans.find((s) => s.name === "span-1");
      const span2 = spans.find((s) => s.name === "span-2");

      expect(span1?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user1",
      );
      expect(span2?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user2",
      );
    });

    it("should restore outer context after inner context exits", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes({ userId: "user1" }, () => {
          const span1 = startObservation("span-1");
          span1.end();

          propagateAttributes({ userId: "user2" }, () => {
            const span2 = startObservation("span-2");
            span2.end();
          });

          // Back to outer context
          const span3 = startObservation("span-3");
          span3.end();
        });
        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 4);
      const spans = testEnv.mockExporter.exportedSpans;
      const span1 = spans.find((s) => s.name === "span-1");
      const span2 = spans.find((s) => s.name === "span-2");
      const span3 = spans.find((s) => s.name === "span-3");

      expect(span1?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user1",
      );
      expect(span2?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user2",
      );
      expect(span3?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "user1",
      );
    });

    it("should not propagate to spans outside context", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        // Span before propagation
        const beforeSpan = startObservation("before");
        beforeSpan.end();

        propagateAttributes({ userId: "user_123" }, () => {
          const insideSpan = startObservation("inside");
          insideSpan.end();
        });

        // Span after propagation context exits
        const afterSpan = startObservation("after");
        afterSpan.end();

        parentSpan.end();
      });

      await waitForSpanExport(testEnv.mockExporter, 4);
      const spans = testEnv.mockExporter.exportedSpans;
      const beforeSpan = spans.find((s) => s.name === "before");
      const insideSpan = spans.find((s) => s.name === "inside");
      const afterSpan = spans.find((s) => s.name === "after");

      expect(
        beforeSpan?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID],
      ).toBeUndefined();
      expect(
        insideSpan?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID],
      ).toBe("user_123");
      expect(
        afterSpan?.attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID],
      ).toBeUndefined();
    });
  });

  describe("getPropagatedAttributesFromContext", () => {
    it("should read userId from context", () => {
      const context = ROOT_CONTEXT.setValue(
        LangfuseOtelContextKeys["userId"],
        "test_user",
      );
      const attributes = getPropagatedAttributesFromContext(context);

      expect(attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "test_user",
      );
    });

    it("should read sessionId from context", () => {
      const context = ROOT_CONTEXT.setValue(
        LangfuseOtelContextKeys["sessionId"],
        "test_session",
      );
      const attributes = getPropagatedAttributesFromContext(context);

      expect(attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID]).toBe(
        "test_session",
      );
    });

    it("should read version from context", () => {
      const context = ROOT_CONTEXT.setValue(
        LangfuseOtelContextKeys["version"],
        "v3.1.4",
      );
      const attributes = getPropagatedAttributesFromContext(context);

      expect(attributes[LangfuseOtelSpanAttributes.VERSION]).toBe("v3.1.4");
    });

    it("should read metadata from context", () => {
      const context = ROOT_CONTEXT.setValue(
        LangfuseOtelContextKeys["metadata"],
        {
          key1: "value1",
          key2: "value2",
        },
      );
      const attributes = getPropagatedAttributesFromContext(context);

      expect(
        attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key1`],
      ).toBe("value1");
      expect(
        attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.key2`],
      ).toBe("value2");
    });

    it("should read attributes from baggage", () => {
      let baggage = propagation.createBaggage();
      baggage = baggage.setEntry("langfuse_user_id", { value: "baggage_user" });
      baggage = baggage.setEntry("langfuse_session_id", {
        value: "baggage_session",
      });
      baggage = baggage.setEntry("langfuse_version", { value: "v2.5.1" });
      baggage = baggage.setEntry("langfuse_metadata_env", { value: "prod" });

      const context = propagation.setBaggage(ROOT_CONTEXT, baggage);
      const attributes = getPropagatedAttributesFromContext(context);

      expect(attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "baggage_user",
      );
      expect(attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID]).toBe(
        "baggage_session",
      );
      expect(attributes[LangfuseOtelSpanAttributes.VERSION]).toBe("v2.5.1");
      expect(
        attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.env`],
      ).toBe("prod");
    });

    it("should return empty object for context with no propagated attributes", () => {
      const attributes = getPropagatedAttributesFromContext(ROOT_CONTEXT);

      expect(Object.keys(attributes)).toHaveLength(0);
    });
  });
});
