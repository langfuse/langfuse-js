import {
  getEnv,
  LangfuseAPIClient,
  type Experiment,
  type ExperimentItem,
  type ObservationV2,
  type ScoreV3,
} from "@langfuse/core";

const OBSERVATION_FIELD_GROUPS =
  "core,basic,time,io,metadata,model,usage,prompt,metrics,trace_context";
const EXPERIMENT_FROM_START_TIME = "2020-01-01T00:00:00Z";

type V4ObservationResponse = ObservationV2 & {
  model?: string | null;
  inputUsage?: number;
  outputUsage?: number;
  totalUsage?: number;
  inputCost?: number | null;
  outputCost?: number | null;
};

export type TestObservation = ObservationV2 & {
  input: any;
  output: any;
  model: string | null;
  usage: Record<string, number>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calculatedInputCost: number | null;
  calculatedOutputCost: number | null;
  calculatedTotalCost: number | null;
};

export type TraceSnapshot = {
  id: string;
  name: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  release: string | null;
  public: boolean;
  metadata: unknown;
  input: unknown;
  output: unknown;
  observations: TestObservation[];
};

export type ScoreSnapshot = ScoreV3 & {
  traceId: string | null;
  observationId: string | null;
  sessionId: string | null;
  datasetRunId: string | null;
  stringValue?: string;
};

function parseIo(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toTestObservation(
  observation: V4ObservationResponse,
): TestObservation {
  const inputUsage =
    observation.inputUsage ??
    observation.usageDetails?.input ??
    observation.usageDetails?.prompt_tokens ??
    0;
  const outputUsage =
    observation.outputUsage ??
    observation.usageDetails?.output ??
    observation.usageDetails?.completion_tokens ??
    0;
  const totalUsage =
    observation.totalUsage ??
    observation.usageDetails?.total ??
    observation.usageDetails?.total_tokens ??
    inputUsage + outputUsage;

  return {
    ...observation,
    input: parseIo(observation.input),
    output: parseIo(observation.output),
    model: observation.model ?? observation.providedModelName ?? null,
    usage: observation.usageDetails ?? {},
    promptTokens: inputUsage,
    completionTokens: outputUsage,
    totalTokens: totalUsage,
    calculatedInputCost:
      observation.inputCost ?? observation.costDetails?.input ?? null,
    calculatedOutputCost:
      observation.outputCost ?? observation.costDetails?.output ?? null,
    calculatedTotalCost: observation.totalCost ?? null,
  };
}

function toTraceSnapshot(
  traceId: string,
  observations: TestObservation[],
): TraceSnapshot {
  if (observations.length === 0) {
    throw new Error(`Trace "${traceId}" has no observations`);
  }

  const root =
    observations.find((observation) => observation.isRootObservation) ??
    observations.find((observation) => !observation.parentObservationId) ??
    observations[0];

  return {
    id: traceId,
    name: root.traceName ?? root.name ?? null,
    userId: root.userId ?? null,
    sessionId: root.sessionId ?? null,
    tags: root.tags ?? [],
    release: root.release ?? null,
    public: observations.some((observation) => observation.public === true),
    metadata: root.metadata,
    input: root.input,
    output: root.output,
    observations,
  };
}

export class ServerAssertions {
  public api: LangfuseAPIClient;

  constructor(api?: LangfuseAPIClient) {
    if (api) {
      this.api = api;
      return;
    }

    const baseUrl = getEnv("LANGFUSE_BASE_URL") || "http://localhost:3000";
    const publicKey = getEnv("LANGFUSE_PUBLIC_KEY");
    const secretKey = getEnv("LANGFUSE_SECRET_KEY");

    if (!publicKey || !secretKey) {
      throw new Error(
        "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set for E2E tests",
      );
    }

    this.api = new LangfuseAPIClient({
      baseUrl,
      username: publicKey,
      password: secretKey,
      environment: "", // noop as baseUrl is set
    });
  }

  async fetchObservations(
    options: {
      traceId?: string;
      name?: string;
      userId?: string;
      sessionId?: string;
    } = {},
  ): Promise<TestObservation[]> {
    const data: TestObservation[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.api.observations.getMany({
        fields: OBSERVATION_FIELD_GROUPS,
        limit: 1_000,
        cursor,
        traceId: options.traceId,
        name: options.name,
        userId: options.userId,
        filter: options.sessionId
          ? JSON.stringify([
              {
                type: "string",
                column: "sessionId",
                operator: "=",
                value: options.sessionId,
              },
            ])
          : undefined,
      });

      data.push(
        ...(response.data as V4ObservationResponse[]).map(toTestObservation),
      );
      cursor = response.meta.cursor;
    } while (cursor);

    return data;
  }

  async fetchTrace(traceId: string): Promise<TraceSnapshot> {
    return toTraceSnapshot(traceId, await this.fetchObservations({ traceId }));
  }

  async fetchScore(scoreId: string): Promise<ScoreSnapshot> {
    const response = await this.api.scoresV3.getManyV3({
      id: scoreId,
      fields: "details,subject,annotation",
      limit: 1,
    });
    const score = response.data[0];

    if (!score) {
      throw new Error(`Score "${scoreId}" not found`);
    }

    const subject = score.subject;

    return {
      ...score,
      traceId:
        subject?.kind === "trace"
          ? subject.id
          : subject?.kind === "observation"
            ? (subject.traceId ?? null)
            : null,
      observationId: subject?.kind === "observation" ? subject.id : null,
      sessionId: subject?.kind === "session" ? subject.id : null,
      datasetRunId: subject?.kind === "experiment" ? subject.id : null,
      ...(typeof score.value === "string" ? { stringValue: score.value } : {}),
    };
  }

  async fetchExperiments(
    options: {
      id?: string;
      name?: string;
      datasetId?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    return this.api.experiments.list({
      fromStartTime: EXPERIMENT_FROM_START_TIME,
      fields: "core,metadata,scores",
      id: options.id,
      name: options.name,
      datasetId: options.datasetId,
      limit: options.limit,
      cursor: options.cursor,
    });
  }

  async fetchExperiment(options: {
    id?: string;
    name?: string;
    datasetId?: string;
  }): Promise<Experiment> {
    const response = await this.fetchExperiments({ ...options, limit: 2 });

    if (response.data.length !== 1) {
      throw new Error(`Expected one experiment, found ${response.data.length}`);
    }

    return response.data[0];
  }

  async fetchExperimentItems(experimentId: string): Promise<ExperimentItem[]> {
    const data: ExperimentItem[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.api.experiments.listItems({
        fromStartTime: EXPERIMENT_FROM_START_TIME,
        fields:
          "core,dataset,io,metadata,itemMetadata,experimentMetadata,scores",
        experimentId,
        limit: 100,
        cursor,
      });
      data.push(...response.data);
      cursor = response.meta.cursor;
    } while (cursor);

    return data;
  }

  async fetchTraces(
    options: {
      name?: string;
      userId?: string;
      sessionId?: string;
      limit?: number;
    } = {},
  ): Promise<TraceSnapshot[]> {
    const filters = [
      options.name
        ? {
            type: "string",
            column: "traceName",
            operator: "=",
            value: options.name,
          }
        : undefined,
      options.userId
        ? {
            type: "string",
            column: "userId",
            operator: "=",
            value: options.userId,
          }
        : undefined,
      options.sessionId
        ? {
            type: "string",
            column: "sessionId",
            operator: "=",
            value: options.sessionId,
          }
        : undefined,
    ].filter(Boolean);

    const response = await this.api.observations.getMany({
      fields: OBSERVATION_FIELD_GROUPS,
      limit: 1_000,
      filter: filters.length > 0 ? JSON.stringify(filters) : undefined,
    });
    const byTrace = new Map<string, TestObservation[]>();

    for (const rawObservation of response.data as V4ObservationResponse[]) {
      if (!rawObservation.traceId) {
        continue;
      }

      const observations = byTrace.get(rawObservation.traceId) ?? [];
      observations.push(toTestObservation(rawObservation));
      byTrace.set(rawObservation.traceId, observations);
    }

    return [...byTrace.entries()]
      .map(([traceId, observations]) => toTraceSnapshot(traceId, observations))
      .slice(0, options.limit);
  }

  /**
   * Assert that a trace exists with specific properties
   */
  expectTraceExists(
    trace: TraceSnapshot,
    expectedProperties: Partial<TraceSnapshot>,
  ): void {
    if (
      expectedProperties.name !== undefined &&
      trace.name !== expectedProperties.name
    ) {
      throw new Error(
        `Expected trace name "${expectedProperties.name}", got "${trace.name}"`,
      );
    }

    if (
      expectedProperties.userId !== undefined &&
      trace.userId !== expectedProperties.userId
    ) {
      throw new Error(
        `Expected trace userId "${expectedProperties.userId}", got "${trace.userId}"`,
      );
    }

    if (
      expectedProperties.sessionId !== undefined &&
      trace.sessionId !== expectedProperties.sessionId
    ) {
      throw new Error(
        `Expected trace sessionId "${expectedProperties.sessionId}", got "${trace.sessionId}"`,
      );
    }

    if (
      expectedProperties.public !== undefined &&
      trace.public !== expectedProperties.public
    ) {
      throw new Error(
        `Expected trace public "${expectedProperties.public}", got "${trace.public}"`,
      );
    }
  }

  /**
   * Assert that an observation exists with specific properties
   */
  expectObservationExists(
    trace: TraceSnapshot,
    observationName: string,
    expectedProperties: Partial<TestObservation>,
  ): TestObservation {
    const observation = trace.observations.find(
      (item) => item.name === observationName,
    );

    if (!observation) {
      const availableNames = trace.observations.map((item) => item.name);
      throw new Error(
        `Observation "${observationName}" not found. Available: [${availableNames.join(", ")}]`,
      );
    }

    if (
      expectedProperties.type !== undefined &&
      observation.type !== expectedProperties.type
    ) {
      throw new Error(
        `Expected observation type "${expectedProperties.type}", got "${observation.type}"`,
      );
    }

    if (
      expectedProperties.level !== undefined &&
      observation.level !== expectedProperties.level
    ) {
      throw new Error(
        `Expected observation level "${expectedProperties.level}", got "${observation.level}"`,
      );
    }

    if (
      expectedProperties.model !== undefined &&
      observation.model !== expectedProperties.model
    ) {
      throw new Error(
        `Expected observation model "${expectedProperties.model}", got "${observation.model}"`,
      );
    }

    return observation;
  }

  /**
   * Assert parent-child relationship between observations
   */
  expectObservationParent(
    trace: TraceSnapshot,
    childName: string,
    parentName: string,
  ): void {
    const child = trace.observations.find((item) => item.name === childName);
    const parent = trace.observations.find((item) => item.name === parentName);

    if (!child) {
      throw new Error(`Child observation "${childName}" not found`);
    }

    if (!parent) {
      throw new Error(`Parent observation "${parentName}" not found`);
    }

    if (child.parentObservationId !== parent.id) {
      throw new Error(
        `Expected "${childName}" to be child of "${parentName}", but parentObservationId is "${child.parentObservationId}" (expected "${parent.id}")`,
      );
    }
  }

  /**
   * Assert observation count in trace
   */
  expectObservationCount(
    trace: Pick<TraceSnapshot, "observations">,
    expectedCount: number,
  ): void {
    if (trace.observations.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} observations, got ${trace.observations.length}`,
      );
    }
  }
}
