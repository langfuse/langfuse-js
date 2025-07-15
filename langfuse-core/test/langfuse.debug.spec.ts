import {
  createTestClient,
  type LangfuseCoreTestClient,
  type LangfuseCoreTestClientMocks,
} from "./test-utils/LangfuseCoreTestClient";

describe("Langfuse Core", () => {
  let langfuse: LangfuseCoreTestClient;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let mocks: LangfuseCoreTestClientMocks;

  beforeEach(() => {
    [langfuse, mocks] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });
  });

  describe("debug", () => {
    it("should log emitted events when enabled", async () => {
      const spy = jest.spyOn(console, "log");

      langfuse.trace({ name: "test-trace1" });
      expect(spy).toHaveBeenCalledTimes(0);

      langfuse.debug();
      langfuse.trace({ name: "test-trace2" });
      await jest.advanceTimersByTimeAsync(1);
      expect(spy).toHaveBeenCalledTimes(4);
      expect(spy).toHaveBeenCalledWith("[Langfuse Debug]", "trace-create", expect.stringContaining("test-trace2"));
      expect(spy).toHaveBeenCalledWith("[Langfuse Debug]", "flush", expect.stringContaining("test-trace2"));

      spy.mockReset();
      langfuse.debug(false);
      langfuse.trace({ name: "test-trace3" });
      await jest.advanceTimersByTimeAsync(1);

      expect(spy).toHaveBeenCalledTimes(0);
    });
  });
});
