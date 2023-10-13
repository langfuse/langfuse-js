// uses the compiled node.js version, run yarn build after making changes to the SDKs

import { Langfuse } from "../langfuse-langchain";

const LF_HOST = process.env.LF_HOST ?? "http://localhost:3000";
const LF_PUBLIC_KEY = process.env.LF_PUBLIC_KEY ?? "pk-lf-1234567890";
const LF_SECRET_KEY = process.env.LF_SECRET_KEY ?? "sk-lf-1234567890";

describe("Langfuse Langchain", () => {
  describe("core", () => {
    it("exports the Langfuse SDK", () => {
      const langfuse = new Langfuse({
        publicKey: LF_PUBLIC_KEY,
        secretKey: LF_SECRET_KEY,
        baseUrl: LF_HOST,
      });
      expect(langfuse).toBeInstanceOf(Langfuse);
    });

    // it("exports the callback handler", async () => {
    //   const callbackHandler = new CallbackHandler({
    //     publicKey: LF_PUBLIC_KEY,
    //     secretKey: LF_SECRET_KEY,
    //     baseUrl: LF_HOST,
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
