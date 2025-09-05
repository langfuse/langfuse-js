import { DatasetItem, ScoreBody } from "@langfuse/core";

import { LangfuseClient } from "../LangfuseClient.js";

export type ExperimentItem = {
  input?: any;
  expectedOutput?: any;
};

export type ExperimentTaskParams = Pick<ExperimentItem, "input">;
export type ExperimentTask = (params: ExperimentTaskParams) => Promise<any>;

export type Evaluation = Pick<
  ScoreBody,
  "name" | "value" | "comment" | "metadata" | "dataType"
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
  metadata?: Record<string, any>;
  langfuseClient: LangfuseClient;

  data: ExperimentItem[] | DatasetItem[];
  task: ExperimentTask;
  evaluators?: Evaluator[];
};

export type ExperimentRunConfig = {
  maxConcurrency?: number;
};

export type ExperimentItemResult = Pick<
  ExperimentItem,
  "input" | "expectedOutput"
> & {
  output: any;
  evaluations: Evaluation[];
  traceId?: string;
};

export type ExperimentResult = {
  datasetRunId?: string;
  itemResults: ExperimentItemResult[];
  prettyPrint: () => Promise<string>;
};
