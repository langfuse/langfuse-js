import type { LangfuseIngestionError } from "./types.js";

export class LangfuseBrowserError extends Error {
  public readonly status?: number;
  public readonly response?: unknown;
  public readonly errors?: LangfuseIngestionError[];
  public readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      response?: unknown;
      errors?: LangfuseIngestionError[];
      originalError?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "LangfuseBrowserError";
    this.status = options.status;
    this.response = options.response;
    this.errors = options.errors;
    this.originalError = options.originalError;
  }
}
