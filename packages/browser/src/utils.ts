import { LangfuseBrowserError } from "./errors.js";
import type { LangfuseBrowserScoreResult } from "./types.js";

const RESERVED_ADDITIONAL_HEADER_NAMES = new Set([
  "authorization",
  "content-type",
  "x-langfuse-public-key",
  "x-langfuse-sdk-name",
  "x-langfuse-sdk-version",
  "x-langfuse-sdk-variant",
  "x-langfuse-sdk-integration",
]);

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LangfuseBrowserError(
      "Langfuse score response was not valid JSON.",
      {
        status: response.status,
        response: text,
        originalError: error,
      },
    );
  }
}

export async function parseErrorResponseBody(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function isCreateScoreResponse(
  value: unknown,
): value is LangfuseBrowserScoreResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LangfuseBrowserScoreResult).id === "string"
  );
}

export function filterAdditionalHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !RESERVED_ADDITIONAL_HEADER_NAMES.has(name.toLowerCase()),
    ),
  );
}

export function removeTrailingSlash(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === url.length ? url : url.slice(0, end);
}
