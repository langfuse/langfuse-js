import { describe, it, expect, beforeEach } from "vitest";
import { LangfuseClient } from "@langfuse/client";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { startObservation } from "@langfuse/tracing";
import { nanoid } from "nanoid";
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
      const datasetName = nanoid() + "+ 7/";
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

    it("e2e dataset runs and linking", async () => {
      const datasetName = nanoid();
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

      // Create trace and generation using the tracing SDK
      const span = startObservation("test-trace-" + datasetName, {
        input: "input",
        output: "Hello world traced",
      });

      const generation = span.startGeneration(
        "test-generation-" + datasetName,
        {
          input: "input",
          model: "test-model",
        },
      );
      generation.update({ output: "Hello world generated" });
      generation.end();
      span.end();

      const dataset = await langfuse.dataset.get(datasetName);
      const runName = "test-run-" + datasetName;

      // Link dataset items to observations using the new linking API
      for (const item of dataset.items) {
        if (item.input === "Hello trace") {
          await item.link(span, runName);

          // Add score to trace
          langfuse.score.observation(span, {
            name: "test-score-trace",
            value: 0.5,
          });
        } else if (item.input === "Hello generation") {
          await item.link({ otelSpan: generation.otelSpan }, runName, {
            description: "test-run-description",
            metadata: { test: "test" },
          });

          // Add score to generation
          langfuse.score.observation(generation, {
            name: "test-score-generation",
            value: 0.5,
          });
        }
      }

      waitForServerIngestion(2_000);

      // Verify the dataset run was created
      const targetRun = await langfuse.api.datasets.getRun(
        datasetName,
        runName,
      );

      expect(targetRun).toBeDefined();
      expect(targetRun).toMatchObject({
        name: runName,
        datasetId: dataset.id,
        // description and metadata from second link should be preserved
        description: "test-run-description",
        metadata: { test: "test" },
      });

      // Verify run items
      expect(targetRun.datasetRunItems).toHaveLength(2);
      expect(targetRun.datasetRunItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            traceId: generation.traceId,
          }),
        ]),
      );
    }, 15000);

    it("e2e multiple runs", async () => {
      const datasetName = nanoid();
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

      // Create base trace and generation using tracing SDK
      const span = startObservation("test-trace-" + datasetName, {
        input: "input",
        output: "Hello world traced",
      });

      const generation = span.startGeneration(
        "test-generation-" + datasetName,
        {
          input: "input",
          model: "test-model",
        },
      );
      generation.update({ output: "Hello world generated" });
      generation.end();
      span.end();

      const dataset = await langfuse.dataset.get(datasetName);

      // Create 9 different runs
      for (let i = 0; i < 9; i++) {
        const runName = `test-run-${datasetName}-${i}`;

        // Link items to the run using the new API
        for (const item of dataset.items) {
          if (item.input === "Hello trace") {
            await item.link(span, runName);
            langfuse.score.observation(span, {
              name: "test-score-trace",
              value: 0.5,
            });
          } else if (item.input === "Hello generation") {
            await item.link({ otelSpan: generation.otelSpan }, runName, {
              description: "test-run-description",
              metadata: { test: "test" },
            });
            langfuse.score.observation(generation, {
              name: "test-score-generation",
              value: 0.5,
            });
          }
        }
      }

      // Get all runs
      const getRuns = await langfuse.api.datasets.getRuns(datasetName);

      expect(getRuns.data.length).toEqual(9);
      expect(getRuns.data[0]).toMatchObject({
        name: `test-run-${datasetName}-8`,
        description: "test-run-description",
        metadata: { test: "test" },
        datasetName: datasetName,
      });

      // Test pagination
      const getRunsQuery = await langfuse.api.datasets.getRuns(datasetName, {
        limit: 2,
        page: 1,
      });

      expect(getRunsQuery.data.length).toBeLessThanOrEqual(2);
      expect(getRunsQuery.meta).toMatchObject({
        limit: 2,
        page: 1,
      });
      expect(getRunsQuery.meta.totalItems).toBeGreaterThanOrEqual(9);
    }, 20000);

    it("createDatasetItemHandler equivalent with LangChain", async () => {
      // Create simple Langchain chain
      const prompt = new PromptTemplate({
        template:
          "What is the capital of {country}? Give ONLY the name of the capital.",
        inputVariables: ["country"],
      });
      const llm = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY || "fake-key-for-testing",
        model: "gpt-3.5-turbo",
      });
      const parser = new StringOutputParser();
      const chain = prompt.pipe(llm).pipe(parser);

      // Create a dataset
      const datasetName = nanoid();
      await langfuse.api.datasets.create({ name: datasetName });

      // Add two items to the dataset
      await Promise.all([
        langfuse.api.datasetItems.create({
          datasetName: datasetName,
          input: "Germany",
          expectedOutput: "Berlin",
        }),
        langfuse.api.datasetItems.create({
          datasetName: datasetName,
          input: "France",
          expectedOutput: "Paris",
        }),
      ]);

      // Execute chain on dataset items
      const dataset = await langfuse.dataset.get(datasetName);
      const runName = "test-run-" + new Date().toISOString();
      const runDescription = "test-run-description";
      const runMetadata = { test: "test" };
      const traceIds: string[] = [];

      for (const item of dataset.items) {
        // Create trace for this run using tracing SDK
        const span = startObservation("langchain-execution", {
          input: { country: item.input },
          metadata: { chainType: "capital-lookup" },
        });

        traceIds.push(span.traceId);

        try {
          // Execute LangChain with tracing (simplified - in real implementation would use callbacks)
          const result = await chain.invoke({ country: item.input });

          // Update trace with result
          span.update({ output: result });

          // Link dataset item to trace using the new API
          await item.link(span, runName, {
            description: runDescription,
            metadata: runMetadata,
          });

          // Add score
          langfuse.score.observation(span, {
            name: "test-score",
            value: 0.5,
          });
        } catch (error) {
          // Handle LLM errors gracefully - update trace with error
          span.update({
            output: { error: String(error) },
            level: "ERROR",
          });

          // Still link the dataset item
          await item.link(span, runName, {
            description: runDescription,
            metadata: runMetadata,
          });
        }

        span.end();
      }

      await waitForServerIngestion(2_000);

      // Verify that the dataset run was created correctly
      const targetRun = await langfuse.api.datasets.getRun(
        datasetName,
        runName,
      );

      expect(targetRun).toBeDefined();
      expect(targetRun).toMatchObject({
        name: runName,
        description: runDescription,
        metadata: runMetadata,
        datasetId: dataset.id,
      });

      expect(targetRun.datasetRunItems).toHaveLength(2);
      expect(targetRun.datasetRunItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            traceId: traceIds[0],
          }),
          expect.objectContaining({
            traceId: traceIds[1],
          }),
        ]),
      );
    }, 25000);
  });
});
