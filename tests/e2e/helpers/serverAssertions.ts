import {
  LangfuseAPIClient,
  getEnv,
  type Experiment,
  type ExperimentItem,
  type GetObservationsV2Request,
  type GetScoresV3Request,
  type ObservationV2,
  type ScoreV3,
} from "@langfuse/core";
import { expect } from "vitest";

export const ALL_OBSERVATION_FIELDS =
  "core,basic,time,io,metadata,model,usage,prompt,metrics,trace_context";

const DEFAULT_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

export interface PollOptions {
  timeoutMs?: number;
}

/**
 * Repeatedly calls `fetch` until `isDone` accepts the result. Server reads lag
 * ingestion, so assertions on persisted data should go through this instead of
 * fixed sleeps.
 */
export async function pollUntil<T>(
  fetch: () => Promise<T>,
  isDone: (value: T) => boolean,
  description: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    let last: T | undefined;
    let lastError: unknown;

    try {
      last = await fetch();
      if (isDone(last)) return last;
    } catch (error) {
      lastError = error;
    }

    if (Date.now() >= deadline) {
      const detail =
        lastError !== undefined
          ? `last error: ${String(lastError)}`
          : `last result: ${JSON.stringify(last)?.slice(0, 2000)}`;

      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description} (${detail})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** Observation and experiment IO is returned as raw strings; parse JSON when possible. */
export function parseIO(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

type ObservationQuery = Omit<GetObservationsV2Request, "cursor" | "fields">;

type WaitForObservationsOptions = {
  count?: number;
  until?: (observations: ObservationV2[]) => boolean;
  fields?: string;
} & PollOptions;

/** `filter` value matching observations whose trace has the given name. */
export function traceNameFilter(traceName: string): string {
  return JSON.stringify([
    { type: "string", column: "traceName", operator: "=", value: traceName },
  ]);
}

export class ServerAssertions {
  public api: LangfuseAPIClient;

  constructor() {
    const publicKey = getEnv("LANGFUSE_PUBLIC_KEY");
    const secretKey = getEnv("LANGFUSE_SECRET_KEY");

    if (!publicKey || !secretKey) {
      throw new Error(
        "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set for E2E tests",
      );
    }

    this.api = new LangfuseAPIClient({
      baseUrl: getEnv("LANGFUSE_BASE_URL") || "http://localhost:3000",
      username: publicKey,
      password: secretKey,
      environment: "", // noop as baseUrl is set
    });
  }

  async getObservations(
    traceId: string,
    fields: string = ALL_OBSERVATION_FIELDS,
  ): Promise<ObservationV2[]> {
    return this.queryObservations({ traceId }, fields);
  }

  async queryObservations(
    query: ObservationQuery,
    fields: string = ALL_OBSERVATION_FIELDS,
  ): Promise<ObservationV2[]> {
    const observations: ObservationV2[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.api.observations.getMany({
        ...query,
        fields,
        limit: 1000,
        cursor,
      });
      observations.push(...page.data);
      cursor = page.meta.cursor;
    } while (cursor);

    return observations;
  }

  /**
   * Waits until the trace has at least `count` observations (default 1) and
   * `until` (if given) accepts them.
   */
  async waitForObservations(
    traceId: string,
    options: WaitForObservationsOptions = {},
  ): Promise<ObservationV2[]> {
    return this.waitForObservationsWhere({ traceId }, options);
  }

  /** Like `waitForObservations`, for any observations query (e.g. by name). */
  async waitForObservationsWhere(
    query: ObservationQuery,
    options: WaitForObservationsOptions = {},
  ): Promise<ObservationV2[]> {
    const { count = 1, until, fields, timeoutMs } = options;

    return pollUntil(
      () => this.queryObservations(query, fields),
      (observations) =>
        observations.length >= count && (until?.(observations) ?? true),
      `${count} observation(s) matching ${JSON.stringify(query)}`,
      { timeoutMs },
    );
  }

  async getScores(
    filter: Omit<GetScoresV3Request, "cursor">,
  ): Promise<ScoreV3[]> {
    const scores: ScoreV3[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.api.scoresV3.getManyV3({
        fields: "details,subject",
        limit: 100,
        ...filter,
        cursor,
      });
      scores.push(...page.data);
      cursor = page.meta.cursor;
    } while (cursor);

    return scores;
  }

  /** Waits until the filter matches at least `count` scores (default 1). */
  async waitForScores(
    filter: Omit<GetScoresV3Request, "cursor">,
    { count = 1, timeoutMs }: { count?: number } & PollOptions = {},
  ): Promise<ScoreV3[]> {
    return pollUntil(
      () => this.getScores(filter),
      (scores) => scores.length >= count,
      `${count} score(s) matching ${JSON.stringify(filter)}`,
      { timeoutMs },
    );
  }

  async waitForScore(id: string, options?: PollOptions): Promise<ScoreV3> {
    const [score] = await this.waitForScores({ id }, options);
    return score;
  }

  /** Waits until the experiment is listed and `until` (if given) accepts it. */
  async waitForExperiment(
    experimentId: string,
    options: {
      fromStartTime: string;
      /**
       * Waits for this many experiment items first. Item root spans carry the
       * root-only fields (e.g. description) and can arrive after child spans,
       * which already make the experiment visible.
       */
      itemCount?: number;
      fields?: string;
      until?: (experiment: Experiment) => boolean;
    } & PollOptions,
  ): Promise<Experiment> {
    const { fromStartTime, itemCount, fields, until, timeoutMs } = options;

    if (itemCount !== undefined) {
      await this.waitForExperimentItems(experimentId, {
        fromStartTime,
        count: itemCount,
        timeoutMs,
      });
    }

    const experiments = await pollUntil(
      async () =>
        (
          await this.api.experiments.list({
            id: experimentId,
            fromStartTime,
            fields,
          })
        ).data,
      (data) => data.length > 0 && (until?.(data[0]) ?? true),
      `experiment ${experimentId}`,
      { timeoutMs },
    );

    return experiments[0];
  }

  /** Waits until the experiment has at least `count` items (default 1). */
  async waitForExperimentItems(
    experimentId: string,
    options: {
      fromStartTime: string;
      count?: number;
      fields?: string;
      until?: (items: ExperimentItem[]) => boolean;
    } & PollOptions,
  ): Promise<ExperimentItem[]> {
    const { fromStartTime, count = 1, fields, until, timeoutMs } = options;

    const listItems = async () => {
      const items: ExperimentItem[] = [];
      let cursor: string | undefined;

      do {
        const page = await this.api.experiments.listItems({
          experimentId,
          fromStartTime,
          fields,
          limit: 100,
          cursor,
        });
        items.push(...page.data);
        cursor = page.meta.cursor;
      } while (cursor);

      return items;
    };

    return pollUntil(
      listItems,
      (items) => items.length >= count && (until?.(items) ?? true),
      `${count} item(s) in experiment ${experimentId}`,
      { timeoutMs },
    );
  }

  expectObservation(
    observations: ObservationV2[],
    name: string,
    expected: Partial<ObservationV2> = {},
  ): ObservationV2 {
    const observation = observations.find((obs) => obs.name === name);

    if (!observation) {
      throw new Error(
        `Observation "${name}" not found. Available: [${observations.map((obs) => obs.name).join(", ")}]`,
      );
    }

    expect(observation).toMatchObject(expected);

    return observation;
  }

  expectObservationParent(
    observations: ObservationV2[],
    childName: string,
    parentName: string,
  ): void {
    const child = this.expectObservation(observations, childName);
    const parent = this.expectObservation(observations, parentName);

    expect(
      child.parentObservationId,
      `"${childName}" should be a child of "${parentName}"`,
    ).toBe(parent.id);
  }

  getRootObservation(observations: ObservationV2[]): ObservationV2 {
    const roots = observations.filter((obs) => !obs.parentObservationId);

    if (roots.length !== 1) {
      throw new Error(
        `Expected exactly one root observation, got [${roots.map((obs) => obs.name).join(", ")}]`,
      );
    }

    return roots[0];
  }
}
