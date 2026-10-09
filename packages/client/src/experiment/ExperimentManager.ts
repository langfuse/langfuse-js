import {
  DatasetItem,
  getGlobalLogger,
  propagateAttributes,
  serializeValue,
  createExperimentId,
  createExperimentItemId,
  createStableExperimentId,
  LangfuseOtelSpanAttributes,
  LANGFUSE_SDK_EXPERIMENT_ENVIRONMENT,
} from "@langfuse/core";
import { startActiveObservation } from "@langfuse/tracing";
import { ProxyTracerProvider, trace } from "@opentelemetry/api";

import { LangfuseClient } from "../LangfuseClient.js";

import {
  ExperimentParams,
  ExperimentResult,
  ExperimentTask,
  ExperimentItem,
  ExperimentItemResult,
  Evaluator,
  Evaluation,
} from "./types.js";

/**
 * Manages the execution and evaluation of experiments on datasets.
 *
 * The ExperimentManager provides a comprehensive framework for running experiments
 * that test models or tasks against datasets, with support for automatic evaluation,
 * scoring.
 *
 * @example Basic experiment usage
 * ```typescript
 * const langfuse = new LangfuseClient();
 *
 * const result = await langfuse.experiment.run({
 *   name: "Capital Cities Test",
 *   description: "Testing model knowledge of world capitals",
 *   data: [
 *     { input: "France", expectedOutput: "Paris" },
 *     { input: "Germany", expectedOutput: "Berlin" }
 *   ],
 *   task: async ({ input }) => {
 *     const response = await openai.chat.completions.create({
 *       model: "gpt-4",
 *       messages: [{ role: "user", content: `What is the capital of ${input}?` }]
 *     });
 *     return response.choices[0].message.content;
 *   },
 *   evaluators: [
 *     async ({ input, output, expectedOutput }) => ({
 *       name: "exact_match",
 *       value: output === expectedOutput ? 1 : 0
 *     })
 *   ]
 * });
 *
 * console.log(await result.format());
 * ```
 *
 * @example Using with Langfuse datasets
 * ```typescript
 * const dataset = await langfuse.dataset.get("my-dataset");
 *
 * const result = await dataset.runExperiment({
 *   name: "Model Comparison",
 *   task: myTask,
 *   evaluators: [myEvaluator],
 *   runEvaluators: [averageScoreEvaluator]
 * });
 * ```
 *
 * @public
 */
export class ExperimentManager {
  private langfuseClient: LangfuseClient;

  /**
   * Creates a new ExperimentManager instance.
   *
   * @param params - Configuration object
   * @param params.langfuseClient - The Langfuse client instance for API communication
   * @internal
   */
  constructor(params: { langfuseClient: LangfuseClient }) {
    this.langfuseClient = params.langfuseClient;
  }

  /**
   * Gets the global logger instance for experiment-related logging.
   *
   * @returns The global logger instance
   * @internal
   */
  get logger() {
    return getGlobalLogger();
  }

  /**
   * Executes an experiment by running a task on each data item and evaluating the results.
   *
   * This method orchestrates the complete experiment lifecycle:
   * 1. Executes the task function on each data item with proper tracing
   * 2. Runs item-level evaluators on each task output
   * 3. Executes run-level evaluators on the complete result set
   * 4. Groups all items into one Langfuse experiment (stable per dataset and run name)
   * 5. Stores all scores and traces in Langfuse
   *
   * @param config - The experiment configuration
   * @param config.name - Human-readable name for the experiment
   * @param config.runName - Optional exact name for the experiment run (defaults to name + timestamp)
   * @param config.description - Optional description of the experiment's purpose
   * @param config.metadata - Optional metadata to attach to the experiment run
   * @param config.data - Array of data items to process (ExperimentItem[] or DatasetItem[])
   * @param config.task - Function that processes each data item and returns output
   * @param config.evaluators - Optional array of functions to evaluate each item's output
   * @param config.runEvaluators - Optional array of functions to evaluate the entire run
   * @param config.maxConcurrency - Maximum number of concurrent task executions (default: 50)
   *
   * @returns Promise that resolves to experiment results including:
   *   - experimentId: Identifier of the experiment in Langfuse
   *   - experimentUrl: Link to the experiment results in the Langfuse UI
   *   - runName: The experiment run name (either provided or generated)
   *   - itemResults: Results for each processed data item
   *   - runEvaluations: Results from run-level evaluators
   *   - datasetRunId: ID of the dataset run (if using Langfuse datasets)
   *   - format: Function to format results for display
   *
   * @throws {Error} When task execution fails and cannot be handled gracefully
   * @throws {Error} When required evaluators fail critically
   *
   * @example Simple experiment
   * ```typescript
   * const result = await langfuse.experiment.run({
   *   name: "Translation Quality Test",
   *   data: [
   *     { input: "Hello world", expectedOutput: "Hola mundo" },
   *     { input: "Good morning", expectedOutput: "Buenos días" }
   *   ],
   *   task: async ({ input }) => translateText(input, 'es'),
   *   evaluators: [
   *     async ({ output, expectedOutput }) => ({
   *       name: "bleu_score",
   *       value: calculateBleuScore(output, expectedOutput)
   *     })
   *   ]
   * });
   * ```
   *
   * @example Experiment with concurrency control
   * ```typescript
   * const result = await langfuse.experiment.run({
   *   name: "Large Scale Evaluation",
   *   data: largeBatchOfItems,
   *   task: expensiveModelCall,
   *   maxConcurrency: 5, // Process max 5 items simultaneously
   *   evaluators: [myEvaluator],
   *   runEvaluators: [
   *     async ({ itemResults }) => ({
   *       name: "average_score",
   *       value: itemResults.reduce((acc, r) => acc + r.evaluations[0].value, 0) / itemResults.length
   *     })
   *   ]
   * });
   * ```
   *
   * @see {@link ExperimentParams} for detailed parameter documentation
   * @see {@link ExperimentResult} for detailed return value documentation
   * @see {@link Evaluator} for evaluator function specifications
   * @see {@link RunEvaluator} for run evaluator function specifications
   *
   * @public
   */
  async run<
    Input = any,
    ExpectedOutput = any,
    Metadata extends Record<string, any> = Record<string, any>,
  >(
    config: ExperimentParams<Input, ExpectedOutput, Metadata>,
  ): Promise<ExperimentResult<Input, ExpectedOutput, Metadata>> {
    const {
      data,
      evaluators,
      task,
      name,
      runName: providedRunName,
      description,
      metadata,
      maxConcurrency = 50,
      runEvaluators,
    } = config;

    const runName = this.createExperimentRunName({
      name,
      runName: providedRunName,
    });
    const datasetIds = [
      ...new Set(
        data.flatMap((item) =>
          "datasetId" in item && item.datasetId ? [item.datasetId] : [],
        ),
      ),
    ];
    const datasetId = datasetIds[0];
    const tracingEnabled = this.isOtelRegistered();
    if (!tracingEnabled) {
      this.logger.warn(
        "OpenTelemetry has not been set up. Traces will not be sent to Langfuse.See our docs on how to set up OpenTelemetry: https://langfuse.com/docs/observability/sdk/typescript/setup#tracing-setup",
      );
    }

    // Only runs on Langfuse datasets need the project ID before items start;
    // for local data it is only used for the URL afterwards. Without tracing
    // nothing reaches Langfuse, so the lookup is skipped.
    const projectIdPromise = tracingEnabled
      ? this.resolveProjectId()
      : Promise.resolve(undefined);
    const projectId = datasetId ? await projectIdPromise : undefined;
    const experimentIdsByDatasetId = new Map<string, string>();
    for (const id of datasetIds) {
      experimentIdsByDatasetId.set(
        id,
        await this.createRunExperimentId({
          projectId,
          datasetId: id,
          runName,
        }),
      );
    }
    const experimentId = datasetId
      ? experimentIdsByDatasetId.get(datasetId)!
      : await createExperimentId();

    if (datasetIds.length > 1) {
      this.logger.warn(
        `Experiment data contains items from ${datasetIds.length} datasets. Each dataset's items form a separate experiment; the result and run evaluator scores use the experiment of dataset ${datasetId}.`,
      );
    }

    const itemResultsByIndex: Array<
      ExperimentItemResult<Input, ExpectedOutput, Metadata> | undefined
    > = new Array(data.length);
    let nextIndex = 0;
    let sampledItemCount = 0;

    const runNextItem = async () => {
      while (nextIndex < data.length) {
        const index = nextIndex++;
        const item = data[index];

        try {
          const { itemResult, sampled } = await this.runItem({
            item,
            evaluators,
            task,
            experimentName: name,
            experimentRunName: runName,
            experimentDescription: description,
            experimentMetadata: metadata,
            experimentId:
              ("datasetId" in item &&
                item.datasetId &&
                experimentIdsByDatasetId.get(item.datasetId)) ||
              experimentId,
            datasetVersion: config.datasetVersion,
          });
          itemResultsByIndex[index] = itemResult;
          if (sampled) sampledItemCount++;
        } catch (reason) {
          const errorMessage =
            reason instanceof Error ? reason.message : String(reason);
          this.logger.error(
            `Task failed with error: ${errorMessage}. Skipping item.`,
          );
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(maxConcurrency, data.length) },
      runNextItem,
    );
    await Promise.all(workers);

    const itemResults = itemResultsByIndex.filter(
      (
        result,
      ): result is ExperimentItemResult<Input, ExpectedOutput, Metadata> =>
        result !== undefined,
    );

    const datasetRunId = datasetId ? experimentId : undefined;
    const experimentUrl = (await projectIdPromise)
      ? await this.langfuseClient.getExperimentUrl(experimentId)
      : undefined;
    const datasetRunUrl = datasetRunId ? experimentUrl : undefined;

    // Execute run evaluators
    let runEvaluations: Evaluation[] = [];
    if (runEvaluators && runEvaluators?.length > 0) {
      const promises = runEvaluators.map(async (runEvaluator) => {
        return runEvaluator({ itemResults })
          .then((result) => {
            // Handle both single evaluation and array of evaluations
            return Array.isArray(result) ? result : [result];
          })
          .catch((err) => {
            this.logger.error("Run evaluator failed with error ", err);

            throw err;
          });
      });

      runEvaluations = (await Promise.allSettled(promises)).reduce(
        (acc, settledPromise) => {
          if (settledPromise.status === "fulfilled") {
            acc.push(...settledPromise.value);
          }

          return acc;
        },
        [] as Evaluation[],
      );

      // Run-level scores attach to the experiment: on Langfuse the experiment
      // ID is the dataset run ID, also for experiments on local data. If no
      // item was sampled, the experiment does not exist on Langfuse and the
      // scores would be orphaned.
      if (sampledItemCount > 0) {
        runEvaluations.forEach((runEval) =>
          this.langfuseClient.score.create({
            datasetRunId: experimentId,
            ...runEval,
          }),
        );
      } else if (runEvaluations.length > 0) {
        this.logger.debug(
          "No experiment item was sampled. Skipping run-level scores.",
        );
      }
    }

    await this.langfuseClient.score.flush();

    return {
      experimentId,
      experimentUrl,
      runName,
      itemResults,
      datasetRunId,
      datasetRunUrl,
      runEvaluations,
      format: async (options?: { includeItemResults?: boolean }) =>
        await this.prettyPrintResults({
          experimentUrl,
          itemResults,
          originalData: data,
          runEvaluations,
          name: config.name,
          runName,
          description: config.description,
          includeItemResults: options?.includeItemResults ?? false,
        }),
    };
  }

  /**
   * Executes the task and evaluators for a single data item.
   *
   * This method handles the complete processing pipeline for one data item:
   * 1. Executes the task within a traced observation span
   * 2. Tags the observation with the experiment and dataset item attributes
   * 3. Runs all item-level evaluators on the output
   * 4. Stores evaluation scores in Langfuse
   * 5. Handles errors gracefully by continuing with remaining evaluators
   *
   * @param params - Parameters for item execution
   * @param params.experimentName - Name of the parent experiment
   * @param params.experimentRunName - Run name for the parent experiment
   * @param params.experimentDescription - Description of the parent experiment
   * @param params.experimentMetadata - Metadata for the parent experiment
   * @param params.item - The data item to process
   * @param params.task - The task function to execute
   * @param params.evaluators - Optional evaluators to run on the output
   *
   * @returns Promise resolving to the item result with output, evaluations, and trace info,
   *   and whether the item's root span was sampled
   *
   * @throws {Error} When task execution fails (propagated from task function)
   *
   * @internal
   */
  private async runItem<
    Input = any,
    ExpectedOutput = any,
    Metadata extends Record<string, any> = Record<string, any>,
  >(params: {
    experimentName: ExperimentParams<Input, ExpectedOutput, Metadata>["name"];
    experimentRunName: string;
    experimentDescription: ExperimentParams<
      Input,
      ExpectedOutput,
      Metadata
    >["description"];
    experimentMetadata: ExperimentParams<
      Input,
      ExpectedOutput,
      Metadata
    >["metadata"];
    experimentId: string;
    item: ExperimentParams<Input, ExpectedOutput, Metadata>["data"][0];
    task: ExperimentTask<Input, ExpectedOutput, Metadata>;
    evaluators?: Evaluator<Input, ExpectedOutput, Metadata>[];
    datasetVersion?: string;
  }): Promise<{
    itemResult: ExperimentItemResult<Input, ExpectedOutput, Metadata>;
    sampled: boolean;
  }> {
    const { item, evaluators = [], task, experimentMetadata } = params;

    const { output, traceId, observationId, datasetRunId, sampled } =
      await startActiveObservation("experiment-item-run", async (span) => {
        // Extract experiment data
        const input = item.input;
        const expectedOutput = item.expectedOutput;
        const itemMetadata = item.metadata;
        const datasetId = "datasetId" in item ? item.datasetId : undefined;
        const datasetItemId = "id" in item ? item.id : undefined;
        const traceId = span.traceId;
        const observationId = span.id;

        // Validate input is present
        if (input === undefined) {
          throw new Error("Experiment item is missing input. Skipping item.");
        }

        const datasetRunId =
          datasetId && datasetItemId ? params.experimentId : undefined;

        // Generate IDs
        const experimentItemId =
          datasetItemId || (await createExperimentItemId(input));
        const experimentId = params.experimentId;

        // Set non-propagated experiment attributes directly on root span
        const rootSpanAttributes: Record<string, string> = {
          [LangfuseOtelSpanAttributes.ENVIRONMENT]:
            LANGFUSE_SDK_EXPERIMENT_ENVIRONMENT,
        };
        if (params.experimentDescription) {
          rootSpanAttributes[
            LangfuseOtelSpanAttributes.EXPERIMENT_DESCRIPTION
          ] = params.experimentDescription;
        }
        if (datasetItemId && params.datasetVersion) {
          rootSpanAttributes[
            LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_VERSION
          ] = params.datasetVersion;
        }

        if (expectedOutput !== undefined) {
          const serialized = serializeValue(expectedOutput);
          if (serialized) {
            rootSpanAttributes[
              LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_EXPECTED_OUTPUT
            ] = serialized;
          }
        }

        span.otelSpan.setAttributes(rootSpanAttributes);

        // Propagate experiment context to all child spans
        const output = await propagateAttributes(
          {
            _internalExperiment: {
              experimentId,
              experimentName: params.experimentRunName,
              experimentMetadata: serializeValue(experimentMetadata),
              experimentDatasetId: datasetId,
              experimentItemId,
              experimentItemMetadata: serializeValue(itemMetadata),
              experimentItemRootObservationId: span.id,
            },
          },
          async () => await task(item),
        );

        const experimentRunMetadata = {
          experiment_name: params.experimentName,
          experiment_run_name: params.experimentRunName,
          ...(datasetId && datasetItemId
            ? {
                dataset_id: datasetId,
                dataset_item_id: datasetItemId,
              }
            : {}),
        };

        span.update({
          input,
          output,
          // Experiment run keys go first so the span attribute limit drops user
          // metadata before them, and last so they still win over user keys.
          metadata: {
            ...experimentRunMetadata,
            ...(itemMetadata ?? {}),
            ...experimentMetadata,
            ...experimentRunMetadata,
          },
        });

        return {
          output,
          traceId,
          observationId,
          datasetRunId,
          sampled: span.otelSpan.isRecording(),
        };
      });

    const evalPromises: Promise<Evaluation[]>[] = evaluators.map(
      async (evaluator) => {
        const params = {
          input: item.input as any,
          expectedOutput: item.expectedOutput as any,
          output,
          metadata: item.metadata as any,
        };

        return evaluator(params)
          .then((result) => {
            // Handle both single evaluation and array of evaluations
            return Array.isArray(result) ? result : [result];
          })
          .catch((err) => {
            this.logger.error(
              `Evaluator '${evaluator.name}' failed for params \n\n${JSON.stringify(params)}\n\n with error: ${err}`,
            );

            throw err;
          });
      },
    );

    const evals = (await Promise.allSettled(evalPromises)).reduce(
      (acc, promiseResult) => {
        if (promiseResult.status === "fulfilled") {
          acc.push(...promiseResult.value.flat());
        }

        return acc;
      },
      [] as Evaluation[],
    );

    for (const ev of evals) {
      this.langfuseClient.score.create({
        traceId,
        observationId,
        ...ev,
      });
    }

    return {
      itemResult: {
        output,
        evaluations: evals,
        traceId,
        datasetRunId,
        item,
      },
      sampled,
    };
  }

  /**
   * Formats experiment results into a human-readable string representation.
   *
   * Creates a comprehensive, nicely formatted summary of the experiment including:
   * - Individual item results with inputs, outputs, expected values, and scores
   * - Dataset item and trace links (when available)
   * - Experiment overview with aggregate statistics
   * - Average scores across all evaluations
   * - Run-level evaluation results
   * - Link to the experiment in the Langfuse UI
   *
   * @param params - Formatting parameters
   * @param params.experimentUrl - Optional URL to the experiment in the Langfuse UI
   * @param params.itemResults - Results from processing each data item
   * @param params.originalData - The original input data items
   * @param params.runEvaluations - Results from run-level evaluators
   * @param params.name - Name of the experiment
   * @param params.description - Optional description of the experiment
   * @param params.includeItemResults - Whether to include individual item details (default: false)
   *
   * @returns Promise resolving to formatted string representation
   *
   * @example Output format
   * ```
   * 1. Item 1:
   *    Input:    What is the capital of France?
   *    Expected: Paris
   *    Actual:   Paris
   *    Scores:
   *      • exact_match: 1.000
   *      • similarity: 0.95
   *        💭 Very close match with expected output
   *
   *    Dataset Item:
   *    https://cloud.langfuse.com/project/123/datasets/456/items/789
   *
   *    Trace:
   *    https://cloud.langfuse.com/project/123/traces/abc123
   *
   * ──────────────────────────────────────────────────
   * 📊 Translation Quality Test - Testing model accuracy
   * 2 items
   * Evaluations:
   *   • exact_match
   *   • similarity
   *
   * Average Scores:
   *   • exact_match: 0.850
   *   • similarity: 0.923
   *
   * Run Evaluations:
   *   • overall_quality: 0.887
   *     💭 Good performance with room for improvement
   *
   * 🔗 Experiment:
   *    https://cloud.langfuse.com/project/123/experiments/results?baseline=def456
   * ```
   *
   * @internal
   */
  private async prettyPrintResults<
    Input = any,
    ExpectedOutput = any,
    Metadata extends Record<string, any> = Record<string, any>,
  >(params: {
    experimentUrl?: string;
    itemResults: ExperimentItemResult<Input, ExpectedOutput, Metadata>[];
    originalData:
      | ExperimentItem<Input, ExpectedOutput, Metadata>[]
      | DatasetItem[];
    runEvaluations: Evaluation[];
    name: string;
    runName: string;
    description?: string;
    includeItemResults?: boolean;
  }): Promise<string> {
    const {
      itemResults,
      originalData,
      runEvaluations,
      name,
      runName,
      description,
      includeItemResults = false,
    } = params;

    if (itemResults.length === 0) {
      return "No experiment results to display.";
    }

    let output = "";

    // Individual results
    if (includeItemResults) {
      for (let index = 0; index < itemResults.length; index++) {
        const result = itemResults[index];
        const originalItem = originalData[index];

        output += `\n${index + 1}. Item ${index + 1}:\n`;

        // Input, expected, and actual on separate lines
        if (originalItem?.input !== undefined) {
          output += `   Input:    ${this.formatValue(originalItem.input)}\n`;
        }

        const expectedOutput =
          originalItem?.expectedOutput ?? result.expectedOutput ?? null;
        output += `   Expected: ${expectedOutput !== null ? this.formatValue(expectedOutput) : "null"}\n`;
        output += `   Actual:   ${this.formatValue(result.output)}\n`;

        // Scores on separate lines
        if (result.evaluations.length > 0) {
          output += `   Scores:\n`;
          result.evaluations.forEach((evaluation) => {
            const score =
              typeof evaluation.value === "number"
                ? evaluation.value.toFixed(3)
                : evaluation.value;
            output += `     • ${evaluation.name}: ${score}`;
            if (evaluation.comment) {
              output += `\n       💭 ${evaluation.comment}`;
            }
            output += "\n";
          });
        }

        // Dataset item link on separate line
        if (
          originalItem &&
          "id" in originalItem &&
          "datasetId" in originalItem
        ) {
          const projectUrl = (
            await this.langfuseClient.getTraceUrl("mock")
          ).split("/traces")[0];
          const datasetItemUrl = `${projectUrl}/datasets/${originalItem.datasetId}/items/${originalItem.id}`;
          output += `\n   Dataset Item:\n   ${datasetItemUrl}\n`;
        }

        // Trace link on separate line
        if (result.traceId) {
          const traceUrl = await this.langfuseClient.getTraceUrl(
            result.traceId,
          );
          output += `\n   Trace:\n   ${traceUrl}\n`;
        }
      }
    } else {
      output += `Individual Results: Hidden (${itemResults.length} items)\n`;
      output += "💡 Call format({ includeItemResults: true }) to view them\n";
    }

    // Experiment Overview
    const totalItems = itemResults.length;
    const evaluationNames = new Set(
      itemResults.flatMap((r) => r.evaluations.map((e) => e.name)),
    );

    output += `\n${"─".repeat(50)}\n`;
    output += `🧪 Experiment: ${name}`;
    output += `\n📋 Run name: ${runName}`;
    if (description) {
      output += ` - ${description}`;
    }

    output += `\n${totalItems} items`;

    if (evaluationNames.size > 0) {
      output += `\nEvaluations:`;
      Array.from(evaluationNames).forEach((evalName) => {
        output += `\n  • ${evalName}`;
      });
      output += "\n";
    }

    // Average scores in bulleted list
    if (evaluationNames.size > 0) {
      output += `\nAverage Scores:`;
      for (const evalName of evaluationNames) {
        const scores = itemResults
          .flatMap((r) => r.evaluations)
          .filter((e) => e.name === evalName && typeof e.value === "number")
          .map((e) => e.value as number);

        if (scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          output += `\n  • ${evalName}: ${avg.toFixed(3)}`;
        }
      }
      output += "\n";
    }

    // Run evaluations
    if (runEvaluations.length > 0) {
      output += `\nRun Evaluations:`;
      runEvaluations.forEach((runEval) => {
        const score =
          typeof runEval.value === "number"
            ? runEval.value.toFixed(3)
            : runEval.value;
        output += `\n  • ${runEval.name}: ${score}`;
        if (runEval.comment) {
          output += `\n    💭 ${runEval.comment}`;
        }
      });
      output += "\n";
    }

    if (params.experimentUrl) {
      output += `\n🔗 Experiment:\n   ${params.experimentUrl}`;
    }

    return output;
  }

  /**
   * Formats a value for display in pretty-printed output.
   *
   * Handles different value types appropriately:
   * - Strings: Truncates long strings to 50 characters with "..."
   * - Objects/Arrays: Converts to JSON string representation
   * - Primitives: Uses toString() representation
   *
   * @param value - The value to format
   * @returns Formatted string representation suitable for display
   *
   * @internal
   */
  private formatValue(value: any): string {
    if (typeof value === "string") {
      return value.length > 50 ? `${value.substring(0, 47)}...` : value;
    }
    return JSON.stringify(value);
  }

  /**
   * Resolves the project ID for experiment IDs and URLs. Returns `undefined`
   * and logs a warning when the lookup fails, so the experiment still runs.
   *
   * @internal
   */
  private async resolveProjectId(): Promise<string | undefined> {
    try {
      return await this.langfuseClient.getProjectId();
    } catch (err) {
      this.logger.warn(
        "Failed to fetch the Langfuse project ID. The experiment URL is unavailable and runs on a dataset get a random experiment ID.",
        err,
      );

      return undefined;
    }
  }

  /**
   * Creates the experiment ID shared by all items of a run.
   *
   * Runs on a Langfuse dataset get an ID derived from project, dataset and run
   * name, so re-running or sharding a run with the same name continues the
   * same experiment. Runs on local data get a random ID.
   *
   * @internal
   */
  private async createRunExperimentId(params: {
    projectId?: string;
    datasetId?: string;
    runName: string;
  }): Promise<string> {
    const { projectId, datasetId, runName } = params;

    if (datasetId && projectId) {
      return await createStableExperimentId({ projectId, datasetId, runName });
    }

    return await createExperimentId();
  }

  private isOtelRegistered(): boolean {
    let tracerProvider = trace.getTracerProvider();

    if (tracerProvider instanceof ProxyTracerProvider) {
      tracerProvider = tracerProvider.getDelegate();
    }

    return tracerProvider.constructor.name !== "NoopTracerProvider";
  }

  /**
   * Creates an experiment run name based on provided parameters.
   *
   * If runName is provided, returns it directly. Otherwise, generates
   * a name by combining the experiment name with an ISO timestamp.
   *
   * @param params - Parameters for run name creation
   * @param params.name - The experiment name
   * @param params.runName - Optional provided run name
   * @returns The final run name to use
   *
   * @internal
   */
  private createExperimentRunName(params: {
    name: string;
    runName?: string;
  }): string {
    if (params.runName) {
      return params.runName;
    }

    const isoTimestamp = new Date().toISOString();
    return `${params.name} - ${isoTimestamp}`;
  }
}
