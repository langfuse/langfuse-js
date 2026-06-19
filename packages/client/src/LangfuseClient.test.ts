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
    // createItem resolves the dataset id up front (for the media upload context).
    client.api.datasets.get = vi.fn().mockResolvedValue({ id: "ds-id" });

    const result = await client.createDatasetItem({
      datasetName: "ds",
      input: { q: "?" },
    });

    expect(result).toEqual({ id: "created" });
    expect(create).toHaveBeenCalledOnce();
  });

  it("Fern-generated v3-compat aliases are bound to their owning resource", () => {
    const client = makeClient();

    // Settle the dispatched requests immediately so they aren't aborted at
    // teardown — we only care that `this` resolves, not the network result.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    // Each of these public methods dispatches to a private `this.__<name>(...)`
    // synchronously. Without `.bind`, `this` is the LangfuseClient (which has no
    // such private method) and the call throws "this.__<name> is not a function"
    // before any network request — see PR #840 review.
    const aliases: Array<[string, () => unknown]> = [
      ["fetchTrace", () => client.fetchTrace("t")],
      ["fetchTraces", () => client.fetchTraces()],
      ["fetchObservation", () => client.fetchObservation("o")],
      ["fetchObservations", () => client.fetchObservations()],
      ["fetchSessions", () => client.fetchSessions("s")],
      ["getDatasetRun", () => client.getDatasetRun("d", "r")],
      ["getDatasetRuns", () => client.getDatasetRuns("d")],
      ["createDataset", () => client.createDataset({ name: "d" })],
      ["getDatasetItem", () => client.getDatasetItem("i")],
      ["fetchMedia", () => client.fetchMedia("m")],
    ];

    for (const [name, call] of aliases) {
      let result: unknown;
      expect(() => {
        result = call();
      }, name).not.toThrow();
      // Swallow the eventual network rejection — we only assert `this` resolves.
      void Promise.resolve(result).catch(() => {});
    }
  });

  it("resolveMediaReferences is bound to the MediaManager", async () => {
    const client = makeClient();
    client.api.media.get = vi
      .fn()
      .mockResolvedValue({ url: "http://localhost:3000/media/med-1" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    // Resolving a reference string reads `this.apiClient.media` inside the
    // traverse closure; unbound, `this` is the LangfuseClient and it throws
    // "Cannot read properties of undefined (reading 'media')".
    const obj = {
      image: "@@@langfuseMedia:type=image/png|id=med-1|source=bytes@@@",
    };
    await expect(
      client.resolveMediaReferences({ obj, resolveWith: "base64DataUri" }),
    ).resolves.toBeDefined();
    expect(client.api.media.get).toHaveBeenCalledWith("med-1");
  });
});
