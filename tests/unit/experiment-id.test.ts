import { createStableExperimentId } from "@langfuse/core";
import { describe, expect, it } from "vitest";

// Golden vectors shared with the Langfuse platform and the Python SDK. All of
// them must derive the same experiment ID for the same run.
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const DATASET_ID = "cm9x1dataset0000000000001";

describe("createStableExperimentId", () => {
  it("matches the pinned cross-SDK test vectors", async () => {
    await expect(
      createStableExperimentId({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        runName: "my-run",
      }),
    ).resolves.toBe("a1164c0f238e4173");

    await expect(
      createStableExperimentId({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        runName: 'Läufe "v2" 🚀 – 2026-10-06T12:00:00.000Z',
      }),
    ).resolves.toBe("dce21641128b88a8");
  });

  it("changes with each part of the run identity", async () => {
    const base = {
      projectId: PROJECT_ID,
      datasetId: DATASET_ID,
      runName: "my-run",
    };
    const id = await createStableExperimentId(base);

    await expect(
      createStableExperimentId({ ...base, projectId: "other-project" }),
    ).resolves.not.toBe(id);
    await expect(
      createStableExperimentId({ ...base, datasetId: "other-dataset" }),
    ).resolves.not.toBe(id);
    await expect(
      createStableExperimentId({ ...base, runName: "other-run" }),
    ).resolves.not.toBe(id);
  });
});
