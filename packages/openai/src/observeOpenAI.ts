import { withTracing } from "./traceMethod.js";
import type { LangfuseConfig } from "./types.js";

/**
 * Wraps an OpenAI SDK client with automatic Langfuse tracing.
 *
 * This function creates a proxy around the OpenAI SDK that automatically
 * traces all method calls, capturing detailed information about requests,
 * responses, token usage, costs, and performance metrics. It works with
 * both streaming and non-streaming OpenAI API calls.
 *
 * The wrapper recursively traces nested objects in the OpenAI SDK, ensuring
 * that all API calls (chat completions, embeddings, fine-tuning, etc.) are
 * automatically captured as Langfuse generations.
 *
 * @param sdk - The OpenAI SDK client instance to wrap with tracing
 * @param langfuseConfig - Optional configuration for tracing behavior
 * @returns A proxied version of the OpenAI SDK with automatic tracing
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { observeOpenAI } from '@langfuse/openai';
 *
 * const openai = observeOpenAI(new OpenAI({
 *   apiKey: process.env.OPENAI_API_KEY,
 * }));
 *
 * // All OpenAI calls are now automatically traced
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   max_tokens: 100,
 *   temperature: 0.7
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom tracing configuration
 * const openai = observeOpenAI(new OpenAI({
 *   apiKey: process.env.OPENAI_API_KEY
 * }), {
 *   traceName: 'AI-Assistant-Chat',
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   tags: ['production', 'chat-feature'],
 *   generationName: 'gpt-4-chat-completion'
 * });
 *
 * const completion = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Explain quantum computing' }]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Streaming responses are also automatically traced
 * const stream = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Write a story' }],
 *   stream: true
 * });
 *
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk.choices[0]?.delta?.content || '');
 * }
 * // Final usage details and complete output are captured automatically
 * ```
 *
 * @example
 * ```typescript
 * // Using with Langfuse prompt management
 * const openai = observeOpenAI(new OpenAI({
 *   apiKey: process.env.OPENAI_API_KEY
 * }), {
 *   langfusePrompt: {
 *     name: 'chat-assistant-v2',
 *     version: 3,
 *     isFallback: false
 *   },
 *   generationMetadata: {
 *     environment: 'production',
 *     feature: 'chat-assistant'
 *   }
 * });
 * ```
 *
 * @public
 */
export const observeOpenAI = <SDKType extends object>(
  sdk: SDKType,
  langfuseConfig?: LangfuseConfig,
): SDKType => {
  return new Proxy(sdk, {
    get(wrappedSdk, propKey, proxy) {
      const originalProperty = wrappedSdk[propKey as keyof SDKType];

      const defaultGenerationName = `${sdk.constructor?.name}.${propKey.toString()}`;
      const generationName =
        langfuseConfig?.generationName ?? defaultGenerationName;
      const config = { ...langfuseConfig, generationName };

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
  });
};
