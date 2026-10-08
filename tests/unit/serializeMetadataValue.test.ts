import { describe, expect, it } from "vitest";

// Internal helper (not part of the public API)
import { serializeMetadataValue } from "../../packages/core/src/utils.js";

const FAILED = JSON.stringify("<failed to serialize>");

describe("serializeMetadataValue", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["function", () => "ignored"],
    ["symbol", Symbol("ignored")],
  ])("should return undefined for %s", (_, value) => {
    expect(serializeMetadataValue(value)).toBeUndefined();
  });

  it.each([
    ["string", "prod", '"prod"'],
    ["empty string", "", '""'],
    ["numeric string", "3", '"3"'],
    ["JSON string", '{"a":1}', '"{\\"a\\":1}"'],
    ["number", 3, "3"],
    ["zero", 0, "0"],
    ["float", -1.5, "-1.5"],
    ["true", true, "true"],
    ["false", false, "false"],
    [
      "object",
      { host: "localhost", port: 5432 },
      '{"host":"localhost","port":5432}',
    ],
    ["array", [1, "a", true], '[1,"a",true]'],
    ["empty object", {}, "{}"],
    ["empty array", [], "[]"],
  ])("should JSON-encode %s", (_, value, expected) => {
    const serialized = serializeMetadataValue(value);

    expect(serialized).toBe(expected);
    expect(JSON.parse(serialized!)).toStrictEqual(value);
  });

  it("should tell strings apart from numbers and objects", () => {
    expect(serializeMetadataValue("3")).not.toBe(serializeMetadataValue(3));
    expect(serializeMetadataValue('{"a":1}')).not.toBe(
      serializeMetadataValue({ a: 1 }),
    );
  });

  it("should JSON-encode non-finite numbers like JSON.stringify", () => {
    expect(serializeMetadataValue(NaN)).toBe("null");
    expect(serializeMetadataValue(Infinity)).toBe("null");
    expect(serializeMetadataValue(-Infinity)).toBe("null");
  });

  it("should JSON-encode dates", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");

    expect(serializeMetadataValue(date)).toBe('"2024-01-01T00:00:00.000Z"');
  });

  it("should return a JSON placeholder for circular references", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(serializeMetadataValue(circular)).toBe(FAILED);
  });

  it("should JSON-encode bigints in the JS-safe range as numbers", () => {
    expect(serializeMetadataValue(BigInt(10))).toBe("10");
    expect(serializeMetadataValue(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
      "9007199254740991",
    );
    expect(serializeMetadataValue(BigInt(Number.MIN_SAFE_INTEGER))).toBe(
      "-9007199254740991",
    );
    expect(serializeMetadataValue({ id: BigInt(-1) })).toBe('{"id":-1}');
  });

  it("should JSON-encode bigints outside the JS-safe range as strings of their decimal digits", () => {
    expect(serializeMetadataValue(BigInt("9007199254740992"))).toBe(
      '"9007199254740992"',
    );
    expect(serializeMetadataValue(BigInt("-9007199254740992"))).toBe(
      '"-9007199254740992"',
    );
    expect(serializeMetadataValue({ id: BigInt(2) ** BigInt(70) })).toBe(
      '{"id":"1180591620717411303424"}',
    );
  });

  it("should return undefined if toJSON returns undefined", () => {
    expect(serializeMetadataValue({ toJSON: () => undefined })).toBeUndefined();
  });
});
