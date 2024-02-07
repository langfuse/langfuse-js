// uses the compiled node.js version, run yarn build after making changes to the SDKs

import { Langfuse } from "../langfuse-langchain";

describe("Langfuse Langchain", () => {
  describe("core", () => {
    it("exports the Langfuse SDK", () => {
      const langfuse = new Langfuse();
      expect(langfuse).toBeInstanceOf(Langfuse);
    });
  });
});
