import { Span, TimeInput } from "@opentelemetry/api";

import {
  createObservationAttributes,
  createTraceAttributes,
} from "./attributes.js";
import { getLangfuseTracer } from "./tracerProvider.js";
import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseTraceAttributes,
} from "./types.js";
import type {
  LangfuseAgentAttributes,
  LangfuseChainAttributes,
  LangfuseEmbeddingAttributes,
  LangfuseEvaluatorAttributes,
  LangfuseGuardrailAttributes,
  LangfuseObservationAttributes,
  LangfuseObservationType,
  LangfuseRetrieverAttributes,
  LangfuseToolAttributes,
} from "./types.js";

import { startObservation } from "./index.js";

/**
 * Union type representing any Langfuse observation wrapper.
 *
 * This type encompasses all observation types supported by Langfuse, providing
 * a unified interface for handling different kinds of traced operations. It's
 * particularly useful for generic functions that work with any observation type.
 *
 * ## Included Types
 * - **LangfuseSpan**: General-purpose operations and workflows
 * - **LangfuseGeneration**: LLM calls and AI model interactions
 * - **LangfuseEmbedding**: Text embedding and vector operations
 * - **LangfuseAgent**: AI agent workflows with tool usage
 * - **LangfuseTool**: Individual tool calls and API requests
 * - **LangfuseChain**: Multi-step processes and pipelines
 * - **LangfuseRetriever**: Document retrieval and search operations
 * - **LangfuseEvaluator**: Quality assessment and scoring
 * - **LangfuseGuardrail**: Safety checks and content filtering
 * - **LangfuseEvent**: Point-in-time occurrences and log entries
 *
 * @example
 * ```typescript
 * // Function accepting any observation type
 * function logObservation(obs: LangfuseObservation) {
 *   console.log(`Observation ${obs.id} in trace ${obs.traceId}`);
 *
 *   // All observations have common methods
 *   obs.updateTrace({ tags: ['logged'] });
 *   obs.end();
 * }
 *
 * // Works with any observation type
 * const span = startObservation('test-span');
 * const generation = startObservation('llm-call', {}, { asType: 'generation' });
 * const agent = startObservation('ai-agent', {}, { asType: 'agent' });
 *
 * logObservation(span);
 * logObservation(generation);
 * logObservation(agent);
 * ```
 *
 * @public
 */
export type LangfuseObservation =
  | LangfuseSpan
  | LangfuseGeneration
  | LangfuseEvent
  | LangfuseAgent
  | LangfuseTool
  | LangfuseChain
  | LangfuseRetriever
  | LangfuseEvaluator
  | LangfuseGuardrail
  | LangfuseEmbedding;

/**
 * Parameters for creating a Langfuse observation wrapper.
 *
 * @internal
 */
type LangfuseObservationParams = {
  otelSpan: Span;
  type: LangfuseObservationType;
  attributes?:
    | LangfuseSpanAttributes
    | LangfuseGenerationAttributes
    | LangfuseEventAttributes;
};

/**
 * Base class for all Langfuse observation wrappers providing unified functionality.
 *
 * This abstract class serves as the foundation for all observation types in Langfuse,
 * encapsulating common operations and properties shared across spans, generations,
 * events, and specialized observation types like agents, tools, and chains.
 *
 * ## Core Capabilities
 * - **OpenTelemetry Integration**: Wraps OTEL spans with Langfuse-specific functionality
 * - **Unique Identification**: Provides span ID and trace ID for correlation
 * - **Lifecycle Management**: Handles observation creation, updates, and completion
 * - **Trace Context**: Enables updating trace-level attributes from any observation
 * - **Hierarchical Structure**: Supports creating nested child observations
 * - **Type Safety**: Ensures type-safe attribute handling based on observation type
 *
 * ## Common Properties
 * - `id`: Unique identifier for this observation (OpenTelemetry span ID)
 * - `traceId`: Identifier of the parent trace containing this observation
 * - `otelSpan`: Direct access to the underlying OpenTelemetry span
 * - `type`: The observation type (span, generation, event, etc.)
 *
 * ## Common Methods
 * - `end()`: Marks the observation as complete with optional timestamp
 * - `updateTrace()`: Sets trace-level attributes like user ID, session ID, tags
 * - `startObservation()`: Creates child observations with inherited context
 *
 * @example
 * ```typescript
 * // All observation types share these common capabilities
 * const observation: LangfuseObservation = startObservation('my-operation');
 *
 * // Common properties available on all observations
 * console.log(`Observation ID: ${observation.id}`);
 * console.log(`Trace ID: ${observation.traceId}`);
 * console.log(`Type: ${observation.type}`);
 *
 * // Common methods available on all observations
 * observation.updateTrace({
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   tags: ['production', 'api-v2']
 * });
 *
 * // Create child observations
 * const child = observation.startObservation('child-operation', {
 *   input: { step: 'processing' }
 * });
 *
 * // End observations
 * child.end();
 * observation.end();
 * ```
 *
 * @internal
 */
abstract class LangfuseBaseObservation {
  /** The underlying OpenTelemetry span */
  public readonly otelSpan: Span;
  /** The underlying OpenTelemetry span */
  public readonly type: LangfuseObservationType;
  /** The span ID from the OpenTelemetry span context */
  public id: string;
  /** The trace ID from the OpenTelemetry span context */
  public traceId: string;

  constructor(params: LangfuseObservationParams) {
    this.otelSpan = params.otelSpan;
    this.id = params.otelSpan.spanContext().spanId;
    this.traceId = params.otelSpan.spanContext().traceId;
    this.type = params.type;

    if (params.attributes) {
      this.otelSpan.setAttributes(
        createObservationAttributes(params.type, params.attributes),
      );
    }
  }

  /** Gets the Langfuse OpenTelemetry tracer instance */
  protected get tracer() {
    return getLangfuseTracer();
  }

  /**
   * Ends the observation, marking it as complete.
   *
   * @param endTime - Optional end time, defaults to current time
   */
  public end(endTime?: TimeInput) {
    this.otelSpan.end(endTime);
  }

  updateOtelSpanAttributes(attributes: LangfuseObservationAttributes) {
    this.otelSpan.setAttributes(
      createObservationAttributes(this.type, attributes),
    );
  }

  /**
   * Updates the parent trace with new attributes.
   *
   * This sets trace-level attributes that apply to the entire trace,
   * not just this specific observation.
   *
   * @param attributes - Trace attributes to set
   * @returns This observation for method chaining
   */
  public updateTrace(attributes: LangfuseTraceAttributes) {
    this.otelSpan.setAttributes(createTraceAttributes(attributes));

    return this;
  }

  /**
   * Creates a new child observation within this observation's context with full type safety.
   *
   * This method enables hierarchical tracing by creating child observations that inherit
   * the parent's trace context. It supports all observation types with automatic TypeScript
   * type inference based on the `asType` parameter, ensuring compile-time safety for
   * attributes and return types.
   *
   * ## Hierarchy & Context
   * - Child observations automatically inherit the parent's trace ID and span context
   * - Creates proper parent-child relationships in the trace structure
   * - Enables distributed tracing across nested operations
   * - Maintains correlation between related operations
   *
   * ## Type Safety
   * - Return type is automatically inferred from `asType` parameter
   * - Attributes parameter is type-checked based on observation type
   * - Compile-time validation prevents type mismatches
   * - Full IntelliSense support for observation-specific attributes
   *
   * @param name - Descriptive name for the child observation
   * @param attributes - Type-specific attributes (varies by observation type)
   * @param options - Configuration including observation type (defaults to 'span')
   * @returns Strongly-typed observation instance based on `asType`
   *
   * @example
   * ```typescript
   * // Within any observation (span, generation, agent, etc.)
   * const parentObservation = startObservation('ai-workflow');
   *
   * // Create child span (default)
   * const dataProcessing = parentObservation.startObservation('data-processing', {
   *   input: { userId: '123', dataSize: 1024 },
   *   metadata: { processor: 'fast-lane', version: '2.1' }
   * }); // Returns LangfuseSpan
   *
   * // Create child generation with full LLM attributes
   * const llmCall = parentObservation.startObservation('openai-gpt-4', {
   *   input: [{ role: 'system', content: 'You are a helpful assistant' },
   *           { role: 'user', content: 'Explain machine learning' }],
   *   model: 'gpt-4-turbo',
   *   modelParameters: {
   *     temperature: 0.7,
   *     maxTokens: 500,
   *     topP: 1.0
   *   },
   *   metadata: { priority: 'high', timeout: 30000 }
   * }, { asType: 'generation' }); // Returns LangfuseGeneration
   *
   * // Create child agent for complex reasoning
   * const reasoningAgent = parentObservation.startObservation('reasoning-agent', {
   *   input: {
   *     task: 'Analyze market trends',
   *     context: 'Q4 2024 financial data'
   *   },
   *   metadata: {
   *     model: 'gpt-4',
   *     tools: ['calculator', 'web-search', 'data-analysis'],
   *     maxIterations: 5
   *   }
   * }, { asType: 'agent' }); // Returns LangfuseAgent
   *
   * // Create child tool for external API calls
   * const apiCall = reasoningAgent.startObservation('market-data-api', {
   *   input: {
   *     endpoint: '/market/trends',
   *     params: { symbol: 'AAPL', period: '1Y' }
   *   },
   *   metadata: {
   *     provider: 'alpha-vantage',
   *     rateLimit: 5,
   *     timeout: 10000
   *   }
   * }, { asType: 'tool' }); // Returns LangfuseTool
   *
   * // Create child retriever for document search
   * const docSearch = parentObservation.startObservation('document-retrieval', {
   *   input: {
   *     query: 'sustainable energy solutions',
   *     filters: { year: '2024', category: 'research' },
   *     topK: 10
   *   },
   *   metadata: {
   *     vectorStore: 'pinecone',
   *     embeddingModel: 'text-embedding-ada-002',
   *     similarity: 'cosine'
   *   }
   * }, { asType: 'retriever' }); // Returns LangfuseRetriever
   *
   * // Create child evaluator for quality assessment
   * const qualityCheck = parentObservation.startObservation('response-evaluator', {
   *   input: {
   *     response: llmCall.output?.content,
   *     reference: 'Expected high-quality explanation',
   *     criteria: ['accuracy', 'clarity', 'completeness']
   *   },
   *   metadata: {
   *     evaluator: 'custom-bert-scorer',
   *     threshold: 0.8,
   *     metrics: ['bleu', 'rouge', 'semantic-similarity']
   *   }
   * }, { asType: 'evaluator' }); // Returns LangfuseEvaluator
   *
   * // Create child guardrail for safety checking
   * const safetyCheck = parentObservation.startObservation('content-guardrail', {
   *   input: {
   *     text: llmCall.output?.content,
   *     policies: ['no-harmful-content', 'no-personal-info', 'professional-tone']
   *   },
   *   metadata: {
   *     guardrailVersion: 'v2.1',
   *     strictMode: true,
   *     confidence: 0.95
   *   }
   * }, { asType: 'guardrail' }); // Returns LangfuseGuardrail
   *
   * // Create child embedding for vector generation
   * const textEmbedding = parentObservation.startObservation('text-embedder', {
   *   input: {
   *     texts: ['Document summary', 'Key insights', 'Conclusions'],
   *     batchSize: 3
   *   },
   *   model: 'text-embedding-ada-002',
   *   metadata: {
   *     dimensions: 1536,
   *     normalization: 'l2',
   *     purpose: 'semantic-search'
   *   }
   * }, { asType: 'embedding' }); // Returns LangfuseEmbedding
   *
   * // Create child event for point-in-time logging
   * const userAction = parentObservation.startObservation('user-interaction', {
   *   input: {
   *     action: 'button-click',
   *     element: 'generate-report',
   *     timestamp: new Date().toISOString()
   *   },
   *   level: 'DEFAULT',
   *   metadata: {
   *     sessionId: 'sess_123',
   *     userId: 'user_456',
   *     browser: 'Chrome 120.0'
   *   }
   * }, { asType: 'event' }); // Returns LangfuseEvent (auto-ended)
   *
   * // Chain operations - each child inherits context
   * dataProcessing.update({ output: { processed: true, records: 1000 } });
   * dataProcessing.end();
   *
   * llmCall.update({
   *   output: { role: 'assistant', content: 'Machine learning is...' },
   *   usageDetails: { promptTokens: 25, completionTokens: 150 }
   * });
   * llmCall.end();
   *
   * parentObservation.update({
   *   output: {
   *     workflowCompleted: true,
   *     childOperations: 8,
   *     totalDuration: Date.now() - startTime
   *   }
   * });
   * parentObservation.end();
   * ```
   *
   * @see {@link startObservation} for creating root-level observations
   * @see {@link startActiveObservation} for function-scoped child observations
   */
  public startObservation(
    name: string,
    attributes: LangfuseGenerationAttributes,
    options: { asType: "generation" },
  ): LangfuseGeneration;
  public startObservation(
    name: string,
    attributes: LangfuseEventAttributes,
    options: { asType: "event" },
  ): LangfuseEvent;
  public startObservation(
    name: string,
    attributes: LangfuseAgentAttributes,
    options: { asType: "agent" },
  ): LangfuseAgent;
  public startObservation(
    name: string,
    attributes: LangfuseToolAttributes,
    options: { asType: "tool" },
  ): LangfuseTool;
  public startObservation(
    name: string,
    attributes: LangfuseChainAttributes,
    options: { asType: "chain" },
  ): LangfuseChain;
  public startObservation(
    name: string,
    attributes: LangfuseRetrieverAttributes,
    options: { asType: "retriever" },
  ): LangfuseRetriever;
  public startObservation(
    name: string,
    attributes: LangfuseEvaluatorAttributes,
    options: { asType: "evaluator" },
  ): LangfuseEvaluator;
  public startObservation(
    name: string,
    attributes: LangfuseGuardrailAttributes,
    options: { asType: "guardrail" },
  ): LangfuseGuardrail;
  public startObservation(
    name: string,
    attributes: LangfuseEmbeddingAttributes,
    options: { asType: "embedding" },
  ): LangfuseEmbedding;
  public startObservation(
    name: string,
    attributes?: LangfuseSpanAttributes,
    options?: { asType?: "span" },
  ): LangfuseSpan;
  public startObservation(
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
    options?: { asType?: LangfuseObservationType },
  ): LangfuseObservation {
    const { asType = "span" } = options || {};

    return startObservation(name, attributes, {
      asType: asType as "span", // typecast necessary as ts cannot narrow the type correctly
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }
}

type LangfuseSpanParams = {
  otelSpan: Span;
  attributes?: LangfuseSpanAttributes;
};

/**
 * General-purpose observation wrapper for tracking operations, functions, and workflows.
 *
 * LangfuseSpan is the default and most versatile observation type, designed for tracing
 * any operation that has a defined start and end time. It serves as the foundation for
 * building hierarchical traces and can contain any other observation type as children.
 *
 * ## Primary Use Cases
 * - **Business Logic**: User workflows, order processing, data transformations
 * - **API Operations**: REST endpoint handling, database queries, external service calls
 * - **System Operations**: File I/O, network requests, background jobs
 * - **Pipeline Steps**: Data processing stages, validation steps, orchestration
 * - **Application Functions**: Any measurable operation in your application
 *
 * ## Key Features
 * - **Hierarchical Structure**: Can contain child observations of any type
 * - **Flexible Attributes**: Supports arbitrary input, output, and metadata
 * - **Duration Tracking**: Automatically measures execution time from start to end
 * - **Status Monitoring**: Tracks success/failure states and error conditions
 * - **Context Propagation**: Maintains trace context for distributed operations
 *
 * ## Span Lifecycle
 * 1. **Creation**: Span starts automatically when created
 * 2. **Updates**: Add input data, intermediate state, metadata as needed
 * 3. **Child Operations**: Create nested observations for sub-operations
 * 4. **Completion**: Update with final output and call `.end()` to finish
 *
 * @example
 * ```typescript
 * import { startObservation } from '@langfuse/tracing';
 *
 * // Simple operation tracking
 * const span = startObservation('user-authentication', {
 *   input: { username: 'john_doe', method: 'oauth' },
 *   metadata: { provider: 'google', version: '2.0' }
 * });
 *
 * try {
 *   // Perform authentication logic
 *   const user = await authenticateUser(credentials);
 *
 *   span.update({
 *     output: { userId: user.id, success: true },
 *     level: 'DEFAULT',
 *     metadata: { loginTime: Date.now(), sessionId: user.sessionId }
 *   });
 * } catch (error) {
 *   span.update({
 *     output: { success: false, error: error.message },
 *     level: 'ERROR',
 *     statusMessage: 'Authentication failed'
 *   });
 * } finally {
 *   span.end();
 * }
 *
 * // Complex workflow with nested operations
 * const orderProcessing = startObservation('order-processing', {
 *   input: { orderId: 'ord_123', items: cartItems },
 *   metadata: { customerId: 'cust_456', priority: 'standard' }
 * });
 *
 * // Validation step
 * const validation = orderProcessing.startObservation('order-validation', {
 *   input: { items: cartItems, inventory: currentInventory }
 * });
 * validation.update({ output: { valid: true, adjustments: [] } });
 * validation.end();
 *
 * // Payment processing
 * const payment = orderProcessing.startObservation('payment-processing', {
 *   input: { amount: totalAmount, method: paymentMethod }
 * });
 * payment.update({ output: { transactionId: 'tx_789', status: 'completed' } });
 * payment.end();
 *
 * // Inventory update with error handling
 * const inventory = orderProcessing.startObservation('inventory-update', {
 *   input: { items: validatedItems, operation: 'decrement' }
 * });
 *
 * try {
 *   await updateInventory(validatedItems);
 *   inventory.update({ output: { updated: true, newQuantities: quantities } });
 * } catch (error) {
 *   inventory.update({
 *     level: 'ERROR',
 *     statusMessage: 'Inventory update failed',
 *     output: { error: error.message }
 *   });
 *   throw error; // Re-throw to handle at parent level
 * } finally {
 *   inventory.end();
 * }
 *
 * // Complete main workflow
 * orderProcessing.update({
 *   output: {
 *     orderId: 'ord_123',
 *     status: 'confirmed',
 *     completedSteps: ['validation', 'payment', 'inventory'],
 *     totalDuration: Date.now() - startTime
 *   },
 *   metadata: { completedAt: new Date().toISOString() }
 * });
 * orderProcessing.end();
 *
 * // Background job processing
 * const backgroundJob = startObservation('email-campaign-job', {
 *   input: { campaignId: 'camp_123', recipients: 5000 },
 *   metadata: { jobId: 'job_789', priority: 'low', scheduled: true }
 * });
 *
 * // Process in batches
 * let processed = 0;
 * const batchSize = 100;
 *
 * while (processed < recipients.length) {
 *   const batch = recipients.slice(processed, processed + batchSize);
 *
 *   const batchSpan = backgroundJob.startObservation(`email-batch-${Math.floor(processed / batchSize)}`, {
 *     input: { batchSize: batch.length, startIndex: processed }
 *   });
 *
 *   await processBatch(batch);
 *   batchSpan.update({ output: { sent: batch.length, failed: 0 } });
 *   batchSpan.end();
 *
 *   processed += batchSize;
 *
 *   // Update progress on main span
 *   backgroundJob.update({
 *     metadata: {
 *       progress: Math.round((processed / recipients.length) * 100),
 *       processedCount: processed
 *     }
 *   });
 * }
 *
 * backgroundJob.update({
 *   output: {
 *     totalSent: processed,
 *     totalFailed: 0,
 *     campaignStatus: 'completed'
 *   }
 * });
 * backgroundJob.end();
 * ```
 *
 * @see {@link startObservation} - Factory function for creating spans
 * @see {@link startActiveObservation} - Function-scoped span creation
 * @see {@link LangfuseGeneration} - For LLM and AI model interactions
 * @see {@link LangfuseEvent} - For point-in-time occurrences
 *
 * @public
 */
export class LangfuseSpan extends LangfuseBaseObservation {
  constructor(params: LangfuseSpanParams) {
    super({ ...params, type: "span" });
  }

  /**
   * Updates this span with new attributes.
   *
   * @param attributes - Span attributes to set
   * @returns This span for method chaining
   *
   * @example
   * ```typescript
   * span.update({
   *   output: { result: 'success' },
   *   level: 'DEFAULT',
   *   metadata: { duration: 150 }
   * });
   * ```
   */
  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseAgentParams = {
  otelSpan: Span;
  attributes?: LangfuseAgentAttributes;
};

export class LangfuseAgent extends LangfuseBaseObservation {
  constructor(params: LangfuseAgentParams) {
    super({ ...params, type: "agent" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseToolParams = {
  otelSpan: Span;
  attributes?: LangfuseToolAttributes;
};

export class LangfuseTool extends LangfuseBaseObservation {
  constructor(params: LangfuseToolParams) {
    super({ ...params, type: "tool" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseChainParams = {
  otelSpan: Span;
  attributes?: LangfuseChainAttributes;
};

export class LangfuseChain extends LangfuseBaseObservation {
  constructor(params: LangfuseChainParams) {
    super({ ...params, type: "chain" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseRetrieverParams = {
  otelSpan: Span;
  attributes?: LangfuseRetrieverAttributes;
};

export class LangfuseRetriever extends LangfuseBaseObservation {
  constructor(params: LangfuseRetrieverParams) {
    super({ ...params, type: "retriever" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseEvaluatorParams = {
  otelSpan: Span;
  attributes?: LangfuseEvaluatorAttributes;
};

export class LangfuseEvaluator extends LangfuseBaseObservation {
  constructor(params: LangfuseEvaluatorParams) {
    super({ ...params, type: "evaluator" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseGuardrailParams = {
  otelSpan: Span;
  attributes?: LangfuseGuardrailAttributes;
};

export class LangfuseGuardrail extends LangfuseBaseObservation {
  constructor(params: LangfuseGuardrailParams) {
    super({ ...params, type: "guardrail" });
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

/**
 * Parameters for creating a Langfuse generation.
 *
 * @internal
 */
type LangfuseGenerationParams = {
  otelSpan: Span;
  attributes?: LangfuseGenerationAttributes;
};

/**
 * Specialized observation wrapper for tracking LLM interactions, AI model calls, and text generation.
 *
 * LangfuseGeneration is purpose-built for observing AI model interactions, providing rich
 * metadata capture for prompts, completions, model parameters, token usage, and costs.
 * It's the go-to observation type for any operation involving language models, chat APIs,
 * completion APIs, or other generative AI services.
 *
 * ## Primary Use Cases
 * - **LLM API Calls**: OpenAI, Anthropic, Cohere, Azure OpenAI, AWS Bedrock
 * - **Chat Completions**: Multi-turn conversations and dialogue systems
 * - **Text Generation**: Content creation, summarization, translation
 * - **Code Generation**: AI-powered code completion and generation
 * - **RAG Systems**: Generation step in retrieval-augmented generation
 * - **AI Agents**: LLM reasoning and decision-making within agent workflows
 *
 * ## Key Features
 * - **Rich LLM Metadata**: Model name, parameters, prompts, completions
 * - **Usage Tracking**: Token counts (prompt, completion, total)
 * - **Cost Monitoring**: Automatic cost calculation and tracking
 * - **Performance Metrics**: Latency, throughput, tokens per second
 * - **Prompt Engineering**: Version control for prompts and templates
 * - **Error Handling**: Rate limits, timeouts, model-specific errors
 *
 * ## Generation-Specific Attributes
 * - `model`: Model identifier (e.g., 'gpt-4-turbo', 'claude-3-sonnet')
 * - `modelParameters`: Temperature, max tokens, top-p, frequency penalty
 * - `input`: Prompt or message array for the model
 * - `output`: Model response, completion, or generated content
 * - `usageDetails`: Token consumption (prompt, completion, total)
 * - `costDetails`: Financial cost breakdown and pricing
 * - `prompt`: Structured prompt object with name, version, variables
 *
 * @example
 * ```typescript
 * import { startObservation } from '@langfuse/tracing';
 *
 * // Basic LLM completion tracking
 * const generation = startObservation('openai-completion', {
 *   model: 'gpt-4-turbo',
 *   input: [
 *     { role: 'system', content: 'You are a helpful assistant specialized in explaining complex topics.' },
 *     { role: 'user', content: 'Explain quantum computing in simple terms' }
 *   ],
 *   modelParameters: {
 *     temperature: 0.7,
 *     maxTokens: 500,
 *     topP: 1.0,
 *     frequencyPenalty: 0.0,
 *     presencePenalty: 0.0
 *   },
 *   metadata: {
 *     userId: 'user_123',
 *     requestId: 'req_456',
 *     priority: 'high'
 *   }
 * }, { asType: 'generation' });
 *
 * try {
 *   const startTime = Date.now();
 *
 *   const response = await openai.chat.completions.create({
 *     model: 'gpt-4-turbo',
 *     messages: [
 *       { role: 'system', content: 'You are a helpful assistant specialized in explaining complex topics.' },
 *       { role: 'user', content: 'Explain quantum computing in simple terms' }
 *     ],
 *     temperature: 0.7,
 *     max_tokens: 500,
 *     top_p: 1.0
 *   });
 *
 *   const duration = Date.now() - startTime;
 *   const tokensPerSecond = response.usage.total_tokens / (duration / 1000);
 *
 *   generation.update({
 *     output: response.choices[0].message,
 *     usageDetails: {
 *       promptTokens: response.usage.prompt_tokens,
 *       completionTokens: response.usage.completion_tokens,
 *       totalTokens: response.usage.total_tokens
 *     },
 *     costDetails: {
 *       totalCost: calculateCost(response.usage, 'gpt-4-turbo'),
 *       currency: 'USD',
 *       costBreakdown: {
 *         promptCost: response.usage.prompt_tokens * 0.01 / 1000,
 *         completionCost: response.usage.completion_tokens * 0.03 / 1000
 *       }
 *     },
 *     metadata: {
 *       latency: duration,
 *       tokensPerSecond: Math.round(tokensPerSecond),
 *       finishReason: response.choices[0].finish_reason,
 *       responseId: response.id
 *     }
 *   });
 *
 * } catch (error) {
 *   generation.update({
 *     level: 'ERROR',
 *     statusMessage: `OpenAI API error: ${error.message}`,
 *     output: { error: error.message, errorType: error.type },
 *     metadata: {
 *       errorCode: error.code,
 *       rateLimitHit: error.type === 'rate_limit_exceeded'
 *     }
 *   });
 *   throw error;
 * } finally {
 *   generation.end();
 * }
 *
 * // Structured prompt with versioning
 * const summarizeGeneration = startObservation('document-summarizer', {
 *   model: 'gpt-4-turbo',
 *   prompt: {
 *     name: 'document-summary-v2',
 *     version: '2.1.0',
 *     variables: {
 *       document: longDocument,
 *       maxWords: 200,
 *       tone: 'professional'
 *     }
 *   },
 *   input: [
 *     { role: 'system', content: 'Summarize documents professionally and concisely.' },
 *     { role: 'user', content: `Summarize this document in ${200} words with a professional tone: ${longDocument}` }
 *   ],
 *   modelParameters: {
 *     temperature: 0.3, // Lower temperature for consistency
 *     maxTokens: 300
 *   }
 * }, { asType: 'generation' });
 *
 * // RAG generation with context injection
 * const ragGeneration = startObservation('rag-answer-generation', {
 *   model: 'gpt-4',
 *   input: [
 *     {
 *       role: 'system',
 *       content: 'Answer questions based only on the provided context. If the context doesn\'t contain enough information, say so.'
 *     },
 *     {
 *       role: 'user',
 *       content: `Context: ${retrievedDocuments.join('\n\n')}\n\nQuestion: ${userQuestion}`
 *     }
 *   ],
 *   modelParameters: {
 *     temperature: 0.1, // Low temperature for factual responses
 *     maxTokens: 400
 *   },
 *   metadata: {
 *     retrievalQuery: userQuestion,
 *     contextSources: retrievedDocuments.length,
 *     contextLength: retrievedDocuments.join('').length,
 *     ragVersion: '1.2.0'
 *   }
 * }, { asType: 'generation' });
 *
 * // Multi-step generation with reflection
 * const reasoningGeneration = startObservation('chain-of-thought', {
 *   model: 'gpt-4-turbo',
 *   input: [
 *     { role: 'system', content: 'Think step by step and show your reasoning.' },
 *     { role: 'user', content: complexProblem }
 *   ],
 *   modelParameters: {
 *     temperature: 0.8,
 *     maxTokens: 1000
 *   }
 * }, { asType: 'generation' });
 *
 * // First reasoning step
 * const initialResponse = await callLLM(reasoningGeneration.input);
 * reasoningGeneration.update({
 *   output: initialResponse,
 *   metadata: { step: 'initial_reasoning' }
 * });
 *
 * // Reflection step - create child generation for self-critique
 * const reflection = reasoningGeneration.startObservation('self-reflection', {
 *   model: 'gpt-4-turbo',
 *   input: [
 *     { role: 'system', content: 'Review and improve the reasoning in the previous response.' },
 *     { role: 'user', content: `Previous reasoning: ${initialResponse.content}\n\nOriginal problem: ${complexProblem}` }
 *   ],
 *   modelParameters: { temperature: 0.5, maxTokens: 500 }
 * }, { asType: 'generation' });
 *
 * const improvedResponse = await callLLM(reflection.input);
 * reflection.update({ output: improvedResponse });
 * reflection.end();
 *
 * // Update parent with final refined answer
 * reasoningGeneration.update({
 *   output: improvedResponse,
 *   metadata: {
 *     step: 'refined_reasoning',
 *     reflectionApplied: true,
 *     totalSteps: 2
 *   }
 * });
 * reasoningGeneration.end();
 *
 * // Batch generation processing
 * const batchGeneration = startObservation('batch-content-generation', {
 *   model: 'gpt-3.5-turbo',
 *   input: { batchSize: contentPrompts.length, templates: contentPrompts },
 *   modelParameters: { temperature: 0.9, maxTokens: 200 },
 *   metadata: { batchId: 'batch_789', contentType: 'marketing' }
 * }, { asType: 'generation' });
 *
 * const results = [];
 * let totalTokens = 0;
 * let totalCost = 0;
 *
 * for (let i = 0; i < contentPrompts.length; i++) {
 *   const itemGeneration = batchGeneration.startObservation(`content-item-${i}`, {
 *     model: 'gpt-3.5-turbo',
 *     input: [{ role: 'user', content: contentPrompts[i] }],
 *     modelParameters: { temperature: 0.9, maxTokens: 200 }
 *   }, { asType: 'generation' });
 *
 *   const result = await generateContent(contentPrompts[i]);
 *   results.push(result);
 *
 *   itemGeneration.update({
 *     output: result,
 *     usageDetails: result.usage,
 *     costDetails: result.cost
 *   });
 *   itemGeneration.end();
 *
 *   totalTokens += result.usage.totalTokens;
 *   totalCost += result.cost.totalCost;
 * }
 *
 * batchGeneration.update({
 *   output: {
 *     generatedItems: results.length,
 *     successful: results.filter(r => r.success).length,
 *     failed: results.filter(r => !r.success).length
 *   },
 *   usageDetails: { totalTokens },
 *   costDetails: { totalCost, currency: 'USD' },
 *   metadata: {
 *     avgTokensPerItem: Math.round(totalTokens / results.length),
 *     avgCostPerItem: totalCost / results.length
 *   }
 * });
 * batchGeneration.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'generation' }` - Factory function
 * @see {@link startActiveObservation} with `{ asType: 'generation' }` - Function-scoped generation
 * @see {@link LangfuseSpan} - For general-purpose operations
 * @see {@link LangfuseEmbedding} - For text embedding and vector operations
 *
 * @public
 */
export class LangfuseGeneration extends LangfuseBaseObservation {
  constructor(params: LangfuseGenerationParams) {
    super({ ...params, type: "generation" });
  }

  update(attributes: LangfuseGenerationAttributes): LangfuseGeneration {
    this.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseEmbeddingParams = {
  otelSpan: Span;
  attributes?: LangfuseEmbeddingAttributes;
};

export class LangfuseEmbedding extends LangfuseBaseObservation {
  constructor(params: LangfuseEmbeddingParams) {
    super({ ...params, type: "embedding" });
  }

  update(attributes: LangfuseGenerationAttributes): LangfuseGeneration {
    this.updateOtelSpanAttributes(attributes);

    return this;
  }
}

/**
 * Parameters for creating a Langfuse event.
 *
 * @internal
 */
type LangfuseEventParams = {
  otelSpan: Span;
  attributes?: LangfuseEventAttributes;
  timestamp: TimeInput;
};

/**
 * Langfuse event wrapper for point-in-time observations.
 *
 * Events represent instantaneous occurrences or log entries within a trace.
 * Unlike spans and generations, they don't have duration and are automatically
 * ended when created.
 *
 * @public
 */
export class LangfuseEvent extends LangfuseBaseObservation {
  constructor(params: LangfuseEventParams) {
    super({ ...params, type: "event" });

    // Events are automatically ended at their timestamp
    this.otelSpan.end(params.timestamp);
  }
}
