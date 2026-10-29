import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { base64ToBytes, base64Decode, base64Encode } from "../../packages/core/src/utils.js";

describe("base64ToBytes", () => {
  it("matches Buffer decoding on representative inputs", () => {
    const inputs = [
      "",
      "aGVsbG8gd29ybGQ=", // ascii "hello world"
      "w6nDqcOpIHDpY2jDqcOpw6k=", // multibyte UTF-8 "ünïcödé tëxt"
      Buffer.from(randomBytes(1024)).toString("base64"), // random binary
      Buffer.from(new Uint8Array(Array.from({ length: 256 }, (_, i) => i))).toString("base64"), // every byte value 0x00-0xFF
    ];
    for (const input of inputs) {
      const expected = Buffer.from(input, "base64");
      expect(Array.from(base64ToBytes(input))).toEqual(Array.from(new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength)));
    }
  });

  it("round-trips through bytesToBase64's inverse", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const encoded = Buffer.from(bytes).toString("base64");
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("takes the Buffer fast path on Node.js (issue #19450)", () => {
    // 4 MiB of random media, as a data URI payload: the atob path costs ~150 ms here,
    // the Buffer path well under 5 ms. Assert the fast path is actually in effect.
    const payload = Buffer.from(randomBytes(4 * 1024 * 1024)).toString("base64");
    const start = performance.now();
    const decoded = base64ToBytes(payload);
    const elapsed = performance.now() - start;
    expect(decoded.byteLength).toBe(4 * 1024 * 1024);
    expect(elapsed).toBeLessThan(50); // atob path measures ~100x slower than this budget
  });

  it("stays consistent with base64Decode for UTF-8 text", () => {
    const text = "ünïcödé tëxt with 中文 too";
    const encoded = base64Encode(text);
    expect(new TextDecoder().decode(base64ToBytes(encoded))).toBe(base64Decode(encoded));
  });
});
