import { ScoreBody } from "@langfuse/core";

import { FetchedDataset } from "../dataset/index.js";
import { LangfuseClient } from "../LangfuseClient.js";

export type ExperimentItem = {
  input?: any;
  expectedOutput?: any;
};

export type ExperimentTaskParams = Pick<ExperimentItem, "input"> & {
  metadata?: any;
};
export type ExperimentTask = (params: ExperimentTaskParams) => Promise<any>;

export type Evaluation = Pick<
  ScoreBody,
  "name" | "value" | "comment" | "metadata"
>;

export type EvaluatorParams = {
  input: any;
  output: any;
  expectedOutput?: any;
};
export type Evaluator = (params: EvaluatorParams) => Promise<Evaluation[]>;

export type ExperimentParams = {
  name: string;
  description?: string;
  data: ExperimentItem[] | FetchedDataset["items"];
  task: ExperimentTask;
  evaluators?: Evaluator[];

  apiClient: LangfuseClient;
};

export type ExperimentRunConfig = {
  maxConcurrency?: number;
};

export type ExperimentItemResult = Pick<ExperimentItem, "expectedOutput"> & {
  output: any;
  evaluations: Evaluation[];
  traceId?: string;
};

export type ExperimentResult = {
  datasetRunId?: string;
  itemResults: ExperimentItemResult[];
};

export class Experiment {
  name: string;
  description?: string;
  data: ExperimentItem[] | FetchedDataset["items"];
  task: ExperimentTask;
  evaluators: Evaluator[];
  langfuseClient: LangfuseClient;

  private hasRun = false;
  private itemResults: ExperimentItemResult[] = [];

  constructor(params: ExperimentParams) {
    this.name = params.name;
    this.description = params.description;
    this.data = params.data;
    this.task = params.task;
    this.evaluators = params.evaluators ?? [];

    this.langfuseClient = params.apiClient;
  }

  public async run(config?: ExperimentRunConfig): Promise<void> {
    const batchSize = config?.maxConcurrency ?? Infinity;

    for (let i = 0; i <= this.data.length; i += batchSize) {
      const batch = this.data.slice(i, i + batchSize);

      const promises: Promise<ExperimentItemResult>[] = batch.map(
        async (item) => {
          return this.runItem(item);
        },
      );

      const results = await Promise.all(promises);

      this.itemResults.push(...results);
    }

    // flush scores
    await this.langfuseClient.score.flush();

    this.hasRun = true;
  }

  private async runItem(item: ExperimentItem): Promise<ExperimentItemResult> {
    const output = await this.task(item);

    const evals: Evaluation[] = [];

    for (const evaluator of this.evaluators) {
      const evaluation = await evaluator({
        input: item.input,
        expectedOutput: item.expectedOutput,
        output,
      });

      evals.push(...evaluation.flat());
    }

    return {
      output,
      evaluations: evals,
    };
  }

  public async getResult(): Promise<ExperimentResult> {
    if (!this.hasRun) {
      throw Error("Experiment has not yet run.");
    }

    return { itemResults: this.itemResults };
  }
}
