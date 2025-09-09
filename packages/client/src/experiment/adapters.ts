import { Evaluator } from "./types.js";

/**
 * Converts an AutoEvals evaluator to a Langfuse-compatible evaluator function.
 *
 * This adapter function bridges the gap between AutoEvals library evaluators
 * and Langfuse experiment evaluators, handling parameter mapping and result
 * formatting automatically.
 *
 * AutoEvals evaluators expect `input`, `output`, and `expected` parameters,
 * while Langfuse evaluators use `input`, `output`, and `expectedOutput`.
 * This function handles the parameter name mapping.
 *
 * @template E - Type of the AutoEvals evaluator function
 * @param autoevalEvaluator - The AutoEvals evaluator function to convert
 * @param params - Optional additional parameters to pass to the AutoEvals evaluator
 * @returns A Langfuse-compatible evaluator function
 *
 * @example Basic usage with AutoEvals
 * ```typescript
 * import { Factuality, Levenshtein } from 'autoevals';
 * import { autoevalToLangfuseEvaluator } from '@langfuse/client';
 *
 * const factualityEvaluator = autoevalToLangfuseEvaluator(Factuality);
 * const levenshteinEvaluator = autoevalToLangfuseEvaluator(Levenshtein);
 *
 * await langfuse.experiment.run({
 *   name: "AutoEvals Integration Test",
 *   data: myDataset,
 *   task: myTask,
 *   evaluators: [factualityEvaluator, levenshteinEvaluator]
 * });
 * ```
 *
 * @example Using with additional parameters
 * ```typescript
 * import { Similarity } from 'autoevals';
 *
 * const similarityEvaluator = autoevalToLangfuseEvaluator(
 *   Similarity,
 *   { model: 'text-embedding-ada-002' } // Additional params for AutoEvals
 * );
 *
 * await langfuse.experiment.run({
 *   name: "Semantic Similarity Test",
 *   data: myDataset,
 *   task: myTask,
 *   evaluators: [similarityEvaluator]
 * });
 * ```
 *
 * @example Custom AutoEvals evaluator
 * ```typescript
 * // Define a custom AutoEvals-compatible function
 * const customEvaluator = async ({ input, output, expected }) => {
 *   const score = calculateCustomScore(input, output, expected);
 *   return {
 *     name: "custom_metric",
 *     score: score,
 *     metadata: { method: "custom_algorithm" }
 *   };
 * };
 *
 * // Convert to Langfuse format
 * const langfuseEvaluator = autoevalToLangfuseEvaluator(customEvaluator);
 * ```
 *
 * @see {@link https://github.com/braintrustdata/autoevals} AutoEvals library documentation
 * @see {@link Evaluator} for Langfuse evaluator specifications
 *
 * @public
 * @since 4.0.0
 */
export function autoevalToLangfuseEvaluator<E extends CallableFunction>(
  autoevalEvaluator: E,
  params?: Params<E>,
): Evaluator {
  const langfuseEvaluator: Evaluator = async (langfuseEvaluatorParams) => {
    const score = await autoevalEvaluator({
      ...(params ?? {}),
      input: langfuseEvaluatorParams.input,
      output: langfuseEvaluatorParams.output,
      expected: langfuseEvaluatorParams.expectedOutput,
    });

    return {
      name: score.name,
      value: score.score ?? 0,
      metadata: score.metadata,
    };
  };

  return langfuseEvaluator;
}

/**
 * Utility type to extract parameter types from AutoEvals evaluator functions.
 *
 * This type helper extracts the parameter type from an AutoEvals evaluator
 * and omits the standard parameters (input, output, expected) that are
 * handled by the adapter, leaving only the additional configuration parameters.
 *
 * @template E - The AutoEvals evaluator function type
 * @internal
 */
type Params<E> = Parameters<
  E extends (...args: any[]) => any ? E : never
>[0] extends infer P
  ? Omit<P, "input" | "output" | "expected">
  : never;
