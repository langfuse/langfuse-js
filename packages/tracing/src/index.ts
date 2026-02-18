import { getGlobalLogger, LangfuseOtelSpanAttributes } from "@langfuse/core";
import {
  trace,
  context,
  TimeInput,
  SpanStatusCode,
  Span,
  Context,
  SpanContext,
} from "@opentelemetry/api";

import {
  createObservationAttributes,
  createTraceAttributes,
} from "./attributes.js";
import {
  LangfuseAgent,
  LangfuseEvent,
  LangfuseGeneration,
  LangfuseSpan,
  LangfuseTool,
  LangfuseChain,
  LangfuseEmbedding,
  LangfuseEvaluator,
  LangfuseGuardrail,
  LangfuseRetriever,
  LangfuseObservation,
} from "./spanWrapper.js";
import { getLangfuseTracer } from "./tracerProvider.js";
import {
  LangfuseChainAttributes,
  LangfuseEmbeddingAttributes,
  LangfuseEvaluatorAttributes,
  LangfuseGuardrailAttributes,
  LangfuseRetrieverAttributes,
  LangfuseToolAttributes,
  LangfuseAgentAttributes,
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseObservationType,
  LangfuseSpanAttributes,
  LangfuseTraceAttributes,
  LangfuseObservationAttributes,
} from "./types.js";

export type {
  LangfuseObservationType,
  ObservationLevel,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseGenerationAttributes,
  LangfuseObservationAttributes,
  LangfuseTraceAttributes,
} from "./types.js";

export * from "./spanWrapper.js";
export {
  createTraceAttributes,
  createObservationAttributes,
} from "./attributes.js";
export {
  setLangfuseTracerProvider,
  getLangfuseTracerProvider,
  getLangfuseTracer,
} from "./tracerProvider.js";
export {
  propagateAttributes,
  type PropagateAttributesParams,
} from "@langfuse/core";

export { LangfuseOtelSpanAttributes } from "@langfuse/core";

/**
 * Options for starting observations (spans, generations, events).
 *
 * @public
 */
export type StartObservationOptions = {
  /** Custom start time for the observation */
  startTime?: Date;
  /** Parent span context to attach this observation to */
  parentSpanContext?: SpanContext;
};

/**
 * Options for starting an observations set to active in context
 *
 * Extends StartObservationOptions with additional context-specific configuration.
 *
 * @public
 */
export type StartActiveObservationContext = StartObservationOptions & {
  /** Whether to automatically end the observation when exiting the context. Default is true */
  endOnExit?: boolean;
};

/**
 * Options for startObservation function.
 *
 * @public
 */
export type StartObservationOpts = StartObservationOptions & {
  /** Type of observation to create. Defaults to 'span' */
  asType?: LangfuseObservationType;
};

/**
 * Options for startActiveObservation function.
 *
 * @public
 */
export type StartActiveObservationOpts = StartActiveObservationContext & {
  /** Type of observation to create. Defaults to 'span' */
  asType?: LangfuseObservationType;
};

/**
 * Creates an OpenTelemetry span with the Langfuse tracer.
 *
 * @param params - Parameters for span creation
 * @returns The created OpenTelemetry span
 * @internal
 */
function createOtelSpan(params: {
  name: string;
  startTime?: TimeInput;
  parentSpanContext?: SpanContext;
}): Span {
  return getLangfuseTracer().startSpan(
    params.name,
    { startTime: params.startTime },
    createParentContext(params.parentSpanContext),
  );
}

/**
 * Creates a parent context from a span context.
 *
 * @param parentSpanContext - The span context to use as parent
 * @returns The created context or undefined if no parent provided
 * @internal
 */
function createParentContext(
  parentSpanContext?: SpanContext,
): Context | undefined {
  if (!parentSpanContext) return;

  return trace.setSpanContext(context.active(), parentSpanContext);
}

/**
 * Wraps a promise to automatically end the span when the promise resolves or rejects.
 *
 * @param promise - The promise to wrap
 * @param span - The span to end when promise completes
 * @returns The wrapped promise
 * @internal
 */
function wrapPromise<T>(
  promise: Promise<T>,
  span: Span,
  endOnExit: boolean | undefined,
): Promise<T> {
  return promise.then(
    (value) => {
      if (endOnExit !== false) {
        span.end(); // End span AFTER Promise resolves
      }

      return value;
    },
    (err: unknown) => {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : "Unknown error",
      });

      if (endOnExit !== false) {
        span.end(); // End span AFTER Promise rejects
      }

      throw err;
    },
  );
}

// Function overloads for proper type inference
export function startObservation(
  name: string,
  attributes: LangfuseGenerationAttributes,
  options: StartObservationOpts & { asType: "generation" },
): LangfuseGeneration;
export function startObservation(
  name: string,
  attributes: LangfuseEventAttributes,
  options: StartObservationOpts & { asType: "event" },
): LangfuseEvent;
export function startObservation(
  name: string,
  attributes: LangfuseAgentAttributes,
  options: StartObservationOpts & { asType: "agent" },
): LangfuseAgent;
export function startObservation(
  name: string,
  attributes: LangfuseToolAttributes,
  options: StartObservationOpts & { asType: "tool" },
): LangfuseTool;
export function startObservation(
  name: string,
  attributes: LangfuseChainAttributes,
  options: StartObservationOpts & { asType: "chain" },
): LangfuseChain;
export function startObservation(
  name: string,
  attributes: LangfuseRetrieverAttributes,
  options: StartObservationOpts & { asType: "retriever" },
): LangfuseRetriever;
export function startObservation(
  name: string,
  attributes: LangfuseEvaluatorAttributes,
  options: StartObservationOpts & { asType: "evaluator" },
): LangfuseEvaluator;
export function startObservation(
  name: string,
  attributes: LangfuseGuardrailAttributes,
  options: StartObservationOpts & { asType: "guardrail" },
): LangfuseGuardrail;
export function startObservation(
  name: string,
  attributes: LangfuseEmbeddingAttributes,
  options: StartObservationOpts & { asType: "embedding" },
): LangfuseEmbedding;
export function startObservation(
  name: string,
  attributes?: LangfuseSpanAttributes,
  options?: StartObservationOpts & { asType?: "span" },
): LangfuseSpan;
/**
 * Creates and starts a new Langfuse observation with automatic TypeScript type inference.
 *
 * This is the primary method for creating observations in Langfuse. It supports multiple
 * observation types with full TypeScript type safety - the return type is automatically
 * inferred based on the `asType` parameter.
 *
 * ## Supported Observation Types
 * - **span** (default): General-purpose operations, functions, or workflows
 * - **generation**: LLM calls, text generation, or AI model interactions
 * - **embedding**: Text embedding generation or vector operations
 * - **agent**: AI agent workflows with tool usage and decision making
 * - **tool**: Individual tool calls, API requests, or function invocations
 * - **chain**: Multi-step processes like RAG pipelines or sequential operations
 * - **retriever**: Document retrieval, vector search, or knowledge base queries
 * - **evaluator**: Quality assessment, scoring, or evaluation operations
 * - **guardrail**: Safety checks, content filtering, or validation operations
 * - **event**: Point-in-time occurrences or log entries (automatically ended)
 *
 * @param name - Descriptive name for the observation (e.g., 'openai-gpt-4', 'vector-search')
 * @param attributes - Type-specific attributes (input, output, metadata, etc.)
 * @param options - Configuration options including observation type and timing
 * @returns Strongly-typed observation object based on `asType` parameter
 *
 * @example
 * ```typescript
 * import { startObservation } from '@langfuse/tracing';
 *
 * // Span for general operations (default)
 * const span = startObservation('user-workflow', {
 *   input: { userId: '123', action: 'checkout' },
 *   metadata: { version: '2.1.0', feature: 'new-checkout' }
 * });
 * span.update({ output: { success: true, orderId: '456' } });
 * span.end();
 *
 * // Generation for LLM interactions
 * const generation = startObservation('openai-gpt-4', {
 *   input: [{ role: 'user', content: 'Explain quantum computing' }],
 *   model: 'gpt-4-turbo',
 *   modelParameters: { temperature: 0.7, maxTokens: 500 }
 * }, { asType: 'generation' });
 *
 * generation.update({
 *   output: { role: 'assistant', content: 'Quantum computing...' },
 *   usageDetails: { promptTokens: 12, completionTokens: 150, totalTokens: 162 },
 *   costDetails: { totalCost: 0.002, currency: 'USD' }
 * });
 * generation.end();
 *
 * // Agent for AI workflows with tools
 * const agent = startObservation('research-agent', {
 *   input: { query: 'Latest developments in renewable energy' },
 *   metadata: { tools: ['web-search', 'pdf-reader'], model: 'gpt-4' }
 * }, { asType: 'agent' });
 *
 * // Tool for individual API calls
 * const weatherTool = startObservation('weather-api', {
 *   input: { location: 'San Francisco', units: 'metric' },
 *   metadata: { provider: 'openweather', timeout: 5000 }
 * }, { asType: 'tool' });
 *
 * // Chain for multi-step RAG pipeline
 * const ragChain = startObservation('rag-qa-pipeline', {
 *   input: { question: 'How does photosynthesis work?' },
 *   metadata: { steps: ['retrieve', 'rerank', 'generate'], vectorDb: 'pinecone' }
 * }, { asType: 'chain' });
 *
 * // Retriever for vector search
 * const retriever = startObservation('vector-search', {
 *   input: { query: 'machine learning algorithms', topK: 5 },
 *   metadata: { vectorStore: 'chroma', similarity: 'cosine' }
 * }, { asType: 'retriever' });
 *
 * // Evaluator for quality assessment
 * const evaluator = startObservation('quality-check', {
 *   input: {
 *     response: 'Paris is the capital of France',
 *     reference: 'The capital city of France is Paris'
 *   },
 *   metadata: { metric: 'semantic-similarity', threshold: 0.8 }
 * }, { asType: 'evaluator' });
 *
 * // Guardrail for content filtering
 * const guardrail = startObservation('content-filter', {
 *   input: { text: 'User message content', policies: ['no-profanity', 'no-pii'] },
 *   metadata: { strictMode: true, version: 'v2' }
 * }, { asType: 'guardrail' });
 *
 * // Embedding for text vectorization
 * const embedding = startObservation('text-embedder', {
 *   input: { texts: ['Hello world', 'Machine learning'] },
 *   model: 'text-embedding-ada-002',
 *   metadata: { dimensions: 1536 }
 * }, { asType: 'embedding' });
 *
 * // Event for point-in-time occurrences (auto-ended)
 * const event = startObservation('user-login', {
 *   input: { userId: '123', method: 'oauth' },
 *   level: 'DEFAULT',
 *   metadata: { ip: '192.168.1.1', userAgent: 'Chrome/120.0' }
 * }, { asType: 'event' });
 *
 * // Nested observations with parent context
 * const parentSpan = startObservation('ai-pipeline');
 * const childRetriever = startObservation('doc-search', {
 *   input: { query: 'AI safety' }
 * }, {
 *   asType: 'retriever',
 *   parentSpanContext: parentSpan.otelSpan.spanContext()
 * });
 * ```
 *
 * @see {@link startActiveObservation} for function-scoped observations with automatic context management
 * @see {@link observe} for decorator-style observation wrapping
 *
 * @public
 */
export function startObservation(
  name: string,
  attributes?:
    | LangfuseSpanAttributes
    | LangfuseGenerationAttributes
    | LangfuseEventAttributes
    | LangfuseAgentAttributes
    | LangfuseToolAttributes
    | LangfuseChainAttributes
    | LangfuseRetrieverAttributes
    | LangfuseEvaluatorAttributes
    | LangfuseGuardrailAttributes
    | LangfuseEmbeddingAttributes,
  options?: StartObservationOpts,
): LangfuseObservation {
  const { asType = "span", ...observationOptions } = options || {};

  const otelSpan = createOtelSpan({
    name,
    ...observationOptions,
  });

  switch (asType) {
    case "generation":
      return new LangfuseGeneration({
        otelSpan,
        attributes,
      });

    case "embedding":
      return new LangfuseEmbedding({
        otelSpan,
        attributes,
      });

    case "agent":
      return new LangfuseAgent({
        otelSpan,
        attributes,
      });

    case "tool":
      return new LangfuseTool({
        otelSpan,
        attributes,
      });

    case "chain":
      return new LangfuseChain({
        otelSpan,
        attributes,
      });

    case "retriever":
      return new LangfuseRetriever({
        otelSpan,
        attributes,
      });

    case "evaluator":
      return new LangfuseEvaluator({
        otelSpan,
        attributes,
      });

    case "guardrail":
      return new LangfuseGuardrail({
        otelSpan,
        attributes,
      });

    case "event": {
      const timestamp = observationOptions?.startTime ?? new Date();

      return new LangfuseEvent({
        otelSpan,
        attributes: attributes as LangfuseEventAttributes,
        timestamp,
      });
    }
    case "span":
    default:
      return new LangfuseSpan({
        otelSpan,
        attributes: attributes as LangfuseSpanAttributes,
      });
  }
}

// Function overloads for proper type inference
export function startActiveObservation<
  F extends (generation: LangfuseGeneration) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "generation" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (embedding: LangfuseEmbedding) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "embedding" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (agent: LangfuseAgent) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "agent" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (tool: LangfuseTool) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "tool" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (chain: LangfuseChain) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "chain" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (retriever: LangfuseRetriever) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "retriever" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (evaluator: LangfuseEvaluator) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "evaluator" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (guardrail: LangfuseGuardrail) => unknown,
>(
  name: string,
  fn: F,
  options: StartActiveObservationOpts & { asType: "guardrail" },
): ReturnType<F>;

export function startActiveObservation<
  F extends (span: LangfuseSpan) => unknown,
>(
  name: string,
  fn: F,
  options?: StartActiveObservationOpts & { asType?: "span" },
): ReturnType<F>;
/**
 * Starts an active observation and executes a function within its context with automatic lifecycle management.
 *
 * This function creates an observation, sets it as the active span in the OpenTelemetry context,
 * executes your function with the observation instance, and automatically handles cleanup.
 * It supports all observation types with full TypeScript type inference based on `asType`.
 *
 * ## Key Features
 * - **Automatic Context Management**: Sets the observation as active in the current execution context
 * - **Lifecycle Automation**: Creates, activates, and ends observations automatically
 * - **Type Safety**: Function parameter is strongly typed based on `asType`
 * - **Promise Support**: Handles both synchronous and asynchronous functions seamlessly
 * - **Error Handling**: Automatically sets error status and ends observations on exceptions
 * - **Nested Observations**: Child observations created within the function inherit the context
 *
 * ## When to Use
 * - When you want automatic observation lifecycle management
 * - For function-scoped operations where the observation maps to the function's execution
 * - When you need the observation to be active for child operations
 * - For async operations where manual `.end()` calls are error-prone
 *
 * @param name - Descriptive name for the observation
 * @param fn - Function to execute within the observation context (receives typed observation instance)
 * @param options - Configuration options including observation type and lifecycle settings
 * @returns The exact return value of the executed function (preserves type and async behavior)
 *
 * @example
 * ```typescript
 * import { startActiveObservation } from '@langfuse/tracing';
 *
 * // Span for general operations (default)
 * const result = startActiveObservation('user-checkout', (span) => {
 *   span.update({ input: { userId: '123', cart: items } });
 *
 *   // Any child observations created here inherit this span's context
 *   const validation = processPayment(paymentData);
 *
 *   span.update({ output: { orderId: 'ord_456', success: true } });
 *   return validation;
 * });
 *
 * // Generation for LLM interactions with automatic error handling
 * const response = await startActiveObservation(
 *   'openai-completion',
 *   async (generation) => {
 *     generation.update({
 *       input: { messages: [{ role: 'user', content: 'Explain AI ethics' }] },
 *       model: 'gpt-4-turbo',
 *       modelParameters: { temperature: 0.7, maxTokens: 500 }
 *     });
 *
 *     try {
 *       const result = await openai.chat.completions.create({
 *         model: 'gpt-4-turbo',
 *         messages: [{ role: 'user', content: 'Explain AI ethics' }],
 *         temperature: 0.7,
 *         max_tokens: 500
 *       });
 *
 *       generation.update({
 *         output: result.choices[0].message,
 *         usageDetails: {
 *           promptTokens: result.usage?.prompt_tokens,
 *           completionTokens: result.usage?.completion_tokens,
 *           totalTokens: result.usage?.total_tokens
 *         },
 *         costDetails: { totalCost: 0.002, currency: 'USD' }
 *       });
 *
 *       return result.choices[0].message.content;
 *     } catch (error) {
 *       generation.update({
 *         level: 'ERROR',
 *         statusMessage: error.message,
 *         output: { error: error.message }
 *       });
 *       throw error;
 *     }
 *   },
 *   { asType: 'generation' }
 * );
 *
 * // Agent workflow with nested tool calls
 * const agentResult = await startActiveObservation(
 *   'research-agent',
 *   async (agent) => {
 *     agent.update({
 *       input: { query: 'Latest climate change research' },
 *       metadata: { tools: ['web-search', 'arxiv-search'], model: 'gpt-4' }
 *     });
 *
 *     // Tool calls inherit the agent context automatically
 *     const webResults = await startActiveObservation(
 *       'web-search-tool',
 *       async (tool) => {
 *         tool.update({ input: { query: 'climate change 2024' } });
 *         const results = await searchWeb('climate change 2024');
 *         tool.update({ output: results });
 *         return results;
 *       },
 *       { asType: 'tool' }
 *     );
 *
 *     const analysis = await analyzeResults(webResults);
 *
 *     agent.update({
 *       output: { analysis, sources: webResults.length },
 *       metadata: { processingTime: Date.now() }
 *     });
 *
 *     return analysis;
 *   },
 *   { asType: 'agent' }
 * );
 *
 * // RAG Chain with retriever and generation steps
 * const answer = await startActiveObservation(
 *   'rag-qa-chain',
 *   async (chain) => {
 *     chain.update({
 *       input: { question: 'How does photosynthesis work?' },
 *       metadata: { vectorDb: 'pinecone', model: 'gpt-4' }
 *     });
 *
 *     // Retrieval step
 *     const docs = await startActiveObservation(
 *       'vector-retrieval',
 *       async (retriever) => {
 *         retriever.update({
 *           input: { query: 'photosynthesis mechanism', topK: 5 },
 *           metadata: { similarity: 'cosine' }
 *         });
 *         const results = await vectorSearch('photosynthesis mechanism');
 *         retriever.update({ output: { documents: results } });
 *         return results;
 *       },
 *       { asType: 'retriever' }
 *     );
 *
 *     // Generation step
 *     const response = await startActiveObservation(
 *       'answer-generation',
 *       async (generation) => {
 *         const context = docs.map(d => d.content).join('\n');
 *         generation.update({
 *           input: { question: 'How does photosynthesis work?', context },
 *           model: 'gpt-4'
 *         });
 *
 *         const answer = await generateAnswer(context);
 *         generation.update({ output: { answer } });
 *         return answer;
 *       },
 *       { asType: 'generation' }
 *     );
 *
 *     chain.update({
 *       output: { answer: response, sources: docs.length }
 *     });
 *
 *     return response;
 *   },
 *   { asType: 'chain' }
 * );
 *
 * // Quality evaluation with automatic metrics
 * const evaluation = startActiveObservation(
 *   'response-evaluator',
 *   (evaluator) => {
 *     evaluator.update({
 *       input: {
 *         response: 'Paris is the capital of France.',
 *         reference: 'The capital city of France is Paris.'
 *       },
 *       metadata: { metric: 'semantic-similarity' }
 *     });
 *
 *     const score = calculateSimilarity(response, reference);
 *     const passed = score > 0.8;
 *
 *     evaluator.update({
 *       output: { score, passed, grade: passed ? 'excellent' : 'needs_improvement' }
 *     });
 *
 *     return { score, passed };
 *   },
 *   { asType: 'evaluator' }
 * );
 *
 * // Content filtering with guardrails
 * const safetyCheck = startActiveObservation(
 *   'content-guardrail',
 *   (guardrail) => {
 *     guardrail.update({
 *       input: { text: userMessage, policies: ['no-profanity', 'no-pii'] },
 *       metadata: { strictMode: true }
 *     });
 *
 *     const violations = checkContent(userMessage);
 *     const allowed = violations.length === 0;
 *
 *     guardrail.update({
 *       output: { allowed, violations, confidence: 0.95 }
 *     });
 *
 *     return { allowed, violations };
 *   },
 *   { asType: 'guardrail' }
 * );
 *
 * // Text embedding generation
 * const embeddings = await startActiveObservation(
 *   'text-embeddings',
 *   async (embedding) => {
 *     const texts = ['Hello world', 'Machine learning'];
 *     embedding.update({
 *       input: { texts },
 *       model: 'text-embedding-ada-002',
 *       metadata: { dimensions: 1536 }
 *     });
 *
 *     const vectors = await generateEmbeddings(texts);
 *
 *     embedding.update({
 *       output: { embeddings: vectors },
 *       usageDetails: { totalTokens: texts.join(' ').split(' ').length }
 *     });
 *
 *     return vectors;
 *   },
 *   { asType: 'embedding' }
 * );
 *
 * // Disable automatic ending (advanced use case)
 * const longRunningSpan = await startActiveObservation(
 *   'background-process',
 *   async (span) => {
 *     span.update({ input: { taskId: '123' } });
 *
 *     // Process continues after function returns
 *     startBackgroundTask(span);
 *
 *     return 'process-started';
 *   },
 *   { asType: 'span', endOnExit: false } // Manual ending required
 * );
 * ```
 *
 * @see {@link startObservation} for manual observation lifecycle management
 * @see {@link observe} for decorator-style function wrapping
 *
 * @public
 */
export function startActiveObservation<
  F extends (observation: LangfuseSpan | LangfuseGeneration) => unknown,
>(name: string, fn: F, options?: StartActiveObservationOpts): ReturnType<F> {
  const { asType = "span", ...observationOptions } = options || {};

  return getLangfuseTracer().startActiveSpan(
    name,
    { startTime: observationOptions?.startTime },
    createParentContext(observationOptions?.parentSpanContext) ??
      context.active(),
    (span) => {
      try {
        let observation: LangfuseObservation;

        switch (asType) {
          case "generation":
            observation = new LangfuseGeneration({
              otelSpan: span,
            });
            break;

          case "embedding":
            observation = new LangfuseEmbedding({
              otelSpan: span,
            });
            break;

          case "agent":
            observation = new LangfuseAgent({
              otelSpan: span,
            });
            break;

          case "tool":
            observation = new LangfuseTool({
              otelSpan: span,
            });
            break;

          case "chain":
            observation = new LangfuseChain({
              otelSpan: span,
            });
            break;

          case "retriever":
            observation = new LangfuseRetriever({
              otelSpan: span,
            });
            break;

          case "evaluator":
            observation = new LangfuseEvaluator({
              otelSpan: span,
            });
            break;

          case "guardrail":
            observation = new LangfuseGuardrail({
              otelSpan: span,
            });
            break;

          case "event": {
            const timestamp = observationOptions?.startTime ?? new Date();
            observation = new LangfuseEvent({
              otelSpan: span,
              timestamp,
            });
            break;
          }
          case "span":
          default:
            observation = new LangfuseSpan({
              otelSpan: span,
            });
        }

        const result = fn(observation as Parameters<F>[0]);

        if (result instanceof Promise) {
          return wrapPromise(
            result,
            span,
            observationOptions?.endOnExit,
          ) as ReturnType<F>;
        } else {
          if (observationOptions?.endOnExit !== false) {
            span.end();
          }

          return result as ReturnType<F>;
        }
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "Unknown error",
        });

        if (observationOptions?.endOnExit !== false) {
          span.end();
        }

        throw err;
      }
    },
  );
}

/**
 * Set trace-level input and output for the currently active trace.
 *
 * This function finds the currently active OpenTelemetry span and sets
 * trace-level input/output on it. If no active span is found, a warning is logged.
 *
 * @deprecated This is a legacy function for backward compatibility with Langfuse platform
 * features that still rely on trace-level input/output (e.g., legacy LLM-as-a-judge
 * evaluators). It will be removed in a future major version.
 *
 * For setting other trace attributes (userId, sessionId, metadata, tags, version),
 * use {@link propagateAttributes} instead.
 *
 * @param attributes - Input and output data to associate with the trace
 *
 * @example
 * ```typescript
 * import { setActiveTraceIO } from '@langfuse/tracing';
 *
 * // Inside an active span context
 * setActiveTraceIO({
 *   input: { query: 'user question' },
 *   output: { response: 'assistant answer' }
 * });
 * ```
 *
 * @public
 */
export function setActiveTraceIO(attributes: LangfuseTraceAttributes) {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping trace IO update.",
    );

    return;
  }

  span.setAttributes(createTraceAttributes(attributes));
}

/**
 * Make the trace of the currently active span publicly accessible via its URL.
 *
 * When a trace is published, anyone with the trace link can view the full trace
 * without needing to be logged in to Langfuse. This action cannot be undone
 * programmatically - once any span in a trace is published, the entire trace
 * becomes public.
 *
 * If called outside of an active span context, the operation is skipped with a warning.
 *
 * @example
 * ```typescript
 * import { setActiveTraceAsPublic, startActiveObservation } from '@langfuse/tracing';
 *
 * startActiveObservation('my-operation', () => {
 *   // Make this trace publicly accessible
 *   setActiveTraceAsPublic();
 * });
 * ```
 *
 * @public
 */
export function setActiveTraceAsPublic() {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping trace publish.",
    );

    return;
  }

  span.setAttributes({
    [LangfuseOtelSpanAttributes.TRACE_PUBLIC]: true,
  });
}

/**
 * Updates the currently active observation with new attributes.
 *
 * This function finds the currently active OpenTelemetry span in the execution context
 * and updates it with Langfuse-specific attributes. It supports all observation types
 * through TypeScript overloads, providing type safety for attributes based on the
 * specified `asType` parameter. If no active span exists, the update is skipped with a warning.
 *
 * ## Type Safety
 * - Automatic type inference based on `asType` parameter
 * - Compile-time validation of attribute compatibility
 * - IntelliSense support for observation-specific attributes
 *
 * ## Context Requirements
 * - Must be called within an active OpenTelemetry span context
 * - Typically used inside `startActiveObservation` callbacks or manual span contexts
 * - Relies on OpenTelemetry's context propagation mechanism
 *
 * ## Supported Observation Types
 * - **span** (default): General-purpose operations and workflows
 * - **generation**: LLM calls and AI model interactions
 * - **agent**: AI agent workflows with tool usage
 * - **tool**: Individual tool calls and API requests
 * - **chain**: Multi-step processes and pipelines
 * - **retriever**: Document retrieval and search operations
 * - **evaluator**: Quality assessment and scoring
 * - **guardrail**: Safety checks and content filtering
 * - **embedding**: Text embedding and vector operations
 *
 * @param attributes - Observation-specific attributes to update (type varies by observation type)
 * @param options - Configuration specifying observation type (defaults to 'span')
 *
 * @example
 * ```typescript
 * import { updateActiveObservation, startActiveObservation } from '@langfuse/tracing';
 *
 * // Update active span (default)
 * await startActiveObservation('data-processing', async (observation) => {
 *   // Process data...
 *   const result = await processData(inputData);
 *
 *   // Update with results
 *   updateActiveObservation({
 *     output: { processedRecords: result.count },
 *     metadata: { processingTime: result.duration }
 *   });
 * });
 *
 * // Update active generation
 * await startActiveObservation('llm-call', async () => {
 *   const response = await openai.chat.completions.create({
 *     model: 'gpt-4',
 *     messages: [{ role: 'user', content: 'Hello' }]
 *   });
 *
 *   // Update with LLM-specific attributes
 *   updateActiveObservation({
 *     output: response.choices[0].message,
 *     usageDetails: {
 *       promptTokens: response.usage.prompt_tokens,
 *       completionTokens: response.usage.completion_tokens,
 *       totalTokens: response.usage.total_tokens
 *     },
 *     costDetails: {
 *       totalCost: 0.025,
 *       currency: 'USD'
 *     }
 *   }, { asType: 'generation' });
 * }, {}, { asType: 'generation' });
 *
 * // Update active tool execution
 * await startActiveObservation('web-search', async () => {
 *   const results = await searchAPI('latest news');
 *
 *   updateActiveObservation({
 *     output: {
 *       results: results,
 *       count: results.length,
 *       relevanceScore: 0.89
 *     },
 *     metadata: {
 *       searchLatency: 150,
 *       cacheHit: false
 *     }
 *   }, { asType: 'tool' });
 * }, {}, { asType: 'tool' });
 *
 * // Update active agent workflow
 * await startActiveObservation('research-agent', async () => {
 *   // Agent performs multiple operations...
 *   const findings = await conductResearch();
 *
 *   updateActiveObservation({
 *     output: {
 *       completed: true,
 *       toolsUsed: ['web-search', 'summarizer'],
 *       iterationsRequired: 3,
 *       confidence: 0.92
 *     },
 *     metadata: {
 *       efficiency: 0.85,
 *       qualityScore: 0.88
 *     }
 *   }, { asType: 'agent' });
 * }, {}, { asType: 'agent' });
 *
 * // Update active chain workflow
 * await startActiveObservation('rag-pipeline', async () => {
 *   // Execute multi-step RAG process...
 *   const finalResponse = await executeRAGPipeline();
 *
 *   updateActiveObservation({
 *     output: {
 *       finalResponse: finalResponse,
 *       stepsCompleted: 4,
 *       documentsRetrieved: 8,
 *       qualityScore: 0.91
 *     },
 *     metadata: {
 *       pipelineEfficiency: 0.87,
 *       totalLatency: 3200
 *     }
 *   }, { asType: 'chain' });
 * }, {}, { asType: 'chain' });
 * ```
 *
 * @see {@link startActiveObservation} - For creating active observation contexts
 * @see {@link setActiveTraceIO} - For setting trace-level input/output (deprecated)
 *
 * @public
 */
export function updateActiveObservation(
  attributes: LangfuseSpanAttributes,
  options?: { asType: "span" },
): void;
export function updateActiveObservation(
  attributes: LangfuseGenerationAttributes,
  options: { asType: "generation" },
): void;
export function updateActiveObservation(
  attributes: LangfuseAgentAttributes,
  options: { asType: "agent" },
): void;
export function updateActiveObservation(
  attributes: LangfuseToolAttributes,
  options: { asType: "tool" },
): void;
export function updateActiveObservation(
  attributes: LangfuseChainAttributes,
  options: { asType: "chain" },
): void;
export function updateActiveObservation(
  attributes: LangfuseEmbeddingAttributes,
  options: { asType: "embedding" },
): void;
export function updateActiveObservation(
  attributes: LangfuseEvaluatorAttributes,
  options: { asType: "evaluator" },
): void;
export function updateActiveObservation(
  attributes: LangfuseGuardrailAttributes,
  options: { asType: "guardrail" },
): void;
export function updateActiveObservation(
  attributes: LangfuseRetrieverAttributes,
  options: { asType: "retriever" },
): void;
export function updateActiveObservation(
  attributes: LangfuseObservationAttributes,
  options?: { asType?: LangfuseObservationType },
): void {
  const span = trace.getActiveSpan();

  if (!span) {
    getGlobalLogger().warn(
      "No active OTEL span in context. Skipping span update.",
    );

    return;
  }

  const otelAttributes = createObservationAttributes(
    options?.asType ?? "span",
    attributes,
  );

  // If no 'asType' was provided, drop the observation type OTEL attribute
  // to avoid inadvertendly overwriting the type to "span"
  if (!options?.asType) {
    otelAttributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] = undefined;
  }

  span.setAttributes(otelAttributes);
}

/**
 * Options for the observe decorator function.
 *
 * @public
 */
export interface ObserveOptions {
  /** Name for the observation (defaults to function name) */
  name?: string;
  /** Type of observation to create */
  asType?: LangfuseObservationType;
  /** Whether to capture function input as observation input */
  captureInput?: boolean;
  /** Whether to capture function output as observation output */
  captureOutput?: boolean;
  /** Parent span context to attach this observation to */
  parentSpanContext?: SpanContext;
  /** Whether to automatically end the observation when exiting the context. Default is true */
  endOnExit?: boolean;
}

/**
 * Decorator function that automatically wraps any function with Langfuse observability.
 *
 * This higher-order function creates a traced version of your function that automatically
 * handles observation lifecycle, input/output capture, and error tracking. It's perfect
 * for instrumenting existing functions without modifying their internal logic.
 *
 * ## Key Features
 * - **Zero Code Changes**: Wrap existing functions without modifying their implementation
 * - **Automatic I/O Capture**: Optionally captures function arguments and return values
 * - **Error Tracking**: Automatically captures exceptions and sets error status
 * - **Type Preservation**: Maintains original function signature and return types
 * - **Async Support**: Works seamlessly with both sync and async functions
 * - **Flexible Configuration**: Control observation type, naming, and capture behavior
 *
 * ## Use Cases
 * - Instrumenting business logic functions
 * - Wrapping API calls and external service interactions
 * - Adding observability to utility functions
 * - Creating traced versions of third-party functions
 * - Decorating class methods for observability
 *
 * @param fn - The function to wrap with observability (preserves original signature)
 * @param options - Configuration for observation behavior and capture settings
 * @returns An instrumented version of the function with identical behavior plus tracing
 *
 * @example
 * ```typescript
 * import { observe } from '@langfuse/tracing';
 *
 * // Basic function wrapping with automatic I/O capture
 * const processOrder = observe(
 *   async (orderId: string, items: CartItem[]) => {
 *     const validation = await validateOrder(orderId, items);
 *     const payment = await processPayment(validation);
 *     const shipping = await scheduleShipping(payment);
 *     return { orderId, status: 'confirmed', trackingId: shipping.id };
 *   },
 *   {
 *     name: 'process-order',
 *     asType: 'span',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // LLM function with generation tracking
 * const generateSummary = observe(
 *   async (document: string, maxWords: number = 100) => {
 *     const response = await openai.chat.completions.create({
 *       model: 'gpt-4-turbo',
 *       messages: [
 *         { role: 'system', content: `Summarize in ${maxWords} words or less` },
 *         { role: 'user', content: document }
 *       ],
 *       max_tokens: maxWords * 2
 *     });
 *     return response.choices[0].message.content;
 *   },
 *   {
 *     name: 'document-summarizer',
 *     asType: 'generation',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Database query with automatic error tracking
 * const fetchUserProfile = observe(
 *   async (userId: string) => {
 *     const user = await db.users.findUnique({ where: { id: userId } });
 *     if (!user) throw new Error(`User ${userId} not found`);
 *
 *     const preferences = await db.preferences.findMany({
 *       where: { userId }
 *     });
 *
 *     return { ...user, preferences };
 *   },
 *   {
 *     name: 'fetch-user-profile',
 *     asType: 'span',
 *     captureInput: false, // Don't capture sensitive user IDs
 *     captureOutput: true
 *   }
 * );
 *
 * // Vector search with retriever semantics
 * const searchDocuments = observe(
 *   async (query: string, topK: number = 5) => {
 *     const embedding = await embedText(query);
 *     const results = await vectorDb.search(embedding, topK);
 *     return results.map(r => ({
 *       content: r.metadata.content,
 *       score: r.score,
 *       source: r.metadata.source
 *     }));
 *   },
 *   {
 *     name: 'document-search',
 *     asType: 'retriever',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Quality evaluation function
 * const evaluateResponse = observe(
 *   (response: string, reference: string, metric: string = 'similarity') => {
 *     let score: number;
 *
 *     switch (metric) {
 *       case 'similarity':
 *         score = calculateCosineSimilarity(response, reference);
 *         break;
 *       case 'bleu':
 *         score = calculateBleuScore(response, reference);
 *         break;
 *       default:
 *         throw new Error(`Unknown metric: ${metric}`);
 *     }
 *
 *     return {
 *       score,
 *       passed: score > 0.8,
 *       metric,
 *       grade: score > 0.9 ? 'excellent' : score > 0.7 ? 'good' : 'needs_improvement'
 *     };
 *   },
 *   {
 *     name: 'response-evaluator',
 *     asType: 'evaluator',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Content moderation with guardrails
 * const moderateContent = observe(
 *   async (text: string, policies: string[] = ['profanity', 'spam']) => {
 *     const violations = [];
 *
 *     for (const policy of policies) {
 *       const result = await checkPolicy(text, policy);
 *       if (result.violation) {
 *         violations.push({ policy, severity: result.severity });
 *       }
 *     }
 *
 *     return {
 *       allowed: violations.length === 0,
 *       violations,
 *       confidence: 0.95
 *     };
 *   },
 *   {
 *     name: 'content-moderator',
 *     asType: 'guardrail',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // AI agent function with tool usage
 * const researchAgent = observe(
 *   async (query: string, maxSources: number = 3) => {
 *     // Search for relevant documents
 *     const documents = await searchDocuments(query, maxSources * 2);
 *
 *     // Filter and rank results
 *     const topDocs = documents
 *       .filter(d => d.score > 0.7)
 *       .slice(0, maxSources);
 *
 *     // Generate comprehensive answer
 *     const context = topDocs.map(d => d.content).join('\n\n');
 *     const answer = await generateSummary(
 *       `Based on: ${context}\n\nQuestion: ${query}`,
 *       200
 *     );
 *
 *     return {
 *       answer,
 *       sources: topDocs.map(d => d.source),
 *       confidence: Math.min(...topDocs.map(d => d.score))
 *     };
 *   },
 *   {
 *     name: 'research-agent',
 *     asType: 'agent',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Class method decoration
 * class UserService {
 *   private db: Database;
 *
 *   // Wrap methods during class construction
 *   constructor(database: Database) {
 *     this.db = database;
 *     this.createUser = observe(this.createUser.bind(this), {
 *       name: 'create-user',
 *       asType: 'span',
 *       captureInput: false, // Sensitive data
 *       captureOutput: true
 *     });
 *   }
 *
 *   async createUser(userData: UserData) {
 *     // Implementation automatically traced
 *     return await this.db.users.create(userData);
 *   }
 * }
 *
 * // Chain composition - functions remain composable
 * const processDocument = observe(
 *   async (document: string) => {
 *     const summary = await generateSummary(document, 150);
 *     const moderation = await moderateContent(summary);
 *     const evaluation = evaluateResponse(summary, document, 'similarity');
 *
 *     return {
 *       summary: moderation.allowed ? summary : '[Content Filtered]',
 *       safe: moderation.allowed,
 *       quality: evaluation.score
 *     };
 *   },
 *   {
 *     name: 'document-processor',
 *     asType: 'chain',
 *     captureInput: true,
 *     captureOutput: true
 *   }
 * );
 *
 * // Usage - functions work exactly as before, just with observability
 * const order = await processOrder('ord_123', cartItems);
 * const profile = await fetchUserProfile('user_456');
 * const research = await researchAgent('What is quantum computing?');
 * const processed = await processDocument(documentText);
 * ```
 *
 * @see {@link startObservation} for manual observation creation
 * @see {@link startActiveObservation} for function-scoped observations
 *
 * @public
 */
export function observe<T extends (...args: any[]) => any>(
  fn: T,
  options: ObserveOptions = {},
): T {
  const {
    name = fn.name || "anonymous-function",
    asType = "span",
    captureInput = true,
    captureOutput = true,
    parentSpanContext = undefined,
  } = options;

  const wrappedFunction = function (
    this: any,
    ...args: Parameters<T>
  ): ReturnType<T> {
    // Prepare input data
    const inputData = captureInput ? _captureArguments(args) : undefined;

    // Create the appropriate observation type
    const observation = startObservation(
      name,
      inputData ? { input: inputData } : {},
      {
        asType: asType as "span", // typecast necessary as ts cannot narrow down type
        parentSpanContext,
      },
    );

    // Set the observation span as active in the context
    const activeContext = trace.setSpan(context.active(), observation.otelSpan);

    try {
      const result = context.with(activeContext, () => fn.apply(this, args));

      // Handle async functions - check if result is a Promise
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            if (captureOutput) {
              observation.update({ output: _captureOutput(value) });
            }

            if (options?.endOnExit !== false) {
              observation.end();
            }

            return value;
          },
          (error: unknown) => {
            observation.update({
              level: "ERROR",
              statusMessage:
                (error instanceof Error ? error.message : String(error)) ||
                "Function threw an error",
              output: captureOutput ? { error: String(error) } : undefined,
            });

            if (options?.endOnExit !== false) {
              observation.end();
            }

            throw error;
          },
        ) as ReturnType<T>;
      } else {
        // Handle sync functions
        if (captureOutput) {
          observation.update({ output: _captureOutput(result) });
        }

        if (options?.endOnExit !== false) {
          observation.end();
        }

        return result as ReturnType<T>;
      }
    } catch (error: unknown) {
      observation.update({
        level: "ERROR",
        statusMessage:
          (error instanceof Error ? error.message : String(error)) ||
          "Function threw an error",
        output: captureOutput ? { error: String(error) } : undefined,
      });

      if (options?.endOnExit !== false) {
        observation.end();
      }
      throw error;
    }
  };

  return wrappedFunction as T;
}

/**
 * Helper function to safely capture function arguments.
 *
 * @param args - Function arguments array
 * @returns Captured arguments or error message
 * @internal
 */
function _captureArguments(args: unknown[]): unknown {
  try {
    if (args.length === 0) return undefined;
    if (args.length === 1) return args[0];
    return args;
  } catch {
    return "<failed to capture arguments>";
  }
}

/**
 * Helper function to safely capture function output.
 *
 * @param value - Function return value
 * @returns Captured output or error message
 * @internal
 */
function _captureOutput(value: unknown): unknown {
  try {
    // Handle undefined/null
    if (value === undefined || value === null) return value;

    // For primitive types, return as-is
    if (typeof value !== "object") return value;

    // For objects, return them directly (serialization happens in span processor)
    return value;
  } catch {
    return "<failed to capture output>";
  }
}

/**
 * Creates a trace ID for OpenTelemetry spans.
 *
 * @param seed - A seed string for deterministic trace ID generation.
 *               If provided (non-empty), the same seed will always generate the same trace ID.
 *               If empty or falsy, generates a random trace ID.
 *
 *               Using a seed is especially useful when trying to correlate external,
 *               non-W3C compliant IDs with Langfuse trace IDs. This allows you to later
 *               have a method available for scoring the Langfuse trace given only the
 *               external ID by regenerating the same trace ID from the external ID.
 *
 * @returns A Promise that resolves to a 32-character lowercase hexadecimal string suitable for use as an OpenTelemetry trace ID.
 *
 * @example
 * ```typescript
 * // Deterministic trace ID from seed
 * const traceId1 = await createTraceId("my-session-123");
 * const traceId2 = await createTraceId("my-session-123");
 * console.log(traceId1 === traceId2); // true
 *
 * // Random trace ID
 * const randomId1 = await createTraceId("");
 * const randomId2 = await createTraceId("");
 * console.log(randomId1 === randomId2); // false
 *
 * // Use with spans
 * const span = startObservation("my-span", {}, {
 *   parentSpanContext: {
 *     traceId: await createTraceId("session-456"),
 *     spanId: "0123456789abcdef",
 *     traceFlags: 1
 *   }
 * });
 *
 * // Correlating external IDs with Langfuse traces
 * const externalId = "ext-12345-67890";
 * const traceId = await createTraceId(externalId);
 *
 * // Later, when you need to score this trace, regenerate the same ID
 * const scoringTraceId = await createTraceId(externalId);
 * console.log(traceId === scoringTraceId); // true - can now find and score the trace
 * ```
 *
 * @public
 */
export async function createTraceId(seed?: string): Promise<string> {
  if (seed) {
    const data = new TextEncoder().encode(seed);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    const hashArray = new Uint8Array(hashBuffer);

    return uint8ArrayToHex(hashArray).slice(0, 32);
  }

  const randomValues = crypto.getRandomValues(new Uint8Array(16));

  return uint8ArrayToHex(randomValues);
}

/**
 * Converts a Uint8Array to a hexadecimal string.
 *
 * @param array - The byte array to convert
 * @returns Hexadecimal string representation
 * @internal
 */
function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Gets the current active trace ID.
 *
 * If there is no span in the current context, returns undefined.
 *
 * @returns The trace ID of the currently active span, or undefined if no span is active
 *
 * @public
 */
export function getActiveTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

/**
 * Gets the current active observation ID.
 *
 * If there is no OTEL span in the current context, returns undefined.
 *
 * @returns The ID of the currently active OTEL span, or undefined if no OTEL span is active
 *
 * @public
 */
export function getActiveSpanId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().spanId;
}
