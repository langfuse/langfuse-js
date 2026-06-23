/**
 * Resolves the JSONPaths the Langfuse API attaches to dataset item media
 * references.
 *
 * The backend reads `node.path` from jsonpath-plus' `JSONPath(...,
 * resultType: "all")`, which returns a bracket-normalized (RFC 9535) path. So
 * we only ever see `$`, `['<key>']` (single-quoted, with no escaping — keys may
 * contain literal quotes, brackets, dots, etc.), and `[<int>]` (also emitted for
 * all-digit object keys). It is always bracket notation, never dot notation like
 * `$.x.y`. We parse exactly this restricted grammar rather than depend on a full
 * JSONPath engine; anything outside it throws.
 */

/**
 * Parses a jsonpath-plus normalized path into ordered segments: object keys
 * become strings, array indices become numbers. Returns `[]` for the root `$`.
 */
export function parseJsonPath(jsonPath: string): (string | number)[] {
  if (!jsonPath.startsWith("$")) {
    throw new Error(`Invalid JSONPath: ${jsonPath}`);
  }

  const segments: (string | number)[] = [];
  let i = 1;
  const n = jsonPath.length;

  while (i < n) {
    if (jsonPath[i] !== "[") {
      throw new Error(`Invalid JSONPath: ${jsonPath}`);
    }
    i += 1;

    if (jsonPath[i] === "'") {
      // Object key: ['<key>'] (single-quoted). No escaping, so the key ends at
      // the first closing "']".
      i += 1;
      const close = jsonPath.indexOf("']", i);
      if (close === -1) {
        throw new Error(`Invalid JSONPath: ${jsonPath}`);
      }
      segments.push(jsonPath.slice(i, close));
      i = close + 2;
    } else {
      // Array index: [<int>]
      const start = i;
      while (i < n && jsonPath[i] >= "0" && jsonPath[i] <= "9") {
        i += 1;
      }
      if (i === start || i >= n || jsonPath[i] !== "]") {
        throw new Error(`Invalid JSONPath: ${jsonPath}`);
      }
      segments.push(Number.parseInt(jsonPath.slice(start, i), 10));
      i += 1;
    }
  }

  return segments;
}

/**
 * Replaces the node at `jsonPath` within `value` with `replacement`. Mutates
 * `value` in place and returns it; for the root path `$` it returns
 * `replacement` directly. Throws if the path can't be parsed or navigated.
 */
export function setValueAtPath(
  value: unknown,
  jsonPath: string,
  replacement: unknown,
): unknown {
  const segments = parseJsonPath(jsonPath);
  if (segments.length === 0) {
    // "$": the whole value is the reference.
    return replacement;
  }

  let target = value;
  for (const segment of segments.slice(0, -1)) {
    target = (target as Record<string | number, unknown>)[segment];
  }

  const leaf = segments[segments.length - 1];
  // A numeric leaf on a non-array means jsonpath-plus rendered an all-digit
  // object key as "[0]", which is indistinguishable from a list index — so we
  // can't safely resolve it (rather than write a bogus numeric key).
  if (typeof leaf === "number" && !Array.isArray(target)) {
    throw new Error(`Cannot resolve JSONPath: ${jsonPath}`);
  }
  (target as Record<string | number, unknown>)[leaf] = replacement;

  return value;
}
