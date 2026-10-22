import { it } from "vitest";

/**
 * Registers a test that fails intermittently for reasons outside the SDK.
 * It still runs, but a failure is logged as a warning instead of failing the
 * suite. Remove the wrapper once the cause is fixed.
 */
export function itQuarantined(
  name: string,
  reason: string,
  fn: () => Promise<void>,
  timeout?: number,
) {
  it(
    `[quarantined] ${name}`,
    async () => {
      try {
        await fn();
      } catch (error) {
        console.warn(`[quarantined] "${name}" failed (${reason}):`, error);
      }
    },
    timeout,
  );
}
