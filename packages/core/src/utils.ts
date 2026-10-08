import { LangfuseOtelSpanAttributes } from "./constants.js";
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
 * Derive the experiment ID of a run on a Langfuse dataset: the first 16 hex
 * characters of SHA-256 over
 * `JSON.stringify(["langfuse-experiment-v1", projectId, datasetId, runName])`.
 *
 * Runs with the same project, dataset and run name share one experiment, and
 * the ID matches the one the Langfuse platform and the Python SDK derive for
 * the same run. Do not change the input layout: it is a cross-SDK contract.
 * @internal
 */
export async function createStableExperimentId(params: {
  projectId: string;
  datasetId: string;
  runName: string;
}): Promise<string> {
  const seed = JSON.stringify([
    "langfuse-experiment-v1",
    params.projectId,
    params.datasetId,
    params.runName,
  ]);
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(seed),
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
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

function isObservationMetadataKey(key: string): boolean {
  const prefix = LangfuseOtelSpanAttributes.OBSERVATION_METADATA;

  return key === prefix || key.startsWith(`${prefix}.`);
}

/**
 * Reads the attribute count limit of an OpenTelemetry SDK span. Returns
 * `undefined` for spans without SDK limits, such as non-recording spans.
 */
function getSpanAttributeCountLimit(span: unknown): number | undefined {
  // `_spanLimits` is private on the SDK span and has no public accessor
  const limit = (
    span as { _spanLimits?: { attributeCountLimit?: unknown } } | undefined
  )?._spanLimits?.attributeCountLimit;

  return typeof limit === "number" && Number.isFinite(limit)
    ? limit
    : undefined;
}

/**
 * Drops new observation metadata attributes
 * (`langfuse.observation.metadata.<key>`) that would exceed the span's
 * attribute count limit (`spanLimits.attributeCountLimit`, default 128).
 * OpenTelemetry JS silently drops new attributes once a span is full, so
 * unbounded metadata would otherwise push out later attributes such as the
 * output.
 *
 * Counts the attributes already on the span, the new keys with non-null
 * values, and `reservedKeys` that are not on the span yet. Excess new metadata
 * keys are dropped from the tail. Other attributes are never dropped, and
 * overwrites of keys already on the span are always kept. Spans without SDK
 * limits are left alone. Logs one warning if keys are dropped and never
 * throws.
 *
 * @param span - Span the attributes are about to be set on
 * @param attributes - Attributes about to be set on the span
 * @param reservedKeys - Keys to keep room for, because they are written later
 * @returns `attributes` without the dropped metadata keys
 * @internal
 */
export function dropMetadataOverSpanAttributeLimit<
  T extends Record<string, unknown>,
>(span: unknown, attributes: T, reservedKeys: readonly string[]): T {
  try {
    const limit = getSpanAttributeCountLimit(span);
    if (limit === undefined) {
      return attributes;
    }

    const existing =
      (span as { attributes?: Record<string, unknown> }).attributes ?? {};
    const isExisting = (key: string) =>
      Object.prototype.hasOwnProperty.call(existing, key);

    const newKeys = Object.keys(attributes).filter(
      (key) => attributes[key] != null && !isExisting(key),
    );
    const newKeySet = new Set(newKeys);
    const reservedCount = new Set(
      reservedKeys.filter((key) => !isExisting(key) && !newKeySet.has(key)),
    ).size;
    const usedCount = Object.keys(existing).length + reservedCount;

    if (usedCount + newKeys.length <= limit) {
      return attributes;
    }

    const newMetadataKeys = newKeys.filter(isObservationMetadataKey);
    const freeSlots = Math.max(
      0,
      limit - usedCount - (newKeys.length - newMetadataKeys.length),
    );
    const dropped = newMetadataKeys.slice(freeSlots);
    if (dropped.length === 0) {
      return attributes;
    }

    const metadataPrefix = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;
    getGlobalLogger().warn(
      `Dropped ${dropped.length} metadata key(s) from observation '${(span as { name?: unknown }).name}' ` +
        `to stay within the span attribute limit of ${limit} (spanLimits.attributeCountLimit / OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT). ` +
        `Dropped keys include: ${dropped
          .slice(0, 5)
          .map((key) =>
            key.startsWith(metadataPrefix)
              ? key.slice(metadataPrefix.length)
              : key,
          )
          .join(", ")}`,
    );

    const droppedKeys = new Set(dropped);

    return Object.fromEntries(
      Object.entries(attributes).filter(([key]) => !droppedKeys.has(key)),
    ) as T;
  } catch {
    return attributes;
  }
}

/**
 * Serializes an observation metadata value into the JSON string written to
 * its `langfuse.observation.metadata.<key>` span attribute.
 *
 * Every value is JSON-encoded, strings included (`"3"` becomes `"\"3\""`), so
 * the server can tell the string `"3"` from the number `3` and the string
 * `'{"a":1}'` from the object `{ a: 1 }`. A value that fails to serialize
 * becomes the JSON string `"\"<failed to serialize>\""`. `null`, `undefined`,
 * functions and symbols return undefined and are not written.
 *
 * @param value - Metadata value to serialize
 * @returns JSON string, or undefined if the value is not written
 * @internal
 */
export function serializeMetadataValue(value: unknown): string | undefined {
  if (
    value == null ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }

  try {
    // JSON.stringify returns undefined if a toJSON method returns undefined
    return JSON.stringify(value) as string | undefined;
  } catch {
    return JSON.stringify("<failed to serialize>");
  }
}
