export class LangfuseBrowserError extends Error {
  public readonly status?: number;
  public readonly response?: unknown;
  public readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      response?: unknown;
      originalError?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "LangfuseBrowserError";
    this.status = options.status;
    this.response = options.response;
    this.originalError = options.originalError;
  }
}
