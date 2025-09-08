import { Evaluator } from "./types.js";

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

// You'll also need to define the Params type if it doesn't exist:
type Params<E> = Parameters<
  E extends (...args: any[]) => any ? E : never
>[0] extends infer P
  ? Omit<P, "input" | "output" | "expected">
  : never;
