#!/usr/bin/env node

// Gives every generated API method without a request object an empty,
// optional `request` parameter in front of `requestOptions`.
//
// Fern only generates a request object for endpoints that have query
// parameters or an inlined body. Adding the first query parameter to an
// endpoint later inserts that object before `requestOptions`, so existing
// `method(id, requestOptions)` calls would silently pass their options as the
// request. Reserving the slot now keeps the call shape stable:
//
//   get(datasetName, requestOptions?)                          // Fern output
//   get(datasetName, request: Record<string, never> = {}, requestOptions?)
//
// When the endpoint gains real query parameters, Fern generates
// `request: SomeRequest = {}` in the same position and this script skips it.
//
// Usage:
//   node scripts/patch-generated-request-placeholders.mjs [--api-root <dir>]
//   node scripts/patch-generated-request-placeholders.mjs --check
//   node scripts/patch-generated-request-placeholders.mjs --list
//
// --check exits non-zero if any method still lacks the placeholder.
// --list prints every method that carries it as JSON.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const PLACEHOLDER_TYPE = "Record<string, never>";
const PLACEHOLDER_PARAM = `request: ${PLACEHOLDER_TYPE} = {}`;
const PLACEHOLDER_DOC =
  "Takes no fields yet. Reserves the position for query parameters that later API versions may add, so `requestOptions` never moves.";

function findClientFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findClientFiles(path));
    } else if (
      entry.name === "Client.ts" &&
      path.split(sep).includes("client") &&
      path.split(sep).includes("resources")
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

function resourceAccessor(apiRoot, file) {
  // api/resources/legacy/resources/scoreV1/client/Client.ts -> legacy.scoreV1
  const parts = relative(join(apiRoot, "api", "resources"), file).split(sep);
  return parts
    .slice(0, -2)
    .filter((part) => part !== "resources")
    .join(".");
}

function isPublicMethod(member) {
  return (
    ts.isMethodDeclaration(member) &&
    ts.isIdentifier(member.name) &&
    !member.name.text.startsWith("_") &&
    (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Public) !== 0 &&
    (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) === 0
  );
}

function analyzeMethod(member, file) {
  const params = member.parameters;
  const last = params[params.length - 1];
  if (
    !last ||
    !ts.isIdentifier(last.name) ||
    last.name.text !== "requestOptions"
  ) {
    return null;
  }

  const leading = params.slice(0, -1);
  const names = leading.map((param) =>
    ts.isIdentifier(param.name) ? param.name.text : null,
  );
  const requestIndex = names.indexOf("request");
  if (requestIndex !== -1) {
    const request = leading[requestIndex];
    const isPlaceholder =
      request.type?.getText() === PLACEHOLDER_TYPE &&
      request.initializer?.getText() === "{}";
    return {
      patched: true,
      placeholder: isPlaceholder,
      pathParams: names.slice(0, requestIndex),
    };
  }

  for (const param of leading) {
    if (
      !ts.isIdentifier(param.name) ||
      param.questionToken ||
      param.initializer ||
      param.dotDotDotToken
    ) {
      throw new Error(
        `Unexpected parameter shape in ${file} ${member.name.text}(): ${param.getText()}`,
      );
    }
  }

  return { patched: false, placeholder: false, pathParams: names };
}

function analyzeFile(apiRoot, file) {
  const contents = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const accessor = resourceAccessor(apiRoot, file);
  const methods = [];

  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    for (const member of statement.members) {
      if (!isPublicMethod(member)) continue;
      const analysis = analyzeMethod(member, file);
      if (!analysis) continue;
      methods.push({
        file,
        accessor,
        method: member.name.text,
        label: `${accessor}.${member.name.text}(${analysis.pathParams.join(", ")})`,
        member,
        ...analysis,
      });
    }
  }

  return { contents, source, methods };
}

function indentationBefore(contents, position) {
  const lineStart = contents.lastIndexOf("\n", position - 1) + 1;
  return contents.slice(lineStart, position);
}

function patchMethod(contents, method) {
  const edits = [];
  const requestOptions =
    method.member.parameters[method.member.parameters.length - 1];
  const paramStart = requestOptions.getStart();
  const previousChar = contents.slice(0, paramStart).trimEnd().slice(-1);
  const isMultiline = /\n\s*$/.test(contents.slice(0, paramStart));
  const separator = isMultiline
    ? `\n${indentationBefore(contents, paramStart)}`
    : " ";
  if (previousChar !== "(" && previousChar !== ",") {
    throw new Error(
      `Cannot place request before requestOptions in ${method.file} ${method.method}()`,
    );
  }
  edits.push({
    position: paramStart,
    text: `${PLACEHOLDER_PARAM},${separator}`,
  });

  const docStart = method.member.getFullStart();
  const docText = contents.slice(docStart, method.member.getStart());
  const docMatch = /^([ \t]*\*[ \t]*)@param \{[^}]+\} requestOptions\b/m.exec(
    docText,
  );
  if (docMatch) {
    edits.push({
      position: docStart + docMatch.index,
      text: `${docMatch[1]}@param {${PLACEHOLDER_TYPE}} request - ${PLACEHOLDER_DOC}\n`,
    });
  }

  return edits;
}

export function listMethods(apiRoot) {
  return findClientFiles(join(apiRoot, "api", "resources")).flatMap(
    (file) => analyzeFile(apiRoot, file).methods,
  );
}

export function patchApiRoot(apiRoot) {
  const patched = [];
  for (const file of findClientFiles(join(apiRoot, "api", "resources"))) {
    const { contents, methods } = analyzeFile(apiRoot, file);
    const targets = methods.filter((method) => !method.patched);
    if (targets.length === 0) continue;

    const edits = targets
      .flatMap((method) => patchMethod(contents, method))
      .sort((a, b) => b.position - a.position);
    let next = contents;
    for (const edit of edits) {
      next =
        next.slice(0, edit.position) + edit.text + next.slice(edit.position);
    }
    writeFileSync(file, next);
    patched.push(...targets.map((method) => method.label));
  }
  return patched;
}

function parseArgs(argv) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const args = {
    apiRoot: resolve(scriptDir, "..", "packages", "core", "src", "api"),
    mode: "patch",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--api-root") {
      args.apiRoot = resolve(argv[++i]);
    } else if (arg === "--check") {
      args.mode = "check";
    } else if (arg === "--list") {
      args.mode = "list";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function main() {
  const { apiRoot, mode } = parseArgs(process.argv.slice(2));

  if (mode === "list") {
    const methods = listMethods(apiRoot)
      .filter((method) => method.placeholder)
      .map(({ accessor, method, pathParams, label }) => ({
        accessor,
        method,
        pathParams,
        label,
      }));
    process.stdout.write(`${JSON.stringify(methods, null, 2)}\n`);
    return;
  }

  if (mode === "check") {
    const missing = listMethods(apiRoot).filter((method) => !method.patched);
    if (missing.length > 0) {
      console.error(
        `Generated methods without a request placeholder:\n${missing
          .map((method) => `  ${method.label}`)
          .join(
            "\n",
          )}\nRun node scripts/patch-generated-request-placeholders.mjs`,
      );
      process.exit(1);
    }
    return;
  }

  const patched = patchApiRoot(apiRoot);
  console.log(
    patched.length === 0
      ? "Request placeholders already present"
      : `Added request placeholders to ${patched.length} methods:\n${patched
          .map((label) => `  ${label}`)
          .join("\n")}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
