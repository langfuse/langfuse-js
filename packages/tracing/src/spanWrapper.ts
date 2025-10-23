import { getGlobalLogger } from "@langfuse/core";
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
   * @deprecated Use `propagateAttributes()` instead for proper attribute propagation.
   * This method only sets attributes on the current span, not child spans.
   *
   * **Current behavior**: This method still works as expected - it sets trace-level
   * attributes on the current span. However, it will be removed in a future version,
   * so please migrate to `propagateAttributes()`.
   *
   * **Why deprecated**: This method only sets attributes on a single span, which means
   * child spans created later won't have these attributes. This causes gaps when
   * using Langfuse aggregation queries (e.g., filtering by userId or calculating
   * costs per sessionId) because only the span with the attribute is included.
   *
   * **Migration**: Replace with `propagateAttributes()` to set attributes on ALL
   * child spans created within the context. Call it as early as possible in your trace:
   *
   * @example
   * ```typescript
   * // OLD (deprecated)
   * const span = startObservation('handle-request');
   * const user = authenticateUser(request);
   * span.updateTrace({
   *   userId: user.id,
   *   sessionId: request.sessionId
   * });
   * // Child spans created here won't have userId/sessionId
   * const response = processRequest(request);
   * span.end();
   *
   * // NEW (recommended)
   * await startActiveObservation('handle-request', async (span) => {
   *   const user = authenticateUser(request);
   *   await propagateAttributes({
   *     userId: user.id,
   *     sessionId: request.sessionId,
   *     metadata: { environment: 'production' }
   *   }, async () => {
   *     // All child spans will have these attributes
   *     const response = await processRequest(request);
   *   });
   * });
   * ```
   *
   * @param attributes - Trace attributes to set
   * @returns This observation for method chaining
   *
   * @see {@link propagateAttributes} Recommended replacement
   */
  public updateTrace(attributes: LangfuseTraceAttributes) {
    getGlobalLogger().warn(
      "updateTrace() is deprecated and will be removed in a future version. " +
        "While it still works today, it only sets attributes on a single span, causing gaps in aggregation queries in the future. " +
        "Migrate to propagateAttributes({ userId: ..., sessionId: ..., metadata: {...} }) to propagate attributes to ALL child spans. " +
        "Call propagateAttributes() as early as possible in your trace for complete coverage. " +
        "See: https://langfuse.com/docs/sdk/typescript/decorators#trace-level-attributes",
    );

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
 * // Basic span tracking
 * const span = startObservation('user-authentication', {
 *   input: { username: 'john_doe', method: 'oauth' },
 *   metadata: { provider: 'google' }
 * });
 *
 * try {
 *   const user = await authenticateUser(credentials);
 *   span.update({
 *     output: { userId: user.id, success: true }
 *   });
 * } catch (error) {
 *   span.update({
 *     level: 'ERROR',
 *     output: { success: false, error: error.message }
 *   });
 * } finally {
 *   span.end();
 * }
 *
 * // Nested operations
 * const workflow = startObservation('order-processing', {
 *   input: { orderId: 'ord_123' }
 * });
 *
 * const validation = workflow.startObservation('validation', {
 *   input: { items: cartItems }
 * });
 * validation.update({ output: { valid: true } });
 * validation.end();
 *
 * const payment = workflow.startObservation('payment', {
 *   input: { amount: 100 }
 * });
 * payment.update({ output: { status: 'completed' } });
 * payment.end();
 *
 * workflow.update({
 *   output: { status: 'confirmed', steps: 2 }
 * });
 * workflow.end();
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

/**
 * Specialized observation wrapper for tracking AI agent workflows and autonomous operations.
 *
 * LangfuseAgent is designed for observing intelligent agent systems that combine reasoning,
 * tool usage, memory management, and decision-making in autonomous workflows. It captures
 * the complex multi-step nature of agent operations, including planning, execution, and
 * self-correction cycles typical in advanced AI agent architectures.
 *
 * ## Primary Use Cases
 * - **Autonomous AI Agents**: ReAct, AutoGPT, LangGraph agent implementations
 * - **Tool-Using Agents**: Function calling agents with external API access
 * - **Multi-Step Reasoning**: Chain-of-thought, tree-of-thought agent workflows
 * - **Planning Agents**: Goal decomposition and task planning systems
 * - **Conversational Agents**: Multi-turn dialogue agents with memory
 * - **Code Generation Agents**: AI assistants that write, test, and debug code
 *
 * ## Key Features
 * - **Multi-Step Tracking**: Captures entire agent workflow from planning to execution
 * - **Tool Integration**: Records all tool calls and their results within agent context
 * - **Decision Logic**: Tracks reasoning steps, decisions, and strategy adaptations
 * - **Memory Management**: Observes how agents maintain and use context across steps
 * - **Error Recovery**: Monitors how agents handle failures and adapt their approach
 * - **Performance Metrics**: Measures agent efficiency, success rates, and resource usage
 *
 * ## Agent-Specific Patterns
 * - **Planning Phase**: Initial goal analysis and strategy formulation
 * - **Execution Loop**: Iterative action-observation-reasoning cycles
 * - **Tool Selection**: Dynamic tool choice based on context and goals
 * - **Self-Correction**: Error detection and strategy adjustment
 * - **Memory Updates**: Context retention and knowledge accumulation
 * - **Final Synthesis**: Result compilation and quality assessment
 *
 * @example
 * ```typescript
 * // Basic agent workflow
 * const agent = startObservation('research-agent', {
 *   input: {
 *     task: 'Research renewable energy trends',
 *     tools: ['web-search', 'summarizer'],
 *     maxIterations: 3
 *   }
 * }, { asType: 'agent' });
 *
 * // Agent uses tools and makes decisions
 * const searchTool = agent.startObservation('web-search', {
 *   input: { query: 'renewable energy 2024' }
 * }, { asType: 'tool' });
 *
 * const results = await webSearch('renewable energy 2024');
 * searchTool.update({ output: results });
 * searchTool.end();
 *
 * // Agent generates final response
 * const generation = agent.startObservation('synthesize-findings', {
 *   input: results,
 *   model: 'gpt-4'
 * }, { asType: 'generation' });
 *
 * const response = await llm.generate(results);
 * generation.update({ output: response });
 * generation.end();
 *
 * agent.update({
 *   output: {
 *     completed: true,
 *     toolsUsed: 1,
 *     finalResponse: response
 *   }
 * });
 * agent.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'agent' }` - Factory function
 * @see {@link startActiveObservation} with `{ asType: 'agent' }` - Function-scoped agent
 * @see {@link LangfuseTool} - For individual tool executions within agents
 * @see {@link LangfuseChain} - For structured multi-step workflows
 *
 * @public
 */
export class LangfuseAgent extends LangfuseBaseObservation {
  constructor(params: LangfuseAgentParams) {
    super({ ...params, type: "agent" });
  }

  /**
   * Updates this agent observation with new attributes.
   *
   * @param attributes - Agent attributes to set
   * @returns This agent for method chaining
   *
   * @example
   * ```typescript
   * agent.update({
   *   output: {
   *     taskCompleted: true,
   *     iterationsUsed: 5,
   *     toolsInvoked: ['web-search', 'calculator', 'summarizer'],
   *     finalResult: 'Research completed with high confidence'
   *   },
   *   metadata: {
   *     efficiency: 0.85,
   *     qualityScore: 0.92,
   *     resourcesConsumed: { tokens: 15000, apiCalls: 12 }
   *   }
   * });
   * ```
   */
  public update(attributes: LangfuseAgentAttributes): LangfuseAgent {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseToolParams = {
  otelSpan: Span;
  attributes?: LangfuseToolAttributes;
};

/**
 * Specialized observation wrapper for tracking individual tool calls and external API interactions.
 *
 * LangfuseTool is designed for observing discrete tool invocations within agent workflows,
 * function calling scenarios, or standalone API integrations. It captures the input parameters,
 * execution results, performance metrics, and error conditions of tool operations, making it
 * essential for debugging tool reliability and optimizing tool selection strategies.
 *
 * ## Primary Use Cases
 * - **Function Calling**: OpenAI function calls, Anthropic tool use, Claude function calling
 * - **External APIs**: REST API calls, GraphQL queries, database operations
 * - **System Tools**: File operations, shell commands, system integrations
 * - **Data Processing Tools**: Calculators, converters, validators, parsers
 * - **Search Tools**: Web search, vector search, document retrieval
 * - **Content Tools**: Image generation, text processing, format conversion
 *
 * ## Key Features
 * - **Parameter Tracking**: Complete input parameter logging and validation
 * - **Result Capture**: Full output data and metadata from tool execution
 * - **Performance Monitoring**: Execution time, success rates, retry attempts
 * - **Error Analysis**: Detailed error tracking with context and recovery info
 * - **Usage Analytics**: Frequency, patterns, and efficiency metrics
 * - **Integration Health**: API status, rate limits, and service availability
 *
 * ## Tool-Specific Patterns
 * - **Input Validation**: Parameter checking and sanitization before execution
 * - **Execution Monitoring**: Real-time performance and status tracking
 * - **Result Processing**: Output validation, transformation, and formatting
 * - **Error Handling**: Retry logic, fallbacks, and graceful degradation
 * - **Caching Integration**: Result caching and cache hit/miss tracking
 * - **Rate Limiting**: Request throttling and quota management
 *
 * @example
 * ```typescript
 * // Web search tool
 * const searchTool = startObservation('web-search', {
 *   input: {
 *     query: 'latest AI developments',
 *     maxResults: 10
 *   },
 *   metadata: { provider: 'google-api' }
 * }, { asType: 'tool' });
 *
 * try {
 *   const results = await webSearch('latest AI developments');
 *
 *   searchTool.update({
 *     output: {
 *       results: results,
 *       count: results.length
 *     },
 *     metadata: {
 *       latency: 1200,
 *       cacheHit: false
 *     }
 *   });
 * } catch (error) {
 *   searchTool.update({
 *     level: 'ERROR',
 *     statusMessage: 'Search failed',
 *     output: { error: error.message }
 *   });
 * } finally {
 *   searchTool.end();
 * }
 *
 * // Database query tool
 * const dbTool = startObservation('db-query', {
 *   input: {
 *     query: 'SELECT * FROM users WHERE active = true',
 *     timeout: 30000
 *   }
 * }, { asType: 'tool' });
 *
 * const result = await db.query('SELECT * FROM users WHERE active = true');
 * dbTool.update({
 *   output: { rowCount: result.length },
 *   metadata: { executionTime: 150 }
 * });
 * dbTool.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'tool' }` - Factory function
 * @see {@link startActiveObservation} with `{ asType: 'tool' }` - Function-scoped tool
 * @see {@link LangfuseAgent} - For agent workflows that use multiple tools
 * @see {@link LangfuseChain} - For orchestrated tool sequences
 *
 * @public
 */
export class LangfuseTool extends LangfuseBaseObservation {
  constructor(params: LangfuseToolParams) {
    super({ ...params, type: "tool" });
  }

  /**
   * Updates this tool observation with new attributes.
   *
   * @param attributes - Tool attributes to set
   * @returns This tool for method chaining
   *
   * @example
   * ```typescript
   * tool.update({
   *   output: {
   *     result: searchResults,
   *     count: searchResults.length,
   *     relevanceScore: 0.89,
   *     executionTime: 1250
   *   },
   *   metadata: {
   *     cacheHit: false,
   *     apiCost: 0.025,
   *     rateLimitRemaining: 950
   *   }
   * });
   * ```
   */
  public update(attributes: LangfuseToolAttributes): LangfuseTool {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseChainParams = {
  otelSpan: Span;
  attributes?: LangfuseChainAttributes;
};

/**
 * Specialized observation wrapper for tracking structured multi-step workflows and process chains.
 *
 * LangfuseChain is designed for observing sequential, parallel, or conditional workflow orchestration
 * where multiple operations are coordinated to achieve a larger goal. It captures the flow of data
 * between steps, manages dependencies, tracks progress through complex pipelines, and provides
 * insights into workflow performance and reliability patterns.
 *
 * ## Primary Use Cases
 * - **Data Processing Pipelines**: ETL processes, data transformation workflows
 * - **Business Process Automation**: Order processing, approval workflows, document processing
 * - **LangChain Integration**: LangChain chain execution and orchestration
 * - **RAG Pipelines**: Document retrieval → context preparation → generation → post-processing
 * - **Multi-Model Workflows**: Preprocessing → model inference → post-processing → validation
 * - **Content Production**: Research → drafting → review → editing → publishing
 *
 * ## Key Features
 * - **Step Orchestration**: Sequential, parallel, and conditional step execution tracking
 * - **Data Flow Management**: Input/output tracking between pipeline steps
 * - **Dependency Resolution**: Manages complex step dependencies and prerequisites
 * - **Progress Monitoring**: Real-time workflow progress and completion status
 * - **Error Propagation**: Handles failures, retries, and recovery across workflow steps
 * - **Performance Analytics**: Bottleneck identification and optimization insights
 *
 * ## Chain-Specific Patterns
 * - **Pipeline Setup**: Workflow definition, step configuration, and dependency mapping
 * - **Sequential Execution**: Step-by-step processing with state management
 * - **Parallel Processing**: Concurrent step execution with synchronization
 * - **Conditional Logic**: Dynamic branching based on intermediate results
 * - **Error Recovery**: Failure handling, rollback, and alternative path execution
 * - **Result Aggregation**: Combining outputs from multiple workflow branches
 *
 * @example
 * ```typescript
 * // RAG processing chain
 * const ragChain = startObservation('rag-chain', {
 *   input: {
 *     query: 'What is renewable energy?',
 *     steps: ['retrieval', 'generation']
 *   }
 * }, { asType: 'chain' });
 *
 * // Step 1: Document retrieval
 * const retrieval = ragChain.startObservation('document-retrieval', {
 *   input: { query: 'renewable energy' }
 * }, { asType: 'retriever' });
 *
 * const docs = await vectorSearch('renewable energy');
 * retrieval.update({ output: { documents: docs, count: docs.length } });
 * retrieval.end();
 *
 * // Step 2: Generate response
 * const generation = ragChain.startObservation('response-generation', {
 *   input: {
 *     query: 'What is renewable energy?',
 *     context: docs
 *   },
 *   model: 'gpt-4'
 * }, { asType: 'generation' });
 *
 * const response = await llm.generate({
 *   prompt: buildPrompt('What is renewable energy?', docs)
 * });
 *
 * generation.update({ output: response });
 * generation.end();
 *
 * ragChain.update({
 *   output: {
 *     finalResponse: response,
 *     stepsCompleted: 2,
 *     documentsUsed: docs.length
 *   }
 * });
 * ragChain.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'chain' }` - Factory function
 * @see {@link startActiveObservation} with `{ asType: 'chain' }` - Function-scoped chain
 * @see {@link LangfuseSpan} - For individual workflow steps
 * @see {@link LangfuseAgent} - For intelligent workflow orchestration
 *
 * @public
 */
export class LangfuseChain extends LangfuseBaseObservation {
  constructor(params: LangfuseChainParams) {
    super({ ...params, type: "chain" });
  }

  /**
   * Updates this chain observation with new attributes.
   *
   * @param attributes - Chain attributes to set
   * @returns This chain for method chaining
   *
   * @example
   * ```typescript
   * chain.update({
   *   output: {
   *     stepsCompleted: 5,
   *     stepsSuccessful: 4,
   *     finalResult: processedData,
   *     pipelineEfficiency: 0.87
   *   },
   *   metadata: {
   *     bottleneckStep: 'data-validation',
   *     parallelizationOpportunities: ['step-2', 'step-3'],
   *     optimizationSuggestions: ['cache-intermediate-results']
   *   }
   * });
   * ```
   */
  public update(attributes: LangfuseChainAttributes): LangfuseChain {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseRetrieverParams = {
  otelSpan: Span;
  attributes?: LangfuseRetrieverAttributes;
};

/**
 * Specialized observation wrapper for tracking document retrieval and search operations.
 *
 * LangfuseRetriever is designed for observing information retrieval systems that search,
 * filter, and rank content from various data sources. It captures search queries, retrieval
 * strategies, result quality metrics, and performance characteristics of search operations,
 * making it essential for RAG systems, knowledge bases, and content discovery workflows.
 *
 * ## Primary Use Cases
 * - **Vector Search**: Semantic similarity search using embeddings and vector databases
 * - **Document Retrieval**: Full-text search, keyword matching, and document filtering
 * - **Knowledge Base Query**: FAQ systems, help documentation, and knowledge management
 * - **RAG Systems**: Retrieval step in retrieval-augmented generation pipelines
 * - **Recommendation Systems**: Content recommendations and similarity-based suggestions
 * - **Data Mining**: Information extraction and content discovery from large datasets
 *
 * ## Key Features
 * - **Query Analysis**: Input query processing, expansion, and optimization tracking
 * - **Search Strategy**: Retrieval algorithms, ranking functions, and filtering criteria
 * - **Result Quality**: Relevance scores, diversity metrics, and retrieval effectiveness
 * - **Performance Metrics**: Search latency, index size, and throughput measurements
 * - **Source Tracking**: Data source attribution and content provenance information
 * - **Ranking Intelligence**: Personalization, context awareness, and result optimization
 *
 * @example
 * ```typescript
 * // Vector search retrieval
 * const retriever = startObservation('vector-search', {
 *   input: {
 *     query: 'machine learning applications',
 *     topK: 10,
 *     similarityThreshold: 0.7
 *   },
 *   metadata: {
 *     vectorDB: 'pinecone',
 *     embeddingModel: 'text-embedding-ada-002'
 *   }
 * }, { asType: 'retriever' });
 *
 * const results = await vectorDB.search({
 *   query: 'machine learning applications',
 *   topK: 10,
 *   threshold: 0.7
 * });
 *
 * retriever.update({
 *   output: {
 *     documents: results,
 *     count: results.length,
 *     avgSimilarity: 0.89
 *   },
 *   metadata: {
 *     searchLatency: 150,
 *     cacheHit: false
 *   }
 * });
 * retriever.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'retriever' }` - Factory function
 * @see {@link LangfuseChain} - For multi-step RAG pipelines
 * @see {@link LangfuseEmbedding} - For embedding generation used in vector search
 *
 * @public
 */
export class LangfuseRetriever extends LangfuseBaseObservation {
  constructor(params: LangfuseRetrieverParams) {
    super({ ...params, type: "retriever" });
  }

  /**
   * Updates this retriever observation with new attributes.
   *
   * @param attributes - Retriever attributes to set
   * @returns This retriever for method chaining
   */
  public update(attributes: LangfuseRetrieverAttributes): LangfuseRetriever {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseEvaluatorParams = {
  otelSpan: Span;
  attributes?: LangfuseEvaluatorAttributes;
};

/**
 * Specialized observation wrapper for tracking quality assessment and evaluation operations.
 *
 * LangfuseEvaluator is designed for observing evaluation systems that assess, score, and
 * validate the quality of AI outputs, content, or system performance. It captures evaluation
 * criteria, scoring methodologies, benchmark comparisons, and quality metrics, making it
 * essential for AI system validation, content moderation, and performance monitoring.
 *
 * ## Primary Use Cases
 * - **LLM Output Evaluation**: Response quality, factual accuracy, and relevance assessment
 * - **Content Quality Assessment**: Writing quality, tone analysis, and style validation
 * - **Automated Testing**: System performance validation and regression testing
 * - **Bias Detection**: Fairness evaluation and bias identification in AI systems
 * - **Safety Evaluation**: Content safety, harm detection, and compliance checking
 * - **Benchmark Comparison**: Performance comparison against reference standards
 *
 * ## Key Features
 * - **Multi-Criteria Scoring**: Comprehensive evaluation across multiple quality dimensions
 * - **Automated Assessment**: AI-powered evaluation using specialized models and algorithms
 * - **Human Evaluation**: Integration with human reviewers and expert assessment
 * - **Benchmark Tracking**: Performance comparison against established baselines
 * - **Quality Metrics**: Detailed scoring with confidence intervals and reliability measures
 * - **Trend Analysis**: Quality tracking over time with improvement recommendations
 *
 * @example
 * ```typescript
 * // Response quality evaluation
 * const evaluator = startObservation('response-quality-eval', {
 *   input: {
 *     response: 'Machine learning is a subset of artificial intelligence...',
 *     criteria: ['accuracy', 'completeness', 'clarity']
 *   }
 * }, { asType: 'evaluator' });
 *
 * const evaluation = await evaluateResponse({
 *   response: 'Machine learning is a subset of artificial intelligence...',
 *   criteria: ['accuracy', 'completeness', 'clarity']
 * });
 *
 * evaluator.update({
 *   output: {
 *     overallScore: 0.87,
 *     criteriaScores: {
 *       accuracy: 0.92,
 *       completeness: 0.85,
 *       clarity: 0.90
 *     },
 *     passed: true
 *   }
 * });
 * evaluator.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'evaluator' }` - Factory function
 * @see {@link LangfuseGeneration} - For LLM outputs being evaluated
 * @see {@link LangfuseGuardrail} - For safety and compliance enforcement
 *
 * @public
 */
export class LangfuseEvaluator extends LangfuseBaseObservation {
  constructor(params: LangfuseEvaluatorParams) {
    super({ ...params, type: "evaluator" });
  }

  /**
   * Updates this evaluator observation with new attributes.
   *
   * @param attributes - Evaluator attributes to set
   * @returns This evaluator for method chaining
   */
  public update(attributes: LangfuseEvaluatorAttributes): LangfuseEvaluator {
    super.updateOtelSpanAttributes(attributes);

    return this;
  }
}

type LangfuseGuardrailParams = {
  otelSpan: Span;
  attributes?: LangfuseGuardrailAttributes;
};

/**
 * Specialized observation wrapper for tracking safety checks and compliance enforcement.
 *
 * LangfuseGuardrail is designed for observing safety and compliance systems that prevent,
 * detect, and mitigate harmful, inappropriate, or policy-violating content and behaviors
 * in AI applications. It captures safety policies, violation detection, risk assessment,
 * and mitigation actions, ensuring responsible AI deployment and regulatory compliance.
 *
 * ## Primary Use Cases
 * - **Content Moderation**: Harmful content detection and filtering in user inputs/outputs
 * - **Safety Enforcement**: PII detection, toxicity filtering, and inappropriate content blocking
 * - **Compliance Monitoring**: Regulatory compliance, industry standards, and policy enforcement
 * - **Bias Mitigation**: Fairness checks and bias prevention in AI decision-making
 * - **Privacy Protection**: Data privacy safeguards and sensitive information redaction
 * - **Behavioral Monitoring**: User behavior analysis and anomaly detection
 *
 * ## Key Features
 * - **Multi-Policy Enforcement**: Simultaneous checking against multiple safety policies
 * - **Risk Assessment**: Quantitative risk scoring with confidence intervals
 * - **Real-Time Detection**: Low-latency safety checks for interactive applications
 * - **Context Awareness**: Contextual safety evaluation considering user and application context
 * - **Mitigation Actions**: Automatic content blocking, filtering, and redaction capabilities
 * - **Audit Trail**: Comprehensive logging for compliance and safety incident investigation
 *
 * @example
 * ```typescript
 * // Content safety guardrail
 * const guardrail = startObservation('content-safety-check', {
 *   input: {
 *     content: userMessage,
 *     policies: ['no-toxicity', 'no-hate-speech'],
 *     strictMode: false
 *   }
 * }, { asType: 'guardrail' });
 *
 * const safetyCheck = await checkContentSafety({
 *   text: userMessage,
 *   policies: ['no-toxicity', 'no-hate-speech']
 * });
 *
 * guardrail.update({
 *   output: {
 *     safe: safetyCheck.safe,
 *     riskScore: 0.15,
 *     violations: [],
 *     action: 'allow'
 *   }
 * });
 * guardrail.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'guardrail' }` - Factory function
 * @see {@link LangfuseEvaluator} - For detailed quality and safety assessment
 * @see {@link LangfuseGeneration} - For protecting LLM outputs with guardrails
 *
 * @public
 */
export class LangfuseGuardrail extends LangfuseBaseObservation {
  constructor(params: LangfuseGuardrailParams) {
    super({ ...params, type: "guardrail" });
  }

  /**
   * Updates this guardrail observation with new attributes.
   *
   * @param attributes - Guardrail attributes to set
   * @returns This guardrail for method chaining
   */
  public update(attributes: LangfuseGuardrailAttributes): LangfuseGuardrail {
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
 * // Basic LLM generation tracking
 * const generation = startObservation('openai-completion', {
 *   model: 'gpt-4-turbo',
 *   input: [
 *     { role: 'system', content: 'You are a helpful assistant.' },
 *     { role: 'user', content: 'Explain quantum computing' }
 *   ],
 *   modelParameters: {
 *     temperature: 0.7,
 *     maxTokens: 500
 *   }
 * }, { asType: 'generation' });
 *
 * try {
 *   const response = await openai.chat.completions.create({
 *     model: 'gpt-4-turbo',
 *     messages: [
 *       { role: 'system', content: 'You are a helpful assistant.' },
 *       { role: 'user', content: 'Explain quantum computing' }
 *     ],
 *     temperature: 0.7,
 *     max_tokens: 500
 *   });
 *
 *   generation.update({
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
 *   });
 * } catch (error) {
 *   generation.update({
 *     level: 'ERROR',
 *     statusMessage: `API error: ${error.message}`,
 *     output: { error: error.message }
 *   });
 * } finally {
 *   generation.end();
 * }
 *
 * // RAG generation example
 * const ragGeneration = startObservation('rag-response', {
 *   model: 'gpt-4',
 *   input: [
 *     { role: 'system', content: 'Answer based on provided context.' },
 *     { role: 'user', content: `Context: ${context}\n\nQuestion: ${question}` }
 *   ],
 *   modelParameters: { temperature: 0.1 }
 * }, { asType: 'generation' });
 *
 * const response = await llm.generate({ prompt, context });
 * ragGeneration.update({
 *   output: response,
 *   metadata: { contextSources: 3 }
 * });
 * ragGeneration.end();
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

/**
 * Specialized observation wrapper for tracking text embedding and vector generation operations.
 *
 * LangfuseEmbedding is designed for observing embedding model interactions that convert
 * text, images, or other content into high-dimensional vector representations. It captures
 * embedding model parameters, input preprocessing, vector characteristics, and performance
 * metrics, making it essential for semantic search, RAG systems, and similarity-based applications.
 *
 * ## Primary Use Cases
 * - **Text Embeddings**: Converting text to vectors for semantic search and similarity
 * - **Document Indexing**: Creating vector representations for large document collections
 * - **Semantic Search**: Enabling similarity-based search and content discovery
 * - **RAG Preparation**: Embedding documents and queries for retrieval-augmented generation
 * - **Clustering Analysis**: Grouping similar content using vector representations
 * - **Recommendation Systems**: Content similarity for personalized recommendations
 *
 * ## Key Features
 * - **Model Tracking**: Embedding model selection, version, and parameter monitoring
 * - **Input Processing**: Text preprocessing, tokenization, and normalization tracking
 * - **Vector Analysis**: Dimensionality, magnitude, and quality metrics for generated embeddings
 * - **Batch Processing**: Efficient handling of multiple texts in single embedding operations
 * - **Performance Monitoring**: Embedding generation speed, cost tracking, and efficiency metrics
 * - **Quality Assessment**: Vector quality evaluation and embedding effectiveness measurement
 *
 * @example
 * ```typescript
 * // Text embedding generation
 * const embedding = startObservation('text-embedder', {
 *   input: {
 *     texts: [
 *       'Machine learning is a subset of AI',
 *       'Deep learning uses neural networks'
 *     ],
 *     batchSize: 2
 *   },
 *   model: 'text-embedding-ada-002'
 * }, { asType: 'embedding' });
 *
 * const embedResult = await generateEmbeddings({
 *   texts: [
 *     'Machine learning is a subset of AI',
 *     'Deep learning uses neural networks'
 *   ],
 *   model: 'text-embedding-ada-002'
 * });
 *
 * embedding.update({
 *   output: {
 *     embeddings: embedResult.vectors,
 *     count: embedResult.vectors.length,
 *     dimensions: 1536
 *   },
 *   usageDetails: {
 *     totalTokens: embedResult.tokenCount
 *   },
 *   metadata: {
 *     processingTime: 340
 *   }
 * });
 * embedding.end();
 * ```
 *
 * @see {@link startObservation} with `{ asType: 'embedding' }` - Factory function
 * @see {@link LangfuseRetriever} - For using embeddings in vector search
 * @see {@link LangfuseGeneration} - For LLM operations that may use embeddings
 *
 * @public
 */
export class LangfuseEmbedding extends LangfuseBaseObservation {
  constructor(params: LangfuseEmbeddingParams) {
    super({ ...params, type: "embedding" });
  }

  /**
   * Updates this embedding observation with new attributes.
   *
   * @param attributes - Embedding attributes to set
   * @returns This embedding for method chaining
   */
  update(attributes: LangfuseEmbeddingAttributes): LangfuseEmbedding {
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
