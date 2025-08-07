/**
 * Type guard to check if a value is an async iterable.
 *
 * This utility function determines whether a given value implements the
 * AsyncIterable interface, which is used to identify streaming responses
 * from the OpenAI SDK.
 *
 * @param x - The value to check
 * @returns True if the value is an async iterable, false otherwise
 *
 * @example
 * ```typescript
 * import { isAsyncIterable } from './utils.js';
 *
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [...],
 *   stream: true
 * });
 *
 * if (isAsyncIterable(response)) {
 *   // Handle streaming response
 *   for await (const chunk of response) {
 *     console.log(chunk);
 *   }
 * } else {
 *   // Handle regular response
 *   console.log(response);
 * }
 * ```
 *
 * @public
 */
export const isAsyncIterable = (x: unknown): x is AsyncIterable<unknown> =>
  x != null &&
  typeof x === "object" &&
  typeof (x as any)[Symbol.asyncIterator] === "function";
