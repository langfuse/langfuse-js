import { LangfuseClient } from "@langfuse/client";
import { describe, expect, it, vi } from "vitest";

describe("LangfuseClient skills", () => {
  const skillVersion = {
    id: "skill-id",
    name: "refund-policy",
    description: "Refund policy",
    version: 1,
    tags: [],
    files: [
      {
        path: "SKILL.md",
        sha256Hash: "hash-v1",
        id: "file-id",
        blobId: "blob-id",
        contentLength: 7,
        contentType: "text/markdown",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    projectId: "project-id",
    createdBy: "user-id",
    labels: ["production"],
    commitMessage: null,
  };

  function makeClient(): LangfuseClient {
    return new LangfuseClient({ publicKey: "pk-test", secretKey: "sk-test" });
  }

  it("deduplicates large name selections before resolving versions", async () => {
    const client = makeClient();
    const get = vi
      .spyOn(client.api.unstable.skills, "get")
      .mockResolvedValue(skillVersion);

    const manifests = await client.skills.listManifests({
      names: Array.from({ length: 200_000 }, () => "refund-policy"),
      label: "production",
    });

    expect(manifests.size).toBe(1);
    expect(get).toHaveBeenCalledExactlyOnceWith("refund-policy", {
      label: "production",
    });
  });

  it("reads a skill by name while keeping each run pinned across label changes", async () => {
    const client = makeClient();
    const get = vi
      .spyOn(client.api.unstable.skills, "get")
      .mockResolvedValue(skillVersion);
    const getFileContents = vi
      .spyOn(client.api.unstable.skills, "getFileContents")
      .mockImplementation(async ({ sha256Hashes }) => ({
        data: sha256Hashes
          .split(",")
          .map((hash) => ({ sha256Hash: hash, content: hash })),
      }));
    const selection = { names: ["refund-policy"], label: "production" };
    const run1 = await client.skills.listManifests(selection);
    await client.skills.preloadContent(run1, { files: "entrypoints" });
    expect(
      await client.skills.getFileContent(
        run1.get("refund-policy")!,
        "SKILL.md",
      ),
    ).toBe("hash-v1");

    get.mockResolvedValue({
      ...skillVersion,
      version: 2,
      files: [{ ...skillVersion.files[0], sha256Hash: "hash-v2" }],
    });
    const run2 = await client.skills.listManifests(selection);
    expect(
      await client.skills.getFileContent(
        run2.get("refund-policy")!,
        "SKILL.md",
      ),
    ).toBe("hash-v2");
    expect(
      await client.skills.getFileContent(
        run1.get("refund-policy")!,
        "SKILL.md",
      ),
    ).toBe("hash-v1");
    expect(run2.get("unavailable-skill")).toBeUndefined();
    expect(getFileContents).toHaveBeenCalledTimes(2);
  });

  it("rejects two versions of the same skill instead of overwriting a name lookup", async () => {
    const client = makeClient();
    const get = vi
      .spyOn(client.api.unstable.skills, "get")
      .mockResolvedValue(skillVersion);
    await expect(
      client.skills.listManifests([
        { name: "refund-policy", version: 1 },
        { name: "refund-policy", version: 2 },
      ]),
    ).rejects.toThrow("Multiple versions selected for skill refund-policy.");
    expect(get).not.toHaveBeenCalled();
  });
});

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
});
