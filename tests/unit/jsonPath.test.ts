import { describe, expect, it } from "vitest";

// Internal helper (not part of the public API), imported directly by source path
// — mirrors the Python SDK's tests/unit/test_json_path.
import {
  parseJsonPath,
  setValueAtPath,
} from "../../packages/client/src/dataset/jsonPath.js";

const REF = "@@@langfuseMedia:type=image/png|id=abc|source=bytes@@@";
const M = "__MEDIA__";

// (description, value, jsonPath, expected) generated from jsonpath-plus 10.x —
// the same library the backend uses to produce the jsonPath. `jsonPath` is what
// jsonpath-plus emits for the reference's location; `expected` is the value after
// the reference is replaced, so this verifies our setter matches the library.
const SET_CASES: Array<[string, unknown, string, unknown]> = [
  ["root", REF, "$", M],
  ["simple key", { image: REF }, "$['image']", { image: M }],
  ["key with space", { "my image": REF }, "$['my image']", { "my image": M }],
  ["apostrophe key", { "O'connor": REF }, "$['O'connor']", { "O'connor": M }],
  ["double-quote key", { 'a"b': REF }, "$['a\"b']", { 'a"b': M }],
  ["bracket key", { "arr[0]": REF }, "$['arr[0]']", { "arr[0]": M }],
  ["dot key", { "a.b": REF }, "$['a.b']", { "a.b": M }],
  ["list root", [REF], "$[0]", [M]],
  [
    "list element",
    { items: [0, REF, 2] },
    "$['items'][1]",
    { items: [0, M, 2] },
  ],
  [
    "nested obj",
    { a: { b: { c: REF } } },
    "$['a']['b']['c']",
    { a: { b: { c: M } } },
  ],
  ["obj in list", [{ x: REF }], "$[0]['x']", [{ x: M }]],
  ["two indices", [[REF]], "$[0][0]", [[M]]],
  ["three indices", [[[REF]]], "$[0][0][0]", [[[M]]]],
  [
    "key then two indices",
    { matrix: [[0, REF]] },
    "$['matrix'][0][1]",
    { matrix: [[0, M]] },
  ],
  ["index key index", [{ rows: [REF] }], "$[0]['rows'][0]", [{ rows: [M] }]],
  [
    "deep mixed",
    { messages: [{ content: [{ image_url: REF }] }] },
    "$['messages'][0]['content'][0]['image_url']",
    { messages: [{ content: [{ image_url: M }] }] },
  ],
  [
    "sibling untouched",
    { keep: "txt", img: REF },
    "$['img']",
    { keep: "txt", img: M },
  ],
];

describe("setValueAtPath", () => {
  it.each(SET_CASES)(
    "matches jsonpath-plus: %s",
    (_name, value, path, expected) => {
      expect(setValueAtPath(value, path, M)).toEqual(expected);
    },
  );

  // All-digit keys and keys containing "']" are indistinguishable / broken in
  // jsonpath-plus' output, so they cannot be resolved and must throw (the caller
  // leaves the value unchanged rather than guessing). Plus malformed paths the
  // API should never emit.
  const THROW_CASES: Array<[string, unknown, string]> = [
    ["all-digit object key", { "0": REF }, "$[0]"],
    ["key containing ']", { "a']b": REF }, "$['a']b']"],
    ["no leading $", "x", "image"],
    ["unterminated", { a: REF }, "$['a'"],
    ["non-quoted segment", { a: REF }, "$[a]"],
  ];
  it.each(THROW_CASES)("throws on %s", (_name, value, path) => {
    expect(() => setValueAtPath(value, path, M)).toThrow();
  });
});

describe("parseJsonPath", () => {
  it("parses into ordered segments", () => {
    expect(parseJsonPath("$")).toEqual([]);
    expect(parseJsonPath("$['image']")).toEqual(["image"]);
    expect(parseJsonPath("$[0]")).toEqual([0]);
    expect(parseJsonPath("$['a']['b'][2]")).toEqual(["a", "b", 2]);
    expect(parseJsonPath("$[0][1][2]")).toEqual([0, 1, 2]);
    expect(parseJsonPath("$['O'connor']")).toEqual(["O'connor"]);
  });
});
