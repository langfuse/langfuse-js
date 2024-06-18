import { type LangfuseCoreOptions } from "langfuse-core";

/**
 * LangfuseOptions
 * @property publicKey - Public API key of Langfuse project. Can be set via LANGFUSE_PUBLIC_KEY environment variable.
 * @property secretKey - Secret API key of Langfuse project. Can be set via LANGFUSE_SECRET_KEY environment variable.
 * @property baseUrl - Langfuse API baseUrl (https://cloud.langfuse.com by default). Can be set via LANGFUSE_BASEURL environment variable.
 * @property persistence - The storage method used to persist the Langfuse client state.
 * @property persistence_name - The name of the key used to persist the Langfuse client state.
 * @property flushAt - Max batch size that's sent to the API. Defaults to 15. Can be set via LANGFUSE_FLUSH_AT environment variable.
 * @property flushInterval - The maximum time to wait before sending a batch. Defaults to 10000ms. Can be set via LANGFUSE_FLUSH_INTERVAL environment variable.
 * @property fetchRetryCount - Max number of retries in case of API/network errors. Defaults to 3.
 * @property fetchRetryDelay - The delay between HTTP request retries. Defaults to 3000ms.
 * @property requestTimeout - Timeout of API requests in seconds. Defaults to 10000ms.
 * @property release -  Release number/hash of the application to provide analytics grouped by release. Can be set via LANGFUSE_RELEASE environment variable.
 * @property sdkIntegration - Used by intgerations that wrap the Langfuse SDK to add context for debugging and support. Not to be used directly.
 * @property enabled - Enables or disables the Langfuse client. If disabled, all observability calls to the backend will be no-ops. Defaults to true.
 * @interface
 */
export type LangfuseOptions = {
  secretKey?: string;
  publicKey?: string;
  // autocapture?: boolean
  persistence?: "localStorage" | "sessionStorage" | "cookie" | "memory";
  persistence_name?: string;
  enabled?: boolean;
} & LangfuseCoreOptions;
