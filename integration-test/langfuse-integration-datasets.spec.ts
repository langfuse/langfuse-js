// uses the compiled node.js version, run yarn build after making changes to the SDKs
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

      const getRuns = await langfuse.getDatasetRun({
        datasetName: projectNameRandom,
        runName: "test-run-" + projectNameRandom,
      });

      expect(getRuns).toMatchObject({
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
  });
});
