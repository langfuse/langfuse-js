import { anySignal, getTimeoutSignal } from "./signals.js";

export interface MadeRequest {
  response: Response;
  cleanup: () => void;
}

export const makeRequest = async (
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  url: string,
  method: string,
  headers: Record<string, string>,
  requestBody: BodyInit | undefined,
  timeoutMs?: number,
  abortSignal?: AbortSignal,
  withCredentials?: boolean,
  duplex?: "half",
): Promise<MadeRequest> => {
  const signals: AbortSignal[] = [];

  // Add timeout signal
  let timeoutAbortId: NodeJS.Timeout | undefined = undefined;
  if (timeoutMs != null) {
    const { signal, abortId } = getTimeoutSignal(timeoutMs);
    timeoutAbortId = abortId;
    signals.push(signal);
  }

  // Add arbitrary signal
  if (abortSignal != null) {
    signals.push(abortSignal);
  }
  const { signal: newSignals, cleanup: cleanupSignals } = anySignal(signals);
  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;
    newSignals.removeEventListener("abort", abortListener);
    cleanupSignals();
    if (timeoutAbortId != null) {
      clearTimeout(timeoutAbortId);
    }
  };
  const abortListener = () => cleanup();
  newSignals.addEventListener("abort", abortListener);

  try {
    const response = await fetchFn(url, {
      method,
      headers,
      body: requestBody,
      signal: newSignals,
      credentials: withCredentials ? "include" : undefined,
      // @ts-ignore
      duplex,
    });
    return { response, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
};
