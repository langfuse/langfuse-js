import { DatasetItem, ScoreBody } from "@langfuse/core";

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

export type RunEvaluatorParams = {
  itemResults: ExperimentItemResult[];
};
export type RunEvaluator = (
  params: RunEvaluatorParams,
) => Promise<Evaluation[]>;

export type ExperimentParams = {
  name: string;
  description?: string;
  metadata?: Record<string, any>;

  data: ExperimentItem[] | DatasetItem[];
  task: ExperimentTask;
  evaluators?: Evaluator[];
  runEvaluators?: RunEvaluator[];

  maxConcurrency?: number;
};

export type ExperimentItemResult = Pick<
  ExperimentItem,
  "input" | "expectedOutput"
> & {
  output: any;
  evaluations: Evaluation[];
  traceId?: string;
  datasetRunId?: string;
};

export type ExperimentResult = {
  datasetRunId?: string;
  itemResults: ExperimentItemResult[];
  runEvaluations: Evaluation[];
  prettyPrint: (options?: { includeItemResults?: boolean }) => Promise<string>;
};
