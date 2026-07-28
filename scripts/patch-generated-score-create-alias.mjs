#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_MARKER =
  "Compatibility alias managed by scripts/patch-generated-score-create-alias.mjs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, contents) {
  writeFileSync(path, contents);
}

function replaceExactlyOnce(contents, search, replacement, path) {
  const first = contents.indexOf(search);
  const last = contents.lastIndexOf(search);
  if (first === -1 || first !== last) {
    throw new Error(
      `Expected exactly one patch anchor in ${path}, found ${
        first === -1 ? 0 : "multiple"
      }`,
    );
  }
  return contents.replace(search, replacement);
}

function replaceRegexExactlyOnce(contents, pattern, replacement, path) {
  const matches = [...contents.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one patch anchor in ${path}, found ${matches.length}`,
    );
  }
  return contents.replace(pattern, replacement);
}

function addImport(contents, importLine, path) {
  return replaceExactlyOnce(
    contents,
    'import * as LangfuseAPI from "../../../index.js";',
    `import * as LangfuseAPI from "../../../index.js";\n${importLine}`,
    path,
  );
}

function addLegacyImport(contents, importLine, path) {
  return replaceExactlyOnce(
    contents,
    'import * as LangfuseAPI from "../../../../../index.js";',
    `import * as LangfuseAPI from "../../../../../index.js";\n${importLine}`,
    path,
  );
}

function addMethodAfterConstructor(contents, method, path) {
  const className = path.includes("/scoreV1/") ? "ScoreV1" : "Scores";
  const constructorPattern = new RegExp(
    `^([ \\t]+)constructor\\(_options: ${className}\\.Options\\) \\{\\n[ \\t]+this\\._options = _options;\\n[ \\t]+\\}\\n`,
    "gm",
  );
  return replaceRegexExactlyOnce(
    contents,
    constructorPattern,
    (constructorEnd) => `${constructorEnd}\n${method}`,
    path,
  );
}

function patchCanonicalAlias(scoresPath) {
  let contents = read(scoresPath);
  contents = addImport(
    contents,
    'import { ScoreV1 } from "../../legacy/resources/scoreV1/client/Client.js";',
    scoresPath,
  );
  contents = addMethodAfterConstructor(
    contents,
    `  /**\n   * Create a score (supports both trace and session scores)\n   *\n   * ${PATCH_MARKER}\n   */\n  public create(\n    request: LangfuseAPI.legacy.CreateScoreRequest,\n    requestOptions?: Scores.RequestOptions,\n  ): core.HttpResponsePromise<LangfuseAPI.legacy.CreateScoreResponse> {\n    return new ScoreV1(this._options).create(request, requestOptions);\n  }\n`,
    scoresPath,
  );
  write(scoresPath, contents);
}

function patchLegacyAlias(legacyPath) {
  let contents = read(legacyPath);
  contents = addLegacyImport(
    contents,
    'import { Scores } from "../../../../scores/client/Client.js";',
    legacyPath,
  );
  contents = addMethodAfterConstructor(
    contents,
    `  /**\n   * Create a score (supports both trace and session scores)\n   *\n   * @deprecated Use \`client.scores.create()\` instead.\n   * ${PATCH_MARKER}\n   */\n  public create(\n    request: LangfuseAPI.CreateScoreRequest,\n    requestOptions?: ScoreV1.RequestOptions,\n  ): core.HttpResponsePromise<LangfuseAPI.CreateScoreResponse> {\n    return new Scores(this._options).create(request, requestOptions);\n  }\n`,
    legacyPath,
  );
  write(legacyPath, contents);
}

function preserveLegacyTypes(root) {
  const typesIndexPath = resolve(
    root,
    "packages/core/src/api/api/resources/legacy/resources/scoreV1/types/index.ts",
  );
  mkdirSync(dirname(typesIndexPath), { recursive: true });
  write(
    typesIndexPath,
    `export { type CreateScoreRequest } from "../../../../scores/types/CreateScoreRequest.js";\nexport { type CreateScoreResponse } from "../../../../scores/types/CreateScoreResponse.js";\nexport { CreateScoreSource } from "../../../../scores/types/CreateScoreSource.js";\n`,
  );

  const scoreV1IndexPath = resolve(
    root,
    "packages/core/src/api/api/resources/legacy/resources/scoreV1/index.ts",
  );
  let scoreV1Index = read(scoreV1IndexPath);
  const typesExport = 'export * from "./types/index.js";';
  if (!scoreV1Index.includes(typesExport)) {
    scoreV1Index = `${typesExport}\n${scoreV1Index}`;
    write(scoreV1IndexPath, scoreV1Index);
  }

  const legacyResourcesIndexPath = resolve(
    root,
    "packages/core/src/api/api/resources/legacy/resources/index.ts",
  );
  let legacyResourcesIndex = read(legacyResourcesIndexPath);
  const scoreTypesExport = 'export * from "./scoreV1/types/index.js";';
  if (!legacyResourcesIndex.includes(scoreTypesExport)) {
    legacyResourcesIndex = replaceExactlyOnce(
      legacyResourcesIndex,
      'export * as scoreV1 from "./scoreV1/index.js";',
      `export * as scoreV1 from "./scoreV1/index.js";\n${scoreTypesExport}`,
      legacyResourcesIndexPath,
    );
    write(legacyResourcesIndexPath, legacyResourcesIndex);
  }
}

export function patchGeneratedScoreCreateAlias(root = process.cwd()) {
  const scoresPath = resolve(
    root,
    "packages/core/src/api/api/resources/scores/client/Client.ts",
  );
  const legacyPath = resolve(
    root,
    "packages/core/src/api/api/resources/legacy/resources/scoreV1/client/Client.ts",
  );
  const scoresContents = read(scoresPath);
  const legacyContents = read(legacyPath);
  const scoresHasCreate = /^[ \t]+public create\(/m.test(scoresContents);
  const legacyHasCreate = /^[ \t]+public create\(/m.test(legacyContents);
  const scoresIsPatched = scoresContents.includes(PATCH_MARKER);
  const legacyIsPatched = legacyContents.includes(PATCH_MARKER);

  if (scoresHasCreate && legacyHasCreate) {
    if (scoresIsPatched !== legacyIsPatched) {
      return;
    }
    throw new Error(
      "Both score clients expose create(), but no unique compatibility alias was found",
    );
  }

  if (!scoresHasCreate && !legacyHasCreate) {
    throw new Error("Neither score client exposes create(); refusing to guess");
  }

  if (legacyHasCreate) {
    if (!legacyContents.includes('"/api/public/scores"')) {
      throw new Error(
        "Legacy create() does not target /api/public/scores; refusing to patch",
      );
    }
    patchCanonicalAlias(scoresPath);
    return;
  }

  if (!scoresContents.includes('"/api/public/scores"')) {
    throw new Error(
      "Canonical create() does not target /api/public/scores; refusing to patch",
    );
  }
  patchLegacyAlias(legacyPath);
  preserveLegacyTypes(root);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  patchGeneratedScoreCreateAlias();
}
