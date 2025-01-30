/**
 * A consistent sampling function that works for arbitrary strings across all JavaScript runtimes.
 */
export function isInSample(input: string, sampleRate: number | undefined): boolean {
  if (sampleRate === undefined) {
    return true;
  } else if (sampleRate === 0) {
    return false;
  }

  if (sampleRate < 0 || sampleRate > 1 || isNaN(sampleRate)) {
    console.warn("Sample rate must be between 0 and 1. Ignoring setting.");

    return true;
  }


  return simpleHash(input) < sampleRate;
}

/**
 * Simple and consistent string hashing function.
 * Uses character codes and prime numbers for good distribution.
 */
function simpleHash(str: string): number {
  let hash = 0;
  const prime = 31;

  for (let i = 0; i < str.length; i++) {
    // Use rolling multiplication instead of Math.pow
    hash = (hash * prime + str.charCodeAt(i)) >>> 0;
  }

  // Use bit operations for better distribution
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
  hash = (hash >>> 16) ^ hash;

  return Math.abs(hash) / 0x7fffffff;
}
