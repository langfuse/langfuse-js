import type { LangfuseClient } from "../LangfuseClient.js";

import type {
  ExperimentItem,
  ExperimentParams,
  ExperimentResult,
} from "./types.js";

export type RunnerContextOptions<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  client: LangfuseClient;
  data?: ExperimentItem<Input, ExpectedOutput, Metadata>[];
  datasetVersion?: string;
  metadata?: Record<string, any>;
};

export type RunnerContextExperimentParams<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = Omit<
  ExperimentParams<Input, ExpectedOutput, Metadata>,
  "data" | "datasetVersion" | "metadata"
> & {
  data?: ExperimentItem<Input, ExpectedOutput, Metadata>[];
  datasetVersion?: string;
  metadata?: Record<string, any>;
};

/**
 * Wraps `langfuse.experiment.run` with CI-injected defaults.
 *
 * Intended for use with the `langfuse/experiment-action` GitHub Action.
 * Defaults set here are applied when the caller omits them on the
 * `runExperiment` call, while explicit call-time values still win.
 *
 * @public
 */
export class RunnerContext<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> {
  public readonly client: LangfuseClient;
  public readonly data?: ExperimentItem<Input, ExpectedOutput, Metadata>[];
  public readonly datasetVersion?: string;
  public readonly metadata?: Record<string, any>;

  constructor({
    client,
    data,
    datasetVersion,
    metadata,
  }: RunnerContextOptions<Input, ExpectedOutput, Metadata>) {
    this.client = client;
    this.data = data;
    this.datasetVersion = datasetVersion;
    this.metadata = metadata;
  }

  async runExperiment(
    params: RunnerContextExperimentParams<Input, ExpectedOutput, Metadata>,
  ): Promise<ExperimentResult<Input, ExpectedOutput, Metadata>> {
    const resolvedData = params.data ?? this.data;

    if (resolvedData === undefined) {
      throw new Error(
        "`data` must be provided either on the RunnerContext or the runExperiment call",
      );
    }

    const mergedMetadata =
      this.metadata === undefined && params.metadata === undefined
        ? undefined
        : {
            ...(this.metadata ?? {}),
            ...(params.metadata ?? {}),
          };

    return this.client.experiment.run({
      ...params,
      data: resolvedData,
      datasetVersion: params.datasetVersion ?? this.datasetVersion,
      metadata: mergedMetadata,
    });
  }
}

export type RegressionErrorOptions<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  result: ExperimentResult<Input, ExpectedOutput, Metadata>;
  metric?: string;
  value?: number;
  threshold?: number;
  message?: string;
};

/**
 * Raised by experiment runners to signal a CI gate failure.
 *
 * Intended for use with the `langfuse/experiment-action` GitHub Action.
 *
 * @public
 */
export class RegressionError<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> extends Error {
  public readonly result: ExperimentResult<Input, ExpectedOutput, Metadata>;
  public readonly metric?: string;
  public readonly value?: number;
  public readonly threshold?: number;

  constructor({
    result,
    metric,
    value,
    threshold,
    message,
  }: RegressionErrorOptions<Input, ExpectedOutput, Metadata>) {
    super(
      message ??
        (metric !== undefined && value !== undefined
          ? `Regression on \`${metric}\`: ${value} (threshold ${threshold})`
          : "Experiment regression detected"),
    );

    this.name = "RegressionError";
    this.result = result;
    this.metric = metric;
    this.value = value;
    this.threshold = threshold;
  }
}
