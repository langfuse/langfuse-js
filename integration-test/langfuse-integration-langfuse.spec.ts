// uses the compiled node.js version, run yarn build after making changes to the SDKs

import { Langfuse } from "../langfuse-langchain";

import { getKeys } from "./integration-utils";

describe("Langfuse Langchain", () => {
  describe("core", () => {
    it("exports the Langfuse SDK", () => {
      const langfuse = new Langfuse(getKeys());
      expect(langfuse).toBeInstanceOf(Langfuse);
    });
  });
});
