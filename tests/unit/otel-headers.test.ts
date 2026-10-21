import { describe, expect, it } from "vitest";

import { withDefaultHeaders } from "../../packages/otel/src/headers.js";

describe("withDefaultHeaders", () => {
  it("lets an override replace a default regardless of casing", () => {
    expect(
      withDefaultHeaders(
        { "x-langfuse-ingestion-version": "4", "x-langfuse-sdk-name": "js" },
        { "X-Langfuse-Ingestion-Version": "3" },
      ),
    ).toEqual({
      "x-langfuse-sdk-name": "js",
      "X-Langfuse-Ingestion-Version": "3",
    });
  });

  it("keeps all defaults without overrides", () => {
    expect(withDefaultHeaders({ a: "1" })).toEqual({ a: "1" });
  });
});
