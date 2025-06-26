import "dotenv/config";

import { Langfuse } from "langfuse-otel";

describe("Langfuse OTEL SDK", () => {
  describe("Basic tracing", () => {
    it("should create a span", async () => {
      const langfuse = new Langfuse();

      langfuse.init({});
      langfuse.startSpan();
      langfuse.flush();
    });
  });
});
