import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LangfuseAPIClient } from "@langfuse/core";

const script = resolve(
  process.cwd(),
  "scripts/patch-generated-request-placeholders.mjs",
);

// Every generated method that has no query parameters and no body. Each one
// takes `request: Record<string, never> = {}` before `requestOptions`, so a
// query parameter added to the endpoint later does not move `requestOptions`.
// After an API regeneration, update this list to the script's `--list` output.
const PLACEHOLDER_METHODS = [
  "annotationQueues.getQueue(queueId)",
  "annotationQueues.getQueueItem(queueId, itemId)",
  "annotationQueues.deleteQueueItem(queueId, itemId)",
  "blobStorageIntegrations.getBlobStorageIntegrations()",
  "blobStorageIntegrations.getBlobStorageIntegrationStatus(id)",
  "blobStorageIntegrations.deleteBlobStorageIntegration(id)",
  "comments.getById(commentId)",
  "datasetItems.get(id)",
  "datasetItems.delete(id)",
  "datasets.get(datasetName)",
  "datasets.getRun(datasetName, runName)",
  "datasets.deleteRun(datasetName, runName)",
  "evaluationRules.get(evaluationRuleId)",
  "evaluationRules.delete(evaluationRuleId)",
  "evaluators.get(evaluatorId)",
  "evaluators.delete(evaluatorId)",
  "health.health()",
  "legacy.observationsV1.get(observationId)",
  "legacy.scoreV1.delete(scoreId)",
  "llmConnections.delete(id)",
  "media.get(mediaId)",
  "models.get(id)",
  "models.delete(id)",
  "organizations.getOrganizationMemberships()",
  "organizations.getProjectMemberships(projectId)",
  "organizations.getOrganizationProjects()",
  "organizations.getOrganizationApiKeys()",
  "projects.get()",
  "projects.delete(projectId)",
  "projects.getApiKeys(projectId)",
  "projects.deleteApiKey(projectId, apiKeyId)",
  "scim.getServiceProviderConfig()",
  "scim.getResourceTypes()",
  "scim.getSchemas()",
  "scim.getUser(userId)",
  "scim.deleteUser(userId)",
  "scoreConfigs.getById(configId)",
  "scores.getById(scoreId)",
  "sessions.get(sessionId)",
  "trace.delete(traceId)",
  "unstable.dashboardWidgets.get(widgetId)",
  "unstable.dashboardWidgets.delete(widgetId)",
  "unstable.dashboards.get(dashboardId)",
  "unstable.dashboards.delete(dashboardId)",
  "unstable.dashboards.deletePlacement(dashboardId, placementId)",
];

function runScript(...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
}

function parseLabel(label: string) {
  const match = /^([\w.]+)\.(\w+)\(([^)]*)\)$/.exec(label);
  if (!match) throw new Error(`Invalid method label: ${label}`);
  const [, accessor, method, params] = match;
  return {
    accessor: accessor.split("."),
    method,
    pathParams: params ? params.split(", ") : [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generated request placeholders", () => {
  it("covers every generated method without a request object", () => {
    expect(() => runScript("--check")).not.toThrow();
  });

  it("matches the reviewed list of placeholder methods", () => {
    const methods = JSON.parse(runScript("--list")) as { label: string }[];
    expect(methods.map((method) => method.label)).toEqual(PLACEHOLDER_METHODS);
  });

  it.each(PLACEHOLDER_METHODS)(
    "honors requestOptions after the placeholder in %s",
    async (label) => {
      const { accessor, method, pathParams } = parseLabel(label);
      const fetchMock = vi.fn(async () => {
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      const client = new LangfuseAPIClient({
        environment: "https://cloud.langfuse.com",
        username: "public-key",
        password: "secret-key",
      });

      const resource = accessor.reduce<any>(
        (current, key) => current[key],
        client,
      );
      await resource[method](
        ...pathParams.map((param) => `${param}-value`),
        {},
        {
          headers: { "X-Placeholder-Check": "kept" },
          queryParams: { probe: "kept" },
        },
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(new Headers(init.headers).get("X-Placeholder-Check")).toBe("kept");
      expect(new URL(url).searchParams.get("probe")).toBe("kept");
      for (const param of pathParams) {
        expect(url).toContain(`${param}-value`);
      }
    },
  );
});
