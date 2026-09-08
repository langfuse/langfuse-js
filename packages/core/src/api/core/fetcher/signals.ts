const TIMEOUT = "timeout";

export function getTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  abortId: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const abortId = setTimeout(() => controller.abort(TIMEOUT), timeoutMs);
  return { signal: controller.signal, abortId };
}

/**
 * Returns an abort signal that is getting aborted when
 * at least one of the specified abort signals is aborted.
 *
 * Requires at least node.js 18.
 */
export function anySignal(...args: AbortSignal[] | [AbortSignal[]]): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  // Allowing signals to be passed either as array
  // of signals or as multiple arguments.
  const signals = (
    args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  ) as AbortSignal[];

  const controller = new AbortController();
  const listeners: Array<{
    signal: AbortSignal;
    listener: () => void;
  }> = [];
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;
    for (const { signal, listener } of listeners) {
      signal.removeEventListener("abort", listener);
    }
    listeners.length = 0;
  };

  for (const signal of signals) {
    if (signal.aborted) {
      // Exiting early if one of the signals
      // is already aborted.
      controller.abort((signal as any)?.reason);
      break;
    }

    const listener = () => {
      controller.abort((signal as any)?.reason);
      cleanup();
    };

    // Listening for signals and removing the listeners
    // when at least one symbol is aborted.
    signal.addEventListener("abort", listener, {
      signal: controller.signal,
    });
    listeners.push({ signal, listener });
  }

  return { signal: controller.signal, cleanup };
}
