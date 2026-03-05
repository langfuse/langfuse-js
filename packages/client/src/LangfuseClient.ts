import {
  LangfuseAPIClient,
  LANGFUSE_SDK_VERSION,
  getGlobalLogger,
  getEnv,
} from "@langfuse/core";

import { DatasetManager } from "./dataset/index.js";
import { ExperimentManager } from "./experiment/ExperimentManager.js";
import { MediaManager } from "./media/index.js";
import { PromptManager } from "./prompt/index.js";
import { ScoreManager } from "./score/index.js";

/**
 * Configuration parameters for initializing a LangfuseClient instance.
 *
 * @public
 */
export interface LangfuseClientParams {
  /**
   * Public API key for authentication with Langfuse.
   * Can also be provided via LANGFUSE_PUBLIC_KEY environment variable.
   */
  publicKey?: string;

  /**
   * Secret API key for authentication with Langfuse.
   * Can also be provided via LANGFUSE_SECRET_KEY environment variable.
   */
  secretKey?: string;

  /**
   * Base URL of the Langfuse instance to connect to.
   * Can also be provided via LANGFUSE_BASE_URL environment variable.
   *
   * @defaultValue "https://cloud.langfuse.com"
   */
  baseUrl?: string;

  /**
   * Request timeout in seconds.
   * Can also be provided via LANGFUSE_TIMEOUT environment variable.
   *
   * @defaultValue 5
   */
  timeout?: number;

  /**
   * Additional HTTP headers to include with API requests.
   */
  additionalHeaders?: Record<string, string>;

  /**
   * Custom fetch function to use for HTTP requests.
   * Useful for testing, proxying, or customizing request behavior.
   *
   * @example
   * ```typescript
   * const customFetch = async (url, init) => {
   *   console.log('Making request to:', url);
   *   return fetch(url, init);
   * };
   *
   * const langfuse = new LangfuseClient({
   *   fetch: customFetch
   * });
   * ```
   */
  fetch?: typeof fetch;
}

/**
 * Main client for interacting with the Langfuse API.
 *
 * The LangfuseClient provides access to all Langfuse functionality including:
 * - Prompt management and retrieval
 * - Dataset operations
 * - Score creation and management
 * - Media upload and handling
 * - Direct API access for advanced use cases
 *
 * @example
 * ```typescript
 * // Initialize with explicit credentials
 * const langfuse = new LangfuseClient({
 *   publicKey: "pk_...",
 *   secretKey: "sk_...",
 *   baseUrl: "https://cloud.langfuse.com"
 * });
 *
 * // Or use environment variables
 * const langfuse = new LangfuseClient();
 *
 * // Use the client
 * const prompt = await langfuse.prompt.get("my-prompt");
 * const compiledPrompt = prompt.compile({ variable: "value" });
 * ```
 *
 * @public
 */
export class LangfuseClient {
  /**
   * Direct access to the underlying Langfuse API client.
   * Use this for advanced API operations not covered by the high-level managers.
   */
  public api: LangfuseAPIClient;

  /**
   * Manager for prompt operations including creation, retrieval, and caching.
   */
  public prompt: PromptManager;

  /**
   * Manager for dataset operations including retrieval and item linking.
   */
  public dataset: DatasetManager;

  /**
   * Manager for score creation and batch processing.
   */
  public score: ScoreManager;

  /**
   * Manager for media upload and reference resolution.
   */
  public media: MediaManager;

  /**
   * Manager for running experiments on datasets and data items.
   *
   * The experiment manager provides comprehensive functionality for:
   * - Running tasks on datasets or custom data arrays
   * - Evaluating outputs with custom or pre-built evaluators
   * - Tracking experiment runs with automatic tracing
   * - Generating formatted result summaries
   * - Integrating with AutoEvals library evaluators
   *
   * @example Basic experiment execution
   * ```typescript
   * const langfuse = new LangfuseClient();
   *
   * const result = await langfuse.experiment.run({
   *   name: "Model Evaluation",
   *   description: "Testing model performance on Q&A tasks",
   *   data: [
   *     { input: "What is 2+2?", expectedOutput: "4" },
   *     { input: "What is the capital of France?", expectedOutput: "Paris" }
   *   ],
   *   task: async ({ input }) => {
   *     // Your model/task implementation
   *     const response = await myModel.generate(input);
   *     return response;
   *   },
   *   evaluators: [
   *     async ({ output, expectedOutput }) => ({
   *       name: "exact_match",
   *       value: output.trim().toLowerCase() === expectedOutput.toLowerCase() ? 1 : 0
   *     })
   *   ]
   * });
   *
   * console.log(await result.format());
   * ```
   *
   * @example Using with datasets
   * ```typescript
   * const dataset = await langfuse.dataset.get("my-test-dataset");
   * const result = await dataset.runExperiment({
   *   name: "Production Readiness Test",
   *   task: myTask,
   *   evaluators: [accuracyEvaluator, latencyEvaluator],
   *   runEvaluators: [overallQualityEvaluator]
   * });
   * ```
   *
   * @see {@link ExperimentManager} for detailed API documentation
   * @see {@link ExperimentParams} for configuration options
   * @see {@link ExperimentResult} for result structure
   * @public
   * @since 4.0.0
   */
  public experiment: ExperimentManager;

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

  /**
   * Creates a new LangfuseClient instance.
   *
   * @param params - Configuration parameters. If not provided, will use environment variables.
   *
   * @throws Will log warnings if required credentials are not provided
   *
   * @example
   * ```typescript
   * // With explicit configuration
   * const client = new LangfuseClient({
   *   publicKey: "pk_...",
   *   secretKey: "sk_...",
   *   baseUrl: "https://your-instance.langfuse.com"
   * });
   *
   * // Using environment variables
   * const client = new LangfuseClient();
   * ```
   */
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
      fetch: params?.fetch,
    });

    logger.debug("Initialized LangfuseClient with params:", {
      publicKey,
      baseUrl: this.baseUrl,
      timeoutSeconds,
    });

    this.prompt = new PromptManager({ apiClient: this.api });
    this.dataset = new DatasetManager({ langfuseClient: this });
    this.score = new ScoreManager({ apiClient: this.api });
    this.media = new MediaManager({ apiClient: this.api });
    this.experiment = new ExperimentManager({ langfuseClient: this });

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

  /**
   * Flushes any pending score events to the Langfuse API.
   *
   * This method ensures all queued scores are sent immediately rather than
   * waiting for the automatic flush interval or batch size threshold.
   *
   * @returns Promise that resolves when all pending scores have been sent
   *
   * @example
   * ```typescript
   * langfuse.score.create({ name: "quality", value: 0.8 });
   * await langfuse.flush(); // Ensures the score is sent immediately
   * ```
   */
  public async flush() {
    return this.score.flush();
  }

  /**
   * Gracefully shuts down the client by flushing all pending data.
   *
   * This method should be called before your application exits to ensure
   * all data is sent to Langfuse.
   *
   * @returns Promise that resolves when shutdown is complete
   *
   * @example
   * ```typescript
   * // Before application exit
   * await langfuse.shutdown();
   * ```
   */
  public async shutdown() {
    return this.score.shutdown();
  }

  /**
   * Generates a URL to view a specific trace in the Langfuse UI.
   *
   * @param traceId - The ID of the trace to generate a URL for
   * @returns Promise that resolves to the trace URL
   *
   * @example
   * ```typescript
   * const traceId = "trace-123";
   * const url = await langfuse.getTraceUrl(traceId);
   * console.log(`View trace at: ${url}`);
   * ```
   */
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
