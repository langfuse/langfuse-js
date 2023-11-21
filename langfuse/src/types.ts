import { type LangfuseCoreOptions } from "../../langfuse-core";

export type LangfuseOptions = {
  // autocapture?: boolean
  persistence?: "localStorage" | "sessionStorage" | "cookie" | "memory";
  persistence_name?: string;
} & LangfuseCoreOptions;
