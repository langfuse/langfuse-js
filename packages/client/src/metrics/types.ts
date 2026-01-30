/**
 * Supported views for the Metrics API v1.
 *
 * @public
 */
export type MetricsViewV1 =
  | "traces"
  | "observations"
  | "scores-numeric"
  | "scores-categorical";

/**
 * Supported views for the Metrics API v2.
 *
 * @public
 */
export type MetricsViewV2 =
  | "observations"
  | "scores-numeric"
  | "scores-categorical";

/**
 * Supported aggregation functions.
 *
 * @public
 */
export type MetricsAggregation =
  | "sum"
  | "avg"
  | "count"
  | "max"
  | "min"
  | "p50"
  | "p75"
  | "p90"
  | "p95"
  | "p99"
  | "histogram";

/**
 * Supported time granularity values.
 *
 * @public
 */
export type MetricsGranularity =
  | "auto"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

/**
 * Sort direction for `orderBy`.
 *
 * @public
 */
export type MetricsOrderDirection = "asc" | "desc";

/**
 * Filter type discriminator used by the Metrics API.
 *
 * @public
 */
export type MetricsFilterType =
  | "datetime"
  | "string"
  | "number"
  | "stringOptions"
  | "categoryOptions"
  | "arrayOptions"
  | "stringObject"
  | "numberObject"
  | "boolean"
  | "null";

/**
 * Dimension descriptor used for grouping.
 *
 * @public
 */
export interface MetricsDimension {
  /** Field name to group by. */
  field: string;
}

/**
 * Metric descriptor (what to measure and how to aggregate).
 *
 * @public
 */
export interface MetricsMetric {
  /** Measure name, e.g. `count`, `latency`, `totalCost`. */
  measure: string;
  /** Aggregation function to apply to the measure. */
  aggregation: MetricsAggregation;
}

/**
 * Filter descriptor for the Metrics API query.
 *
 * @public
 */
export interface MetricsFilter {
  /** Column/dimension to filter on. */
  column: string;
  /** Operator, depends on `type` (e.g. `=`, `contains`, `>=`). */
  operator: string;
  /** Value to compare against. */
  value: unknown;
  /** Value type discriminator. */
  type: MetricsFilterType;
  /** Required only for `stringObject`/`numberObject` filters (e.g. metadata). */
  key?: string;
}

/**
 * Optional time bucketing configuration.
 *
 * @public
 */
export interface MetricsTimeDimension {
  /** Time granularity used for grouping. */
  granularity: MetricsGranularity;
}

/**
 * Ordering configuration for metrics results.
 *
 * @public
 */
export interface MetricsOrderBy {
  /** Field to order by (dimension field or metric alias). */
  field: string;
  /** Sort direction. */
  direction: MetricsOrderDirection;
}

/**
 * Additional query configuration.
 *
 * @public
 */
export interface MetricsQueryConfig {
  /** Histogram bin count (when using `histogram` aggregation). */
  bins?: number;
  /** Maximum number of rows to return. */
  row_limit?: number;
}

/**
 * Metrics API v1 query object (used with `GET /api/public/metrics`).
 *
 * @public
 */
export interface MetricsQueryV1 {
  /** Data view to query. */
  view: MetricsViewV1;
  /** Dimensions to group by. */
  dimensions?: MetricsDimension[];
  /** Metrics to compute (at least one). */
  metrics: MetricsMetric[];
  /** Optional filters. */
  filters?: MetricsFilter[];
  /** Optional time bucketing. */
  timeDimension?: MetricsTimeDimension | null;
  /** ISO 8601 timestamp for the start of the query period. */
  fromTimestamp: string;
  /** ISO 8601 timestamp for the end of the query period. */
  toTimestamp: string;
  /** Ordering configuration. */
  orderBy?: MetricsOrderBy[] | null;
  /** Additional query configuration. */
  config?: MetricsQueryConfig;
}

/**
 * Metrics API v2 query object (used with `GET /api/public/v2/metrics`).
 *
 * @public
 */
export interface MetricsQueryV2 {
  /** Data view to query. */
  view: MetricsViewV2;
  /** Dimensions to group by. */
  dimensions?: MetricsDimension[];
  /** Metrics to compute (at least one). */
  metrics: MetricsMetric[];
  /** Optional filters. */
  filters?: MetricsFilter[];
  /** Optional time bucketing. */
  timeDimension?: MetricsTimeDimension | null;
  /** ISO 8601 timestamp for the start of the query period. */
  fromTimestamp: string;
  /** ISO 8601 timestamp for the end of the query period. */
  toTimestamp: string;
  /** Ordering configuration. */
  orderBy?: MetricsOrderBy[] | null;
  /** Additional query configuration. */
  config?: MetricsQueryConfig;
}

/**
 * Union of supported Metrics API query payloads.
 *
 * @public
 */
export type MetricsQuery = MetricsQueryV1 | MetricsQueryV2;

/**
 * Serialize a Metrics API query object to the JSON string required by the API.
 *
 * @public
 */
export function serializeMetricsQuery(query: MetricsQuery): string {
  return JSON.stringify(query);
}
