import {
  LangfuseMedia,
  LangfuseMediaReference,
  getGlobalLogger,
} from "@langfuse/core";
import { describe, expect, it, vi } from "vitest";

import { DatasetManager } from "./index.js";

function makeMedia(bytes: number[] = [1, 2, 3, 4]): LangfuseMedia {
  return new LangfuseMedia({
    source: "bytes",
    contentBytes: new Uint8Array(bytes),
    contentType: "image/png",
  });
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    status: "ACTIVE",
    input: null,
    expectedOutput: null,
    metadata: null,
    sourceTraceId: null,
    sourceObservationId: null,
    datasetId: "ds-id",
    datasetName: "ds",
    createdAt: "2026-06-16T12:00:00.000Z",
    updatedAt: "2026-06-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("DatasetManager.createItem media processing", () => {
  it("uploads media and replaces it with a reference string", async () => {
    const media = makeMedia();
    const referenceString = await media.getTag();

    const create = vi.fn().mockResolvedValue({ id: "created" });
    const datasetsGet = vi.fn().mockResolvedValue({ id: "ds-id" });
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    const manager = new DatasetManager({
      langfuseClient: {
        api: { datasets: { get: datasetsGet }, datasetItems: { create } },
        media: { uploadMedia },
      } as never,
    });

    const input = { image: media, question: "q" };
    const result = await manager.createItem({ datasetName: "ds", input });

    expect(result).toEqual({ id: "created" });

    // Media is uploaded against the (dataset, generated item, field) context.
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(uploadMedia).toHaveBeenCalledWith(media, {
      datasetId: "ds-id",
      datasetItemId: expect.any(String),
      field: "input",
    });

    const createArg = create.mock.calls[0][0];
    expect(typeof createArg.id).toBe("string");
    // The item id is settled up front and reused for the media upload context.
    expect(uploadMedia.mock.calls[0][1].datasetItemId).toBe(createArg.id);
    expect(createArg).toMatchObject({
      datasetName: "ds",
      input: { image: referenceString, question: "q" },
      expectedOutput: undefined,
      metadata: undefined,
    });
    // original input is not mutated
    expect(input.image).toBe(media);
  });

  it("processes media in expectedOutput and metadata, deduping uploads", async () => {
    const media = makeMedia();
    const referenceString = await media.getTag();

    const create = vi.fn().mockResolvedValue({ id: "created" });
    const datasetsGet = vi.fn().mockResolvedValue({ id: "ds-id" });
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    const manager = new DatasetManager({
      langfuseClient: {
        api: { datasets: { get: datasetsGet }, datasetItems: { create } },
        media: { uploadMedia },
      } as never,
    });

    await manager.createItem({
      datasetName: "ds",
      input: { a: media },
      expectedOutput: media,
      metadata: { nested: [media] },
    });

    // same media id -> uploaded once, dataset id resolved once
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(datasetsGet).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      datasetName: "ds",
      input: { a: referenceString },
      expectedOutput: referenceString,
      metadata: { nested: [referenceString] },
    });
  });

  it("throws when media is invalid", async () => {
    const invalid = new LangfuseMedia({
      source: "base64_data_uri",
      base64DataUri: "not-a-data-uri",
    });

    const manager = new DatasetManager({
      langfuseClient: {
        api: {
          datasets: { get: vi.fn().mockResolvedValue({ id: "ds-id" }) },
          datasetItems: { create: vi.fn() },
        },
        media: { uploadMedia: vi.fn() },
      } as never,
    });

    await expect(
      manager.createItem({ datasetName: "ds", input: { image: invalid } }),
    ).rejects.toThrow(/invalid LangfuseMedia/);
  });

  it("round-trips a resolved LangfuseMediaReference back to its reference string", async () => {
    const create = vi.fn().mockResolvedValue({ id: "created" });
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    const manager = new DatasetManager({
      langfuseClient: {
        api: {
          datasets: { get: vi.fn().mockResolvedValue({ id: "ds-id" }) },
          datasetItems: { create },
        },
        media: { uploadMedia },
      } as never,
    });

    const referenceString =
      "@@@langfuseMedia:type=image/png|id=med-1|source=bytes@@@";
    const ref = new LangfuseMediaReference({
      mediaId: "med-1",
      contentType: "image/png",
      url: "https://example.com/med.png",
      referenceString,
    });

    await manager.createItem({ datasetName: "ds", input: { image: ref } });

    // Already uploaded — must not be re-uploaded, and must serialize back to
    // the reference string rather than a JSON object with an expiring URL.
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].input).toEqual({ image: referenceString });
  });

  it("preserves non-plain objects (e.g. Date) instead of rebuilding them", async () => {
    const create = vi.fn().mockResolvedValue({ id: "created" });
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    const manager = new DatasetManager({
      langfuseClient: {
        api: {
          datasets: { get: vi.fn().mockResolvedValue({ id: "ds-id" }) },
          datasetItems: { create },
        },
        media: { uploadMedia },
      } as never,
    });

    const when = new Date("2026-06-16T12:00:00.000Z");
    await manager.createItem({
      datasetName: "ds",
      input: { when, label: "x" },
    });

    expect(uploadMedia).not.toHaveBeenCalled();
    const sentInput = create.mock.calls[0][0].input;
    // Same Date instance, not rebuilt into {} via Object.entries.
    expect(sentInput.when).toBe(when);
    expect(sentInput.label).toBe("x");
  });
});

describe("DatasetManager.get resolveMediaReferences", () => {
  function managerReturning(item: Record<string, unknown>) {
    const list = vi
      .fn()
      .mockResolvedValue({ data: [item], meta: { totalPages: 1 } });
    const datasetsGet = vi.fn().mockResolvedValue({ id: "ds-id", name: "ds" });
    const manager = new DatasetManager({
      langfuseClient: {
        api: {
          datasets: { get: datasetsGet },
          datasetItems: { list },
        },
        experiment: { run: vi.fn() },
      } as never,
    });
    return { manager, list };
  }

  const mediaPayload = {
    mediaId: "med-1",
    contentType: "image/png",
    contentLength: 4,
    url: "https://example.com/med.png",
    urlExpiry: "2026-06-16T13:00:00.000Z",
  };

  it("hydrates a bracket-notation json path into a LangfuseMediaReference", async () => {
    const item = makeItem({
      input: { image: "@@@langfuseMedia:...@@@", question: "q" },
      mediaReferences: [
        {
          field: "input",
          referenceString: "@@@langfuseMedia:...@@@",
          jsonPath: "$['image']",
          media: mediaPayload,
        },
      ],
    });
    const { manager, list } = managerReturning(item);

    const dataset = await manager.get("ds", { resolveMediaReferences: true });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ includeMediaReferences: true }),
    );
    const input = dataset.items[0].input as Record<string, unknown>;
    expect(input.image).toBeInstanceOf(LangfuseMediaReference);
    expect((input.image as LangfuseMediaReference).mediaId).toBe("med-1");
    expect(input.question).toBe("q");
  });

  it("hydrates expectedOutput field and nested json paths", async () => {
    const item = makeItem({
      expectedOutput: { a: { b: "@@@langfuseMedia:...@@@" } },
      mediaReferences: [
        {
          field: "expectedOutput",
          referenceString: "@@@langfuseMedia:...@@@",
          jsonPath: "$['a']['b']",
          media: mediaPayload,
        },
      ],
    });
    const { manager } = managerReturning(item);

    const dataset = await manager.get("ds", { resolveMediaReferences: true });

    const expectedOutput = dataset.items[0].expectedOutput as {
      a: { b: unknown };
    };
    expect(expectedOutput.a.b).toBeInstanceOf(LangfuseMediaReference);
  });

  it("does not request or hydrate references when option is off", async () => {
    const item = makeItem({
      input: { image: "@@@langfuseMedia:...@@@" },
      mediaReferences: [
        {
          field: "input",
          referenceString: "@@@langfuseMedia:...@@@",
          jsonPath: "$['image']",
          media: mediaPayload,
        },
      ],
    });
    const { manager, list } = managerReturning(item);

    const dataset = await manager.get("ds");

    expect(list).toHaveBeenCalledWith(
      expect.not.objectContaining({ includeMediaReferences: true }),
    );
    const input = dataset.items[0].input as Record<string, unknown>;
    expect(input.image).toBe("@@@langfuseMedia:...@@@");
  });

  it("leaves the field unchanged when media is null", async () => {
    const item = makeItem({
      input: { image: "@@@langfuseMedia:...@@@" },
      mediaReferences: [
        {
          field: "input",
          referenceString: "@@@langfuseMedia:...@@@",
          jsonPath: "$['image']",
          media: null,
        },
      ],
    });
    const { manager } = managerReturning(item);

    const dataset = await manager.get("ds", { resolveMediaReferences: true });

    const input = dataset.items[0].input as Record<string, unknown>;
    expect(input.image).toBe("@@@langfuseMedia:...@@@");
  });

  it("does not warn or throw when the referenced field value is null", async () => {
    // Server inconsistency: a reference is emitted but the field is null.
    // jsonpath-plus returns undefined (not []) for null roots, so guard it.
    const item = makeItem({
      input: null,
      mediaReferences: [
        {
          field: "input",
          referenceString: "@@@langfuseMedia:...@@@",
          jsonPath: "$['image']",
          media: mediaPayload,
        },
      ],
    });
    const { manager } = managerReturning(item);
    const warn = vi
      .spyOn(getGlobalLogger(), "warn")
      .mockImplementation(() => {});

    const dataset = await manager.get("ds", { resolveMediaReferences: true });

    expect(dataset.items[0].input).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips hydration for an unrecognised field without writing to 'undefined'", async () => {
    const item = makeItem({
      input: { image: "@@@langfuseMedia:...@@@" },
      mediaReferences: [
        {
          field: "some_new_field",
          referenceString: "@@@langfuseMedia:...@@@",
          jsonPath: "$['image']",
          media: mediaPayload,
        },
      ],
    });
    const { manager } = managerReturning(item);

    const dataset = await manager.get("ds", { resolveMediaReferences: true });

    const returnedItem = dataset.items[0] as unknown as Record<string, unknown>;
    const input = returnedItem.input as Record<string, unknown>;
    expect(input.image).toBe("@@@langfuseMedia:...@@@");
    expect(returnedItem.undefined).toBeUndefined();
  });
});
