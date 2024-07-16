import type { LLMResult } from "@langchain/core/outputs";

import { parseBody } from "../../langfuse-core/test/test-utils/test-utils";
import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "../../langfuse-core/test/test-utils/LangfuseCoreTestClient";
import { CallbackHandler } from "../src/callback";

describe("Langfuse Langchain", () => {
  let langfuse: LangfuseCoreTestClient;
  let mocks: LangfuseCoreTestClientMocks;

  jest.useFakeTimers();

  beforeEach(() => {
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });
  });

  describe("end an LLM call", () => {
    it("should count Bedrock tokens", async () => {
      jest.setSystemTime(new Date("2024-01-01"));

      const callback = new CallbackHandler({
      });
      // @ts-expect-error
      callback.langfuse = langfuse;
      const output: LLMResult = {
        generations: [
          [
            {
              text: "Hello! I'm here to assist you with any non-specific tasks or general pleasantries. How can I help you today?",
              generationInfo: {
                type: "message",
                role: "assistant",
                model: "claude-3-haiku-20240307",
                stop_reason: "end_turn",
                stop_sequence: null,
                "amazon-bedrock-invocationMetrics": {
                  inputTokenCount: 335,
                  outputTokenCount: 30,
                  invocationLatency: 870,
                  firstByteLatency: 530,
                },
              },
            },
          ],
        ],
      };

      await callback.handleLLMEnd(output, "test-run-id");

        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        expect(parseBody(mocks.fetch.mock.calls[0])).toMatchObject({
          batch: [
            {
              id: expect.any(String),
              timestamp: expect.any(String),
              type: "generation-update",
              body: {
                endTime: new Date("2024-01-01").toISOString(),
                usage: {
                  input: 335,
                  output: 30,
                },
              },
            },
          ],
        });

    });
  });
});
