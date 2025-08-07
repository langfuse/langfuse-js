import { getGlobalLogger, uint8ArrayToBase64 } from "@langfuse/core";

/**
 * Cross-platform hash utilities with graceful fallbacks.
 *
 * This module attempts to load crypto functionality from various JavaScript runtimes:
 * - Node.js (using the 'crypto' module)
 * - Deno (using 'node:crypto')
 * - Edge runtimes like Cloudflare Workers (using the Web Crypto API)
 *
 * If crypto is not available, functions will throw errors and isCryptoAvailable will be false.
 */

// Cross-platform hash utilities with graceful fallbacks
let cryptoModule: any;

/**
 * Indicates whether cryptographic functions are available in the current runtime.
 *
 * @example
 * ```typescript
 * import { isCryptoAvailable } from '@langfuse/otel';
 *
 * if (isCryptoAvailable) {
 *   // Safe to use hash functions
 *   const hash = getSha256HashFromBytes(data);
 * } else {
 *   // Crypto not available, handle gracefully
 *   console.warn('Crypto functions not available in this runtime');
 * }
 * ```
 *
 * @public
 */
let isCryptoAvailable = false;

try {
  if (typeof (globalThis as any).Deno !== "undefined") {
    // Deno
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cryptoModule = require("node:crypto");
    isCryptoAvailable = true;
  } else if (typeof process !== "undefined" && process.versions?.node) {
    // Node
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cryptoModule = require("crypto");
    isCryptoAvailable = true;
  } else if (typeof crypto !== "undefined") {
    // Edge runtime (Cloudflare Workers, Vercel Cloud Function)
    cryptoModule = crypto;
    isCryptoAvailable = true;
  }
} catch (error) {
  getGlobalLogger().warn(
    "Crypto module not available. Media handling will be disabled.",
    error,
  );

  isCryptoAvailable = false;
}

export { isCryptoAvailable };

/**
 * Computes the SHA-256 hash of the provided data.
 *
 * @param data - The data to hash
 * @returns The SHA-256 hash as a Uint8Array
 * @throws Error if crypto module is not available
 * @private
 */
function sha256(data: Uint8Array): Uint8Array {
  if (!isCryptoAvailable || !cryptoModule) {
    throw new Error("Crypto module not available");
  }

  return cryptoModule.createHash("sha256").update(data).digest();
}

/**
 * Generates a base64-encoded SHA-256 hash from the provided bytes.
 *
 * This function is used throughout the Langfuse OpenTelemetry integration
 * to generate content hashes for media files and ensure data integrity.
 *
 * @param data - The bytes to hash
 * @returns The base64-encoded SHA-256 hash
 * @throws Error if crypto module is not available
 *
 * @example
 * ```typescript
 * import { getSha256HashFromBytes } from '@langfuse/otel';
 *
 * const data = new TextEncoder().encode('Hello World');
 * const hash = getSha256HashFromBytes(data);
 * console.log(hash); // "pZGm1Av0IEBKARczz7exkNYsZb8LzaMrV7J32a2fFG4="
 * ```
 *
 * @public
 */
export function getSha256HashFromBytes(data: Uint8Array): string {
  if (!isCryptoAvailable) {
    throw new Error("Crypto module not available");
  }

  const hash = sha256(data);

  return uint8ArrayToBase64(hash);
}
