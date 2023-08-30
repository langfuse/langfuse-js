import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import typescript from "rollup-plugin-typescript2";
import dts from "rollup-plugin-dts";

import pkg from "./package.json";

const extensions = [".js", ".jsx", ".ts", ".tsx"];

let globalExternal = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.peerDependencies || {}));

const configs = ["langfuse", "langfuse-node", "langfuse-langchain"].reduce((acc, x) => {
  const localPkg = require(`./${x}/package.json`);
  let external = [...globalExternal]
    .concat(Object.keys(localPkg.dependencies || {}))
    .concat(Object.keys(localPkg.peerDependencies || {}))
    .concat(Object.keys(localPkg.devDependencies || {}));

  return [
    ...acc,
    {
      input: `./${x}/index.ts`,
      output: [
        {
          file: `./${x}/` + localPkg.main,
          sourcemap: true,
          exports: "named",
          format: `cjs`,
        },
        {
          file: `./${x}/` + localPkg.module,
          sourcemap: true,
          format: `es`,
        },
      ],
      external,
      plugins: [
        // Allows node_modules resolution
        resolve({ extensions }),
        // Allow bundling cjs modules. Rollup doesn`t understand cjs
        commonjs(),
        json(),
        // Compile TypeScript/JavaScript files
        typescript({
          include: [`*.(t|j)s+(|x)`, `**/*.(t|j)s+(|x)`],
          tsconfig: `./${x}/tsconfig.json`,
          sourceMap: true,
        }),
        babel({
          extensions,
          babelHelpers: "bundled",
          include: [`${x}/src/**/*`],
          presets: [
            ["@babel/preset-env", { targets: { node: "current" } }],
            "@babel/preset-typescript",
            "@babel/preset-react",
          ],
        }),
      ],
    },
    {
      input: `./${x}/lib/${x}/index.d.ts`,
      output: [{ file: `./${x}/lib/index.d.ts`, format: "es" }],
      plugins: [dts.default()],
    },
  ];
}, []);

export default configs;
