// uses the compiled node.js version, run yarn build after making changes to the SDKs
import Langfuse from "../langfuse-node";

const LF_HOST = process.env.LF_HOST ?? "http://localhost:3000";
const LF_PUBLIC_KEY = process.env.LF_PUBLIC_KEY ?? "pk-lf-1234567890";
const LF_SECRET_KEY = process.env.LF_SECRET_KEY ?? "sk-lf-1234567890";

describe("Langfuse Node.js", () => {
  let langfuse: Langfuse;
  // jest.setTimeout(100000)
  jest.useRealTimers();

  beforeEach(() => {
    langfuse = new Langfuse({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      baseUrl: LF_HOST,
    });
    langfuse.debug(true);
  });

  afterEach(async () => {
    // ensure clean shutdown & no test interdependencies
    await langfuse.shutdownAsync();
  });

  describe("dataset and items", () => {
    it("create and get dataset", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      const dataset = await langfuse.createDataset(projectNameRandom);
      const getDataset = await langfuse.getDataset(projectNameRandom);
      expect(getDataset).toEqual(dataset);
    });

    it("create and get dataset item", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      const dataset = await langfuse.createDataset(projectNameRandom);
      const item1 = await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
        input: {
          text: "hello world",
        },
      });
      const item2 = await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
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
      });
      const item3 = await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
        input: "prompt",
        expectedOutput: "completion",
      });
      const getDataset = await langfuse.getDataset(projectNameRandom);
      expect(getDataset).toMatchObject({
        ...dataset,
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
      });
    }, 10000);

    it("e2e", async () => {
      const projectNameRandom = Math.random().toString(36).substring(7);
      await langfuse.createDataset(projectNameRandom);
      await langfuse.createDatasetItem({
        datasetName: projectNameRandom,
        input: "Hello world",
        expectedOutput: "Hello world" as any,
      });

      const dataset = await langfuse.getDataset(projectNameRandom);
      for (const item of dataset.items) {
        const generation = langfuse.generation({
          id: "test-generation-id-" + projectNameRandom,
          input: item.input,
          output: "Hello world generated",
        });
        await item.link(generation, "test-run-" + projectNameRandom);
        generation.score({
          name: "test-score",
          value: 0.5,
        });
      }

      const getRuns = await langfuse.getDatasetRun({
        datasetName: projectNameRandom,
        runName: "test-run-" + projectNameRandom,
      });

      expect(getRuns).toMatchObject({
        name: "test-run-" + projectNameRandom,
        datasetId: dataset.id,
        // array needs to be length 2
        datasetRunItems: expect.arrayContaining([
          expect.objectContaining({
            observationId: "test-generation-id-" + projectNameRandom,
          }),
        ]),
      });
    }, 10000);
  });
});
