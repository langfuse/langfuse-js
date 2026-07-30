import { ExperimentTask, LangfuseClient } from "@langfuse/client";
import { startObservation } from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeEach } from "vitest";

import { waitForServerIngestion } from "./helpers/serverSetup.js";

describe("Langfuse Datasets E2E", () => {
  let langfuse: LangfuseClient;

  beforeEach(async () => {
    langfuse = new LangfuseClient();
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

      await waitForServerIngestion(3_000);

      // Fetch dataset to get the actual server-assigned timestamp of item1
      const datasetAfterItem1 = await langfuse.dataset.get(datasetName);
      expect(datasetAfterItem1.items).toHaveLength(1);
      const item1Id = datasetAfterItem1.items[0].id;
      const item1CreatedAt = new Date(datasetAfterItem1.items[0].createdAt);

      // Use a timestamp 1 second after item1's creation
      const versionTimestamp = new Date(
        item1CreatedAt.getTime() + 1000,
      ).toISOString();

      await waitForServerIngestion(3_000);

      // Update item1 after the version timestamp (this should not affect versioned query)
      await langfuse.api.datasetItems.create({
        id: item1Id,
        datasetName: datasetName,
        input: { question: "What is 4+4?" },
        expectedOutput: 8,
      });

      await waitForServerIngestion(3_000);

      // Create second item (after version timestamp)
      await langfuse.api.datasetItems.create({
        datasetName: datasetName,
        input: { question: "What is 3+3?" },
        expectedOutput: 6,
      });

      await waitForServerIngestion(3_000);

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
