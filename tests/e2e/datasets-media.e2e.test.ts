import { LangfuseClient } from "@langfuse/client";
import { LangfuseMedia, LangfuseMediaReference } from "@langfuse/core";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll } from "vitest";

import { waitForServerIngestion } from "./helpers/serverSetup.js";

// Distinct bytes per tag -> distinct media id, so each JSONPath can be verified
// to resolve to its own media via fetchBytes.
const media = (tag: string): LangfuseMedia =>
  new LangfuseMedia({
    source: "bytes",
    contentBytes: Buffer.from(`media-${tag}`),
    contentType: "image/png",
  });

describe("Langfuse Datasets Multimodal E2E", () => {
  let langfuse: LangfuseClient;
  const datasetName = nanoid();
  const itemId = nanoid();

  beforeAll(async () => {
    langfuse = new LangfuseClient();

    await langfuse.api.datasets.create({ name: datasetName });

    // Cover the interesting jsonpath-plus path shapes in one item: a plain key,
    // list indices, consecutive indices (nested list), plus expectedOutput and
    // metadata fields.
    await langfuse.dataset.createItem({
      datasetName,
      id: itemId,
      input: {
        question: "compare the images",
        image: media("image"), // $['image']
        gallery: [media("gallery0"), media("gallery1")], // $['gallery'][0], [1]
        matrix: [[media("matrix")]], // $['matrix'][0][0]
      },
      expectedOutput: { reference: media("reference") }, // $['reference']
      metadata: { thumbnail: media("thumbnail") }, // $['thumbnail']
    });

    await waitForServerIngestion(2000);
  });

  it("stores LangfuseMedia as reference strings (raw, unresolved)", async () => {
    // The low-level list endpoint returns the raw stored form (dataset.get
    // always resolves references).
    const { data } = await langfuse.api.datasetItems.list({ datasetName });
    const item = data.find((i) => i.id === itemId);

    expect(item).toBeDefined();
    const input = item!.input as Record<string, any>;
    const expectedOutput = item!.expectedOutput as Record<string, any>;
    const metadata = item!.metadata as Record<string, any>;

    const ref = /^@@@langfuseMedia:.*@@@$/;
    expect(input.image).toMatch(ref);
    expect(input.gallery[0]).toMatch(ref);
    expect(input.gallery[1]).toMatch(ref);
    expect(input.matrix[0][0]).toMatch(ref);
    expect(expectedOutput.reference).toMatch(ref);
    expect(metadata.thumbnail).toMatch(ref);

    // Non-media field is untouched.
    expect(input.question).toBe("compare the images");
  });

  it("resolves every path shape to its own LangfuseMediaReference", async () => {
    const dataset = await langfuse.dataset.get(datasetName);
    const item = dataset.items.find((i) => i.id === itemId);
    expect(item).toBeDefined();

    const input = item!.input as Record<string, any>;
    const expectedOutput = item!.expectedOutput as Record<string, any>;
    const metadata = item!.metadata as Record<string, any>;

    // [label, resolved value, the tag whose bytes it should resolve to]
    const byPath: Array<[string, unknown, string]> = [
      ["input.image", input.image, "image"],
      ["input.gallery[0]", input.gallery[0], "gallery0"],
      ["input.gallery[1]", input.gallery[1], "gallery1"],
      ["input.matrix[0][0]", input.matrix[0][0], "matrix"],
      ["expectedOutput.reference", expectedOutput.reference, "reference"],
      ["metadata.thumbnail", metadata.thumbnail, "thumbnail"],
    ];

    for (const [label, resolved, tag] of byPath) {
      expect(resolved, label).toBeInstanceOf(LangfuseMediaReference);
      const ref = resolved as LangfuseMediaReference;
      expect(ref.contentType, label).toBe("image/png");
      // The reference at each path resolves to that path's own media.
      const bytes = await ref.fetchBytes();
      expect(Buffer.from(bytes).toString(), label).toBe(`media-${tag}`);
    }

    // Non-media field is left untouched.
    expect(input.question).toBe("compare the images");
  });

  it("round-trips a resolved item back through dataset.createItem without losing the media link", async () => {
    const resolved = await langfuse.dataset.get(datasetName);
    const sourceItem = resolved.items.find((i) => i.id === itemId);
    expect(sourceItem).toBeDefined();
    const sourceImage = (sourceItem!.input as Record<string, any>)
      .image as LangfuseMediaReference;

    const copyDatasetName = `${datasetName}-copy`;
    const copyItemId = `${itemId}-copy`;
    await langfuse.api.datasets.create({ name: copyDatasetName });

    // Reuse the resolved input (contains LangfuseMediaReference objects).
    await langfuse.dataset.createItem({
      datasetName: copyDatasetName,
      id: copyItemId,
      input: sourceItem!.input,
      expectedOutput: sourceItem!.expectedOutput,
    });

    await waitForServerIngestion(2000);

    // Stored as a reference string, not a JSON object with an expiring URL
    // (checked via the raw list endpoint).
    const { data: copyRaw } = await langfuse.api.datasetItems.list({
      datasetName: copyDatasetName,
    });
    const copyRawItem = copyRaw.find((i) => i.id === copyItemId);
    expect((copyRawItem!.input as Record<string, any>).image).toMatch(
      /^@@@langfuseMedia:.*@@@$/,
    );

    // Re-resolves to the same media — the link survived the round-trip.
    const copyResolved = await langfuse.dataset.get(copyDatasetName);
    const copyItem = copyResolved.items.find((i) => i.id === copyItemId);
    const copyImage = (copyItem!.input as Record<string, any>)
      .image as LangfuseMediaReference;

    expect(copyImage).toBeInstanceOf(LangfuseMediaReference);
    expect(copyImage.mediaId).toBe(sourceImage.mediaId);
  });
});
