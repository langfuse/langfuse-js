import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  base64Decode,
  base64Encode,
  base64ToBytes,
} from "../../packages/core/src/utils.js";

describe("base64ToBytes", () => {
  it("preserves every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const encoded = Buffer.from(bytes).toString("base64");

    expect(base64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips the actual package README", () => {
    const bytes = readFileSync("packages/core/README.md");

    expect(base64ToBytes(bytes.toString("base64"))).toEqual(
      new Uint8Array(bytes),
    );
  });

  it("keeps decoded results independent across calls", () => {
    const encoded = base64Encode("independent results");
    const first = base64ToBytes(encoded);
    const second = base64ToBytes(encoded);
    first[0] = 0;

    expect(new TextDecoder().decode(second)).toBe("independent results");
  });

  it.each([
    "aGVsbG8=AAAA",
    "abc$",
    "abc!",
    "a",
    "hello",
    "ab=c",
    "abc==",
    "ab-_",
    "ab\u0000c",
    "ab\u000bc",
    "ab\u00a0c",
    "ab\ud800c",
  ])("rejects malformed input %j with the native decoding error", (input) => {
    expect(() => atob(input)).toThrowError();
    expect(() => base64ToBytes(input)).toThrowError(
      expect.objectContaining({ name: "InvalidCharacterError" }),
    );
  });

  it.each([
    "",
    "aGVsbG8=",
    "ab==",
    "abc",
    "aGVsbG8",
    "aGVsbG8gd29ybGQ=",
    "a b\nc",
    " aGVsbG8= ",
    "a\tb\nc\r\f",
  ])("matches native decoding for valid input %j", (input) => {
    expect(base64ToBytes(input)).toEqual(
      new Uint8Array(Buffer.from(atob(input), "latin1")),
    );
  });

  it("stays consistent with base64Decode for UTF-8 text", () => {
    const text = "ünïcödé tëxt with 中文 too";
    const encoded = base64Encode(text);

    expect(new TextDecoder().decode(base64ToBytes(encoded))).toBe(
      base64Decode(encoded),
    );
  });
});
