import {
  startObservation,
  startActiveObservation,
  observe,
  propagateAttributes,
} from "@langfuse/tracing";
import { nanoid } from "nanoid";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ServerAssertions, parseIO } from "./helpers/serverAssertions.js";
import {
  setupServerTestEnvironment,
  teardownServerTestEnvironment,
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

    const observations = await assertions.waitForObservations(
      parentSpan.traceId,
      { count: 2 },
    );

    // Assert we have 2 observations (1 span + 1 generation)
    expect(observations).toHaveLength(2);

    // Trace-level attributes are propagated onto every observation
    for (const observation of observations) {
      expect(observation).toMatchObject({
        traceName,
        userId: "test-user-123",
        sessionId: "test-session-456",
      });
      expect(observation.tags).toEqual(expect.arrayContaining(["e2e", "test"]));
    }

    // Assert parent span exists with correct properties
    assertions.expectObservation(observations, parentSpanName, {
      type: "SPAN",
      level: "DEFAULT",
    });

    // Assert nested generation exists with correct properties
    const generationObservation = assertions.expectObservation(
      observations,
      generationName,
      {
        type: "GENERATION",
        model: "gpt-4",
        level: "DEFAULT",
        public: true,
      },
    );

    // Assert parent-child relationship
    assertions.expectObservationParent(
      observations,
      generationName,
      parentSpanName,
    );

    // Assert generation has usage data
    expect(generationObservation.usageDetails?.total).toBe(40);
  });

  it("should export startActiveObservation with nested startActiveObservation generation to Langfuse server", async () => {
    const testId = nanoid(8);
    const traceName = `e2e-active-span-trace-${testId}`;
    const parentSpanName = `active-parent-operation-${testId}`;
    const generationName = `nested-active-generation-${testId}`;
    let traceId = "";

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
            traceId = parentSpan.traceId;

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

    expect(result).toBe("parent-operation-completed");

    // Force flush and wait for ingestion
    await testEnv.spanProcessor.forceFlush();

    const observations = await assertions.waitForObservations(traceId, {
      count: 2,
    });

    // Should have 2 observations: 1 span + 1 generation
    expect(observations).toHaveLength(2);

    // Verify parent span, which also carries the root input/output
    const parentObs = assertions.expectObservation(
      observations,
      parentSpanName,
      {
        type: "SPAN",
        level: "DEFAULT",
        traceName,
        userId: "active-user-789",
        sessionId: "active-session-012",
      },
    );
    expect(assertions.getRootObservation(observations).id).toBe(parentObs.id);
    expect(parseIO(parentObs.input)).toEqual({
      workflow: "active span testing",
    });
    expect(parseIO(parentObs.output)).toMatchObject({
      workflow: "completed",
      generationResult: "generation-completed",
    });

    // Verify nested generation
    const generationObs = assertions.expectObservation(
      observations,
      generationName,
      {
        type: "GENERATION",
        model: "gpt-3.5-turbo",
        level: "DEFAULT",
      },
    );

    // Verify parent-child relationship
    assertions.expectObservationParent(
      observations,
      generationName,
      parentSpanName,
    );

    // Verify usage data
    expect(generationObs.usageDetails?.total).toBe(60);
  });

  it("should export observe wrapper with interoperability to Langfuse server", async () => {
    const testId = nanoid(8);
    const traceName = `e2e-observe-interop-trace-${testId}`;
    const coordinatorSpanName = `workflow-coordinator-${testId}`;
    const observedSpanName = `observed-llm-workflow-${testId}`;
    const internalGenerationName = `internal-llm-generation-${testId}`;
    const postProcessingName = `post-processing-${testId}`;
    const finalGenerationName = `final-summary-${testId}`;
    let traceId = "";

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
            traceId = coordinatorSpan.traceId;

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

    expect(workflowResult.status).toBe("success");

    // Force flush and wait for ingestion
    await testEnv.spanProcessor.forceFlush();

    // Should have 5 observations:
    // 1. workflow-coordinator (span)
    // 2. observed-llm-workflow (span from observe)
    // 3. internal-llm-generation (generation from startActiveGeneration)
    // 4. post-processing (span from manual startSpan)
    // 5. final-summary (generation from manual)
    const observations = await assertions.waitForObservations(traceId, {
      count: 5,
    });
    expect(observations).toHaveLength(5);

    // Verify all observations exist
    assertions.expectObservation(observations, coordinatorSpanName, {
      type: "SPAN",
      traceName,
      userId: "observe-user-456",
      sessionId: "observe-session-789",
    });
    const observedObs = assertions.expectObservation(
      observations,
      observedSpanName,
      { type: "SPAN" },
    );
    assertions.expectObservation(observations, internalGenerationName, {
      type: "GENERATION",
      model: "claude-3-sonnet",
    });
    assertions.expectObservation(observations, postProcessingName, {
      type: "SPAN",
    });
    assertions.expectObservation(observations, finalGenerationName, {
      type: "GENERATION",
      model: "gpt-4",
    });

    // observe() captures the function arguments and return value
    expect(parseIO(observedObs.input)).toEqual([
      "What is the meaning of life?",
      { temperature: 0.7 },
    ]);
    expect(parseIO(observedObs.output)).toMatchObject({ processed: true });

    // Verify key parent-child relationships
    assertions.expectObservationParent(
      observations,
      observedSpanName,
      coordinatorSpanName,
    );
    assertions.expectObservationParent(
      observations,
      internalGenerationName,
      observedSpanName,
    );
    assertions.expectObservationParent(
      observations,
      postProcessingName,
      observedSpanName,
    );
    assertions.expectObservationParent(
      observations,
      finalGenerationName,
      coordinatorSpanName,
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
    let traceId = "";

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
            traceId = coordinatorSpan.traceId;

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

    expect(workflowResult.status).toBe("success");

    // Force flush and wait for ingestion
    await testEnv.spanProcessor.forceFlush();

    // Should have 8 observations: coordinator span + generation + file processing span + 5 events
    const observations = await assertions.waitForObservations(traceId, {
      count: 8,
    });
    expect(observations).toHaveLength(8);

    // Verify all observations exist
    const coordinatorObs = assertions.expectObservation(
      observations,
      coordinatorSpanName,
      {
        type: "SPAN",
        traceName,
        userId: "secure-user-123",
        sessionId: "secure-session-456",
        statusMessage:
          "Comprehensive masking and media workflow completed successfully",
      },
    );
    const generationObs = assertions.expectObservation(
      observations,
      visionGenerationName,
      {
        type: "GENERATION",
        model: "gpt-4-vision-preview",
        version: "1.5.0",
        promptName: "summary-prompt",
        promptVersion: 1,
      },
    );
    assertions.expectObservation(observations, fileProcessingName, {
      type: "SPAN",
      version: "3.2.1",
    });

    // The root observation carries the trace input/output
    expect(assertions.getRootObservation(observations).id).toBe(
      coordinatorObs.id,
    );
    expect(parseIO(coordinatorObs.input)).toEqual({
      workflow: "media processing",
    });
    expect(parseIO(coordinatorObs.output)).toMatchObject({
      status: "completed",
      fileProcessingCompleted: true,
    });

    // Verify events exist
    for (const eventName of [
      workflowStartedEventName,
      analysisCompletedEventName,
      fileStartEventName,
      fileCompleteEventName,
      workflowCompleteEventName,
    ]) {
      assertions.expectObservation(observations, eventName, { type: "EVENT" });
    }

    // Verify parent-child relationships
    const expectedParents: Array<[string, string]> = [
      [visionGenerationName, coordinatorSpanName],
      [fileProcessingName, coordinatorSpanName],
      [workflowStartedEventName, coordinatorSpanName],
      [analysisCompletedEventName, visionGenerationName],
      [fileStartEventName, fileProcessingName],
      [fileCompleteEventName, fileProcessingName],
      [workflowCompleteEventName, coordinatorSpanName],
    ];
    for (const [child, parent] of expectedParents) {
      assertions.expectObservationParent(observations, child, parent);
    }

    // Base64 media is uploaded and replaced with media references
    const generationInput = JSON.stringify(generationObs.input);
    expect(generationInput).toContain("@@@langfuseMedia:");
    expect(generationInput).not.toContain(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
    );
  });
});
