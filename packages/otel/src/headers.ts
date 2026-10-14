/**
 * Merges HTTP headers so that each override replaces a default with the same
 * name regardless of casing. Fetch-based runtimes join case-insensitive
 * duplicates into one comma-separated value, so both must not be sent.
 *
 * @internal
 */
export function withDefaultHeaders(
  defaults: Record<string, string>,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const overridden = new Set(
    Object.keys(overrides).map((name) => name.toLowerCase()),
  );

  return {
    ...Object.fromEntries(
      Object.entries(defaults).filter(
        ([name]) => !overridden.has(name.toLowerCase()),
      ),
    ),
    ...overrides,
  };
}
