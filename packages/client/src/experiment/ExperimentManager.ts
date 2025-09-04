import { startActiveObservation } from "@langfuse/tracing";

import { FetchedDataset } from "../dataset/index.js";
import { LangfuseClient } from "../LangfuseClient.js";

import {
  ExperimentParams,
  ExperimentResult,
  ExperimentRunConfig,
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

  async run(
    config: Omit<ExperimentParams, "langfuseClient"> & ExperimentRunConfig,
  ): Promise<ExperimentResult> {
    const {
      data,
      evaluators,
      task,
      maxConcurrency: batchSize = Infinity,
    } = config;
    const itemResults: ExperimentItemResult[] = [];

    for (let i = 0; i <= data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const promises: Promise<ExperimentItemResult>[] = batch.map(
        async (item) => {
          return this.runItem({ item, evaluators, task });
        },
      );

      const results = await Promise.all(promises);

      itemResults.push(...results);
    }

    await this.langfuseClient.score.flush();

    return {
      itemResults,
      prettyPrint: async () =>
        await this.prettyPrintResults({ itemResults, originalData: data }),
    };
  }

  private async runItem(params: {
    item: ExperimentItem;
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

    const evals: Evaluation[] = [];

    for (const evaluator of evaluators) {
      const evaluation = await evaluator({
        input: item.input,
        expectedOutput: item.expectedOutput,
        output,
      });

      evals.push(...evaluation.flat());
    }

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
    };
  }

  private async prettyPrintResults(params: {
    itemResults: ExperimentItemResult[];
    originalData: ExperimentItem[] | FetchedDataset["items"];
  }): Promise<string> {
    const { itemResults, originalData } = params;

    if (itemResults.length === 0) {
      return "No experiment results to display.";
    }

    let output = "\n📊 Experiment Results\n";
    output += "═".repeat(50) + "\n\n";

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
        output += `  Trace: ${traceUrl}\n`;
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
