import { LangfuseClient } from "../LangfuseClient.js";

import { Experiment, ExperimentParams } from "./Experiment.js";

export class ExperimentManager {
  private langfuseClient: LangfuseClient;

  constructor(params: { langfuseClient: LangfuseClient }) {
    this.langfuseClient = params.langfuseClient;
  }

  create(config: Omit<ExperimentParams, "langfuseClient">): Experiment {
    return new Experiment({
      langfuseClient: this.langfuseClient,
      ...config,
    });
  }
}
