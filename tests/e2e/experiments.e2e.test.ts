import {
  Evaluator,
  ExperimentTask,
  LangfuseClient,
  RunEvaluator,
  autoevalToLangfuseEvaluator,
} from "@langfuse/client";
import { configureGlobalLogger, LogLevel } from "@langfuse/core";
import { observeOpenAI } from "@langfuse/openai";
import { Factuality, Levenshtein } from "autoevals";
import { nanoid } from "nanoid";
import OpenAI from "openai";
import { beforeAll, describe, it, afterEach, beforeEach, expect } from "vitest";

import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

describe("Langfuse Datasets E2E", () => {
  let langfuse: LangfuseClient;
  let testEnv: ServerTestEnvironment;

  const dataset = [
    {
      input: "Germany",
      expectedOutput: "Berlin",
    },
    {
      input: "France",
      expectedOutput: "Paris",
    },
    {
      input: "Spain",
      expectedOutput: "Madrid",
    },
  ];

  const task: ExperimentTask = async (params) => {
    const client = observeOpenAI(new OpenAI());

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: `What is the capital of ${params.input}? Be cheeky sometimes in your answer and give the unofficial one. Respond in one word.`,
        },
      ],
    });

    return response.choices[0].message.content;
  };

  const factualityEvaluator: Evaluator = async (params) => {
    const response = await new OpenAI().chat.completions.parse({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: `Rate the correctness of this sentence: The capital of ${params.input} is ${params.output}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "score",
          description:
            "score between 0 to 1 where 0 is false and 1 is correct.",
          schema: {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
              score: {
                type: "integer",
              },
              reasoning: {
                type: "string",
              },
            },
            required: ["score", "reasoning"],
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content!);

    return [
      {
        name: "manual-factuality",
        value: parsed.score,
        comment: parsed.reasoning,
        metadata: { reasoning: parsed.reasoning },
      },
    ];
  };

  const levenshteinAverageRunEvaluator: RunEvaluator = async ({
    itemResults,
  }) => {
    const average = itemResults
      .map((result) =>
        result.evaluations.filter((e) => e.name === "Levenshtein"),
      )
      .flat()
      .reduce((acc, curr, _, array) => {
        return acc + (curr.value as number) / array.length;
      }, 0);

    return {
      name: "levenshtein-average",
      value: average,
    };
  };

  beforeAll(() => {
    configureGlobalLogger({ level: LogLevel.INFO });
  });

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuse = new LangfuseClient();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
    await langfuse.flush();
  });

  it("should run an experiment on local dataset", async () => {
    const result = await langfuse.experiment.run({
      name: "Euro capitals",
      description: "Country capital experiment",
      data: dataset,
      task,
      evaluators: [
        autoevalToLangfuseEvaluator(Factuality),
        autoevalToLangfuseEvaluator(Levenshtein),
        factualityEvaluator,
      ],
      runEvaluators: [levenshteinAverageRunEvaluator],
    });

    console.log(await result.prettyPrint());

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Validate basic result structure
    expect(result.itemResults).toHaveLength(3);
    expect(result.runEvaluations).toHaveLength(1);
    expect(result.runEvaluations[0]).toMatchObject({
      name: "levenshtein-average",
      value: expect.any(Number),
    });
    // No datasetRunId for local datasets
    expect(result.datasetRunId).toBeUndefined();

    // Validate item results structure
    result.itemResults.forEach((itemResult, index) => {
      expect(itemResult).toMatchObject({
        output: expect.any(String),
        evaluations: expect.arrayContaining([
          expect.objectContaining({
            name: "Factuality",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "Levenshtein",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "manual-factuality",
            value: expect.any(Number),
          }),
        ]),
        traceId: expect.any(String),
      });

      // Should have 3 evaluations per item
      expect(itemResult.evaluations).toHaveLength(3);
      // No datasetRunId for local datasets
      expect(itemResult.datasetRunId).toBeUndefined();
    });
  });

  it("should run an experiment on a langfuse dataset", async () => {
    // create remote dataset
    const datasetName = "euro-capitals-" + nanoid();
    await langfuse.api.datasets.create({
      name: datasetName,
      description: "Collection of euro countries and capitals",
    });

    // create remote dataset items
    await Promise.all(
      dataset.map((item) =>
        langfuse.api.datasetItems.create({ datasetName, ...item }),
      ),
    );

    const fetchedDataset = await langfuse.dataset.get(datasetName);

    const experimentName = "Euro capitals on LF dataset";
    const result = await fetchedDataset.runExperiment({
      name: experimentName,
      description: "Country capital experiment",
      task,
      evaluators: [
        autoevalToLangfuseEvaluator(Factuality),
        autoevalToLangfuseEvaluator(Levenshtein),
        factualityEvaluator,
      ],
      runEvaluators: [levenshteinAverageRunEvaluator],
    });

    console.log(await result.prettyPrint());

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Validate basic result structure
    expect(result.itemResults).toHaveLength(3);
    expect(result.runEvaluations).toHaveLength(1);
    expect(result.runEvaluations[0]).toMatchObject({
      name: "levenshtein-average",
      value: expect.any(Number),
    });
    expect(result.datasetRunId).toBeDefined();

    // Validate item results structure
    result.itemResults.forEach((itemResult, index) => {
      expect(itemResult).toMatchObject({
        output: expect.any(String),
        evaluations: expect.arrayContaining([
          expect.objectContaining({
            name: "Factuality",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "Levenshtein",
            value: expect.any(Number),
          }),
          expect.objectContaining({
            name: "manual-factuality",
            value: expect.any(Number),
          }),
        ]),
        traceId: expect.any(String),
        datasetRunId: expect.any(String),
      });

      // Should have 3 evaluations per item
      expect(itemResult.evaluations).toHaveLength(3);
    });

    // Fetch dataset run from API and validate against database
    const datasetRun = await langfuse.api.datasets.getRun(
      datasetName,
      experimentName,
    );

    expect(datasetRun).toBeDefined();
    expect(datasetRun).toMatchObject({
      name: experimentName,
      description: "Country capital experiment",
      datasetId: fetchedDataset.id,
      datasetName: datasetName,
    });

    // Validate dataset run items
    expect(datasetRun.datasetRunItems).toHaveLength(3);

    // Each run item should correspond to one of our experiment results
    result.itemResults.forEach((itemResult) => {
      const correspondingRunItem = datasetRun.datasetRunItems.find(
        (runItem) => runItem.traceId === itemResult.traceId,
      );

      expect(correspondingRunItem).toBeDefined();
      expect(correspondingRunItem).toMatchObject({
        traceId: itemResult.traceId,
        datasetItemId: expect.any(String),
      });
    });

    // Validate that traces contain the expected scores
    // Each trace should have 3 item-level evaluations + 1 run-level evaluation
    const expectedTraceIds = result.itemResults.map((r) => r.traceId);
    expect(expectedTraceIds).toHaveLength(3);
    expectedTraceIds.forEach((traceId) => {
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
