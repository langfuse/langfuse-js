import { describe, expect, it, vi } from "vitest";
import { base64ToBytes, base64Decode, base64Encode } from "../../packages/core/src/utils.js";

function atobThrows(input: string): boolean {
  try {
    atob(input);
    return false;
  } catch {
    return true;
  }
}

describe("base64ToBytes", () => {
  it("matches Buffer decoding on representative inputs", () => {
    const inputs = [
      "",
      "aGVsbG8gd29ybGQ=", // ascii "hello world"
      "w6nDqcOpIHDpY2jDqcOpw6k=", // multibyte UTF-8
      Buffer.from(new Uint8Array(Array.from({ length: 256 }, (_, i) => i))).toString("base64"), // every byte value 0x00-0xFF
    ];
    for (const input of inputs) {
      const expected = Buffer.from(input, "base64");
      expect(Array.from(base64ToBytes(input))).toEqual(
        Array.from(new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength)),
      );
    }
  });

  it("round-trips through bytesToBase64's inverse", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const encoded = Buffer.from(bytes).toString("base64");
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("takes the Buffer fast path and avoids atob on Node.js", () => {
    // Deterministic path check (no wall-clock assertions): the fast path must go
    // through Buffer.from, never through the atob fallback.
    const atobSpy = vi.spyOn(globalThis, "atob");
    const bufferSpy = vi.spyOn(Buffer, "from");
    try {
      const encoded = Buffer.from("hello world", "utf8").toString("base64");
      expect(new TextDecoder().decode(base64ToBytes(encoded))).toBe("hello world");
      expect(atobSpy).not.toHaveBeenCalled();
      expect(bufferSpy).toHaveBeenCalledWith(encoded, "base64");
    } finally {
      atobSpy.mockRestore();
      bufferSpy.mockRestore();
    }
  });

  it("rejects malformed input exactly like atob (fast path must not be more lenient)", () => {
    // Buffer.from alone would silently truncate these; atob rejects all of them,
    // and LangfuseMedia.parseBase64DataUri relies on the throw to refuse bad media.
    const malformed = [
      "aGVsbG8=AAAA", // trailing content after padding
      "abc$", // non-alphabet character
      "abc!", // non-alphabet character
      "a", // length % 4 === 1
      "hello", // length % 4 === 1 with no padding
      "ab=c", // padding in the middle
      "abc==", // two pads after three data chars (needs 4-block alignment)
    ];
    for (const input of malformed) {
      expect(atobThrows(input), `atob rejects ${JSON.stringify(input)}`).toBe(true);
      expect(() => base64ToBytes(input), `base64ToBytes rejects ${JSON.stringify(input)}`).toThrowError();
    }
  });

  it("accepts exactly what atob accepts (whitespace, unpadded, padded)", () => {
    const valid = ["aGVsbG8=", "ab==", "abc", "aGVsbG8", "aGVsbG8gd29ybGQ=", "a b\nc", " aGVsbG8= "];
    for (const input of valid) {
      expect(atobThrows(input), `atob accepts ${JSON.stringify(input)}`).toBe(false);
      expect(() => base64ToBytes(input), `base64ToBytes accepts ${JSON.stringify(input)}`).not.toThrow();
    }
  });

  it("stays consistent with base64Decode for UTF-8 text", () => {
    const text = "ünïcödé tëxt with 中文 too";
    const encoded = base64Encode(text);
    expect(new TextDecoder().decode(base64ToBytes(encoded))).toBe(base64Decode(encoded));
  });
});
