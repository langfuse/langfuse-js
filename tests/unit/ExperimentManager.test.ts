import { ExperimentManager } from "@langfuse/client";
import { createStableExperimentId, getGlobalLogger } from "@langfuse/core";
import { trace } from "@opentelemetry/api";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BasicTracerProvider,
  type Sampler,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function registerTracerProvider(sampler: Sampler = new AlwaysOnSampler()) {
  trace.disable();
  trace.setGlobalTracerProvider(new BasicTracerProvider({ sampler }));
}

function createLangfuseClientMock(
  getProjectId: () => Promise<string> = async () => "project-1",
) {
  const datasetRunItemsCreate = vi.fn();

  return {
    score: {
      create: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    },
    getProjectId: vi.fn(getProjectId),
    getExperimentUrl: vi.fn(
      async (experimentId: string) =>
        `https://langfuse.test/project/${await getProjectId()}/experiments/results?baseline=${experimentId}`,
    ),
    api: { datasetRunItems: { create: datasetRunItemsCreate } },
  };
}

function createManager(
  langfuseClient = createLangfuseClientMock(),
): ExperimentManager {
  return new ExperimentManager({ langfuseClient: langfuseClient as never });
}

function datasetItem(id: string, input: string, datasetId = "dataset-1") {
  return {
    id,
    datasetId,
    input,
    expectedOutput: `${input}-expected`,
  } as never;
}

describe("ExperimentManager concurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts the next item as soon as any in-flight item settles", async () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => {});

    const gates = new Map(
      ["first", "slow", "third", "fourth"].map((input) => [
        input,
        deferred<string>(),
      ]),
    );
    const started: string[] = [];
    let activeTasks = 0;
    let maxActiveTasks = 0;

    const runPromise = createManager().run({
      name: "rolling-concurrency",
      runName: "rolling-concurrency",
      data: Array.from(gates.keys(), (input) => ({ input })),
      maxConcurrency: 2,
      task: async ({ input }) => {
        started.push(input);
        activeTasks += 1;
        maxActiveTasks = Math.max(maxActiveTasks, activeTasks);

        const output = await gates.get(input)!.promise;
        activeTasks -= 1;
        return output;
      },
    });

    try {
      await vi.waitFor(() => expect([...started]).toEqual(["first", "slow"]));

      gates.get("first")!.resolve("first-output");
      await vi.waitFor(() =>
        expect([...started]).toEqual(["first", "slow", "third"]),
      );
      expect(activeTasks).toBe(2);

      gates.get("third")!.resolve("third-output");
      await vi.waitFor(() =>
        expect([...started]).toEqual(["first", "slow", "third", "fourth"]),
      );
      expect(activeTasks).toBe(2);

      gates.get("fourth")!.resolve("fourth-output");
      gates.get("slow")!.resolve("slow-output");

      const result = await runPromise;

      expect(maxActiveTasks).toBe(2);
      expect(result.itemResults.map(({ item }) => item.input)).toEqual([
        "first",
        "slow",
        "third",
        "fourth",
      ]);
    } finally {
      gates.forEach((gate, input) => gate.resolve(`${input}-output`));
      await runPromise;
    }
  });
});

describe("ExperimentManager experiment ids", () => {
  beforeEach(() => {
    registerTracerProvider();
  });

  afterEach(() => {
    trace.disable();
    vi.restoreAllMocks();
  });

  it("derives a stable experiment id for dataset runs without per-item API calls", async () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => {});
    const langfuseClient = createLangfuseClientMock();

    const run = () =>
      createManager(langfuseClient).run({
        name: "dataset-run",
        runName: "my-run",
        data: [datasetItem("item-1", "a"), datasetItem("item-2", "b")],
        task: async ({ input }) => input,
      });

    const first = await run();
    const second = await run();

    const expectedId = await createStableExperimentId({
      projectId: "project-1",
      datasetId: "dataset-1",
      runName: "my-run",
    });
    expect(first.experimentId).toBe(expectedId);
    expect(second.experimentId).toBe(expectedId);
    expect(first.datasetRunId).toBe(expectedId);
    expect(first.itemResults.map((r) => r.datasetRunId)).toEqual([
      expectedId,
      expectedId,
    ]);
    expect(first.experimentUrl).toBe(
      `https://langfuse.test/project/project-1/experiments/results?baseline=${expectedId}`,
    );
    expect(first.datasetRunUrl).toBe(first.experimentUrl);
    expect(langfuseClient.api.datasetRunItems.create).not.toHaveBeenCalled();
  });

  it("uses a random experiment id for local data and still scores the run", async () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => {});
    const langfuseClient = createLangfuseClientMock();

    const result = await createManager(langfuseClient).run({
      name: "local-run",
      data: [{ input: "a" }, { input: "b" }],
      task: async ({ input }) => input,
      runEvaluators: [async () => ({ name: "run-score", value: 1 })],
    });

    expect(result.experimentId).toMatch(/^[0-9a-f]{16}$/);
    expect(result.datasetRunId).toBeUndefined();
    expect(result.datasetRunUrl).toBeUndefined();
    expect(result.experimentUrl).toBe(
      `https://langfuse.test/project/project-1/experiments/results?baseline=${result.experimentId}`,
    );
    expect(langfuseClient.score.create).toHaveBeenCalledWith({
      datasetRunId: result.experimentId,
      name: "run-score",
      value: 1,
    });
  });

  it("falls back to a random experiment id when the project id lookup fails", async () => {
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => {});
    const langfuseClient = createLangfuseClientMock(async () => {
      throw new Error("unauthorized");
    });

    const result = await createManager(langfuseClient).run({
      name: "dataset-run",
      runName: "my-run",
      data: [datasetItem("item-1", "a")],
      task: async ({ input }) => input,
    });

    expect(result.experimentId).toMatch(/^[0-9a-f]{16}$/);
    expect(result.experimentId).not.toBe(
      await createStableExperimentId({
        projectId: "project-1",
        datasetId: "dataset-1",
        runName: "my-run",
      }),
    );
    expect(result.experimentUrl).toBeUndefined();
    expect(result.itemResults).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch the Langfuse project ID"),
      expect.any(Error),
    );
  });

  it("gives each dataset its own experiment id when data mixes datasets", async () => {
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => {});

    const result = await createManager().run({
      name: "mixed-run",
      runName: "my-run",
      data: [
        datasetItem("item-1", "a", "dataset-1"),
        datasetItem("item-2", "b", "dataset-2"),
      ],
      task: async ({ input }) => input,
    });

    const [first, second] = await Promise.all(
      ["dataset-1", "dataset-2"].map((datasetId) =>
        createStableExperimentId({
          projectId: "project-1",
          datasetId,
          runName: "my-run",
        }),
      ),
    );
    expect(result.experimentId).toBe(first);
    expect(result.itemResults.map((r) => r.datasetRunId)).toEqual([
      first,
      second,
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("items from 2 datasets"),
    );
  });

  it("starts local-data items without waiting for the project id lookup", async () => {
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => {});
    const lookup = deferred<string>();
    const langfuseClient = createLangfuseClientMock(() => lookup.promise);
    let taskStarted = false;

    const runPromise = createManager(langfuseClient).run({
      name: "local-run",
      data: [{ input: "a" }],
      task: async ({ input }) => {
        taskStarted = true;
        return input;
      },
    });

    await vi.waitFor(() => expect(taskStarted).toBe(true));
    lookup.resolve("project-1");
    const result = await runPromise;

    expect(result.experimentUrl).toBe(
      `https://langfuse.test/project/project-1/experiments/results?baseline=${result.experimentId}`,
    );
  });
});

describe("ExperimentManager without exported traces", () => {
  afterEach(() => {
    trace.disable();
    vi.restoreAllMocks();
  });

  it("skips run-level scores when every item was sampled out", async () => {
    registerTracerProvider(new AlwaysOffSampler());
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => {});
    const langfuseClient = createLangfuseClientMock();

    const result = await createManager(langfuseClient).run({
      name: "sampled-out-run",
      data: [{ input: "a" }, { input: "b" }],
      task: async ({ input }) => input,
      runEvaluators: [async () => ({ name: "run-score", value: 1 })],
    });

    expect(result.runEvaluations).toEqual([{ name: "run-score", value: 1 }]);
    expect(langfuseClient.score.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ datasetRunId: expect.anything() }),
    );
  });

  it("does not look up the project id when tracing is disabled", async () => {
    trace.disable();
    vi.spyOn(getGlobalLogger(), "warn").mockImplementation(() => {});
    const langfuseClient = createLangfuseClientMock();

    const result = await createManager(langfuseClient).run({
      name: "untraced-run",
      runName: "my-run",
      data: [datasetItem("item-1", "a")],
      task: async ({ input }) => input,
    });

    expect(langfuseClient.getProjectId).not.toHaveBeenCalled();
    expect(result.experimentUrl).toBeUndefined();
    expect(result.itemResults).toHaveLength(1);
  });
});
