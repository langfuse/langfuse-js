import { ExperimentTask, LangfuseClient } from "@langfuse/client";
import { startObservation } from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ServerAssertions, pollUntil } from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

describe("Langfuse Datasets E2E", () => {
  let langfuse: LangfuseClient;
  let assertions: ServerAssertions;
  let testEnv: ServerTestEnvironment;

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuse = new LangfuseClient();
    assertions = new ServerAssertions();
  });

  afterEach(async () => {
    await langfuse.shutdown();
    await teardownServerTestEnvironment(testEnv);
  });

  describe("dataset and items", () => {
    it("create and get dataset, name only", async () => {
      const datasetName = nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      const getDataset = await langfuse.dataset.get(datasetName);
      expect(getDataset).toMatchObject({
        name: datasetName,
      });
    });

    it("create and get dataset, name only, special character", async () => {
      const datasetName = nanoid() + "+ 7?";
      await langfuse.api.datasets.create({ name: datasetName });
      const getDataset = await langfuse.dataset.get(datasetName);

      expect(getDataset).toMatchObject({
        name: datasetName,
      });
    });

    it("create and get dataset, object", async () => {
      const datasetName = nanoid();

      await langfuse.api.datasets.create({
        name: datasetName,
        description: "test",
        metadata: { test: "test" },
      });

      const getDataset = await langfuse.dataset.get(datasetName);

      expect(getDataset).toMatchObject({
        name: datasetName,
        description: "test",
        metadata: { test: "test" },
      });
    });

    it("create and get dataset item", async () => {
      const datasetNameRandom = nanoid();
      await langfuse.api.datasets.create({
        name: datasetNameRandom,
        metadata: { test: "test" },
      });

      // Create a generation using the tracing SDK for linking
      const generation = startObservation(
        "test-observation",
        {
          input: "generation input",
          model: "gpt-3.5-turbo",
        },
        { asType: "generation" },
      );
      generation.update({ output: "generation output" });
      generation.end();

      const item1 = await langfuse.api.datasetItems.create({
        datasetName: datasetNameRandom,
        input: "hello",
        metadata: { test: "test" },
      });

      const item2 = await langfuse.api.datasetItems.create({
        datasetName: datasetNameRandom,
        input: [
          {
            role: "text",
            text: "hello world",
          },
          {
            role: "label",
            text: "hello world",
          },
        ],
        expectedOutput: {
          text: "hello world",
        },
        metadata: { test: "test" },
        sourceObservationId: generation.id,
        sourceTraceId: generation.traceId,
      });

      const item3 = await langfuse.api.datasetItems.create({
        datasetName: datasetNameRandom,
        input: "prompt",
        expectedOutput: "completion",
      });

      const getDataset = await langfuse.dataset.get(datasetNameRandom);
      expect(getDataset).toMatchObject({
        name: datasetNameRandom,
        description: null,
        metadata: { test: "test" },
      });

      // Verify items exist in dataset
      expect(getDataset.items).toHaveLength(3);
      expect(getDataset.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: item1.id,
            input: "hello",
            metadata: { test: "test" },
          }),
          expect.objectContaining({
            id: item2.id,
            sourceObservationId: generation.id,
            sourceTraceId: generation.traceId,
          }),
          expect.objectContaining({
            id: item3.id,
            input: "prompt",
            expectedOutput: "completion",
          }),
        ]),
      );

      const getDatasetItem = await langfuse.api.datasetItems.get(item1.id);
      expect(getDatasetItem).toMatchObject({
        id: item1.id,
        input: "hello",
        metadata: { test: "test" },
      });
    }, 10000);

    it("create and get many dataset items to test pagination", async () => {
      const datasetNameRandom = nanoid();
      await langfuse.api.datasets.create({
        name: datasetNameRandom,
        metadata: { test: "test" },
      });

      // create 99 items
      const createdItems = [];
      const promises = [];
      for (let i = 0; i < 99; i++) {
        const promise = langfuse.api.datasetItems
          .create({
            datasetName: datasetNameRandom,
            input: "prompt",
            expectedOutput: "completion",
            metadata: { test: "test" },
          })
          .then((item) => createdItems.push(item));
        promises.push(promise);
      }

      await Promise.all(promises);

      // default
      const getDatasetDefault = await langfuse.dataset.get(datasetNameRandom);
      expect(getDatasetDefault.items.length).toEqual(99);
      expect(getDatasetDefault.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            input: "prompt",
            expectedOutput: "completion",
            metadata: { test: "test" },
          }),
        ]),
      );

      // Verify pagination by fetching in chunks (DatasetManager handles pagination internally)
      const getDatasetChunk8 = await langfuse.dataset.get(datasetNameRandom, {
        fetchItemsPageSize: 8,
      });
      expect(getDatasetChunk8.items.length).toEqual(99);

      const getDatasetChunk11 = await langfuse.dataset.get(datasetNameRandom, {
        fetchItemsPageSize: 11,
      });
      expect(getDatasetChunk11.items.length).toEqual(99);
    }, 20000);

    it("create, upsert and get dataset item", async () => {
      const datasetName = nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      const createRes = await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: {
          text: "hello world",
        },
        expectedOutput: {
          text: "hello world",
        },
      });

      const getRes = await langfuse.api.datasetItems.get(createRes.id);
      expect(getRes).toMatchObject({
        id: createRes.id,
        input: { text: "hello world" },
        expectedOutput: { text: "hello world" },
      });

      // Update the same item (upsert)
      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        id: createRes.id,
        input: {
          text: "hello world2",
        },
        expectedOutput: {
          text: "hello world2",
        },
        metadata: {
          test: "test",
        },
        status: "ARCHIVED",
      });

      const getUpdateRes = await langfuse.api.datasetItems.get(createRes.id);
      expect(getUpdateRes).toMatchObject({
        id: createRes.id,
        input: {
          text: "hello world2",
        },
        expectedOutput: {
          text: "hello world2",
        },
        metadata: {
          test: "test",
        },
        status: "ARCHIVED",
      });
    }, 10000);

    it("e2e dataset experiment with items and scores", async () => {
      const datasetName = nanoid();
      const fromStartTime = new Date().toISOString();
      await langfuse.api.datasets.create({ name: datasetName });

      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: "Hello trace",
        expectedOutput: "Hello world",
      });

      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: "Hello generation",
        expectedOutput: "Hello world",
      });

      const dataset = await langfuse.dataset.get(datasetName);
      const runName = "test-run-" + datasetName;

      const result = await dataset.runExperiment({
        name: "dataset-experiment",
        runName,
        description: "test-run-description",
        metadata: { test: "test" },
        task: async ({ input }) => `${input} -> Hello world`,
        evaluators: [async () => ({ name: "test-score-item", value: 0.5 })],
        runEvaluators: [async () => ({ name: "test-score-run", value: 0.5 })],
      });

      await testEnv.spanProcessor.forceFlush();
      await langfuse.flush();

      expect(result.runName).toBe(runName);
      expect(result.datasetRunId).toBe(result.experimentId);

      const experiment = await assertions.waitForExperiment(
        result.experimentId,
        {
          fromStartTime,
          itemCount: result.itemResults.length,
          fields: "core,metadata",
        },
      );
      expect(experiment).toMatchObject({
        id: result.experimentId,
        name: runName,
        datasetId: dataset.id,
        metadata: { test: "test" },
      });
      await assertions.waitForExperimentItemDescriptions(result.experimentId, {
        fromStartTime,
        count: result.itemResults.length,
        description: "test-run-description",
      });

      const items = await assertions.waitForExperimentItems(
        result.experimentId,
        { fromStartTime, count: 2, fields: "core,dataset" },
      );
      expect(items).toHaveLength(2);
      expect(items.map((item) => item.traceId).sort()).toEqual(
        result.itemResults.map((item) => item.traceId).sort(),
      );
      expect(items.map((item) => item.experimentItemId).sort()).toEqual(
        dataset.items.map((item) => item.id).sort(),
      );

      const itemScores = await assertions.waitForScores(
        { name: "test-score-item", traceId: items[0].traceId },
        { count: 1 },
      );
      expect(itemScores[0]).toMatchObject({ value: 0.5 });

      const runScores = await assertions.waitForScores(
        { name: "test-score-run", experimentId: result.experimentId },
        { count: 1 },
      );
      expect(runScores[0]).toMatchObject({
        value: 0.5,
        subject: { kind: "experiment", id: result.experimentId },
      });
    }, 30000);

    it("e2e multiple experiments on the same dataset", async () => {
      const datasetName = nanoid();
      const fromStartTime = new Date().toISOString();
      await langfuse.api.datasets.create({ name: datasetName });

      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: "Hello trace",
        expectedOutput: "Hello world",
      });

      const dataset = await langfuse.dataset.get(datasetName);
      const runNames = [0, 1, 2].map((i) => `test-run-${datasetName}-${i}`);

      const results = [];
      for (const runName of runNames) {
        results.push(
          await dataset.runExperiment({
            name: "dataset-experiment",
            runName,
            description: "test-run-description",
            metadata: { test: "test" },
            task: async ({ input }) => input,
          }),
        );
      }

      await testEnv.spanProcessor.forceFlush();

      // Each run name maps to its own experiment
      expect(new Set(results.map((r) => r.experimentId)).size).toBe(3);

      const experiments = await pollUntil(
        async () =>
          (
            await assertions.api.experiments.list({
              datasetId: dataset.id,
              fromStartTime,
              fields: "core,metadata",
            })
          ).data,
        (data) => data.length >= 3,
        `3 experiments on dataset ${dataset.id}`,
      );

      expect(experiments).toHaveLength(3);
      expect(experiments.map((e) => e.name).sort()).toEqual(runNames.sort());
      for (const experiment of experiments) {
        expect(experiment).toMatchObject({
          datasetId: dataset.id,
          description: "test-run-description",
          metadata: { test: "test" },
        });
      }

      const firstPage = await assertions.api.experiments.list({
        datasetId: dataset.id,
        fromStartTime,
        limit: 2,
      });
      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.meta.cursor).toBeTruthy();

      const secondPage = await assertions.api.experiments.list({
        datasetId: dataset.id,
        fromStartTime,
        limit: 2,
        cursor: firstPage.meta.cursor,
      });
      expect(secondPage.data).toHaveLength(1);
    }, 30000);

    it("get dataset with version parameter returns items at specific timestamp", async () => {
      const datasetName = nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      // Create first item
      const item1 = await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: "first item",
        expectedOutput: "first output",
      });

      // Create second item
      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: "second item",
        expectedOutput: "second output",
      });

      const versionDate = new Date(item1.createdAt);
      const versionTimestamp = versionDate.toISOString();

      // Get dataset at this version - should only have item1
      const datasetAtVersion = await langfuse.dataset.get(datasetName, {
        version: versionTimestamp,
      });

      // Should only have item1, not item2
      expect(datasetAtVersion.items).toHaveLength(1);
      expect(datasetAtVersion.items[0]).toMatchObject({
        input: "first item",
        expectedOutput: "first output",
      });

      // Get latest dataset (no version parameter) - should have both items
      const datasetLatest = await langfuse.dataset.get(datasetName);
      expect(datasetLatest.items).toHaveLength(2);
    }, 30000);

    it("run experiment with versioned dataset", async () => {
      const datasetName = nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      // Create first item
      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: { question: "What is 2+2?" },
        expectedOutput: 4,
      });

      // Fetch dataset to get the actual server-assigned timestamp of item1
      const datasetAfterItem1 = await langfuse.dataset.get(datasetName);
      expect(datasetAfterItem1.items).toHaveLength(1);
      const item1Id = datasetAfterItem1.items[0].id;
      const item1CreatedAt = new Date(datasetAfterItem1.items[0].createdAt);

      // Use a timestamp 1 second after item1's creation
      const versionTimestamp = new Date(
        item1CreatedAt.getTime() + 1000,
      ).toISOString();

      // Later writes must land after the version timestamp
      await new Promise((resolve) =>
        setTimeout(resolve, Date.parse(versionTimestamp) + 500 - Date.now()),
      );

      // Update item1 after the version timestamp (this should not affect versioned query)
      await langfuse.api.datasetItems.create({
        id: item1Id,
        datasetName: datasetName,
        input: { question: "What is 4+4?" },
        expectedOutput: 8,
      });

      // Create second item (after version timestamp)
      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: { question: "What is 3+3?" },
        expectedOutput: 6,
      });

      // Get versioned dataset (should only have first item with ORIGINAL state)
      const versionedDataset = await langfuse.dataset.get(datasetName, {
        version: versionTimestamp,
      });

      expect(versionedDataset.items).toHaveLength(1);
      expect(versionedDataset.version).toBe(versionTimestamp);
      // Verify it returns the ORIGINAL version of item1 (before the update)
      expect(versionedDataset.items[0].input).toEqual({
        question: "What is 2+2?",
      });
      expect(versionedDataset.items[0].expectedOutput).toBe(4);
      expect(versionedDataset.items[0].id).toBe(item1Id);

      // Run a simple experiment on the versioned dataset
      const simpleTask: ExperimentTask = async (params) => {
        // Just return a static answer
        return params.expectedOutput;
      };

      const result = await versionedDataset.runExperiment({
        name: "Versioned Dataset Test",
        description: "Testing experiment with versioned dataset",
        task: simpleTask,
      });

      // Verify experiment ran successfully
      expect(result.runName).toContain("Versioned Dataset Test");
      expect(result.itemResults).toHaveLength(1); // Only one item in versioned dataset
      expect(result.itemResults[0].output).toBe(4);
    }, 40000);
  });
});
