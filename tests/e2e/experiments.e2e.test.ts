import { Evaluator, ExperimentTask, LangfuseClient } from "@langfuse/client";
import { observeOpenAI } from "@langfuse/openai";
import OpenAI from "openai";
import { describe, it, afterEach, beforeEach } from "vitest";

import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

describe("Langfuse Datasets E2E", () => {
  let langfuse: LangfuseClient;
  let testEnv: ServerTestEnvironment;

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
        name: "Factuality",
        value: parsed.score,
        metadata: { reasoning: parsed.reasoning },
      },
    ];
  };

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    langfuse = new LangfuseClient();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
  });

  it("should run an experiment on local dataset", async () => {
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

    const result = await langfuse.experiment.run({
      name: "Euro capitals",
      description: "Country capital experiment",
      data: dataset,
      task,
      evaluators: [factualityEvaluator],
    });

    console.log(await result.prettyPrint());

    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);
  });
});
