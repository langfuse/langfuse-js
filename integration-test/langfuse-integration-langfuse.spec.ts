// uses the compiled node.js version, run yarn build after making changes to the SDKs

import { Langfuse } from "../langfuse-langchain";

const LANGFUSE_HOST = process.env.LANGFUSE_HOST ?? "http://localhost:3000";
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? "pk-lf-1234567890";
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? "sk-lf-1234567890";

describe("Langfuse Langchain", () => {
  describe("core", () => {
    it("exports the Langfuse SDK", () => {
      const langfuse = new Langfuse({
        publicKey: LANGFUSE_PUBLIC_KEY,
        secretKey: LANGFUSE_SECRET_KEY,
        baseUrl: LANGFUSE_HOST,
      });
      expect(langfuse).toBeInstanceOf(Langfuse);
    });

    // it("exports the callback handler", async () => {
    //   const callbackHandler = new CallbackHandler({
    //     publicKey: LANGFUSE_PUBLIC_KEY,
    //     secretKey: LANGFUSE_SECRET_KEY,
    //     baseUrl: LANGFUSE_HOST,
    //   });
    //   expect(callbackHandler).toBeInstanceOf(CallbackHandler);

    //   const llm = new OpenAI({
    //     openAIApiKey: "sk-...",
    //     streaming: true,
    //   });

    //   const res = await llm.call("Tell me a joke", undefined, [callbackHandler]);
    //   console.log(res);
    // });
  });
});
