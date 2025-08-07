import {
  LangfuseAPIClient,
  LANGFUSE_SDK_VERSION,
  getGlobalLogger,
  getEnv,
} from "@langfuse/core";

import { DatasetManager } from "./dataset/index.js";
import { MediaManager } from "./media/index.js";
import { PromptManager } from "./prompt/index.js";
import { ScoreManager } from "./score/index.js";

export interface LangfuseClientParams {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  timeout?: number;
  additionalHeaders?: Record<string, string>;
}

export class LangfuseClient {
  public api: LangfuseAPIClient;
  public prompt: PromptManager;
  public dataset: DatasetManager;
  public score: ScoreManager;
  public media: MediaManager;

  private baseUrl: string;
  private projectId: string | null = null;

  /**
   * @deprecated Use prompt.get instead
   */
  public getPrompt: typeof PromptManager.prototype.get;
  /**
   * @deprecated Use prompt.create instead
   */
  public createPrompt: typeof PromptManager.prototype.create;
  /**
   * @deprecated Use prompt.update instead
   */
  public updatePrompt: typeof PromptManager.prototype.update;
  /**
   * @deprecated Use dataset.get instead
   */
  public getDataset: typeof DatasetManager.prototype.get;
  /**
   * @deprecated Use api.trace.get instead
   */
  public fetchTrace: typeof LangfuseAPIClient.prototype.trace.get;
  /**
   * @deprecated Use api.trace.list instead
   */
  public fetchTraces: typeof LangfuseAPIClient.prototype.trace.list;
  /**
   * @deprecated Use api.observations.get instead
   */
  public fetchObservation: typeof LangfuseAPIClient.prototype.observations.get;
  /**
   * @deprecated Use api.observations.list instead
   */
  public fetchObservations: typeof LangfuseAPIClient.prototype.observations.getMany;
  /**
   * @deprecated Use api.sessions.get instead
   */
  public fetchSessions: typeof LangfuseAPIClient.prototype.sessions.get;
  /**
   * @deprecated Use api.datasets.getRun instead
   */
  public getDatasetRun: typeof LangfuseAPIClient.prototype.datasets.getRun;
  /**
   * @deprecated Use api.datasets.getRuns instead
   */
  public getDatasetRuns: typeof LangfuseAPIClient.prototype.datasets.getRuns;
  /**
   * @deprecated Use api.datasets.create instead
   */
  public createDataset: typeof LangfuseAPIClient.prototype.datasets.create;
  /**
   * @deprecated Use api.datasetItems.get instead
   */
  public getDatasetItem: typeof LangfuseAPIClient.prototype.datasetItems.get;
  /**
   * @deprecated Use api.datasetItems.create instead
   */
  public createDatasetItem: typeof LangfuseAPIClient.prototype.datasetItems.create;
  /**
   * @deprecated Use api.media.get instead
   */
  public fetchMedia: typeof LangfuseAPIClient.prototype.media.get;
  /**
   * @deprecated Use media.resolveReferences instead
   */
  public resolveMediaReferences: typeof MediaManager.prototype.resolveReferences;

  constructor(params?: LangfuseClientParams) {
    const logger = getGlobalLogger();

    const publicKey = params?.publicKey ?? getEnv("LANGFUSE_PUBLIC_KEY");
    const secretKey = params?.secretKey ?? getEnv("LANGFUSE_SECRET_KEY");
    this.baseUrl =
      params?.baseUrl ??
      getEnv("LANGFUSE_BASE_URL") ??
      getEnv("LANGFUSE_BASEURL") ?? // legacy v2
      "https://cloud.langfuse.com";

    if (!publicKey) {
      logger.warn(
        "No public key provided in constructor or as LANGFUSE_PUBLIC_KEY env var. Client operations will fail.",
      );
    }
    if (!secretKey) {
      logger.warn(
        "No secret key provided in constructor or as LANGFUSE_SECRET_KEY env var. Client operations will fail.",
      );
    }
    const timeoutSeconds =
      params?.timeout ?? Number(getEnv("LANGFUSE_TIMEOUT") ?? 5);

    this.api = new LangfuseAPIClient({
      baseUrl: this.baseUrl,
      username: publicKey,
      password: secretKey,
      xLangfusePublicKey: publicKey,
      xLangfuseSdkVersion: LANGFUSE_SDK_VERSION,
      xLangfuseSdkName: "javascript",
      environment: "", // noop as baseUrl is set
      headers: params?.additionalHeaders,
    });

    logger.debug("Initialized LangfuseClient with params:", {
      publicKey,
      baseUrl: this.baseUrl,
      timeoutSeconds,
    });

    this.prompt = new PromptManager({ apiClient: this.api });
    this.dataset = new DatasetManager({ apiClient: this.api });
    this.score = new ScoreManager({ apiClient: this.api });
    this.media = new MediaManager({ apiClient: this.api });

    // Keep v3 compat by exposing old interface
    this.getPrompt = this.prompt.get.bind(this.prompt); // keep correct this context for cache access
    this.createPrompt = this.prompt.create.bind(this.prompt);
    this.updatePrompt = this.prompt.update.bind(this.prompt);
    this.getDataset = this.dataset.get;
    this.fetchTrace = this.api.trace.get;
    this.fetchTraces = this.api.trace.list;
    this.fetchObservation = this.api.observations.get;
    this.fetchObservations = this.api.observations.getMany;
    this.fetchSessions = this.api.sessions.get;
    this.getDatasetRun = this.api.datasets.getRun;
    this.getDatasetRuns = this.api.datasets.getRuns;
    this.createDataset = this.api.datasets.create;
    this.getDatasetItem = this.api.datasetItems.get;
    this.createDatasetItem = this.api.datasetItems.create;
    this.fetchMedia = this.api.media.get;
    this.resolveMediaReferences = this.media.resolveReferences;
  }

  public async flush() {
    return this.score.flush();
  }

  public async shutdown() {
    return this.score.shutdown();
  }

  public async getTraceUrl(traceId: string) {
    let projectId = this.projectId;

    if (!projectId) {
      projectId = (await this.api.projects.get()).data[0].id;
      this.projectId = projectId;
    }

    const traceUrl = `${this.baseUrl}/project/${projectId}/traces/${traceId}`;

    return traceUrl;
  }
}
