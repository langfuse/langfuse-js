import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import typescript from "rollup-plugin-typescript2";
import dts from "rollup-plugin-dts";

const extensions = [".js", ".jsx", ".ts", ".tsx"];

const configs = ["langfuse-core", "langfuse", "langfuse-node", "langfuse-langchain"].reduce((acc, x) => {
  const localPkg = require(`./${x}/package.json`);

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
      external: [/node_modules/],
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
