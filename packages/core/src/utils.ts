/**
 * Environment variables recognized by the Langfuse SDK. Explicit constructor
 * params always take precedence over environment variables.
 *
 * - `LANGFUSE_PUBLIC_KEY` — public API key (`pk-lf-...`)
 * - `LANGFUSE_SECRET_KEY` — secret API key (`sk-lf-...`)
 * - `LANGFUSE_BASE_URL` — Langfuse host, e.g. `https://cloud.langfuse.com`
 *   (EU) or `https://us.cloud.langfuse.com` (US). Canonical spelling, same as
 *   the Python SDK. The legacy JS v2/v3 spelling `LANGFUSE_BASEURL` (no
 *   underscore between BASE and URL) is still accepted as a fallback.
 * - `LANGFUSE_TIMEOUT` — API request timeout in seconds (default: 5)
 * - `LANGFUSE_FLUSH_AT` — number of buffered events/spans that triggers an export
 * - `LANGFUSE_FLUSH_INTERVAL` — max seconds between exports
 * - `LANGFUSE_MEDIA_UPLOAD_ENABLED` — set to `false` or `0` to disable media upload
 * - `LANGFUSE_LOG_LEVEL` — `DEBUG` | `INFO` | `WARN` | `ERROR`
 * - `LANGFUSE_DEBUG` — set to `true` as a shortcut for the DEBUG log level
 * - `LANGFUSE_RELEASE` — release identifier added to all traces
 * - `LANGFUSE_TRACING_ENVIRONMENT` — environment tag for traces (e.g. `production`)
 */
type LangfuseEnvVar =
  | "LANGFUSE_PUBLIC_KEY"
  | "LANGFUSE_SECRET_KEY"
  | "LANGFUSE_BASE_URL"
  | "LANGFUSE_BASEURL" // legacy v2
  | "LANGFUSE_TIMEOUT"
  | "LANGFUSE_FLUSH_AT"
  | "LANGFUSE_FLUSH_INTERVAL"
  | "LANGFUSE_MEDIA_UPLOAD_ENABLED"
  | "LANGFUSE_LOG_LEVEL"
  | "LANGFUSE_DEBUG"
  | "LANGFUSE_RELEASE"
  | "LANGFUSE_TRACING_ENVIRONMENT";

/**
 * Reads a Langfuse environment variable from `process.env` (Node.js and
 * compatible runtimes) or `globalThis` (browsers, tests) as a fallback.
 *
 * @param key - The environment variable name
 * @returns The value, or undefined if not set
 *
 * @public
 */
export function getEnv(key: LangfuseEnvVar): string | undefined {
  if (typeof process !== "undefined" && process.env[key]) {
    return process.env[key];
  } else if (typeof globalThis !== "undefined") {
    return (globalThis as any)[key];
  }

  return;
}

// https://stackoverflow.com/a/8809472
export function generateUUID(globalThis?: any): string {
  // Public Domain/MIT
  let d = new Date().getTime(); //Timestamp
  let d2 =
    (globalThis &&
      globalThis.performance &&
      globalThis.performance.now &&
      globalThis.performance.now() * 1000) ||
    0; //Time in microseconds since page-load or 0 if unsupported
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

export function safeSetTimeout(fn: () => void, timeout: number): any {
  const t = setTimeout(fn, timeout) as any;
  // We unref if available to prevent Node.js hanging on exit
  if (t?.unref) {
    t?.unref();
  }

  return t;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binString = atob(base64);

  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  return btoa(binString);
}

export function base64Encode(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }

  const bytes = new TextEncoder().encode(input);
  return bytesToBase64(bytes);
}

export function base64Decode(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "base64").toString("utf8");
  }

  const bytes = base64ToBytes(input);
  return new TextDecoder().decode(bytes);
}

/**
 * Generate a random experiment ID (16 hex characters from 8 random bytes).
 * @internal
 */
export async function createExperimentId(): Promise<string> {
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);

  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate experiment item ID from input hash (first 16 hex chars of SHA-256).
 * Skips serialization if input is already a string.
 * @internal
 */
export async function createExperimentItemId(input: any): Promise<string> {
  const serialized = serializeValue(input);
  const data = new TextEncoder().encode(serialized);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex.slice(0, 16);
}

/**
 * Serialize a value to JSON string, handling undefined/null.
 * Skips serialization if value is already a string.
 * @internal
 */
export function serializeValue(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;

  return JSON.stringify(value);
}
