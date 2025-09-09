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
export type Evaluator = (
  params: EvaluatorParams,
) => Promise<Evaluation[] | Evaluation>;

export type RunEvaluatorParams = {
  itemResults: ExperimentItemResult[];
};
export type RunEvaluator = (
  params: RunEvaluatorParams,
) => Promise<Evaluation[] | Evaluation>;

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

/**
 * Complete result of an experiment execution.
 *
 * Contains all results from processing the experiment data,
 * including individual item results, run-level evaluations,
 * and utilities for result visualization.
 *
 * @example Using experiment results
 * ```typescript
 * const result = await langfuse.experiment.run(config);
 *
 * // Access individual results
 * console.log(`Processed ${result.itemResults.length} items`);
 *
 * // Check run-level evaluations
 * const avgScore = result.runEvaluations.find(e => e.name === 'average_score');
 * console.log(`Average score: ${avgScore?.value}`);
 *
 * // Print formatted results
 * console.log(await result.prettyPrint());
 *
 * // Print summary only (for large datasets)
 * console.log(await result.prettyPrint({ includeItemResults: false }));
 *
 * // Link to dataset run (if available)
 * if (result.datasetRunId) {
 *   console.log(`View in Langfuse: dataset run ${result.datasetRunId}`);
 * }
 * ```
 *
 * @public
 */
export type ExperimentResult = {
  /** ID of the dataset run in Langfuse (only for experiments on Langfuse datasets) */
  datasetRunId?: string;
  /** Results from processing each individual data item */
  itemResults: ExperimentItemResult[];
  /** Results from run-level evaluators that assessed the entire experiment */
  runEvaluations: Evaluation[];
  /**
   * Function to format and display experiment results in a human-readable format.
   *
   * @param options - Formatting options
   * @param options.includeItemResults - Whether to include individual item details (default: true)
   * @returns Promise resolving to formatted string representation
   */
  prettyPrint: (options?: { includeItemResults?: boolean }) => Promise<string>;
};
