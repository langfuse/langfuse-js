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
      prettyPrint: async (options?: { includeItemResults?: boolean }) =>
        await this.prettyPrintResults({
          datasetRunUrl,
          itemResults,
          originalData: data,
          name: config.name,
          description: config.description,
          includeItemResults: options?.includeItemResults ?? true,
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
    includeItemResults?: boolean;
  }): Promise<string> {
    const {
      itemResults,
      originalData,
      name,
      description,
      includeItemResults = true,
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
      output +=
        "💡 Call prettyPrint({ includeItemResults: true }) to view them\n";
    }

    // Experiment Overview
    const totalItems = itemResults.length;
    const evaluationNames = new Set(
      itemResults.flatMap((r) => r.evaluations.map((e) => e.name)),
    );

    output += `\n${"─".repeat(50)}\n`;
    output += `📊 ${name}`;
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

    if (params.datasetRunUrl) {
      output += `\n🔗 Dataset Run:\n   ${params.datasetRunUrl}`;
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
