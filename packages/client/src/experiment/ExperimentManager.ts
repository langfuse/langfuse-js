import { DatasetItem, getGlobalLogger } from "@langfuse/core";
import { startActiveObservation } from "@langfuse/tracing";

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

export class ExperimentManager {
  private langfuseClient: LangfuseClient;

  constructor(params: { langfuseClient: LangfuseClient }) {
    this.langfuseClient = params.langfuseClient;
  }

  get logger() {
    return getGlobalLogger();
  }

  async run(config: ExperimentParams): Promise<ExperimentResult> {
    const {
      data,
      evaluators,
      task,
      name,
      description,
      metadata,
      maxConcurrency: batchSize = Infinity,
    } = config;

    const itemResults: ExperimentItemResult[] = [];

    for (let i = 0; i <= data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const promises: Promise<ExperimentItemResult>[] = batch.map(
        async (item) => {
          return this.runItem({
            item,
            evaluators,
            task,
            experimentName: name,
            experimentDescription: description,
            experimentMetadata: metadata,
          });
        },
      );

      const results = await Promise.all(promises);

      itemResults.push(...results);
    }

    await this.langfuseClient.score.flush();

    const datasetRunId =
      itemResults.length > 0 ? itemResults[0].datasetRunId : undefined;

    let datasetRunUrl = undefined;

    if (datasetRunId && data.length > 0 && "datasetId" in data[0]) {
      const datasetId = data[0].datasetId;
      const projectUrl = (await this.langfuseClient.getTraceUrl("mock")).split(
        "/traces",
      )[0];

      datasetRunUrl = `${projectUrl}/datasets/${datasetId}/runs/${datasetRunId}`;
    }

    return {
      itemResults,
      datasetRunId,
      prettyPrint: async () =>
        await this.prettyPrintResults({
          datasetRunUrl,
          itemResults,
          originalData: data,
          name: config.name,
          description: config.description,
        }),
    };
  }

  private async runItem(params: {
    experimentName: ExperimentParams["name"];
    experimentDescription: ExperimentParams["description"];
    experimentMetadata: ExperimentParams["metadata"];
    item: ExperimentParams["data"][0];
    task: ExperimentTask;
    evaluators?: Evaluator[];
  }): Promise<ExperimentItemResult> {
    const { item, evaluators = [], task } = params;

    const { output, traceId } = await startActiveObservation(
      "experiment-item-run",
      async (span) => {
        const output = await task(item);

        span.update({
          input: item.input,
          output,
        });

        return { output, traceId: span.traceId };
      },
    );

    let datasetRunId: string | undefined = undefined;

    if ("id" in item) {
      await this.langfuseClient.api.datasetRunItems
        .create({
          runName: params.experimentName,
          runDescription: params.experimentDescription,
          metadata: params.experimentMetadata,
          datasetItemId: item.id,
          traceId,
        })
        .then((result) => {
          datasetRunId = result.datasetRunId;
        })
        .catch((err) =>
          this.logger.error("Linking dataset run item failed", err),
        );
    }

    const evalPromises: Promise<Evaluation[]>[] = evaluators.map(
      async (evaluator) => {
        const params = {
          input: item.input,
          expectedOutput: item.expectedOutput,
          output,
        };

        return evaluator(params).catch((err) => {
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
        name: ev.name,
        comment: ev.comment,
        value: ev.value,
        metadata: ev.metadata,
        dataType: ev.dataType,
      });
    }

    return {
      output,
      evaluations: evals,
      traceId,
      datasetRunId,
    };
  }

  private async prettyPrintResults(params: {
    datasetRunUrl?: string;
    itemResults: ExperimentItemResult[];
    originalData: ExperimentItem[] | DatasetItem[];
    name: string;
    description?: string;
  }): Promise<string> {
    const { itemResults, originalData, name, description } = params;

    if (itemResults.length === 0) {
      return "No experiment results to display.";
    }

    let output = "\n📊 Experiment Results\n";
    output += "═".repeat(50) + "\n\n";

    // Experiment info
    output += `📝 Experiment: ${name}\n`;
    if (description) {
      output += `💬 Description: ${description}\n`;
    }

    if (params.datasetRunUrl) {
      output += `🪢 Dataset Run URL: ${params.datasetRunUrl}\n`;
    }

    output += "\n";

    // Summary stats
    const totalItems = itemResults.length;
    const evaluationNames = new Set(
      itemResults.flatMap((r) => r.evaluations.map((e) => e.name)),
    );

    output += `📈 Summary:\n`;
    output += `  • Total Items: ${totalItems}\n`;
    output += `  • Evaluations: ${Array.from(evaluationNames).join(", ")}\n\n`;

    // Evaluation averages
    if (evaluationNames.size > 0) {
      output += `📊 Average Scores:\n`;
      for (const evalName of evaluationNames) {
        const scores = itemResults
          .flatMap((r) => r.evaluations)
          .filter((e) => e.name === evalName && typeof e.value === "number")
          .map((e) => e.value as number);

        if (scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          output += `  • ${evalName}: ${avg.toFixed(3)}\n`;
        }
      }
      output += "\n";
    }

    // Individual results
    output += `📋 Individual Results:\n`;
    output += "─".repeat(50) + "\n";

    for (let index = 0; index < itemResults.length; index++) {
      const result = itemResults[index];
      output += `\n🔍 Item ${index + 1}:\n`;

      // Get input from the original data if available
      const originalItem = originalData[index];
      if (originalItem?.input !== undefined) {
        output += `  Input:    ${this.formatValue(originalItem.input)}\n`;
      }

      // Always show expected output, use originalItem first, then result, or null
      const expectedOutput =
        originalItem?.expectedOutput ?? result.expectedOutput ?? null;
      output += `  Expected: ${expectedOutput !== null ? this.formatValue(expectedOutput) : "null"}\n`;

      output += `  Actual:   ${this.formatValue(result.output)}\n`;

      if (result.evaluations.length > 0) {
        output += `  Scores:\n`;
        result.evaluations.forEach((evaluation) => {
          const score =
            typeof evaluation.value === "number"
              ? evaluation.value.toFixed(3)
              : evaluation.value;

          output += `    • ${evaluation.name}: ${score}`;
          if (evaluation.comment) {
            output += `\n      💭 ${evaluation.comment}`;
          }
          output += "\n";
        });
      }

      if (result.traceId) {
        const traceUrl = await this.langfuseClient.getTraceUrl(result.traceId);
        output += `\n  🪢Trace: ${traceUrl}\n`;
      }
    }

    return output;
  }

  private formatValue(value: any): string {
    if (typeof value === "string") {
      return value.length > 50 ? `${value.substring(0, 47)}...` : value;
    }
    return JSON.stringify(value);
  }
}
