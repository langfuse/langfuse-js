import { LangfusePromptClient } from ".";
import { CreateLangfuseGenerationBody, PromptInput, UpdateLangfuseGenerationBody } from "./types";

export function assert(truthyValue: any, message: string): void {
  if (!truthyValue) {
    throw new Error(message);
  }
}

export function removeTrailingSlash(url: string): string {
  return url?.replace(/\/+$/, "");
}

export interface RetriableOptions {
  retryCount?: number;
  retryDelay?: number;
  retryCheck?: (err: any) => boolean;
}

export async function retriable<T>(
  fn: () => Promise<T>,
  props: RetriableOptions = {},
  log: (msg: string) => void
): Promise<T> {
  const { retryCount = 3, retryDelay = 5000, retryCheck = () => true } = props;
  let lastError = null;

  for (let i = 0; i < retryCount + 1; i++) {
    if (i > 0) {
      // don't wait when it's the first try
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      log(`Retrying ${i + 1} of ${retryCount + 1}`);
    }

    try {
      const res = await fn();
      return res;
    } catch (e) {
      lastError = e;
      if (!retryCheck(e)) {
        throw e;
      }
      log(`Retriable error: ${JSON.stringify(e)}`);
    }
  }

  throw lastError;
}

// https://stackoverflow.com/a/8809472
export function generateUUID(globalThis?: any): string {
  // Public Domain/MIT
  let d = new Date().getTime(); //Timestamp
  let d2 =
    (globalThis && globalThis.performance && globalThis.performance.now && globalThis.performance.now() * 1000) || 0; //Time in microseconds since page-load or 0 if unsupported
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    let r = Math.random() * 16; //random number between 0 and 16
    if (d > 0) {
      //Use timestamp until depleted
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      //Use microseconds since page-load if supported
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function currentTimestamp(): number {
  return new Date().getTime();
}

export function currentISOTime(): string {
  return new Date().toISOString();
}

export function safeSetTimeout(fn: () => void, timeout: number): any {
  // NOTE: we use this so rarely that it is totally fine to do `safeSetTimeout(fn, 0)``
  // rather than setImmediate.
  const t = setTimeout(fn, timeout) as any;
  // We unref if available to prevent Node.js hanging on exit
  t?.unref && t?.unref();
  return t;
}

export function getEnv<T = string>(key: string): T | undefined {
  if (typeof process !== "undefined" && process.env[key]) {
    return process.env[key] as T;
  } else if (typeof globalThis !== "undefined") {
    return (globalThis as any)[key];
  }
  return;
}

export function createPromptContext(body: {
  prompt?: LangfusePromptClient;
  promptName?: string | null;
  promptVersion?: number | null;
}): {
  promptName?: string;
  promptVersion?: number;
} {
  if (body.prompt) {
    return { promptName: body.prompt.name, promptVersion: body.prompt.version };
  } else if (body.promptName && body.promptVersion) {
    return { promptName: body.promptName, promptVersion: body.promptVersion };
  } else if (body.promptName || body.promptVersion) {
    console.warn("Expected to get prompt name and prompt version. One was missing.");
  }
  return { promptName: undefined, promptVersion: undefined };
}
