import { describe, expect, it, vi } from "vitest";

import { LangfuseClient } from "./LangfuseClient.js";

describe("LangfuseClient deprecated dataset aliases", () => {
  function makeClient(): LangfuseClient {
    return new LangfuseClient({
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "http://localhost:3000",
    });
  }

  it("getDataset is bound to the DatasetManager (this resolves correctly)", async () => {
    const client = makeClient();
    client.api.datasets.get = vi.fn().mockResolvedValue({ id: "d", name: "d" });
    client.api.datasetItems.list = vi
      .fn()
      .mockResolvedValue({ data: [], meta: { totalPages: 1 } });

    // Called off the client, not the manager — without `.bind` this throws
    // "Cannot read properties of undefined (reading 'api')".
    const dataset = await client.getDataset("d");

    expect(dataset.name).toBe("d");
  });

  it("createDatasetItem routes through DatasetManager (uploads media)", async () => {
    const client = makeClient();
    const create = vi.fn().mockResolvedValue({ id: "created" });
    client.api.datasetItems.create = create;

    const result = await client.createDatasetItem({
      datasetName: "ds",
      input: { q: "?" },
    });

    expect(result).toEqual({ id: "created" });
    expect(create).toHaveBeenCalledOnce();
  });
});
