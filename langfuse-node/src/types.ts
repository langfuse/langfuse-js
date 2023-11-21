import { type LangfuseCoreOptions, type LangfuseFetchOptions, type LangfuseFetchResponse } from "../../langfuse-core";

export type LangfuseOptions = LangfuseCoreOptions & {
  persistence?: "memory";
  // Timeout in milliseconds for any calls. Defaults to 10 seconds.
  requestTimeout?: number;
  // A custom fetch implementation. Defaults to axios in the node package.
  fetch?: (url: string, options: LangfuseFetchOptions) => Promise<LangfuseFetchResponse>;
};
