/**
 * Fetches `url` and reads the whole response body, aborting when no progress
 * is made for `timeoutSeconds`: neither the response headers nor a body chunk
 * arrived in that window. Unlike a total timeout, a large download that keeps
 * receiving data is never cut off. This matches the per-read timeout of the
 * Python SDK's HTTP client. Without `timeoutSeconds`, the request is not
 * bounded.
 *
 * Non-2xx responses are returned as soon as their headers arrive, with an
 * empty body; their body is not read. An abort signal in `init` still cancels
 * the request.
 *
 * @internal
 */
export async function fetchWithIdleTimeout(
  url: string,
  init: RequestInit,
  timeoutSeconds: number | undefined,
): Promise<{ response: Response; body: Uint8Array }> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const resetTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (timeoutSeconds === undefined) return;
    // The URL is left out of the error: it can carry signed query parameters.
    timer = setTimeout(
      () =>
        controller.abort(
          new Error(`Request made no progress for ${timeoutSeconds} seconds`),
        ),
      timeoutSeconds * 1_000,
    );
  };

  resetTimer();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    resetTimer();

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { response, body: new Uint8Array() };
    }

    if (!response.body) {
      return { response, body: new Uint8Array(await response.arrayBuffer()) };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimer();
      chunks.push(value);
      length += value.byteLength;
    }

    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { response, body };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
