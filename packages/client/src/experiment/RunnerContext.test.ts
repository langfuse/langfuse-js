import { describe, expect, it, vi } from "vitest";

import type { LangfuseClient } from "../LangfuseClient.js";

import { RegressionError, RunnerContext } from "./RunnerContext.js";
import type { ExperimentResult } from "./types.js";

function createResult(): ExperimentResult {
  return {
    experimentId: "exp-1",
    runName: "run-1",
    itemResults: [],
    runEvaluations: [],
    format: vi.fn(async () => "formatted"),
  };
}

function createContext(params?: {
  data?: { input?: string; expectedOutput?: string }[];
  datasetVersion?: string;
  metadata?: Record<string, any>;
}) {
  const run = vi.fn();
  const client = {
    experiment: { run },
  } as unknown as LangfuseClient;

  return {
    run,
    ctx: new RunnerContext({
      client,
      data: params?.data,
      datasetVersion: params?.datasetVersion,
      metadata: params?.metadata,
    }),
  };
}

describe("RunnerContext", () => {
  it("uses context defaults when call-time values are omitted", async () => {
    const result = createResult();
    const { ctx, run } = createContext({
      data: [{ input: "ctx" }],
      datasetVersion: "2026-01-01T00:00:00.000Z",
      metadata: { sha: "abc" },
    });
    run.mockResolvedValue(result);

    await expect(
      ctx.runExperiment({
        name: "exp",
        task: async () => "output",
      }),
    ).resolves.toBe(result);

    expect(run).toHaveBeenCalledWith({
      name: "exp",
      task: expect.any(Function),
      data: [{ input: "ctx" }],
      datasetVersion: "2026-01-01T00:00:00.000Z",
      metadata: { sha: "abc" },
    });
  });

  it("lets call-time overrides win", async () => {
    const result = createResult();
    const { ctx, run } = createContext({
      data: [{ input: "ctx" }],
      datasetVersion: "2026-01-01T00:00:00.000Z",
      metadata: { sha: "abc" },
    });
    const overrideData = [{ input: "override" }];
    run.mockResolvedValue(result);

    await ctx.runExperiment({
      name: "exp",
      runName: "call-run",
      data: overrideData,
      datasetVersion: "2026-06-06T00:00:00.000Z",
      metadata: { sha: "def", pr: 42 },
      task: async () => "output",
    });

    expect(run).toHaveBeenCalledWith({
      name: "exp",
      runName: "call-run",
      data: overrideData,
      datasetVersion: "2026-06-06T00:00:00.000Z",
      metadata: { sha: "def", pr: 42 },
      task: expect.any(Function),
    });
  });

  it("merges metadata with call-time keys winning on collision", async () => {
    const { ctx, run } = createContext({
      data: [{ input: "ctx" }],
      metadata: { sha: "abc", branch: "main" },
    });
    run.mockResolvedValue(createResult());

    await ctx.runExperiment({
      name: "exp",
      metadata: { sha: "def", pr: 42 },
      task: async () => "output",
    });

    expect(run).toHaveBeenCalledWith({
      name: "exp",
      data: [{ input: "ctx" }],
      datasetVersion: undefined,
      metadata: { sha: "def", branch: "main", pr: 42 },
      task: expect.any(Function),
    });
  });

  it("keeps metadata undefined when neither side provides it", async () => {
    const { ctx, run } = createContext({
      data: [{ input: "ctx" }],
    });
    run.mockResolvedValue(createResult());

    await ctx.runExperiment({
      name: "exp",
      task: async () => "output",
    });

    expect(run).toHaveBeenCalledWith({
      name: "exp",
      data: [{ input: "ctx" }],
      datasetVersion: undefined,
      metadata: undefined,
      task: expect.any(Function),
    });
  });

  it("throws when data is missing on both the context and the call", async () => {
    const { ctx } = createContext();

    await expect(
      ctx.runExperiment({
        name: "exp",
        task: async () => "output",
      }),
    ).rejects.toThrow(
      "`data` must be provided either on the RunnerContext or the runExperiment call",
    );
  });
});

describe("RegressionError", () => {
  it("is an error and stores the result", () => {
    const result = createResult();
    const error = new RegressionError({ result });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RegressionError");
    expect(error.result).toBe(result);
  });

  it("uses the default message when no details are provided", () => {
    const error = new RegressionError({ result: createResult() });

    expect(error.message).toBe("Experiment regression detected");
    expect(error.metric).toBeUndefined();
    expect(error.value).toBeUndefined();
    expect(error.threshold).toBeUndefined();
  });

  it("renders a structured message when metric and value are provided", () => {
    const error = new RegressionError({
      result: createResult(),
      metric: "avg_accuracy",
      value: 0.78,
      threshold: 0.9,
    });

    expect(error.metric).toBe("avg_accuracy");
    expect(error.value).toBe(0.78);
    expect(error.threshold).toBe(0.9);
    expect(error.message).toBe(
      "Regression on `avg_accuracy`: 0.78 (threshold 0.9)",
    );
  });

  it("lets an explicit message win over the structured format", () => {
    const error = new RegressionError({
      result: createResult(),
      metric: "avg_accuracy",
      value: 0.5,
      threshold: 0.9,
      message: "custom explanation",
    });

    expect(error.message).toBe("custom explanation");
    expect(error.metric).toBe("avg_accuracy");
    expect(error.value).toBe(0.5);
    expect(error.threshold).toBe(0.9);
  });

  it("falls back to the default message for partial structured input", () => {
    const error = new RegressionError({
      result: createResult(),
      metric: "avg_accuracy",
    });

    expect(error.message).toBe("Experiment regression detected");
  });
});
