import { getBinaryResponse } from "./BinaryResponse.js";
import { isResponseWithBody } from "./ResponseWithBody.js";
import { fromJson } from "../json.js";
import { withCleanup } from "./withCleanup.js";

export async function getResponseBody(
  response: Response,
  responseType?: string,
  cleanup?: () => void,
): Promise<unknown> {
  if (!isResponseWithBody(response)) {
    cleanup?.();
    return undefined;
  }
  switch (responseType) {
    case "binary-response":
      return getBinaryResponse(response, cleanup);
    case "blob":
      try {
        return await response.blob();
      } finally {
        cleanup?.();
      }
    case "arrayBuffer":
      try {
        return await response.arrayBuffer();
      } finally {
        cleanup?.();
      }
    case "sse":
      return withCleanup(response.body, cleanup);
    case "streaming":
      return withCleanup(response.body, cleanup);

    case "text":
      try {
        return await response.text();
      } finally {
        cleanup?.();
      }
  }

  // if responseType is "json" or not specified, try to parse as JSON
  try {
    const text = await response.text();
    if (text.length > 0) {
      try {
        let responseBody = fromJson(text);
        return responseBody;
      } catch (err) {
        return {
          ok: false,
          error: {
            reason: "non-json",
            statusCode: response.status,
            rawBody: text,
          },
        };
      }
    }
    return undefined;
  } finally {
    cleanup?.();
  }
}
