/**
 * Comprehensive tests for propagateAttributes functionality.
 *
 * This module tests the propagateAttributes function that allows setting
 * trace-level attributes (userId, sessionId, metadata) that automatically propagate
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
    it("should set baggage when asBaggage=true", async () => {
      const tracer = otelTrace.getTracer("test");

      await tracer.startActiveSpan("parent", async (parentSpan) => {
        propagateAttributes(
          {
            userId: "user_123",
            sessionId: "session_abc",
            metadata: { env: "test", version: "2.0" },
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
            expect(baggageKeys).toContain("langfuse_metadata_env");
            expect(baggageKeys).toContain("langfuse_metadata_version");

            // Check baggage values
            const userIdEntry = entries.find(
              ([key]) => key === "langfuse_user_id",
            );
            expect(userIdEntry?.[1].value).toBe("user_123");

            const sessionIdEntry = entries.find(
              ([key]) => key === "langfuse_session_id",
            );
            expect(sessionIdEntry?.[1].value).toBe("session_abc");

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
      baggage = baggage.setEntry("langfuse_metadata_env", { value: "prod" });

      const context = propagation.setBaggage(ROOT_CONTEXT, baggage);
      const attributes = getPropagatedAttributesFromContext(context);

      expect(attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID]).toBe(
        "baggage_user",
      );
      expect(attributes[LangfuseOtelSpanAttributes.TRACE_SESSION_ID]).toBe(
        "baggage_session",
      );
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
