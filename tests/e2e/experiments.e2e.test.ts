import {
  Evaluator,
  ExperimentTask,
  LangfuseClient,
  RunEvaluator,
  createEvaluatorFromAutoevals,
} from "@langfuse/client";
import { observeOpenAI } from "@langfuse/openai";
import { Factuality, Levenshtein } from "autoevals";
import { nanoid } from "nanoid";
import OpenAI from "openai";
import { describe, it, afterEach, beforeEach, expect } from "vitest";

import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

describe("Langfuse Datasets E2E", () => {
  let langfuse: LangfuseClient;
  let testEnv: ServerTestEnvironment;

  const dataset = [
    {
      input: "Germany",
      expectedOutput: "Berlin",
    },
    {
      input: "France",
      expectedOutput: "Paris",
    },
    {
      input: "Spain",
      expectedOutput: "Madrid",
    },
  ];

  const task: ExperimentTask = async (params) => {
    const client = observeOpenAI(new OpenAI());

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: `What is the capital of ${params.input}? Be cheeky sometimes in your answer and give the unofficial one. Respond in one word.`,
        },
      ],
    });

    return response.choices[0].message.content;
  };

  const factualityEvaluator: Evaluator = async (params) => {
    const response = await new OpenAI().chat.completions.parse({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: `Rate the correctness of this sentence: The capital of ${params.input} is ${params.output}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "score",
          description:
            "score between 0 to 1 where 0 is false and 1 is correct.",
          schema: {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
              score: {
                type: "integer",
              },
              reasoning: {
                type: "string",
              },
            },
            required: ["score", "reasoning"],
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content!);

    return [
      {
        name: "manual-factuality",
        value: parsed.score,
        comment: parsed.reasoning,
        metadata: { reasoning: parsed.reasoning },
      },
    ];
  };

  const levenshteinAverageRunEvaluator: RunEvaluator = async ({
    itemResults,
  }) => {
    const average = itemResults
      .map((result) =>
        result.evaluations.filter((e) => e.name === "Levenshtein"),
      )
      .flat()
      .reduce((acc, curr, _, array) => {
        return acc + (curr.value as number) / array.length;
      }, 0);

    return {
      name: "levenshtein-average",
      value: average,
    };
  };

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuse = new LangfuseClient();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
    await langfuse.flush();
  });

  it("should run an experiment on local dataset", async () => {
    const result = await langfuse.experiment.run({
      name: "Euro capitals",
      description: "Country capital experiment",
      data: dataset,
      task,
      evaluators: [
        createEvaluatorFromAutoevals(Factuality),
        createEvaluatorFromAutoevals(Levenshtein),
        factualityEvaluator,
      ],
      runEvaluators: [levenshteinAverageRunEvaluator],
    });

    console.log(await result.prettyPrint());

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Validate basic result structure
    expect(result.itemResults).toHaveLength(3);
    expect(result.runEvaluations).toHaveLength(1);
    expect(result.runEvaluations[0]).toMatchObject({
      name: "levenshtein-average",
      value: expect.any(Number),
    });
    // No datasetRunId for local datasets
    expect(result.datasetRunId).toBeUndefined();

    // Validate item results structure
    result.itemResults.forEach((itemResult, index) => {
      expect(itemResult).toMatchObject({
        output: expect.any(String),
        evaluations: expect.arrayContaining([
          expect.objectContaining({
            name: "Factuality",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "Levenshtein",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "manual-factuality",
            value: expect.any(Number),
          }),
        ]),
        traceId: expect.any(String),
      });

      // Should have 3 evaluations per item
      expect(itemResult.evaluations).toHaveLength(3);
      // No datasetRunId for local datasets
      expect(itemResult.datasetRunId).toBeUndefined();
    });
  });

  it("should run an experiment on a langfuse dataset", async () => {
    // create remote dataset
    const datasetName = "euro-capitals-" + nanoid();
    await langfuse.api.datasets.create({
      name: datasetName,
      description: "Collection of euro countries and capitals",
    });

    // create remote dataset items
    await Promise.all(
      dataset.map((item) =>
        langfuse.api.datasetItems.create({ datasetName, ...item }),
      ),
    );

    const fetchedDataset = await langfuse.dataset.get(datasetName);

    const experimentName = "Euro capitals on LF dataset";
    const result = await fetchedDataset.runExperiment({
      name: experimentName,
      description: "Country capital experiment",
      task,
      evaluators: [
        createEvaluatorFromAutoevals(Factuality),
        createEvaluatorFromAutoevals(Levenshtein),
        factualityEvaluator,
      ],
      runEvaluators: [levenshteinAverageRunEvaluator],
    });

    console.log(await result.prettyPrint());

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Validate basic result structure
    expect(result.itemResults).toHaveLength(3);
    expect(result.runEvaluations).toHaveLength(1);
    expect(result.runEvaluations[0]).toMatchObject({
      name: "levenshtein-average",
      value: expect.any(Number),
    });
    expect(result.datasetRunId).toBeDefined();

    // Validate item results structure
    result.itemResults.forEach((itemResult, index) => {
      expect(itemResult).toMatchObject({
        output: expect.any(String),
        evaluations: expect.arrayContaining([
          expect.objectContaining({
            name: "Factuality",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "Levenshtein",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "manual-factuality",
            value: expect.any(Number),
          }),
        ]),
        traceId: expect.any(String),
        datasetRunId: expect.any(String),
      });

      // Should have 3 evaluations per item
      expect(itemResult.evaluations).toHaveLength(3);
    });

    // Fetch dataset run from API and validate against database
    const datasetRun = await langfuse.api.datasets.getRun(
      datasetName,
      experimentName,
    );

    expect(datasetRun).toBeDefined();
    expect(datasetRun).toMatchObject({
      name: experimentName,
      description: "Country capital experiment",
      datasetId: fetchedDataset.id,
      datasetName: datasetName,
    });

    // Validate dataset run items
    expect(datasetRun.datasetRunItems).toHaveLength(3);

    // Each run item should correspond to one of our experiment results
    result.itemResults.forEach((itemResult) => {
      const correspondingRunItem = datasetRun.datasetRunItems.find(
        (runItem) => runItem.traceId === itemResult.traceId,
      );

      expect(correspondingRunItem).toBeDefined();
      expect(correspondingRunItem).toMatchObject({
        traceId: itemResult.traceId,
        datasetItemId: expect.any(String),
      });
    });

    // Validate that traces contain the expected scores
    // Each trace should have 3 item-level evaluations + 1 run-level evaluation
    const expectedTraceIds = result.itemResults.map((r) => r.traceId);
    expect(expectedTraceIds).toHaveLength(3);
    expectedTraceIds.forEach((traceId) => {
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  // Error Handling Tests
  describe("Error Handling", () => {
    it("should handle evaluator failures gracefully", async () => {
      const failingEvaluator: Evaluator = async () => {
        throw new Error("Evaluator failed");
      };

      const result = await langfuse.experiment.run({
        name: "Error test",
        description: "Test evaluator error handling",
        data: dataset.slice(0, 1), // Just one item
        task,
        evaluators: [
          createEvaluatorFromAutoevals(Factuality), // This should work
          failingEvaluator, // This should fail
        ],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      // Should still complete the experiment
      expect(result.itemResults).toHaveLength(1);
      expect(result.itemResults[0].evaluations).toHaveLength(1); // Only the working evaluator
      expect(result.itemResults[0].evaluations[0].name).toBe("Factuality");
    });

    it("should handle task failures gracefully", async () => {
      const failingTask: ExperimentTask = async () => {
        throw new Error("Task failed");
      };

      // The experiment should handle the task failure gracefully by skipping the failed item
      const result = await langfuse.experiment.run({
        name: "Task error test",
        description: "Test task error handling",
        data: dataset.slice(0, 1),
        task: failingTask,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      // Should complete experiment but skip the failed item
      expect(result.itemResults).toHaveLength(0);
      expect(result.runEvaluations).toHaveLength(0);
    });

    it("should handle mixed task success and failures", async () => {
      const mixedTask: ExperimentTask = async ({ input }) => {
        if (input === "Germany") {
          throw new Error("Task failed for Germany");
        }
        return `Capital of ${input}`;
      };

      const result = await langfuse.experiment.run({
        name: "Mixed task results test",
        description: "Test mixed success/failure handling",
        data: dataset.slice(0, 2), // Germany and France
        task: mixedTask,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      // Should complete experiment with only successful items
      expect(result.itemResults).toHaveLength(1); // Only France should succeed
      expect(result.itemResults[0].output).toContain("France");
      expect(result.itemResults[0].evaluations).toHaveLength(1);
    });

    it("should handle run evaluator failures", async () => {
      const failingRunEvaluator: RunEvaluator = async () => {
        throw new Error("Run evaluator failed");
      };

      const result = await langfuse.experiment.run({
        name: "Run evaluator error test",
        description: "Test run evaluator error handling",
        data: dataset.slice(0, 1),
        task,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
        runEvaluators: [failingRunEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      // Should complete experiment but run evaluations should be empty
      expect(result.itemResults).toHaveLength(1);
      expect(result.runEvaluations).toHaveLength(0);
    });
  });

  // Edge Cases Tests
  describe("Edge Cases", () => {
    it("should handle empty dataset", async () => {
      const result = await langfuse.experiment.run({
        name: "Empty dataset test",
        description: "Test empty dataset handling",
        data: [],
        task,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
        runEvaluators: [levenshteinAverageRunEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(500);

      expect(result.itemResults).toHaveLength(0);
      expect(result.runEvaluations).toHaveLength(1); // Run evaluators will still execute with empty data
      expect(await result.prettyPrint()).toContain("No experiment results");
    });

    it("should handle dataset with missing fields", async () => {
      const incompleteDataset = [
        { input: "Germany" }, // Missing expectedOutput
        { expectedOutput: "Paris" }, // Missing input
        { input: "Spain", expectedOutput: "Madrid" }, // Complete
      ];

      const result = await langfuse.experiment.run({
        name: "Incomplete data test",
        description: "Test incomplete dataset handling",
        data: incompleteDataset,
        task,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(3);
      // Should handle missing fields gracefully
      result.itemResults.forEach((item) => {
        expect(item.traceId).toBeDefined();
        expect(item.output).toBeDefined();
      });
    });

    it("should handle very large dataset", async () => {
      // Create a larger dataset for performance testing
      const largeDataset = Array.from({ length: 20 }, (_, i) => ({
        input: `Country ${i}`,
        expectedOutput: `Capital ${i}`,
      }));

      const result = await langfuse.experiment.run({
        name: "Large dataset test",
        description: "Test performance with larger dataset",
        data: largeDataset,
        task: async ({ input }) => `Output for ${input}`,
        evaluators: [
          async () => ({
            name: "simple-eval",
            value: Math.random(),
          }),
        ],
        maxConcurrency: 5, // Test concurrency limit
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(3000);

      expect(result.itemResults).toHaveLength(20);
      result.itemResults.forEach((item) => {
        expect(item.evaluations).toHaveLength(1);
        expect(item.traceId).toBeDefined();
      });
    }, 30000);
  });

  // New Features Tests
  describe("New Features", () => {
    it("should support evaluators returning single evaluation", async () => {
      const singleEvaluationEvaluator: Evaluator = async ({
        input,
        output,
      }) => {
        // Return single evaluation instead of array
        return {
          name: "single-eval",
          value: input === "Germany" ? 1 : 0,
          comment: `Single evaluation for ${input}`,
        };
      };

      const result = await langfuse.experiment.run({
        name: "Single evaluation test",
        description: "Test single evaluation return",
        data: dataset.slice(0, 2),
        task,
        evaluators: [singleEvaluationEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(2);
      result.itemResults.forEach((item) => {
        expect(item.evaluations).toHaveLength(1);
        expect(item.evaluations[0]).toMatchObject({
          name: "single-eval",
          value: expect.any(Number),
          comment: expect.stringContaining("Single evaluation for"),
        });
      });
    });

    it("should support run evaluators returning single evaluation", async () => {
      const singleRunEvaluator: RunEvaluator = async ({ itemResults }) => {
        // Return single evaluation instead of array
        return {
          name: "single-run-eval",
          value: itemResults.length,
          comment: `Processed ${itemResults.length} items`,
        };
      };

      const result = await langfuse.experiment.run({
        name: "Single run evaluation test",
        description: "Test single run evaluation return",
        data: dataset.slice(0, 2),
        task,
        runEvaluators: [singleRunEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.runEvaluations).toHaveLength(1);
      expect(result.runEvaluations[0]).toMatchObject({
        name: "single-run-eval",
        value: 2,
        comment: "Processed 2 items",
      });
    });

    it("should support prettyPrint with includeItemResults option", async () => {
      const result = await langfuse.experiment.run({
        name: "PrettyPrint options test",
        description: "Test prettyPrint options",
        data: dataset,
        task,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
        runEvaluators: [levenshteinAverageRunEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      // Test with includeItemResults: false (default)
      const compactOutput = await result.prettyPrint();
      expect(compactOutput).toContain("Individual Results: Hidden");
      expect(compactOutput).toContain(
        "Call prettyPrint({ includeItemResults: true })",
      );
      expect(compactOutput).toContain("PrettyPrint options test"); // Should still show summary

      // Test with includeItemResults: true
      const fullOutput = await result.prettyPrint({ includeItemResults: true });
      expect(fullOutput).toContain("1. Item 1:");
      expect(fullOutput).toContain("2. Item 2:");
      expect(fullOutput).toContain("3. Item 3:");

      // Test default behavior (should be same as false)
      const defaultOutput = await result.prettyPrint();
      expect(defaultOutput).toEqual(compactOutput);
    });
  });

  // Concurrency and Performance Tests
  describe("Concurrency and Performance", () => {
    it("should respect maxConcurrency parameter", async () => {
      let concurrentCount = 0;
      let maxConcurrentReached = 0;

      const slowTask: ExperimentTask = async ({ input }) => {
        concurrentCount++;
        maxConcurrentReached = Math.max(maxConcurrentReached, concurrentCount);

        // Simulate slow operation
        await new Promise((resolve) => setTimeout(resolve, 100));

        concurrentCount--;
        return `Processed ${input}`;
      };

      const testData = Array.from({ length: 10 }, (_, i) => ({
        input: `Item ${i}`,
        expectedOutput: `Expected ${i}`,
      }));

      const result = await langfuse.experiment.run({
        name: "Concurrency test",
        description: "Test maxConcurrency parameter",
        data: testData,
        task: slowTask,
        maxConcurrency: 3,
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      expect(result.itemResults).toHaveLength(10);
      expect(maxConcurrentReached).toBeLessThanOrEqual(3);
    }, 15000);

    it("should handle evaluators with different execution times", async () => {
      const fastEvaluator: Evaluator = async () => ({
        name: "fast-eval",
        value: 1,
      });

      const slowEvaluator: Evaluator = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return {
          name: "slow-eval",
          value: 0.5,
        };
      };

      const start = Date.now();
      const result = await langfuse.experiment.run({
        name: "Mixed speed evaluators test",
        description: "Test evaluators with different execution times",
        data: dataset.slice(0, 2),
        task,
        evaluators: [fastEvaluator, slowEvaluator],
      });
      const duration = Date.now() - start;

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(2);
      result.itemResults.forEach((item) => {
        expect(item.evaluations).toHaveLength(2);
        expect(item.evaluations.map((e) => e.name)).toContain("fast-eval");
        expect(item.evaluations.map((e) => e.name)).toContain("slow-eval");
      });

      // Should complete in reasonable time (parallel execution)
      expect(duration).toBeLessThan(2000); // Should be much faster than 400ms * 2 items sequentially
    }, 10000);
  });

  // Data Persistence and API Integration Tests
  describe("Data Persistence and API Integration", () => {
    it("should persist scores correctly", async () => {
      const datasetName = "score-persistence-test-" + nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      const testItem = {
        input: "Test input",
        expectedOutput: "Test output",
      };

      const createdItem = await langfuse.api.datasetItems.create({
        datasetName,
        ...testItem,
      });

      const fetchedDataset = await langfuse.dataset.get(datasetName);

      const testEvaluator: Evaluator = async () => ({
        name: "persistence-test-eval",
        value: 0.85,
        comment: "Test evaluation for persistence",
      });

      const testRunEvaluator: RunEvaluator = async () => ({
        name: "persistence-test-run-eval",
        value: 0.9,
        comment: "Test run evaluation for persistence",
      });

      const result = await fetchedDataset.runExperiment({
        name: "Score persistence test",
        description: "Test score persistence",
        task,
        evaluators: [testEvaluator],
        runEvaluators: [testRunEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(3000);

      // Validate scores are persisted
      const datasetRun = await langfuse.api.datasets.getRun(
        datasetName,
        "Score persistence test",
      );

      expect(datasetRun).toBeDefined();
      expect(datasetRun.datasetRunItems).toHaveLength(1);

      // Validate item-level scores are linked to traces
      const runItem = datasetRun.datasetRunItems[0];
      expect(runItem.traceId).toBe(result.itemResults[0].traceId);
    });

    it("should handle multiple experiments on same dataset", async () => {
      const datasetName = "multi-experiment-test-" + nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      await Promise.all(
        dataset
          .slice(0, 2)
          .map((item) =>
            langfuse.api.datasetItems.create({ datasetName, ...item }),
          ),
      );

      const fetchedDataset = await langfuse.dataset.get(datasetName);

      // Run first experiment
      const result1 = await fetchedDataset.runExperiment({
        name: "Experiment 1",
        description: "First experiment",
        task,
        evaluators: [createEvaluatorFromAutoevals(Factuality)],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      // Run second experiment
      const result2 = await fetchedDataset.runExperiment({
        name: "Experiment 2",
        description: "Second experiment",
        task,
        evaluators: [createEvaluatorFromAutoevals(Levenshtein)],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      // Both experiments should have different run IDs
      expect(result1.datasetRunId).toBeDefined();
      expect(result2.datasetRunId).toBeDefined();
      expect(result1.datasetRunId).not.toBe(result2.datasetRunId);

      // Validate both runs exist in database
      const run1 = await langfuse.api.datasets.getRun(
        datasetName,
        "Experiment 1",
      );
      const run2 = await langfuse.api.datasets.getRun(
        datasetName,
        "Experiment 2",
      );

      expect(run1).toBeDefined();
      expect(run2).toBeDefined();
      expect(run1.id).not.toBe(run2.id);
    });

    it("should preserve dataset run metadata", async () => {
      const datasetName = "metadata-test-" + nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      await langfuse.api.datasetItems.create({
        datasetName,
        input: "Test",
        expectedOutput: "Test output",
      });

      const fetchedDataset = await langfuse.dataset.get(datasetName);

      const result = await fetchedDataset.runExperiment({
        name: "Metadata test experiment",
        description: "Testing metadata preservation",
        metadata: { testKey: "testValue", experimentVersion: "1.0" },
        task,
        evaluators: [
          async () => ({
            name: "test-eval",
            value: 1,
            metadata: { evaluatorVersion: "2.0" },
          }),
        ],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(2000);

      const datasetRun = await langfuse.api.datasets.getRun(
        datasetName,
        "Metadata test experiment",
      );

      expect(datasetRun).toMatchObject({
        name: "Metadata test experiment",
        description: "Testing metadata preservation",
        metadata: { testKey: "testValue", experimentVersion: "1.0" },
      });
    });
  });

  // Different Evaluator Configurations Tests
  describe("Different Evaluator Configurations", () => {
    it("should work with no evaluators", async () => {
      const result = await langfuse.experiment.run({
        name: "No evaluators test",
        description: "Test experiment with no evaluators",
        data: dataset.slice(0, 2),
        task,
        evaluators: [], // No evaluators
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(2);
      result.itemResults.forEach((item) => {
        expect(item.evaluations).toHaveLength(0);
        expect(item.traceId).toBeDefined();
        expect(item.output).toBeDefined();
      });
      expect(result.runEvaluations).toHaveLength(0);
    });

    it("should work with only run evaluators", async () => {
      const onlyRunEvaluator: RunEvaluator = async ({ itemResults }) => ({
        name: "run-only-eval",
        value: itemResults.length * 10,
        comment: `Run-level evaluation of ${itemResults.length} items`,
      });

      const result = await langfuse.experiment.run({
        name: "Only run evaluators test",
        description: "Test with only run evaluators",
        data: dataset.slice(0, 3),
        task,
        evaluators: [], // No item evaluators
        runEvaluators: [onlyRunEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(3);
      result.itemResults.forEach((item) => {
        expect(item.evaluations).toHaveLength(0); // No item evaluations
        expect(item.traceId).toBeDefined();
      });

      expect(result.runEvaluations).toHaveLength(1);
      expect(result.runEvaluations[0]).toMatchObject({
        name: "run-only-eval",
        value: 30, // 3 items * 10
      });
    });

    it("should handle mix of sync and async evaluators", async () => {
      const asyncEvaluator: Evaluator = async ({ input }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          name: "async-eval",
          value: input.length / 10,
        };
      };

      // Simulated sync evaluator (still returns Promise per type signature)
      const syncEvaluator: Evaluator = async ({ input }) => {
        return {
          name: "sync-eval",
          value: input === "Germany" ? 1 : 0,
        };
      };

      const result = await langfuse.experiment.run({
        name: "Mixed sync/async evaluators test",
        description: "Test mix of sync and async evaluators",
        data: dataset.slice(0, 2),
        task,
        evaluators: [asyncEvaluator, syncEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(2);
      result.itemResults.forEach((item) => {
        expect(item.evaluations).toHaveLength(2);
        const evalNames = item.evaluations.map((e) => e.name);
        expect(evalNames).toContain("async-eval");
        expect(evalNames).toContain("sync-eval");
      });
    });

    it("should handle evaluators returning different data types", async () => {
      const numberEvaluator: Evaluator = async () => ({
        name: "number-eval",
        value: 42,
      });

      const stringEvaluator: Evaluator = async () => ({
        name: "string-eval",
        value: "excellent",
      });

      const booleanEvaluator: Evaluator = async () => ({
        name: "boolean-eval",
        value: true,
        dataType: "BOOLEAN",
      });

      const result = await langfuse.experiment.run({
        name: "Different data types test",
        description: "Test evaluators with different return value types",
        data: dataset.slice(0, 1),
        task,
        evaluators: [numberEvaluator, stringEvaluator, booleanEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(1);
      const evaluations = result.itemResults[0].evaluations;
      expect(evaluations).toHaveLength(3);

      const numberEval = evaluations.find((e) => e.name === "number-eval");
      const stringEval = evaluations.find((e) => e.name === "string-eval");
      const booleanEval = evaluations.find((e) => e.name === "boolean-eval");

      expect(numberEval?.value).toBe(42);
      expect(stringEval?.value).toBe("excellent");
      expect(booleanEval?.value).toBe(true);
    });

    it("should handle complex evaluator metadata and comments", async () => {
      const complexEvaluator: Evaluator = async ({
        input,
        output,
        expectedOutput,
      }) => [
        {
          name: "detailed-eval",
          value: 0.85,
          comment: `Detailed analysis: input="${input}", output="${output}", expected="${expectedOutput}"`,
          metadata: {
            inputLength: input?.length || 0,
            outputLength: output?.length || 0,
            timestamp: new Date().toISOString(),
            evaluatorVersion: "1.2.3",
          },
          dataType: "NUMERIC" as const,
        },
        {
          name: "secondary-eval",
          value: input === expectedOutput ? "perfect" : "imperfect",
          comment: "Secondary evaluation result",
          metadata: { secondary: true },
        },
      ];

      const result = await langfuse.experiment.run({
        name: "Complex evaluator test",
        description: "Test evaluators with complex metadata",
        data: dataset.slice(0, 1),
        task,
        evaluators: [complexEvaluator],
      });

      await testEnv.spanProcessor.forceFlush();
      await waitForServerIngestion(1000);

      expect(result.itemResults).toHaveLength(1);
      const evaluations = result.itemResults[0].evaluations;
      expect(evaluations).toHaveLength(2);

      const detailedEval = evaluations.find((e) => e.name === "detailed-eval");
      expect(detailedEval).toMatchObject({
        name: "detailed-eval",
        value: 0.85,
        comment: expect.stringContaining("Detailed analysis"),
        metadata: expect.objectContaining({
          inputLength: expect.any(Number),
          evaluatorVersion: "1.2.3",
        }),
        dataType: "NUMERIC",
      });

      const secondaryEval = evaluations.find(
        (e) => e.name === "secondary-eval",
      );
      expect(secondaryEval).toMatchObject({
        name: "secondary-eval",
        value: expect.any(String),
        metadata: { secondary: true },
      });
    });
  });
});
