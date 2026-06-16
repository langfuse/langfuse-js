import { LangfuseClient } from "@langfuse/client";
import { LangfuseMedia, LangfuseMediaReference } from "@langfuse/core";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeAll } from "vitest";

import { waitForServerIngestion } from "./helpers/serverSetup.js";

// Two distinct 1x1 PNGs so they map to different media ids.
const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhgGAk1l6/AAAAABJRU5ErkJggg==",
  "base64",
);

const png = (bytes: Buffer): LangfuseMedia =>
  new LangfuseMedia({
    source: "bytes",
    contentBytes: bytes,
    contentType: "image/png",
  });

describe("Langfuse Datasets Multimodal E2E", () => {
  let langfuse: LangfuseClient;
  const datasetName = nanoid();
  const itemId = nanoid();

  beforeAll(async () => {
    langfuse = new LangfuseClient();

    await langfuse.api.datasets.create({ name: datasetName });

    // PNG_A is used in both input and metadata to exercise upload dedupe.
    await langfuse.dataset.createItem({
      datasetName,
      id: itemId,
      input: {
        question: "Compare the candidate image against the reference image.",
        candidate: png(PNG_A),
      },
      expectedOutput: {
        reference: png(PNG_B),
        label: "match",
      },
      metadata: {
        note: "vision eval",
        attachment: png(PNG_A),
      },
    });

    await waitForServerIngestion(2000);
  });

  it("stores LangfuseMedia as reference strings (raw, unresolved)", async () => {
    const dataset = await langfuse.dataset.get(datasetName);
    const item = dataset.items.find((i) => i.id === itemId);

    expect(item).toBeDefined();
    const input = item!.input as Record<string, unknown>;
    const expectedOutput = item!.expectedOutput as Record<string, unknown>;
    const metadata = item!.metadata as Record<string, unknown>;

    expect(input.candidate).toMatch(/^@@@langfuseMedia:.*@@@$/);
    expect(expectedOutput.reference).toMatch(/^@@@langfuseMedia:.*@@@$/);
    expect(metadata.attachment).toMatch(/^@@@langfuseMedia:.*@@@$/);

    // Non-media fields are untouched.
    expect(input.question).toBe(
      "Compare the candidate image against the reference image.",
    );
    expect(expectedOutput.label).toBe("match");
    expect(metadata.note).toBe("vision eval");

    // Same media in input + metadata dedupes to the same reference string.
    expect(input.candidate).toBe(metadata.attachment);
  });

  it("resolves references to LangfuseMediaReference and fetches the bytes", async () => {
    const dataset = await langfuse.dataset.get(datasetName, {
      resolveMediaReferences: true,
    });
    const item = dataset.items.find((i) => i.id === itemId);
    expect(item).toBeDefined();

    const input = item!.input as Record<string, unknown>;
    const expectedOutput = item!.expectedOutput as Record<string, unknown>;
    const metadata = item!.metadata as Record<string, unknown>;

    const candidate = input.candidate as LangfuseMediaReference;
    const reference = expectedOutput.reference as LangfuseMediaReference;
    const attachment = metadata.attachment as LangfuseMediaReference;

    expect(candidate).toBeInstanceOf(LangfuseMediaReference);
    expect(reference).toBeInstanceOf(LangfuseMediaReference);
    expect(attachment).toBeInstanceOf(LangfuseMediaReference);

    expect(candidate.contentType).toBe("image/png");
    expect(candidate.url).toMatch(/^https?:\/\//);

    // Non-media fields still preserved alongside the resolved references.
    expect(input.question).toBe(
      "Compare the candidate image against the reference image.",
    );
    expect(expectedOutput.label).toBe("match");

    // Fetch helpers pull the real bytes back through the signed URL.
    const bytes = await candidate.fetchBytes();
    expect(bytes.length).toBe(PNG_A.length);

    const dataUri = await reference.fetchDataUri();
    expect(dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(dataUri.slice("data:image/png;base64,".length)).toBe(
      PNG_B.toString("base64"),
    );

    // Same underlying media → same media id in input and metadata.
    expect(attachment.mediaId).toBe(candidate.mediaId);
  });

  it("round-trips a resolved item back through dataset.createItem without losing the media link", async () => {
    const resolved = await langfuse.dataset.get(datasetName, {
      resolveMediaReferences: true,
    });
    const sourceItem = resolved.items.find((i) => i.id === itemId);
    expect(sourceItem).toBeDefined();
    const sourceCandidate = (sourceItem!.input as Record<string, unknown>)
      .candidate as LangfuseMediaReference;

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

    // Stored as a reference string, not a JSON object with an expiring URL.
    const copyRaw = await langfuse.dataset.get(copyDatasetName);
    const copyRawItem = copyRaw.items.find((i) => i.id === copyItemId);
    expect((copyRawItem!.input as Record<string, unknown>).candidate).toMatch(
      /^@@@langfuseMedia:.*@@@$/,
    );

    // Re-resolves to the same media — the link survived the round-trip.
    const copyResolved = await langfuse.dataset.get(copyDatasetName, {
      resolveMediaReferences: true,
    });
    const copyItem = copyResolved.items.find((i) => i.id === copyItemId);
    const copyCandidate = (copyItem!.input as Record<string, unknown>)
      .candidate as LangfuseMediaReference;

    expect(copyCandidate).toBeInstanceOf(LangfuseMediaReference);
    expect(copyCandidate.mediaId).toBe(sourceCandidate.mediaId);
  });
});
