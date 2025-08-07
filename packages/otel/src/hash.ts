import { getGlobalLogger, uint8ArrayToBase64 } from "@langfuse/core";

// Cross-platform hash utilities with graceful fallbacks
let cryptoModule: any;
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

function sha256(data: Uint8Array): Uint8Array {
  if (!isCryptoAvailable || !cryptoModule) {
    throw new Error("Crypto module not available");
  }

  return cryptoModule.createHash("sha256").update(data).digest();
}

export function getSha256HashFromBytes(data: Uint8Array): string {
  if (!isCryptoAvailable) {
    throw new Error("Crypto module not available");
  }

  const hash = sha256(data);

  return uint8ArrayToBase64(hash);
}
