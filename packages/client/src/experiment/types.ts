import { DatasetItem, ScoreBody } from "@langfuse/core";

export type ExperimentItem<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> =
  | {
      /**
       * The input data to pass to the task function.
       *
       * Can be any type - string, object, array, etc. This data will be passed
       * to your task function as the `input` parameter. Structure it according
       * to your task's requirements.
       */
      input?: Input;

      /**
       * The expected output for evaluation purposes.
       *
       * Optional ground truth or reference output for this input.
       * Used by evaluators to assess task performance. If not provided,
       * only evaluators that don't require expected output can be used.
       */
      expectedOutput?: ExpectedOutput;

      /**
       * Optional metadata to attach to the experiment item.
       *
       * Store additional context, tags, or custom data related to this specific item.
       * This metadata will be available in traces and can be used for filtering,
       * analysis, or custom evaluator logic.
       */
      metadata?: Metadata;
    }
  | DatasetItem;

/**
 * Parameters passed to an experiment task function.
 *
 * Can be either an ExperimentItem (for custom datasets) or a DatasetItem
 * (for Langfuse datasets). The task function should handle both types.
 *
 * @public
 * @since 4.1.0
 */
export type ExperimentTaskParams<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = ExperimentItem<Input, ExpectedOutput, Metadata>;

/**
 * Function type for experiment tasks that process input data and return output.
 *
 * The task function is the core component being tested in an experiment.
 * It receives either an ExperimentItem or DatasetItem and produces output
 * that will be evaluated.
 *
 * @param params - Either an ExperimentItem or DatasetItem containing input and metadata
 * @returns Promise resolving to the task's output (any type)
 *
 * @example Task handling both item types
 * ```typescript
 * const universalTask: ExperimentTask = async (item) => {
 *   // Works with both ExperimentItem and DatasetItem
 *   const input = item.input;
 *   const metadata = item.metadata;
 *
 *   const response = await openai.chat.completions.create({
 *     model: "gpt-4",
 *     messages: [{ role: "user", content: input }]
 *   });
 *
 *   return response.choices[0].message.content;
 * };
 * ```
 *
 * @public
 * @since 4.1.0
 */
export type ExperimentTask<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = (
  params: ExperimentTaskParams<Input, ExpectedOutput, Metadata>,
) => Promise<any>;

export type Evaluation = Pick<
  ScoreBody,
  "name" | "value" | "comment" | "metadata" | "dataType" | "configId"
>;

export type EvaluatorParams<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  /**
   * The original input data passed to the task.
   *
   * This is the same input that was provided to the task function.
   * Use this for context-aware evaluations or input-output relationship analysis.
   */
  input: Input;

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
  expectedOutput?: ExpectedOutput;

  /**
   * Optional metadata about the evaluation context.
   *
   * Contains additional information from the experiment item or dataset item
   * that may be useful for evaluation logic, such as tags, categories,
   * or other contextual data.
   */
  metadata?: Metadata;
};
export type Evaluator<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = (
  params: EvaluatorParams<Input, ExpectedOutput, Metadata>,
) => Promise<Evaluation[] | Evaluation>;

export type RunEvaluatorParams<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  /**
   * Results from all processed experiment items.
   *
   * Each item contains the input, output, evaluations, and metadata from
   * processing a single data item. Use this for aggregate analysis,
   * statistical calculations, and cross-item comparisons.
   */
  itemResults: ExperimentItemResult<Input, ExpectedOutput, Metadata>[];
};
export type RunEvaluator<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = (
  params: RunEvaluatorParams<Input, ExpectedOutput, Metadata>,
) => Promise<Evaluation[] | Evaluation>;

export type ExperimentParams<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  /**
   * Human-readable name for the experiment.
   *
   * This name will appear in Langfuse UI and experiment results.
   * Choose a descriptive name that identifies the experiment's purpose.
   */
  name: string;

  /**
   * Optional exact name for the experiment run.
   *
   * If provided, this will be used as the exact dataset run name if the data
   * contains Langfuse dataset items. If not provided, this will default to
   * the experiment name appended with an ISO timestamp.
   */
  runName?: string;

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
  data: ExperimentItem<Input, ExpectedOutput, Metadata>[];

  /**
   * The task function to execute on each data item.
   *
   * This function receives input data and produces output that will be evaluated.
   * It should encapsulate the model or system being tested.
   */
  task: ExperimentTask<Input, ExpectedOutput, Metadata>;

  /**
   * Optional array of evaluator functions to assess each item's output.
   *
   * Each evaluator receives input, output, and expected output (if available)
   * and returns evaluation results. Multiple evaluators enable comprehensive assessment.
   */
  evaluators?: Evaluator<Input, ExpectedOutput, Metadata>[];

  /**
   * Optional array of run-level evaluators to assess the entire experiment.
   *
   * These evaluators receive all item results and can perform aggregate analysis
   * like calculating averages, detecting patterns, or statistical analysis.
   */
  runEvaluators?: RunEvaluator<Input, ExpectedOutput, Metadata>[];

  /**
   * Maximum number of concurrent task executions (default: Infinity).
   *
   * Controls parallelism to manage resource usage and API rate limits.
   * Set lower values for expensive operations or rate-limited services.
   */
  maxConcurrency?: number;

  /**
   * Whether to show a terminal progress bar (tqdm-style) when running in Node with a TTY.
   *
   * Default: true when stderr is a TTY, false otherwise (e.g. browser, CI, piped output).
   * Set to false to disable the bar.
   */
  progress?: boolean;
};

export type ExperimentItemResult<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = Pick<
  ExperimentItem<Input, ExpectedOutput, Metadata>,
  "input" | "expectedOutput"
> & {
  /**
   * The original experiment or dataset item that was processed.
   *
   * Contains the complete original item data including input, expected output,
   * metadata, and any additional fields. Useful for accessing item-specific
   * context or metadata in result analysis.
   */
  item: ExperimentItem<Input, ExpectedOutput, Metadata>;
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
 * console.log(await result.format());
 *
 * // Print summary with individual item results
 * console.log(await result.format({ includeItemResults: true }));
 *
 * // Link to dataset run (if available)
 * if (result.datasetRunUrl) {
 *   console.log(`View in Langfuse: dataset run ${result.datasetRunUrl}`);
 * }
 * ```
 *
 * @public
 */
export type ExperimentResult<
  Input = any,
  ExpectedOutput = any,
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  /**
   * The experiment run name.
   *
   * This is equal to the dataset run name if experiment was on Langfuse dataset.
   * Either the provided runName parameter or generated name (experiment name + timestamp).
   */
  runName: string;

  /**
   * ID of the dataset run in Langfuse (only for experiments on Langfuse datasets).
   *
   * Present only when running experiments on Langfuse datasets.
   * Use this ID to access the dataset run via the Langfuse API or UI
   * for detailed analysis and comparison with other runs.
   */
  datasetRunId?: string;

  /**
   * URL to the dataset run in the Langfuse UI (only for experiments on Langfuse datasets).
   *
   * Direct link to view the complete dataset run in the Langfuse web interface,
   * including all experiment results, traces, and analytics. Provides easy access
   * to detailed analysis and visualization of the experiment.
   */
  datasetRunUrl?: string;

  /**
   * Results from processing each individual data item.
   *
   * Contains the complete results for every item in your experiment data,
   * including inputs, outputs, evaluations, and trace information.
   * Use this for detailed analysis of individual item performance.
   */
  itemResults: ExperimentItemResult<Input, ExpectedOutput, Metadata>[];

  /**
   * Results from run-level evaluators that assessed the entire experiment.
   *
   * Contains aggregate evaluations that analyze the complete experiment,
   * such as average scores, statistical measures, or overall quality assessments.
   */
  runEvaluations: Evaluation[];

  /**
   * Function to format experiment results in a human-readable format.
   *
   * Generates a comprehensive, nicely formatted summary including individual results,
   * aggregate statistics, evaluation scores, and links to traces and dataset runs.
   *
   * @param options - Formatting options
   * @param options.includeItemResults - Whether to include individual item details (default: false)
   * @returns Promise resolving to formatted string representation
   */
  format: (options?: { includeItemResults?: boolean }) => Promise<string>;
};
