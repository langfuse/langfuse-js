import { type LangfuseCoreOptions } from "./types";

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

export function currentHighResTime(): string {
  return (
    (globalThis &&
      globalThis.performance &&
      globalThis.performance.now &&
      constructHighResIsoString(globalThis.performance.now())) ||
    defaultIsoString()
  );
}

function defaultIsoString(): string {
  console.error("defaultIsoString is deprecated. Use currentTimestamp instead.");
  return new Date().toISOString();
}

function constructHighResIsoString(highResTime: number): string {
  console.error("constructHighResIsoString is deprecated. Use currentHighResTime instead.");

  const preciseDateTime = new Date(highResTime); // this removes the milliseconds from high res

  // Extract the components of the Date object
  const year = preciseDateTime.getUTCFullYear();
  const month = String(preciseDateTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(preciseDateTime.getUTCDate()).padStart(2, "0");
  const hours = String(preciseDateTime.getUTCHours()).padStart(2, "0");
  const minutes = String(preciseDateTime.getUTCMinutes()).padStart(2, "0");
  const seconds = String(preciseDateTime.getUTCSeconds()).padStart(2, "0");
  // const milliseconds = String(preciseDateTime.getUTCMilliseconds()).padStart(3, "0");

  // Extract the fractional part of the high resolution time
  const fractionalSeconds = (highResTime % 1000).toFixed(6); // 6 decimal places
  console.log(fractionalSeconds);

  console.log(`Final timestamp: ${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${fractionalSeconds}Z`);

  // Construct the ISO string with extended precision
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${fractionalSeconds}Z`;
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

export function configLangfuseSDK(params?: LangfuseCoreOptions, secretRequired: boolean = true): LangfuseCoreOptions {
  const { publicKey, secretKey, ...coreOptions } = params ?? {};

  // check environment variables if values not provided
  const finalPublicKey = publicKey ?? getEnv("LANGFUSE_PUBLIC_KEY");
  const finalSecretKey = secretRequired ? secretKey ?? getEnv("LANGFUSE_SECRET_KEY") : undefined;
  const finalBaseUrl = coreOptions.baseUrl ?? getEnv("LANGFUSE_BASEURL");

  const finalCoreOptions = {
    ...coreOptions,
    baseUrl: finalBaseUrl,
  };

  return {
    publicKey: finalPublicKey,
    ...(secretRequired ? { secretKey: finalSecretKey } : undefined),
    ...finalCoreOptions,
  };
}
