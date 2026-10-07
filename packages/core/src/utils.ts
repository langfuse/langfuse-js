import { MAX_OBSERVATION_METADATA_KEYS } from "./constants.js";

type LangfuseEnvVar =
  | "LANGFUSE_PUBLIC_KEY"
  | "LANGFUSE_SECRET_KEY"
  | "LANGFUSE_BASE_URL"
  | "LANGFUSE_BASEURL" // legacy v2
  | "LANGFUSE_TIMEOUT"
  | "LANGFUSE_FLUSH_AT"
  | "LANGFUSE_FLUSH_INTERVAL"
  | "LANGFUSE_OTEL_MAX_BATCH_SIZE_BYTES"
  | "LANGFUSE_MEDIA_UPLOAD_ENABLED"
  | "LANGFUSE_LOG_LEVEL"
  | "LANGFUSE_DEBUG"
  | "LANGFUSE_RELEASE"
  | "LANGFUSE_TRACING_ENVIRONMENT"
  | "LANGFUSE_OTEL_COMPRESSION";

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

/**
 * Serializes observation metadata into the single JSON value written to the
 * `langfuse.observation.metadata` span attribute.
 *
 * Top-level keys with `null` or `undefined` values are skipped. Values are
 * serialized one by one, so a value that fails to serialize is replaced with
 * `"<failed to serialize>"` instead of dropping the whole metadata object.
 *
 * @param metadata - Metadata to serialize
 * @returns JSON string, or undefined if there is no metadata to write
 * @throws Error if metadata has more than {@link MAX_OBSERVATION_METADATA_KEYS} top-level keys
 * @internal
 */
export function serializeObservationMetadata(
  metadata: unknown,
): string | undefined {
  if (metadata === undefined || metadata === null) return undefined;

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    try {
      return serializeValue(metadata);
    } catch {
      return "<failed to serialize>";
    }
  }

  const entries = Object.entries(metadata).filter(([_, v]) => v != null);

  if (entries.length > MAX_OBSERVATION_METADATA_KEYS) {
    throw new Error(
      `Observation metadata has ${entries.length} keys, which exceeds the maximum of ${MAX_OBSERVATION_METADATA_KEYS}.`,
    );
  }

  const parts: string[] = [];

  for (const [key, value] of entries) {
    let serialized: string | undefined;

    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = JSON.stringify("<failed to serialize>");
    }

    // JSON.stringify returns undefined for functions and symbols
    if (serialized !== undefined) {
      parts.push(`${JSON.stringify(key)}:${serialized}`);
    }
  }

  return parts.length > 0 ? `{${parts.join(",")}}` : undefined;
}
