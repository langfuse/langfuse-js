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
  data: ExperimentItem[] | FetchedDataset["items"];
  task: ExperimentTask;
  evaluators?: Evaluator[];

  langfuseClient: LangfuseClient;
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
  prettyPrint: () => Promise<string>;
};
