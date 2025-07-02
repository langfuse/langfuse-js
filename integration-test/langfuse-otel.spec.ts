import "dotenv/config";

import { initializeOTEL, Langfuse } from "langfuse-otel";

describe("Langfuse OTEL SDK", () => {
  describe("Basic tracing", () => {
    it("should create a span", async () => {
      initializeOTEL({ debug: true, environment: "test" });

      const langfuse = new Langfuse();

      langfuse.startSpan("hello").end();

      await langfuse.flush();
    });
  });
});
