import { LANGFUSE_SDK_VERSION, LANGFUSE_TRACER_NAME } from "@langfuse/core";
import { trace } from "@opentelemetry/api";

export function getLangfuseTracer() {
  return trace.getTracer(LANGFUSE_TRACER_NAME, LANGFUSE_SDK_VERSION);
}
