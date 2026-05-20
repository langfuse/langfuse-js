import { MetricsManager } from "@langfuse/client";
import { LangfuseAPIClient } from "@langfuse/core";
import { describe, expect, it, vi } from "vitest";

class MockAPIClient {
  public metrics = {
    metrics: vi.fn(),
  };

  public metricsV2 = {
    metrics: vi.fn(),
  };
}

function createMetricsManager(mockAPIClient: MockAPIClient): MetricsManager {
  return new MetricsManager({
    apiClient: mockAPIClient as unknown as LangfuseAPIClient,
  });
}

describe("MetricsManager Integration Tests", () => {
  it("should serialize the query object for the Metrics API (v1)", async () => {
    const mockAPIClient = new MockAPIClient();
    mockAPIClient.metrics.metrics.mockResolvedValue({ data: [] });

    const metricsManager = createMetricsManager(mockAPIClient);
    const query = {
      view: "traces" as const,
      metrics: [{ measure: "count", aggregation: "count" as const }],
      dimensions: [{ field: "name" }],
      filters: [],
      fromTimestamp: "2025-05-01T00:00:00Z",
      toTimestamp: "2025-05-13T00:00:00Z",
    };

    await metricsManager.query(query);

    expect(mockAPIClient.metrics.metrics).toHaveBeenCalledTimes(1);
    expect(mockAPIClient.metrics.metrics).toHaveBeenCalledWith(
      { query: JSON.stringify(query) },
      undefined,
    );
  });

  it("should pass request options through", async () => {
    const mockAPIClient = new MockAPIClient();
    mockAPIClient.metrics.metrics.mockResolvedValue({ data: [] });

    const metricsManager = createMetricsManager(mockAPIClient);
    const query = {
      view: "traces" as const,
      metrics: [{ measure: "count", aggregation: "count" as const }],
      fromTimestamp: "2025-05-01T00:00:00Z",
      toTimestamp: "2025-05-13T00:00:00Z",
    };

    await metricsManager.query(query, { timeoutInSeconds: 1, maxRetries: 0 });

    expect(mockAPIClient.metrics.metrics).toHaveBeenCalledWith(
      { query: JSON.stringify(query) },
      { timeoutInSeconds: 1, maxRetries: 0 },
    );
  });

  it("should call the Metrics API with a pre-serialized query string", async () => {
    const mockAPIClient = new MockAPIClient();
    mockAPIClient.metrics.metrics.mockResolvedValue({ data: [] });

    const metricsManager = createMetricsManager(mockAPIClient);
    const query =
      '{"view":"traces","metrics":[{"measure":"count","aggregation":"count"}]}';

    await metricsManager.queryRaw(query);

    expect(mockAPIClient.metrics.metrics).toHaveBeenCalledWith(
      { query },
      undefined,
    );
  });

  it("should serialize the query object for the Metrics API (v2)", async () => {
    const mockAPIClient = new MockAPIClient();
    mockAPIClient.metricsV2.metrics.mockResolvedValue({ data: [] });

    const metricsManager = createMetricsManager(mockAPIClient);
    const query = {
      view: "observations" as const,
      metrics: [{ measure: "count", aggregation: "count" as const }],
      dimensions: [{ field: "name" }],
      filters: [],
      fromTimestamp: "2025-05-01T00:00:00Z",
      toTimestamp: "2025-05-13T00:00:00Z",
    };

    await metricsManager.queryV2(query);

    expect(mockAPIClient.metricsV2.metrics).toHaveBeenCalledTimes(1);
    expect(mockAPIClient.metricsV2.metrics).toHaveBeenCalledWith(
      { query: JSON.stringify(query) },
      undefined,
    );
  });

  it("should pass request options through (v2)", async () => {
    const mockAPIClient = new MockAPIClient();
    mockAPIClient.metricsV2.metrics.mockResolvedValue({ data: [] });

    const metricsManager = createMetricsManager(mockAPIClient);
    const query = {
      view: "observations" as const,
      metrics: [{ measure: "count", aggregation: "count" as const }],
      fromTimestamp: "2025-05-01T00:00:00Z",
      toTimestamp: "2025-05-13T00:00:00Z",
    };

    await metricsManager.queryV2(query, { timeoutInSeconds: 1, maxRetries: 0 });

    expect(mockAPIClient.metricsV2.metrics).toHaveBeenCalledWith(
      { query: JSON.stringify(query) },
      { timeoutInSeconds: 1, maxRetries: 0 },
    );
  });

  it("should call the Metrics API v2 with a pre-serialized query string", async () => {
    const mockAPIClient = new MockAPIClient();
    mockAPIClient.metricsV2.metrics.mockResolvedValue({ data: [] });

    const metricsManager = createMetricsManager(mockAPIClient);
    const query =
      '{"view":"observations","metrics":[{"measure":"count","aggregation":"count"}]}';

    await metricsManager.queryRawV2(query);

    expect(mockAPIClient.metricsV2.metrics).toHaveBeenCalledWith(
      { query },
      undefined,
    );
  });
});
