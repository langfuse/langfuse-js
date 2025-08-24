type LangfuseEnvVar =
  | "LANGFUSE_PUBLIC_KEY"
  | "LANGFUSE_SECRET_KEY"
  | "LANGFUSE_BASE_URL"
  | "LANGFUSE_BASEURL" // legacy v2
  | "LANGFUSE_TIMEOUT"
  | "LANGFUSE_FLUSH_AT"
  | "LANGFUSE_FLUSH_INTERVAL"
  | "LANGFUSE_LOG_LEVEL"
  | "LANGFUSE_RELEASE"
  | "LANGFUSE_TRACING_ENVIRONMENT";

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
