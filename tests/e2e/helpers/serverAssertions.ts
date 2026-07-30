import {
  LangfuseAPIClient,
  Trace,
  Observation,
  getEnv,
  TraceWithFullDetails,
  TraceWithDetails,
} from "@langfuse/core";

export class ServerAssertions {
  private baseUrl: string;
  public api: LangfuseAPIClient;

  constructor() {
    this.baseUrl = getEnv("LANGFUSE_BASE_URL") || "http://localhost:3000";

    const publicKey = getEnv("LANGFUSE_PUBLIC_KEY");
    const secretKey = getEnv("LANGFUSE_SECRET_KEY");

    if (!publicKey || !secretKey) {
      throw new Error(
        "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set for E2E tests",
      );
    }

    this.api = new LangfuseAPIClient({
      baseUrl: this.baseUrl,
      username: publicKey,
      password: secretKey,
      environment: "", // noop as baseUrl is set
    });
  }

  async fetchTrace(traceId: string) {
    return this.api.trace.get(traceId);
  }

  async fetchTraces(
    options: {
      name?: string;
      userId?: string;
      sessionId?: string;
      limit?: number;
    } = {},
  ) {
    const { sessionId, userId, name, limit } = options;

    return (
      await this.api.trace.list({
        sessionId,
        userId,
        name,
        limit,
      })
    ).data;
  }

  /**
   * Assert that a trace exists with specific properties
   */
  expectTraceExists(trace: Trace, expectedProperties: Partial<Trace>): void {
    if (expectedProperties.name !== undefined) {
      if (trace.name !== expectedProperties.name) {
        throw new Error(
          `Expected trace name "${expectedProperties.name}", got "${trace.name}"`,
        );
      }
    }

    if (expectedProperties.userId !== undefined) {
      if (trace.userId !== expectedProperties.userId) {
        throw new Error(
          `Expected trace userId "${expectedProperties.userId}", got "${trace.userId}"`,
        );
      }
    }

    if (expectedProperties.sessionId !== undefined) {
      if (trace.sessionId !== expectedProperties.sessionId) {
        throw new Error(
          `Expected trace sessionId "${expectedProperties.sessionId}", got "${trace.sessionId}"`,
        );
      }
    }

    if (expectedProperties.public !== undefined) {
      if (trace.public !== expectedProperties.public) {
        throw new Error(
          `Expected trace public "${expectedProperties.public}", got "${trace.public}"`,
        );
      }
    }
  }

  /**
   * Assert that an observation exists with specific properties
   */
  expectObservationExists(
    trace: TraceWithFullDetails,
    observationName: string,
    expectedProperties: Partial<Observation>,
  ): Observation {
    const observation = trace.observations.find(
      (obs) => obs.name === observationName,
    );

    if (!observation) {
      const availableNames = trace.observations.map((obs) => obs.name);
      throw new Error(
        `Observation "${observationName}" not found. Available: [${availableNames.join(", ")}]`,
      );
    }

    if (expectedProperties.type !== undefined) {
      if (observation.type !== expectedProperties.type) {
        throw new Error(
          `Expected observation type "${expectedProperties.type}", got "${observation.type}"`,
        );
      }
    }

    if (expectedProperties.level !== undefined) {
      if (observation.level !== expectedProperties.level) {
        throw new Error(
          `Expected observation level "${expectedProperties.level}", got "${observation.level}"`,
        );
      }
    }

    if (expectedProperties.model !== undefined) {
      if (observation.model !== expectedProperties.model) {
        throw new Error(
          `Expected observation model "${expectedProperties.model}", got "${observation.model}"`,
        );
      }
    }

    return observation;
  }

  /**
   * Assert parent-child relationship between observations
   */
  expectObservationParent(
    trace: TraceWithFullDetails,
    childName: string,
    parentName: string,
  ): void {
    const child = trace.observations.find((obs) => obs.name === childName);
    const parent = trace.observations.find((obs) => obs.name === parentName);

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
    trace: TraceWithFullDetails | TraceWithDetails,
    expectedCount: number,
  ): void {
    if (trace.observations.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} observations, got ${trace.observations.length}`,
      );
    }
  }
}
