import { ScoreManager } from "@langfuse/client";
import {
  configureGlobalLogger,
  getGlobalLogger,
  LangfuseAPIClient,
  LogLevel,
  resetGlobalLogger,
  type ScoreBody,
} from "@langfuse/core";
import {
  context,
  ROOT_CONTEXT,
  trace,
  type ContextManager,
  type Span,
} from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ScoreManager input handling", () => {
  let batch: ReturnType<typeof vi.fn>;
  let scoreManager: ScoreManager;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetGlobalLogger();
    errorSpy = vi.spyOn(getGlobalLogger(), "error");
    batch = vi.fn().mockResolvedValue({ successes: [], errors: [] });
    scoreManager = new ScoreManager({
      apiClient: { ingestion: { batch } } as unknown as LangfuseAPIClient,
    });
  });

  afterEach(async () => {
    await scoreManager.shutdown();
    context.disable();
    vi.restoreAllMocks();
    resetGlobalLogger();
  });

  async function sentScores(): Promise<ScoreBody[]> {
    await scoreManager.flush();

    return batch.mock.calls.flatMap(([request]) =>
      request.batch.map((event: { body: ScoreBody }) => event.body),
    );
  }

  it.each([
    ["undefined data", undefined],
    ["null data", null],
    ["a non-object", "quality"],
    ["a missing name", { value: 1 }],
    ["an empty name", { name: "", value: 1 }],
    ["a non-string name", { name: 42, value: 1 }],
    ["a missing value", { name: "quality" }],
    ["a boolean value", { name: "quality", value: true }],
    ["a NaN value", { name: "quality", value: Number.NaN }],
    ["an infinite value", { name: "quality", value: Infinity }],
    ["an object value", { name: "quality", value: { score: 1 } }],
  ])("logs and drops a score with %s", async (_, data) => {
    expect(() =>
      scoreManager.create(data as unknown as ScoreBody),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^Invalid score: .*Dropping score\.$/),
    );
    expect(await sentScores()).toEqual([]);
  });

  it("keeps valid numeric and string scores", async () => {
    scoreManager.create({ name: "numeric", value: 0 });
    scoreManager.create({ name: "categorical", value: "good" });

    expect(errorSpy).not.toHaveBeenCalled();
    expect((await sentScores()).map((score) => score.name)).toEqual([
      "numeric",
      "categorical",
    ]);
  });

  it("logs instead of throwing when the span is missing or invalid", () => {
    const data = { name: "quality", value: 1 };
    const brokenSpan = {
      spanContext: () => {
        throw new Error("broken span");
      },
    } as unknown as Span;

    expect(() =>
      scoreManager.observation(
        undefined as unknown as { otelSpan: Span },
        data,
      ),
    ).not.toThrow();
    expect(() =>
      scoreManager.trace({ otelSpan: undefined as unknown as Span }, data),
    ).not.toThrow();
    expect(() =>
      scoreManager.observation({ otelSpan: brokenSpan }, data),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(3);
  });

  it("logs instead of throwing for invalid data on active-span helpers", () => {
    const activeContext = trace.setSpan(
      ROOT_CONTEXT,
      trace.wrapSpanContext({
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "0123456789abcdef",
        traceFlags: 1,
      }),
    );
    const contextManager: ContextManager = {
      active: () => activeContext,
      with: (_ctx, fn, thisArg, ...args) => fn.call(thisArg, ...args),
      bind: (_ctx, target) => target,
      enable() {
        return this;
      },
      disable() {
        return this;
      },
    };
    context.setGlobalContextManager(contextManager);

    expect(() =>
      scoreManager.activeObservation(null as unknown as ScoreBody),
    ).not.toThrow();
    expect(() =>
      scoreManager.activeTrace({ name: "", value: 1 }),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("logs and drops a score whose data cannot be serialized for debug logging", async () => {
    configureGlobalLogger({ level: LogLevel.DEBUG });
    const debugErrorSpy = vi.spyOn(getGlobalLogger(), "error");
    const metadata: Record<string, unknown> = {};
    metadata.self = metadata;

    expect(() =>
      scoreManager.create({ name: "quality", value: 1, metadata }),
    ).not.toThrow();

    expect(debugErrorSpy).toHaveBeenCalledWith(
      "Failed to create score. Dropping score.",
      expect.any(TypeError),
    );
    expect(await sentScores()).toEqual([]);
  });
});
