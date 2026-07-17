import {
  LangfuseAPIClient,
  type MetricsResponse,
  type MetricsV2Response,
} from "@langfuse/core";

import {
  serializeMetricsQuery,
  type MetricsQueryV1,
  type MetricsQueryV2,
} from "./types.js";

export type MetricsRequestOptions = Parameters<
  LangfuseAPIClient["metrics"]["metrics"]
>[1];

export type MetricsV2RequestOptions = Parameters<
  LangfuseAPIClient["metricsV2"]["metrics"]
>[1];

/**
 * Typed wrapper around the Metrics API.
 *
 * The public API expects the query as a JSON string, which makes it hard to use
 * with auto-generated SDKs. This manager provides a typed query object and
 * serializes it to the format required by the API.
 *
 * @public
 */
export class MetricsManager {
  private apiClient: LangfuseAPIClient;

  /**
   * Creates a new MetricsManager instance.
   *
   * @param params - Configuration object containing the API client
   * @internal
   */
  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

  /**
   * Execute a Metrics API v1 query.
   *
   * @param query - Metrics query object
   * @param requestOptions - Request-specific configuration
   * @returns Promise resolving to the query result
   *
   * @example
   * ```typescript
   * const res = await langfuse.metrics.query({
   *   view: "traces",
   *   metrics: [{ measure: "count", aggregation: "count" }],
   *   dimensions: [{ field: "name" }],
   *   filters: [],
   *   fromTimestamp: "2025-05-01T00:00:00Z",
   *   toTimestamp: "2025-05-13T00:00:00Z"
   * });
   * ```
   */
  public query(
    query: MetricsQueryV1,
    requestOptions?: MetricsRequestOptions,
  ): Promise<MetricsResponse> {
    return this.queryRaw(serializeMetricsQuery(query), requestOptions);
  }

  /**
   * Execute a Metrics API v2 query.
   *
   * @param query - Metrics query object
   * @param requestOptions - Request-specific configuration
   * @returns Promise resolving to the query result
   *
   * @example
   * ```typescript
   * const res = await langfuse.metrics.queryV2({
   *   view: "observations",
   *   metrics: [{ measure: "totalCost", aggregation: "sum" }],
   *   dimensions: [{ field: "providedModelName" }],
   *   filters: [],
   *   fromTimestamp: "2025-12-01T00:00:00Z",
   *   toTimestamp: "2025-12-16T00:00:00Z",
   *   orderBy: [{ field: "totalCost_sum", direction: "desc" }]
   * });
   * ```
   */
  public queryV2(
    query: MetricsQueryV2,
    requestOptions?: MetricsV2RequestOptions,
  ): Promise<MetricsV2Response> {
    return this.queryRawV2(serializeMetricsQuery(query), requestOptions);
  }

  /**
   * Advanced usage: call the Metrics API with a pre-serialized query string.
   *
   * @param query - JSON string matching the Metrics API query schema
   * @param requestOptions - Request-specific configuration
   * @returns Promise resolving to the query result
   */
  public async queryRaw(
    query: string,
    requestOptions?: MetricsRequestOptions,
  ): Promise<MetricsResponse> {
    return await this.apiClient.metrics.metrics({ query }, requestOptions);
  }

  /**
   * Advanced usage: call the Metrics API v2 with a pre-serialized query string.
   *
   * @param query - JSON string matching the Metrics API v2 query schema
   * @param requestOptions - Request-specific configuration
   * @returns Promise resolving to the query result
   */
  public async queryRawV2(
    query: string,
    requestOptions?: MetricsV2RequestOptions,
  ): Promise<MetricsV2Response> {
    return await this.apiClient.metricsV2.metrics({ query }, requestOptions);
  }
}
