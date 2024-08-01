// uses the compiled node.js version, run yarn build after making changes to the SDKs
import { utils } from "../langfuse-core/src";
import Langfuse from "../langfuse-node";

describe("Langfuse Node.js", () => {
  let langfuse: Langfuse;
  // jest.setTimeout(100000)
  jest.useRealTimers();

  beforeEach(() => {
    langfuse = new Langfuse();
    langfuse.debug(true);
  });

  afterEach(async () => {
    // ensure clean shutdown & no test interdependencies
    await langfuse.shutdownAsync();
  });

  describe("dataset and items", () => {
    it("create and get dataset, name only", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset(projectNameRandom);
      const getDataset = await langfuse.getDataset(projectNameRandom);
      expect(getDataset).toMatchObject({
        name: projectNameRandom,
      });
    });

    it("create and get dataset, name only, special character", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7) + "+ 7/";
      await langfuse.createDataset(projectNameRandom);
      const getDataset = await langfuse.getDataset(projectNameRandom);
      expect(getDataset).toMatchObject({
        name: projectNameRandom,
      });
    });

    it("create and get dataset, object", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset({
        name: projectNameRandom,
        description: "test",
        metadata: { test: "test" },
      });
      const getDataset = await langfuse.getDataset(projectNameRandom);
      expect(getDataset).toMatchObject({
        name: projectNameRandom,
        description: "test",
        metadata: { test: "test" },
      });
    });

    it("create and get dataset item", async () => {
      const datasetNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset({ name: datasetNameRandom, metadata: { test: "test" } });
      const generation = langfuse.generation({ name: "test-observation" });
      await langfuse.flushAsync();
      const item1 = await langfuse.createDatasetItem({
        datasetName: datasetNameRandom,
        metadata: { test: "test" },
      });
      const item2 = await langfuse.createDatasetItem({
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
      const item3 = await langfuse.createDatasetItem({
        datasetName: datasetNameRandom,
        input: "prompt",
        expectedOutput: "completion",
      });
      const getDataset = await langfuse.getDataset(datasetNameRandom);
      expect(getDataset).toMatchObject({
        name: datasetNameRandom,
        description: undefined,
        metadata: { test: "test" },
        items: expect.arrayContaining([
          expect.objectContaining({ ...item1, link: expect.any(Function) }),
          expect.objectContaining({ ...item2, link: expect.any(Function) }),
          expect.objectContaining({ ...item3, link: expect.any(Function) }),
        ]),
      });

      const getDatasetItem = await langfuse.getDatasetItem(item1.id);
      expect(getDatasetItem).toEqual(item1);
    }, 10000);

    it("create and get many dataset items to test pagination", async () => {
      const datasetNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset({ name: datasetNameRandom, metadata: { test: "test" } });
      await langfuse.flushAsync();
      // create 99 items
      for (let i = 0; i < 99; i++) {
        await langfuse.createDatasetItem({
          datasetName: datasetNameRandom,
          input: "prompt",
          expectedOutput: "completion",
          metadata: { test: "test" },
        });
      }

      // default
      const getDatasetDefault = await langfuse.getDataset(datasetNameRandom);
      expect(getDatasetDefault.items.length).toEqual(99);
      expect(getDatasetDefault.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ input: "prompt", expectedOutput: "completion", metadata: { test: "test" } }),
        ])
      );

      // chunks 8
      const getDatasetChunk8 = await langfuse.getDataset(datasetNameRandom, { fetchItemsPageSize: 8 });
      expect(getDatasetChunk8.items.length).toEqual(99);

      // chunks 11
      const getDatasetChunk11 = await langfuse.getDataset(datasetNameRandom, { fetchItemsPageSize: 11 });
      expect(getDatasetChunk11.items.length).toEqual(99);
    }, 10000);

    it("create, upsert and get dataset item", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset(projectNameRandom);

      const createRes = await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
        input: {
          text: "hello world",
        },
        expectedOutput: {
          text: "hello world",
        },
      });
      const getRes = await langfuse.getDatasetItem(createRes.id);
      expect(getRes).toEqual(createRes);

      const UpdateRes = await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
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
      const getUpdateRes = await langfuse.getDatasetItem(createRes.id);
      expect(getUpdateRes).toEqual(UpdateRes);
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

    it("e2e", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset(projectNameRandom);
      await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
        input: "Hello trace",
        expectedOutput: "Hello world",
      });
      await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
        input: "Hello generation",
        expectedOutput: "Hello world",
      });

      const trace = langfuse.trace({
        id: "test-trace-id-" + projectNameRandom,
        input: "input",
        output: "Hello world traced",
      });

      const generation = langfuse.generation({
        id: "test-generation-id-" + projectNameRandom,
        input: "input",
        output: "Hello world generated",
      });

      await langfuse.flushAsync();

      const dataset = await langfuse.getDataset(projectNameRandom);
      for (const item of dataset.items) {
        if (item.input === "Hello trace") {
          await item.link(trace, "test-run-" + projectNameRandom);
          trace.score({
            name: "test-score-trace",
            value: 0.5,
          });
        } else if (item.input === "Hello generation") {
          await item.link(generation, "test-run-" + projectNameRandom, {
            description: "test-run-description",
            metadata: { test: "test" },
          });
          generation.score({
            name: "test-score-generation",
            value: 0.5,
          });
        }
      }

      const getRun = await langfuse.getDatasetRun({
        datasetName: projectNameRandom,
        runName: "test-run-" + projectNameRandom,
      });

      expect(getRun).toMatchObject({
        name: "test-run-" + projectNameRandom,
        description: "test-run-description", // from second link
        metadata: { test: "test" }, // from second link
        datasetId: dataset.id,
        // array needs to be length 2
        datasetRunItems: expect.arrayContaining([
          expect.objectContaining({
            observationId: generation.id,
            traceId: generation.traceId,
          }),
          expect.objectContaining({
            traceId: trace.id,
          }),
        ]),
      });
    }, 10000);

    it("e2e multiple runs", async () => {
      const datasetName = Math.random().toString(36).substring(7);
      await langfuse.createDataset(datasetName);
      await langfuse.createDatasetItem({
        datasetName: datasetName,
        input: "Hello trace",
        expectedOutput: "Hello world",
      });
      await langfuse.createDatasetItem({
        datasetName: datasetName,
        input: "Hello generation",
        expectedOutput: "Hello world",
      });

      const trace = langfuse.trace({
        id: "test-trace-id-" + datasetName,
        input: "input",
        output: "Hello world traced",
      });

      const generation = langfuse.generation({
        id: "test-generation-id-" + datasetName,
        input: "input",
        output: "Hello world generated",
      });

      await langfuse.flushAsync();

      const dataset = await langfuse.getDataset(datasetName);
      for (let i = 0; i < 9; i++) {
        for (const item of dataset.items) {
          if (item.input === "Hello trace") {
            await item.link(trace, `test-run-${datasetName}-${i}`);
            trace.score({
              name: "test-score-trace",
              value: 0.5,
            });
          } else if (item.input === "Hello generation") {
            await item.link(generation, `test-run-${datasetName}-${i}`, {
              description: "test-run-description",
              metadata: { test: "test" },
            });
            generation.score({
              name: "test-score-generation",
              value: 0.5,
            });
          }
        }
      }

      // all at once
      const getRuns = await langfuse.getDatasetRuns(datasetName);
      expect(getRuns.data.length).toEqual(9);
      expect(getRuns.data[0]).toMatchObject({
        name: `test-run-${datasetName}-8`,
        description: "test-run-description",
        metadata: { test: "test" },
        datasetId: dataset.id,
        datasetName: datasetName,
      });

      // custom query
      const getRunsQuery = await langfuse.getDatasetRuns(datasetName, {
        limit: 2,
        page: 2,
      });
      expect(getRunsQuery.data.length).toEqual(2);
      expect(getRunsQuery.meta).toMatchObject({
        limit: 2,
        page: 2,
        totalItems: 9,
        totalPages: 5,
      });
    }, 10000);
  });
  it("create and fetch dataset items", async () => {
    const datasetName = utils.generateUUID();
    langfuse.createDataset({
      name: datasetName,
      description: "My first dataset",
      metadata: {
        author: "Alice",
        date: "2022-01-01",
        type: "benchmark",
      },
    });
    langfuse.createDatasetItem({
      datasetName: datasetName,
    });
    langfuse.createDatasetItem({
      datasetName: datasetName,
    });
    await langfuse.flushAsync();

    const datasetItems = await langfuse.getDatasetItems({ datasetName: datasetName });
    expect(datasetItems.meta["totalItems"]).toEqual(2);
    expect(datasetItems.data[0]).toMatchObject({ datasetName: datasetName });
    expect(datasetItems.data[1]).toMatchObject({ datasetName: datasetName });
  });

  it("create and fetch datasets", async () => {
    const datasetName1 = utils.generateUUID();
    const datasetName2 = utils.generateUUID();
    const datasetName3 = utils.generateUUID();

    // Create multiple datasets
    langfuse.createDataset({
      name: datasetName1,
      description: "My first dataset",
    });
    langfuse.createDataset({
      name: datasetName2,
      description: "My second dataset",
    });
    langfuse.createDataset({
      name: datasetName3,
      description: "My third dataset",
    });

    const datasets = await langfuse.getDatasets();
    expect(datasets.data).toContainEqual(expect.objectContaining({ name: datasetName1 }));
    expect(datasets.data).toContainEqual(expect.objectContaining({ name: datasetName2 }));
    expect(datasets.data).toContainEqual(expect.objectContaining({ name: datasetName3 }));
  });
});
