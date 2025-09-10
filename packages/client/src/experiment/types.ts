import { DatasetItem, ScoreBody } from "@langfuse/core";

export type ExperimentItem = {
  /**
   * The input data to pass to the task function.
   *
   * Can be any type - string, object, array, etc. This data will be passed
   * to your task function as the `input` parameter. Structure it according
   * to your task's requirements.
   */
  input?: any;

  /**
   * The expected output for evaluation purposes.
   *
   * Optional ground truth or reference output for this input.
   * Used by evaluators to assess task performance. If not provided,
   * only evaluators that don't require expected output can be used.
   */
  expectedOutput?: any;
  metadata?: Record<string, any>;
};

export type ExperimentTaskParams = ExperimentItem | DatasetItem;
export type ExperimentTask = (params: ExperimentTaskParams) => Promise<any>;

export type Evaluation = Pick<
  ScoreBody,
  "name" | "value" | "comment" | "metadata" | "dataType"
>;

export type EvaluatorParams = {
  /**
   * The original input data passed to the task.
   *
   * This is the same input that was provided to the task function.
   * Use this for context-aware evaluations or input-output relationship analysis.
   */
  input: any;

  /**
   * The output produced by the task.
   *
   * This is the actual result returned by your task function.
   * This is the primary value to evaluate against expectations.
   */
  output: any;

  /**
   * The expected output for comparison (optional).
   *
   * This is the ground truth or expected result for the given input.
   * May not be available for all evaluation scenarios.
   */
  expectedOutput?: any;
  metadata?: Record<string, any>;
};
export type Evaluator = (
  params: EvaluatorParams,
) => Promise<Evaluation[] | Evaluation>;

export type RunEvaluatorParams = {
  /**
   * Results from all processed experiment items.
   *
   * Each item contains the input, output, evaluations, and metadata from
   * processing a single data item. Use this for aggregate analysis,
   * statistical calculations, and cross-item comparisons.
   */
  itemResults: ExperimentItemResult[];
};
export type RunEvaluator = (
  params: RunEvaluatorParams,
) => Promise<Evaluation[] | Evaluation>;

export type ExperimentParams = {
  /**
   * Human-readable name for the experiment.
   *
   * This name will appear in Langfuse UI and experiment results.
   * Choose a descriptive name that identifies the experiment's purpose.
   */
  name: string;

  /**
   * Optional description explaining the experiment's purpose.
   *
   * Provide context about what you're testing, methodology, or goals.
   * This helps with experiment tracking and result interpretation.
   */
  description?: string;

  /**
   * Optional metadata to attach to the experiment run.
   *
   * Store additional context like model versions, hyperparameters,
   * or any other relevant information for analysis and comparison.
   */
  metadata?: Record<string, any>;

  /**
   * Array of data items to process.
   *
   * Can be either custom ExperimentItem[] or DatasetItem[] from Langfuse.
   * Each item should contain input data and optionally expected output.
   */
  data: ExperimentItem[] | DatasetItem[];

  /**
   * The task function to execute on each data item.
   *
   * This function receives input data and produces output that will be evaluated.
   * It should encapsulate the model or system being tested.
   */
  task: ExperimentTask;

  /**
   * Optional array of evaluator functions to assess each item's output.
   *
   * Each evaluator receives input, output, and expected output (if available)
   * and returns evaluation results. Multiple evaluators enable comprehensive assessment.
   */
  evaluators?: Evaluator[];

  /**
   * Optional array of run-level evaluators to assess the entire experiment.
   *
   * These evaluators receive all item results and can perform aggregate analysis
   * like calculating averages, detecting patterns, or statistical analysis.
   */
  runEvaluators?: RunEvaluator[];

  /**
   * Maximum number of concurrent task executions (default: Infinity).
   *
   * Controls parallelism to manage resource usage and API rate limits.
   * Set lower values for expensive operations or rate-limited services.
   */
  maxConcurrency?: number;
};

export type ExperimentItemResult = Pick<
  ExperimentItem,
  "input" | "expectedOutput"
> & {
  item: ExperimentItem | DatasetItem;
  /**
   * The actual output produced by the task.
   *
   * This is the result returned by your task function for this specific input.
   * It will be passed to evaluators for assessment against expected outputs.
   */
  output: any;

  /**
   * Results from all evaluators that ran on this item.
   *
   * Contains evaluation scores, comments, and metadata from each evaluator
   * that successfully processed this item. Failed evaluators are excluded.
   */
  evaluations: Evaluation[];

  /**
   * Langfuse trace ID for this item's execution (for debugging and analysis).
   *
   * Use this ID to view detailed execution traces in the Langfuse UI,
   * including timing, inputs, outputs, and any nested observations.
   */
  traceId?: string;

  /**
   * Dataset run ID if this item was part of a Langfuse dataset.
   *
   * Present only when running experiments on Langfuse datasets.
   * Links this item result to a specific dataset run for tracking and comparison.
   */
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
 * // Print summary with individual item results
 * console.log(await result.prettyPrint({ includeItemResults: true }));
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
  /**
   * ID of the dataset run in Langfuse (only for experiments on Langfuse datasets).
   *
   * Present only when running experiments on Langfuse datasets.
   * Use this ID to access the dataset run via the Langfuse API or UI
   * for detailed analysis and comparison with other runs.
   */
  datasetRunId?: string;

  /**
   * Results from processing each individual data item.
   *
   * Contains the complete results for every item in your experiment data,
   * including inputs, outputs, evaluations, and trace information.
   * Use this for detailed analysis of individual item performance.
   */
  itemResults: ExperimentItemResult[];

  /**
   * Results from run-level evaluators that assessed the entire experiment.
   *
   * Contains aggregate evaluations that analyze the complete experiment,
   * such as average scores, statistical measures, or overall quality assessments.
   */
  runEvaluations: Evaluation[];

  /**
   * Function to format and display experiment results in a human-readable format.
   *
   * Generates a comprehensive, nicely formatted summary including individual results,
   * aggregate statistics, evaluation scores, and links to traces and dataset runs.
   *
   * @param options - Formatting options
   * @param options.includeItemResults - Whether to include individual item details (default: false)
   * @returns Promise resolving to formatted string representation
   */
  prettyPrint: (options?: { includeItemResults?: boolean }) => Promise<string>;
};
