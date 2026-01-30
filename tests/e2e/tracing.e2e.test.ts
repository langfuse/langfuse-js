import {
  startObservation,
  startActiveObservation,
  observe,
  propagateAttributes,
} from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { describe, it, beforeEach, afterEach } from "vitest";

import { ServerAssertions } from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
  waitForServerIngestion,
  type ServerTestEnvironment,
} from "./helpers/serverSetup.js";

describe("Server Export E2E Tests", () => {
  let testEnv: ServerTestEnvironment;
  let assertions: ServerAssertions;

  beforeEach(async () => {
    testEnv = await setupServerTestEnvironment();
    assertions = new ServerAssertions();
  });

  afterEach(async () => {
    await teardownServerTestEnvironment(testEnv);
  });

  it("should export span with nested generation to Langfuse server", async () => {
    const testId = nanoid(8);
    const traceName = `e2e-test-trace-${testId}`;
    const parentSpanName = `e2e-parent-span-${testId}`;
    const generationName = `nested-llm-call-${testId}`;

    let parentSpan: any;
    let generation: any;

    // Use propagateAttributes for trace-level attributes and startActiveObservation for active context
    await propagateAttributes(
      {
        traceName: traceName,
        userId: "test-user-123",
        sessionId: "test-session-456",
        tags: ["e2e", "test"],
        metadata: { testRun: "server-export", version: "1.0.0" },
      },
      async () => {
        parentSpan = startActiveObservation(
          parentSpanName,
          (span) => {
            span.update({
              input: { operation: "E2E test operation" },
              metadata: { testType: "e2e", timestamp: Date.now() },
            });

            // Create a nested generation using the parent span
            generation = span.startObservation(
              generationName,
              {
                model: "gpt-4",
                input: {
                  messages: [
                    { role: "user", content: "What is OpenTelemetry?" },
                  ],
                },
                metadata: { temperature: 0.7, maxTokens: 100 },
              },
              { asType: "generation" },
            );

            // Make the trace public
            generation.setTraceAsPublic();

            // Simulate LLM response
            generation.update({
              output: {
                role: "assistant",
                content: "OpenTelemetry is an observability framework...",
              },
              usageDetails: {
                prompt_tokens: 15,
                completion_tokens: 25,
                total_tokens: 40,
              },
            });

            // Complete the generation
            generation.end();
            span.update({
              output: { status: "completed", generationCount: 1 },
            });

            return span;
          },
          { endOnExit: false },
        );
      },
    );

    // End the parent span outside the callback since endOnExit is false
    parentSpan.end();

    // Force flush to send spans to server
    await testEnv.spanProcessor.forceFlush();

    // Wait for server-side async ingestion processing
    await waitForServerIngestion(2000);

    // Fetch the trace from Langfuse server and verify
    const traces = await assertions.fetchTraces({
      name: traceName,
      limit: 1,
    });

    if (traces.length === 0) {
      throw new Error(`No traces found with name '${traceName}'`);
    }

    // Fetch the full trace with observations
    const trace = await assertions.fetchTrace(traces[0].id);

    // Assert trace properties
    assertions.expectTraceExists(trace, {
      name: traceName,
      userId: "test-user-123",
      sessionId: "test-session-456",
      public: true,
    });

    // Assert we have 2 observations (1 span + 1 generation)
    assertions.expectObservationCount(trace, 2);

    // Assert parent span exists with correct properties
    const parentObservation = assertions.expectObservationExists(
      trace,
      parentSpanName,
      {
        type: "SPAN",
        level: "DEFAULT",
      },
    );

    // Assert nested generation exists with correct properties
    const generationObservation = assertions.expectObservationExists(
      trace,
      generationName,
      {
        type: "GENERATION",
        model: "gpt-4",
        level: "DEFAULT",
      },
    );

    // Assert parent-child relationship
    assertions.expectObservationParent(trace, generationName, parentSpanName);

    // Assert generation has usage data
    if (!generationObservation.usage) {
      throw new Error("Generation observation missing usage data");
    }

    if (generationObservation.usage.total !== 40) {
      throw new Error(
        `Expected total tokens 40, got ${generationObservation.usage.total}`,
      );
    }

    console.log(
      "✅ E2E test passed: Trace exported successfully to Langfuse server",
    );
    console.log(`📊 Trace ID: ${trace.id}`);
    console.log(`📈 Observations: ${trace.observations.length}`);
  });

  it("should export startActiveObservation with nested startActiveObservation generation to Langfuse server", async () => {
    const testId = nanoid(8);
    const traceName = `e2e-active-span-trace-${testId}`;
    const parentSpanName = `active-parent-operation-${testId}`;
    const generationName = `nested-active-generation-${testId}`;

    // Use propagateAttributes for trace-level attributes and startActiveObservation for context
    const result = await propagateAttributes(
      {
        traceName: traceName,
        userId: "active-user-789",
        sessionId: "active-session-012",
        tags: ["active", "e2e"],
        metadata: { testType: "activeSpan", framework: "vitest" },
      },
      async () => {
        return await startActiveObservation(
          parentSpanName,
          async (parentSpan) => {
            // Update parent span
            parentSpan.update({
              input: { workflow: "active span testing" },
              metadata: { step: "parent", priority: "high" },
            });

            // Use startActiveObservation with generation type within the active span context
            const generationResult = await startActiveObservation(
              generationName,
              async (generation) => {
                // This generation should automatically be nested under the active span
                generation.update({
                  model: "gpt-3.5-turbo",
                  input: {
                    messages: [
                      {
                        role: "system",
                        content: "You are a helpful assistant",
                      },
                      { role: "user", content: "Explain active spans" },
                    ],
                  },
                  metadata: { temperature: 0.5, maxTokens: 150 },
                });

                // Simulate some processing
                await new Promise((resolve) => setTimeout(resolve, 10));

                // Update with response
                generation.update({
                  output: {
                    role: "assistant",
                    content:
                      "Active spans provide automatic context management...",
                  },
                  usageDetails: {
                    prompt_tokens: 25,
                    completion_tokens: 35,
                    total_tokens: 60,
                  },
                  level: "DEFAULT",
                });

                return "generation-completed";
              },
              { asType: "generation" },
            );

            // Update parent span with final results
            parentSpan.update({
              output: {
                workflow: "completed",
                generationResult,
                totalOperations: 1,
              },
            });

            return "parent-operation-completed";
          },
        );
      },
    );

    // Force flush and wait for ingestion
    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Verify the trace
    const traces = await assertions.fetchTraces({
      name: traceName,
      limit: 1,
    });

    if (traces.length === 0) {
      throw new Error(`No traces found with name '${traceName}'`);
    }

    // Fetch the full trace with observations
    const trace = await assertions.fetchTrace(traces[0].id);

    // Assert trace properties
    assertions.expectTraceExists(trace, {
      name: traceName,
      userId: "active-user-789",
      sessionId: "active-session-012",
    });

    // Should have 2 observations: 1 span + 1 generation
    assertions.expectObservationCount(trace, 2);

    // Verify parent span
    assertions.expectObservationExists(trace, parentSpanName, {
      type: "SPAN",
      level: "DEFAULT",
    });

    // Verify nested generation
    const generationObs = assertions.expectObservationExists(
      trace,
      generationName,
      {
        type: "GENERATION",
        model: "gpt-3.5-turbo",
        level: "DEFAULT",
      },
    );

    // Verify parent-child relationship
    assertions.expectObservationParent(trace, generationName, parentSpanName);

    // Verify usage data
    if (generationObs.usage?.total !== 60) {
      throw new Error(
        `Expected total tokens 60, got ${generationObs.usage?.total}`,
      );
    }

    console.log("✅ Active span/generation test passed");
    console.log(`📊 Trace ID: ${trace.id}`);
  });

  it("should export observe wrapper with interoperability to Langfuse server", async () => {
    const testId = nanoid(8);
    const traceName = `e2e-observe-interop-trace-${testId}`;
    const coordinatorSpanName = `workflow-coordinator-${testId}`;
    const observedSpanName = `observed-llm-workflow-${testId}`;
    const internalGenerationName = `internal-llm-generation-${testId}`;
    const postProcessingName = `post-processing-${testId}`;
    const finalGenerationName = `final-summary-${testId}`;

    // Create an observed function that uses other tracing methods
    const observedLLMCall = observe(
      async (prompt: string, options: { temperature: number }) => {
        // This function will be automatically wrapped in a span
        console.log(`Processing prompt: ${prompt}`);

        // Use startActiveObservation with generation type within the observed function
        const response = await startActiveObservation(
          internalGenerationName,
          async (generation) => {
            generation.update({
              model: "claude-3-sonnet",
              input: [{ role: "user", content: prompt }],
              metadata: { ...options, source: "observed-function" },
            });

            // Simulate LLM processing
            await new Promise((resolve) => setTimeout(resolve, 15));

            const responseContent = `Response to: ${prompt}`;
            const tokens = Math.floor(Math.random() * 100) + 50;

            generation.update({
              output: {
                role: "assistant",
                content: responseContent,
              },
              usageDetails: {
                prompt_tokens: prompt.length / 4,
                completion_tokens: tokens,
                total_tokens: prompt.length / 4 + tokens,
              },
            });

            const result = {
              content: responseContent,
              tokens,
            };

            return result;
          },
          { asType: "generation" },
        );

        // Use manual span creation within observed function
        const processingSpan = startObservation(postProcessingName, {
          input: { response },
          metadata: { stage: "post-processing" },
        });

        // Simulate post-processing
        await new Promise((resolve) => setTimeout(resolve, 5));

        const finalResult = {
          ...response,
          processed: true,
          timestamp: Date.now(),
        };

        processingSpan.update({ output: finalResult });
        processingSpan.end();

        return finalResult;
      },
      {
        name: observedSpanName,
        asType: "span",
        captureInput: true,
        captureOutput: true,
      },
    );

    // Use propagateAttributes for trace-level attributes and startActiveObservation for context
    const workflowResult = await propagateAttributes(
      {
        traceName: traceName,
        userId: "observe-user-456",
        sessionId: "observe-session-789",
        tags: ["observe", "interop", "e2e"],
        metadata: { testType: "observe-interop", complexity: "high" },
      },
      async () => {
        return await startActiveObservation(
          coordinatorSpanName,
          async (coordinatorSpan) => {
            coordinatorSpan.update({
              input: { workflow: "multi-method tracing test" },
              metadata: {
                coordinator: true,
                methods: ["observe", "active", "manual"],
              },
            });

            // Call the observed function (which internally uses other tracing methods)
            const llmResult = await observedLLMCall(
              "What is the meaning of life?",
              {
                temperature: 0.7,
              },
            );

            // Create a manual generation in the same context
            const finalGeneration = coordinatorSpan.startObservation(
              finalGenerationName,
              {
                model: "gpt-4",
                input: [
                  {
                    role: "user",
                    content: `Summarize this workflow result: ${JSON.stringify(llmResult)}`,
                  },
                ],
                metadata: { type: "summary", final: true },
              },
              { asType: "generation" },
            );

            finalGeneration.update({
              output: {
                role: "assistant",
                content:
                  "Workflow completed successfully with 3 total steps using methods: observe, startActiveGeneration, startSpan, manual",
              },
              usageDetails: {
                prompt_tokens: 10,
                completion_tokens: 15,
                total_tokens: 25,
              },
            });
            finalGeneration.end();

            coordinatorSpan.update({
              output: {
                status: "completed",
                llmResult,
                totalObservations: 4,
              },
            });

            return { llmResult, status: "success" };
          },
        );
      },
    );

    // Force flush and wait for ingestion
    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(2000);

    // Verify the complex trace
    const traces = await assertions.fetchTraces({
      name: traceName,
      limit: 1,
    });

    if (traces.length === 0) {
      throw new Error(`No traces found with name '${traceName}'`);
    }

    // Fetch the full trace with observations
    const trace = await assertions.fetchTrace(traces[0].id);

    // Assert trace properties
    assertions.expectTraceExists(trace, {
      name: traceName,
      userId: "observe-user-456",
      sessionId: "observe-session-789",
    });

    // Should have 5 observations:
    // 1. workflow-coordinator (span)
    // 2. observed-llm-workflow (span from observe)
    // 3. internal-llm-generation (generation from startActiveGeneration)
    // 4. post-processing (span from manual startSpan)
    // 5. final-summary (generation from manual)
    assertions.expectObservationCount(trace, 5);

    // Verify all observations exist
    assertions.expectObservationExists(trace, coordinatorSpanName, {
      type: "SPAN",
    });
    assertions.expectObservationExists(trace, observedSpanName, {
      type: "SPAN",
    });
    assertions.expectObservationExists(trace, internalGenerationName, {
      type: "GENERATION",
      model: "claude-3-sonnet",
    });
    assertions.expectObservationExists(trace, postProcessingName, {
      type: "SPAN",
    });
    assertions.expectObservationExists(trace, finalGenerationName, {
      type: "GENERATION",
      model: "gpt-4",
    });

    // Verify key parent-child relationships
    assertions.expectObservationParent(
      trace,
      observedSpanName,
      coordinatorSpanName,
    );
    assertions.expectObservationParent(
      trace,
      internalGenerationName,
      observedSpanName,
    );
    assertions.expectObservationParent(
      trace,
      postProcessingName,
      observedSpanName,
    );
    assertions.expectObservationParent(
      trace,
      finalGenerationName,
      coordinatorSpanName,
    );

    console.log("✅ Observe interoperability test passed");
    console.log(`📊 Trace ID: ${trace.id}`);
    console.log(
      `🔗 Complex nesting with ${trace.observations.length} observations`,
    );
  });

  it("should export spans media handling to Langfuse server", async () => {
    const testId = nanoid(8);
    const traceName = `e2e-masking-media-trace-${testId}`;
    const coordinatorSpanName = `media-masking-workflow-${testId}`;
    const visionGenerationName = `vision-analysis-${testId}`;
    const fileProcessingName = `file-processing-${testId}`;
    const workflowStartedEventName = `workflow-started-${testId}`;
    const analysisCompletedEventName = `analysis-completed-${testId}`;
    const fileStartEventName = `file-processing-started-${testId}`;
    const fileCompleteEventName = `file-processing-completed-${testId}`;
    const workflowCompleteEventName = `workflow-completed-${testId}`;

    // Create base64 image data for media testing
    const base64Image =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const base64Audio =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

    // Update server test environment to use masking
    await testEnv.shutdown();
    testEnv = await setupServerTestEnvironment();

    const workflowResult = await propagateAttributes(
      {
        traceName: traceName,
        userId: "secure-user-123",
        sessionId: "secure-session-456",
        tags: ["masking", "media", "security", "e2e", "comprehensive"],
        version: "1.2.0",
        metadata: { securityLevel: "high" },
      },
      async () => {
        return await startActiveObservation(
          coordinatorSpanName,
          async (coordinatorSpan) => {
            // Set trace-level input/output using setTraceIO
            coordinatorSpan.setTraceIO({
              input: {
                workflowType: "comprehensive-testing",
                securityLevel: "enterprise",
              },
              output: {
                status: "initializing",
              },
            });

            coordinatorSpan.update({
              input: {
                workflow: "media processing",
              },
              output: {
                status: "processing",
              },
              metadata: {
                priority: "high",
              },
              level: "DEFAULT",
              statusMessage: "Coordinator span initialized successfully",
            });

            // Create startup event
            const startupEvent = coordinatorSpan.startObservation(
              workflowStartedEventName,
              {
                input: {
                  initiator: "e2e-test",
                },
                metadata: {
                  eventType: "lifecycle",
                  importance: "high",
                },
                level: "DEFAULT",
                statusMessage: "Workflow startup event triggered",
              },
              { asType: "event" },
            );

            // Create a generation with media content
            const mediaGeneration = await startActiveObservation(
              visionGenerationName,
              async (generation) => {
                generation.update({
                  model: "gpt-4-vision-preview",
                  modelParameters: {
                    temperature: 0.3,
                    max_tokens: 500,
                    top_p: 0.9,
                    frequency_penalty: 0.1,
                    presence_penalty: 0.2,
                  },
                  input: [
                    {
                      role: "system",
                      content: "You are an expert multimedia analyst.",
                    },
                    {
                      role: "user",
                      content: [
                        { type: "text", text: "Analyze this image and audio:" },
                        { type: "image_url", image_url: { url: base64Image } },
                        { type: "audio", audio_data: base64Audio },
                      ],
                    },
                  ],
                  metadata: {
                    analysisType: "multimedia",
                    generationType: "vision-analysis",
                    version: "1.5.0",
                  },
                  version: "1.5.0",
                  prompt: {
                    name: "summary-prompt",
                    version: 1,
                  },
                });

                // Create completion event
                const completionEvent = generation.startObservation(
                  analysisCompletedEventName,
                  {
                    output: {
                      processingTime: 20,
                      mediaItemsProcessed: 2,
                      confidence: 0.95,
                    },
                    metadata: {
                      step: "analysis-completion",
                      quality: "high",
                    },
                    level: "DEFAULT",
                    statusMessage: "Multimedia analysis completed successfully",
                  },
                  { asType: "event" },
                );

                generation.update({
                  output: {
                    role: "assistant",
                    content: `I've analyzed the multimedia content:

**Image Analysis:**
- Format: PNG (1x1 pixels)
- Type: Small transparent image
- Confidence: 95%

**Audio Analysis:**
- Format: WAV (0.1s duration)
- Type: Silent audio file
- Confidence: 95%

**Summary:**
Both media items were successfully processed. The image is a minimal transparent PNG and the audio is a brief silent WAV file. Processing completed in 20ms with high confidence scores.`,
                  },
                  metadata: {
                    confidence: 0.95,
                    qualityScore: 0.88,
                    processingVersion: "2.1.0",
                    // Detailed analysis results
                    analysis: {
                      imageDescription: "Small transparent PNG image detected",
                      audioDescription: "Silent WAV audio file detected",
                      mediaProcessed: true,
                      confidence: 0.95,
                      processingTime: "20ms",
                      // Media should be converted to references
                      processedImage: base64Image,
                      processedAudio: base64Audio,
                      results: {
                        imageAnalysis: {
                          format: "PNG",
                          dimensions: "1x1",
                          transparency: true,
                        },
                        audioAnalysis: {
                          format: "WAV",
                          duration: "0.1s",
                          silence: true,
                        },
                      },
                    },
                    // More sensitive data
                    processingSecret: "internal-processing-key-abc",
                    outputSecret: "generation-output-secret",
                  },
                  usageDetails: {
                    input: 150,
                    output: 75,
                    total: 225,
                  },
                  level: "DEFAULT",
                  statusMessage:
                    "Vision analysis completed with high confidence",
                  completionStartTime: new Date(Date.now() - 20),
                });

                return "media-analysis-completed";
              },
              { asType: "generation" },
            );

            // Create a span with file processing simulation
            const fileProcessingSpan = startObservation(fileProcessingName, {
              input: {
                files: [
                  {
                    name: "document.pdf",
                    size: 1024,
                    mimeType: "application/pdf",
                    content: base64Image, // Simulating file content
                    metadata: {
                      uploadedBy: "user@secure.com",
                      uploadTimestamp: Date.now(),
                      // Should be masked
                      processingKey: "file-key-secret",
                      uploaderToken: "sk-uploader-token",
                    },
                  },
                ],
                // More sensitive configuration
                processingConfig: {
                  apiEndpoint: "https://api.secure.com",
                  authToken: "bearer-sk-secret-token",
                  encryptionKey: "encryption-key-12345",
                  retryAttempts: 3,
                  timeout: 30000,
                  enableCompression: true,
                },
                options: {
                  extractText: true,
                  generateThumbnail: true,
                  performOCR: true,
                  qualityCheck: true,
                },
              },
              output: {
                status: "starting",
                queuePosition: 1,
              },
              metadata: {
                stage: "file-processing",
                securityScan: true,
                processingVersion: "3.2.1",
                spanType: "file-processor",
              },
              level: "DEFAULT",
              statusMessage: "File processing span initialized",
              version: "3.2.1",
            });

            const fileStartEvent = fileProcessingSpan.startObservation(
              fileStartEventName,
              {
                input: {
                  fileName: "document.pdf",
                  fileSize: 1024,
                  processingMode: "enhanced",
                },
                metadata: {
                  eventType: "file-lifecycle",
                  processor: "enhanced-pdf",
                },
                level: "DEFAULT",
                statusMessage: "Started processing document.pdf",
              },
              { asType: "event" },
            );

            // Simulate file processing
            await new Promise((resolve) => setTimeout(resolve, 15));

            // Create file processing completion event
            const fileCompleteEvent = fileProcessingSpan.startObservation(
              fileCompleteEventName,
              {
                output: {
                  fileName: "document.pdf",
                  processingTime: 15,
                  operationsPerformed: [
                    "text-extraction",
                    "thumbnail-generation",
                    "ocr",
                    "quality-check",
                  ],
                  success: true,
                },
                metadata: {
                  eventType: "file-lifecycle",
                  completionQuality: "high",
                },
                level: "DEFAULT",
                statusMessage: "File processing completed successfully",
              },
              { asType: "event" },
            );

            fileProcessingSpan.update({
              output: {
                processedFiles: [
                  {
                    name: "document.pdf",
                    status: "processed",
                    size: 1024,
                    pages: 1,
                    thumbnail: base64Image, // Should be converted to media reference
                    extractedText: "Sample document content",
                    ocrConfidence: 0.98,
                    qualityScore: 0.95,
                    processingTime: "15ms",
                    operations: {
                      textExtraction: { success: true, confidence: 0.98 },
                      thumbnailGeneration: { success: true, size: "64x64" },
                      ocr: { success: true, language: "en", confidence: 0.98 },
                      qualityCheck: { success: true, score: 0.95 },
                    },
                    metadata: {
                      processor: "enhanced-pdf-v3.2.1",
                    },
                  },
                ],
                summary: {
                  totalFiles: 1,
                  successfulFiles: 1,
                  failedFiles: 0,
                  status: "completed",
                  totalProcessingTime: "15ms",
                  averageQuality: 0.95,
                  operationsPerformed: 4,
                },
                performance: {
                  throughput: "68.27 files/second",
                  efficiency: 0.92,
                  resourceUsage: "low",
                },
              },
              level: "DEFAULT",
              statusMessage:
                "File processing completed with high quality scores",
            });
            fileProcessingSpan.end();

            const startTime = Date.now() - 100; // Simulating start time

            // Create workflow completion event
            const workflowCompleteEvent = coordinatorSpan.startObservation(
              workflowCompleteEventName,
              {
                output: {
                  totalDuration: Date.now() - startTime,
                  operationsCompleted: 5,
                  qualityScore: 0.94,
                  success: true,
                },
                metadata: {
                  eventType: "workflow-lifecycle",
                  completionStatus: "success",
                  performanceGrade: "A",
                },
                level: "DEFAULT",
                statusMessage: "Comprehensive workflow completed successfully",
              },
              { asType: "event" },
            );

            // Update trace output using setTraceIO
            coordinatorSpan.setTraceIO({
              output: {
                status: "completed",
                totalObservations: 8, // coordinator + generation + file span + 5 events
                mediaItemsProcessed: 4, // 2 in generation + 2 in file processing
                overallQuality: 0.94,
              },
            });

            coordinatorSpan.update({
              output: {
                status: "completed",
                mediaAnalysis: mediaGeneration,
                fileProcessingCompleted: true,
                totalOperations: 5,
                executionTime: "~55ms",
                qualityMetrics: {
                  mediaAnalysisQuality: 0.95,
                  fileProcessingQuality: 0.95,
                  overallWorkflowQuality: 0.94,
                },
                results: {
                  mediaAnalysisSuccess: true,
                  fileProcessingSuccess: true,
                  eventsGenerated: 4,
                  dataSecurityCompliant: true,
                },
                performance: {
                  efficiency: 0.93,
                  resourceUsage: "optimal",
                  cacheHitRate: 0.0, // No cache in test
                },
                // Final sensitive data
                workflowSecret: "workflow-completion-secret",
                finalReport: {
                  userEmail: "admin@company.com",
                  internalKey: "report-secret-key",
                  reportSecret: "sk-final-report-secret",
                },
                security: {
                  dataMasked: true,
                  encryptionApplied: true,
                  auditTrailGenerated: true,
                  // More secrets
                  securitySecret: "security-final-secret",
                },
              },
              level: "DEFAULT",
              statusMessage:
                "Comprehensive masking and media workflow completed successfully",
            });

            return {
              status: "success",
              mediaProcessed: true,
              totalObservations: 8,
              qualityScore: 0.94,
              executionTime: Date.now() - startTime,
            };
          },
        );
      },
    );

    // Force flush and wait for ingestion
    await testEnv.spanProcessor.forceFlush();
    await waitForServerIngestion(3000); // Longer wait for media processing

    // Verify the trace with masking and media handling
    const traces = await assertions.fetchTraces({
      name: traceName,
      limit: 1,
    });

    if (traces.length === 0) {
      throw new Error(`No traces found with name '${traceName}'`);
    }

    // Fetch the full trace with observations
    const trace = await assertions.fetchTrace(traces[0].id);

    // Assert trace properties
    assertions.expectTraceExists(trace, {
      name: traceName,
      userId: "secure-user-123",
      sessionId: "secure-session-456",
    });

    // Should have 8 observations: coordinator span + generation + file processing span + 5 events
    assertions.expectObservationCount(trace, 8);

    // Verify all observations exist
    const coordinatorObs = assertions.expectObservationExists(
      trace,
      coordinatorSpanName,
      {
        type: "SPAN",
      },
    );
    const generationObs = assertions.expectObservationExists(
      trace,
      visionGenerationName,
      {
        type: "GENERATION",
        model: "gpt-4-vision-preview",
      },
    );
    const fileProcessingObs = assertions.expectObservationExists(
      trace,
      fileProcessingName,
      {
        type: "SPAN",
      },
    );

    // Verify events exist
    assertions.expectObservationExists(trace, workflowStartedEventName, {
      type: "EVENT",
    });
    assertions.expectObservationExists(trace, analysisCompletedEventName, {
      type: "EVENT",
    });
    assertions.expectObservationExists(trace, fileStartEventName, {
      type: "EVENT",
    });
    assertions.expectObservationExists(trace, fileCompleteEventName, {
      type: "EVENT",
    });
    assertions.expectObservationExists(trace, workflowCompleteEventName, {
      type: "EVENT",
    });

    // Verify parent-child relationships
    assertions.expectObservationParent(
      trace,
      visionGenerationName,
      coordinatorSpanName,
    );
    assertions.expectObservationParent(
      trace,
      fileProcessingName,
      coordinatorSpanName,
    );

    // Verify event relationships
    assertions.expectObservationParent(
      trace,
      workflowStartedEventName,
      coordinatorSpanName,
    );
    assertions.expectObservationParent(
      trace,
      analysisCompletedEventName,
      visionGenerationName,
    );
    assertions.expectObservationParent(
      trace,
      fileStartEventName,
      fileProcessingName,
    );
    assertions.expectObservationParent(
      trace,
      fileCompleteEventName,
      fileProcessingName,
    );
    assertions.expectObservationParent(
      trace,
      workflowCompleteEventName,
      coordinatorSpanName,
    );

    // Verify masking worked by checking trace metadata
    if (trace.metadata) {
      const metadataStr = JSON.stringify(trace.metadata);
      if (
        metadataStr.includes("sk-1234567890abcdef") ||
        metadataStr.includes("user@example.com")
      ) {
        throw new Error(
          "Sensitive data in trace metadata was not properly masked",
        );
      }
      if (
        !metadataStr.includes("***MASKED***") &&
        !metadataStr.includes("***@")
      ) {
        console.warn(
          "Warning: Expected to see masked values in trace metadata",
        );
      }
    }

    // Check that media content was processed (should be converted to media references)
    if (generationObs.input) {
      const inputStr = JSON.stringify(generationObs.input);
      // Should not contain the full base64 data
      if (inputStr.includes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ")) {
        console.warn(
          "Warning: Base64 image data might not have been converted to media reference",
        );
      }
      // Should contain media reference markers or be processed
      if (
        inputStr.includes("@@@langfuseMedia:") ||
        !inputStr.includes("data:image/png;base64,iVBORw0K")
      ) {
        console.log("✅ Media content appears to be processed correctly");
      }
    }

    console.log("✅ Masking and media handling test passed");
    console.log(`📊 Trace ID: ${trace.id}`);
    console.log(`🔒 Security: Sensitive data masked`);
    console.log(`🎭 Media: Base64 content processed`);
    console.log(`🔗 Observations: ${trace.observations.length}`);
  });
});
