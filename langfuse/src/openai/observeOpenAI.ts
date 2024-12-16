import type { LangfuseCore } from "langfuse-core";

import { LangfuseSingleton } from "./LangfuseSingleton";
import { withTracing } from "./traceMethod";
import type { LangfuseConfig, LangfuseExtension } from "./types";

/**
 * Wraps an OpenAI SDK object with Langfuse tracing. Function calls are extended with a tracer that logs detailed information about the call, including the method name,
 * input parameters, and output.
 * 
 * @param {T} sdk - The OpenAI SDK object to be wrapped.
 * @param {LangfuseConfig} [langfuseConfig] - Optional configuration object for the wrapper.
 * @param {string} [langfuseConfig.traceName] - The name to use for tracing. If not provided, a default name based on the SDK's constructor name and the method name will be used.
 * @param {string} [langfuseConfig.sessionId] - Optional session ID for tracing.
 * @param {string} [langfuseConfig.userId] - Optional user ID for tracing.
 * @param {string} [langfuseConfig.release] - Optional release version for tracing.
 * @param {string} [langfuseConfig.version] - Optional version for tracing.
 * @param {string} [langfuseConfig.metadata] - Optional metadata for tracing.
 * @param {string} [langfuseConfig.tags] - Optional tags for tracing.
 * @returns {T} - A proxy of the original SDK object with methods wrapped for tracing.
 *
 * @example
 * const client = new OpenAI();
 * const res = observeOpenAI(client, { traceName: "My.OpenAI.Chat.Trace" }).chat.completions.create({
 *      messages: [{ role: "system", content: "Say this is a test!" }],
        model: "gpt-3.5-turbo",
        user: "langfuse",
        max_tokens: 300
 * });
 * */
export const observeOpenAI = <SDKType extends object>(
  sdk: SDKType,
  langfuseConfig?: LangfuseConfig
): SDKType & LangfuseExtension => {
  return new Proxy(sdk, {
    get(wrappedSdk, propKey, proxy) {
      const originalProperty = wrappedSdk[propKey as keyof SDKType];

      const defaultGenerationName = `${sdk.constructor?.name}.${propKey.toString()}`;
      const generationName = langfuseConfig?.generationName ?? defaultGenerationName;
      const traceName = langfuseConfig && 'traceName' in langfuseConfig ? langfuseConfig.traceName : generationName;
      const config = { ...langfuseConfig, generationName, traceName};      

      // Add a flushAsync method to the OpenAI SDK that flushes the Langfuse client
      if (propKey === "flushAsync") {
        let langfuseClient: LangfuseCore;

        // Flush the correct client depending on whether a parent client is provided
        if (langfuseConfig && "parent" in langfuseConfig) {
          langfuseClient = langfuseConfig.parent.client;
        } else {
          langfuseClient = LangfuseSingleton.getInstance();
        }

        return langfuseClient.flushAsync.bind(langfuseClient);
      }

      // Add a shutdownAsync method to the OpenAI SDK that flushes the Langfuse client
      if (propKey === "shutdownAsync") {
        let langfuseClient: LangfuseCore;

        // Flush the correct client depending on whether a parent client is provided
        if (langfuseConfig && "parent" in langfuseConfig) {
          langfuseClient = langfuseConfig.parent.client;
        } else {
          langfuseClient = LangfuseSingleton.getInstance();
        }

        return langfuseClient.shutdownAsync.bind(langfuseClient);
      }

      // Trace methods of the OpenAI SDK
      if (typeof originalProperty === "function") {
        return withTracing(originalProperty.bind(wrappedSdk), config);
      }

      const isNestedOpenAIObject =
        originalProperty &&
        !Array.isArray(originalProperty) &&
        !(originalProperty instanceof Date) &&
        typeof originalProperty === "object";

      // Recursively wrap nested objects to ensure all nested properties or methods are also traced
      if (isNestedOpenAIObject) {
        return observeOpenAI(originalProperty, config);
      }

      // Fallback to returning the original value
      return Reflect.get(wrappedSdk, propKey, proxy);
    },
  }) as SDKType & LangfuseExtension;
};
