import { MAX_OBSERVATION_METADATA_KEYS } from "./constants.js";
import { getGlobalLogger } from "./logger/index.js";

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
 * Whether a top-level metadata value is written to the metadata attribute.
 * `null`, `undefined`, functions and symbols are skipped.
 *
 * @param value - Metadata value to check
 * @returns True if the value is written
 * @internal
 */
export function isWrittenMetadataValue(value: unknown): boolean {
  return (
    value != null && typeof value !== "function" && typeof value !== "symbol"
  );
}

/**
 * Serializes top-level metadata values into `"key":value` JSON fragments and
 * adds them to `entries`, overwriting fragments of existing keys.
 *
 * Keys with `null`, `undefined`, function or symbol values are skipped. Values
 * are serialized one by one, so a value that fails to serialize is replaced
 * with `"<failed to serialize>"` instead of dropping the whole metadata
 * object. New keys beyond {@link MAX_OBSERVATION_METADATA_KEYS} are dropped
 * with a warning.
 *
 * Callers can keep `entries` and pass it again on the next update, so only
 * the keys of that update are serialized.
 *
 * @param metadata - Metadata to serialize
 * @param entries - Fragments of earlier metadata, keyed by metadata key
 * @returns `entries`, with the fragments of `metadata` added
 * @internal
 */
export function serializeObservationMetadataEntries(
  metadata: object,
  entries: Map<string, string> = new Map(),
): Map<string, string> {
  let droppedKeys = 0;

  for (const [key, value] of Object.entries(metadata)) {
    if (!isWrittenMetadataValue(value)) continue;

    if (!entries.has(key) && entries.size >= MAX_OBSERVATION_METADATA_KEYS) {
      droppedKeys++;
      continue;
    }

    let serialized: string | undefined;

    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = JSON.stringify("<failed to serialize>");
    }

    // JSON.stringify returns undefined for values with a toJSON method that
    // returns undefined
    if (serialized !== undefined) {
      entries.set(key, `${JSON.stringify(key)}:${serialized}`);
    }
  }

  if (droppedKeys > 0) {
    getGlobalLogger().warn(
      `Dropped ${droppedKeys} observation metadata keys: metadata can have at most ${MAX_OBSERVATION_METADATA_KEYS} top-level keys.`,
    );
  }

  return entries;
}

/**
 * Joins fragments from {@link serializeObservationMetadataEntries} into a
 * JSON object.
 *
 * @param entries - Fragments keyed by metadata key
 * @returns JSON string, or undefined if there are no fragments
 * @internal
 */
export function joinObservationMetadataEntries(
  entries: Map<string, string>,
): string | undefined {
  return entries.size > 0 ? `{${[...entries.values()].join(",")}}` : undefined;
}

/**
 * Serializes observation metadata into the single JSON value written to the
 * `langfuse.observation.metadata` span attribute.
 *
 * Object metadata is serialized with
 * {@link serializeObservationMetadataEntries}: keys with `null`, `undefined`,
 * function or symbol values are skipped, and keys beyond
 * {@link MAX_OBSERVATION_METADATA_KEYS} are dropped with a warning.
 *
 * @param metadata - Metadata to serialize
 * @returns JSON string, or undefined if there is no metadata to write
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

  return joinObservationMetadataEntries(
    serializeObservationMetadataEntries(metadata),
  );
}
