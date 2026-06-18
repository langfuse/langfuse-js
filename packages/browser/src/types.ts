import {
  ScoreDataType as CoreScoreDataType,
  type IngestionError,
  type IngestionResponse,
  type IngestionSuccess,
  type ScoreBody,
  type ScoreDataType,
} from "@langfuse/core";

type LangfuseFetch = typeof fetch;

export type LangfuseScoreDataType = ScoreDataType;
export const LangfuseScoreDataType = CoreScoreDataType;

export interface LangfuseBrowserOptions {
  /**
   * Langfuse public key obtained from the project settings.
   */
  publicKey: string;
  /**
   * Langfuse host.
   *
   * @defaultValue "https://cloud.langfuse.com"
   */
  baseUrl?: string;
  /**
   * Environment attached to scores when not provided on the score body.
   */
  environment?: string;
  /**
   * Additional HTTP headers sent with ingestion requests. SDK auth and
   * telemetry headers take precedence over these values.
   */
  additionalHeaders?: Record<string, string>;
  /**
   * Custom fetch implementation. Useful for tests and non-standard runtimes.
   */
  fetch?: LangfuseFetch;
}

export type LangfuseBrowserScoreBody = ScoreBody;

export interface LangfuseBrowserScoreResult {
  id: string;
}

export type LangfuseIngestionError = IngestionError;
export type LangfuseIngestionSuccess = IngestionSuccess;
export type LangfuseIngestionResponse = IngestionResponse;
