import { ResponseWithBody } from "./ResponseWithBody.js";
import { withCleanup } from "./withCleanup.js";

export type BinaryResponse = {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/bodyUsed) */
  bodyUsed: boolean;
  /**
   * Returns a ReadableStream of the response body.
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/body)
   */
  stream: () => ReadableStream<Uint8Array>;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/arrayBuffer) */
  arrayBuffer: () => Promise<ArrayBuffer>;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/blob) */
  blob: () => Promise<Blob>;
  /**
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/bytes)
   * Some versions of the Fetch API may not support this method.
   */
  bytes?(): Promise<Uint8Array>;
};

export function getBinaryResponse(
  response: ResponseWithBody,
  cleanup?: () => void,
): BinaryResponse {
  let stream: ReadableStream<Uint8Array> | undefined;
  const binaryResponse: BinaryResponse = {
    get bodyUsed() {
      return response.bodyUsed;
    },
    stream: () => (stream ??= withCleanup(response.body, cleanup)),
    arrayBuffer: async () => {
      try {
        return await response.arrayBuffer();
      } finally {
        cleanup?.();
      }
    },
    blob: async () => {
      try {
        return await response.blob();
      } finally {
        cleanup?.();
      }
    },
  };
  if ("bytes" in response && typeof response.bytes === "function") {
    binaryResponse.bytes = async () => {
      try {
        return await response.bytes!();
      } finally {
        cleanup?.();
      }
    };
  }

  return binaryResponse;
}
