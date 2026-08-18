import { ExperimentManager } from "@langfuse/client";
import { getGlobalLogger } from "@langfuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function createManager(): ExperimentManager {
  return new ExperimentManager({
    langfuseClient: {
      score: {
        create: vi.fn(),
        flush: vi.fn().mockResolvedValue(undefined),
      },
    } as never,
  });
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
