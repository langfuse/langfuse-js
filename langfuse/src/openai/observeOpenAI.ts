import type OpenAI from "openai";
import { LangfuseSingleton } from "./LangfuseSingleton";
import { withTracing } from "./traceMethod";
import type { CreateLangfuseTraceBody } from "langfuse-core";

export type LangfuseConfig = Pick<
  CreateLangfuseTraceBody,
  "sessionId" | "userId" | "release" | "version" | "metadata" | "tags"
> & {
  traceName?: string;
  traceId?: string;
};
type LangfuseExtension = OpenAI & Pick<ReturnType<typeof LangfuseSingleton.getInstance>, "flushAsync">;

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
      const langfuse = LangfuseSingleton.getInstance();
      const requestedSdkProperty = wrappedSdk[propKey as keyof SDKType];
      const traceName = langfuseConfig?.traceName ?? `${sdk.constructor?.name}.${propKey.toString()}`;
      const config = { ...langfuseConfig, traceName };

      // Add a flushAsync method to the OpenAI SDK that flushes the Langfuse client
      if (propKey === "flushAsync") {
        return langfuse.flushAsync.bind(langfuse); // Bind the flushAsync method to the Langfuse client for correct 'this' context
      }

      // Trace methods of the OpenAI SDK
      if (typeof requestedSdkProperty === "function") {
        return withTracing(requestedSdkProperty.bind(wrappedSdk), config);
      }

      const isNestedOpenAIObject =
        requestedSdkProperty &&
        !Array.isArray(requestedSdkProperty) &&
        !(requestedSdkProperty instanceof Date) &&
        typeof requestedSdkProperty === "object";

      // Recursively wrap nested objects to ensure all nested properties or methods are also traced
      if (isNestedOpenAIObject) {
        return observeOpenAI(requestedSdkProperty, config);
      }

      // Fallback to returning the original value
      return Reflect.get(wrappedSdk, propKey, proxy);
    },
  }) as SDKType & LangfuseExtension;
};
