import { createTestClient, type LangfuseCoreTestClient } from "./test-utils/LangfuseCoreTestClient";

describe("truncateEventBody", () => {
  let langfuse: LangfuseCoreTestClient;

  beforeEach(() => {
    [langfuse] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });
  });

  it("should return the original body if size is within limit", () => {
    const body = { input: "small input", output: "small output" };
    const result = (langfuse as any).truncateEventBody(body, 1000);

    expect(result).toEqual(body);
  });

  it("should truncate fields if body size exceeds limit", () => {
    const body = {
      input: "a".repeat(500),
      output: "b".repeat(500),
      metadata: { key: "value" },
    };
    const result = (langfuse as any).truncateEventBody(body, 500);
    expect(result.input).toBe("<truncated due to size exceeding limit>");
    expect(result.output).toBe("<truncated due to size exceeding limit>");
    expect(result.metadata).toEqual({ key: "value" });
  });

  it("should handle nested objects", () => {
    const body = {
      input: { nested: "a".repeat(500) },
      output: "b".repeat(500),
    };
    const result = (langfuse as any).truncateEventBody(body, 500);
    expect(result.input).toBe("<truncated due to size exceeding limit>");
    expect(result.output).toBe("<truncated due to size exceeding limit>");
  });

  it("should truncate largest fields first", () => {
    const body = {
      metadata: "c".repeat(200),
      input: "a".repeat(300),
      output: "b".repeat(400),
    };
    const result = (langfuse as any).truncateEventBody(body, 500);
    expect(result.output).toBe("<truncated due to size exceeding limit>");
    expect(result.input).toBe("<truncated due to size exceeding limit>");
    expect(result.metadata).toBe("c".repeat(200));
  });

  it("should handle non-object bodies", () => {
    const body = "not an object";
    const result = (langfuse as any).truncateEventBody(body as any, 1000);
    expect(result).toBe(body);
  });

  it("should handle null bodies", () => {
    const body = null;
    const result = (langfuse as any).truncateEventBody(body as any, 1000);
    expect(result).toBe(null);
  });

  it("should preserve non-truncated fields", () => {
    const body = {
      input: "a".repeat(500),
      output: "b".repeat(500),
      metadata: { key: "value" },
      extraField: "should remain",
    };
    const result = (langfuse as any).truncateEventBody(body, 500);
    expect(result.input).toBe("<truncated due to size exceeding limit>");
    expect(result.output).toBe("<truncated due to size exceeding limit>");
    expect(result.metadata).toEqual({ key: "value" });
    expect(result.extraField).toBe("should remain");
  });

  it("should handle bodies without truncatable fields", () => {
    const body = {
      field1: "a".repeat(300),
      field2: "b".repeat(300),
    };
    const result = (langfuse as any).truncateEventBody(body, 500);
    expect(result).toEqual(body);
  });
});

describe("getByteSize", () => {
  let langfuse: LangfuseCoreTestClient;

  beforeEach(() => {
    [langfuse] = createTestClient({
      publicKey: "pk-lf-111",
      secretKey: "sk-lf-111",
      flushAt: 1,
    });
  });

  it("should correctly calculate byte size of strings", () => {
    expect((langfuse as any).getByteSize("hello")).toBe(7);
    expect((langfuse as any).getByteSize("こんにちは")).toBe(17); // 3 bytes per character
  });

  it("should correctly calculate byte size of objects", () => {
    const obj = { key: "value" };
    expect((langfuse as any).getByteSize(obj)).toBe(15); // {"key":"value"}
  });

  it("should correctly calculate byte size of arrays", () => {
    const arr = [1, 2, 3];
    expect((langfuse as any).getByteSize(arr)).toBe(7); // [1,2,3]
  });

  it("should handle empty objects and arrays", () => {
    expect((langfuse as any).getByteSize({})).toBe(2);
    expect((langfuse as any).getByteSize([])).toBe(2);
  });

  it("should handle null and undefined", () => {
    expect((langfuse as any).getByteSize(null)).toBe(4);
    expect((langfuse as any).getByteSize(undefined)).toBe(0);
  });
});
