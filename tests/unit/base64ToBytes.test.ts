import { base64ToBytes, bytesToBase64 } from "@langfuse/core";
import { describe, expect, it, vi } from "vitest";

function decodeWithoutBuffer(base64: string): Uint8Array {
  vi.stubGlobal("Buffer", undefined);
  try {
    return base64ToBytes(base64);
  } finally {
    vi.unstubAllGlobals();
  }
}

const allByteValues = Uint8Array.from({ length: 256 }, (_, i) => i);
const randomBytes = crypto.getRandomValues(new Uint8Array(4099));

const cases: Array<[string, string]> = [
  ["empty input", ""],
  ["two padding characters", "Zg=="],
  ["one padding character", "Zm8="],
  ["no padding", "Zm9v"],
  ["all byte values", bytesToBase64(allByteValues)],
  ["random bytes", bytesToBase64(randomBytes)],
];

describe("base64ToBytes", () => {
  it.each(cases)(
    "decodes %s to the same bytes with and without Buffer",
    (_, base64) => {
      const withBuffer = base64ToBytes(base64);
      const withoutBuffer = decodeWithoutBuffer(base64);

      expect(Object.getPrototypeOf(withBuffer)).toBe(Uint8Array.prototype);
      expect(Object.getPrototypeOf(withoutBuffer)).toBe(Uint8Array.prototype);
      expect(withBuffer).toEqual(withoutBuffer);
      expect(bytesToBase64(withBuffer)).toBe(base64);
    },
  );

  it("decodes to the original bytes", () => {
    expect(base64ToBytes("")).toEqual(new Uint8Array());
    expect(base64ToBytes("Zm9v")).toEqual(new Uint8Array([102, 111, 111]));
    expect(base64ToBytes(bytesToBase64(allByteValues))).toEqual(allByteValues);
    expect(base64ToBytes(bytesToBase64(randomBytes))).toEqual(randomBytes);
  });
});
