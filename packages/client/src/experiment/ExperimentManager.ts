import { LangfuseAPIClient } from "@langfuse/core";

// import { Experiment } from "./Experiment.js";

export class ExperimentManager {
  private apiClient: LangfuseAPIClient;

  constructor(params: { apiClient: LangfuseAPIClient }) {
    this.apiClient = params.apiClient;
  }

  // create(config: { name: string; description: string }): Experiment {}
}
