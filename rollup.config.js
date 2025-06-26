import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import typescript from "rollup-plugin-typescript2";
import dts from "rollup-plugin-dts";
import del from "rollup-plugin-delete";

const extensions = [".js", ".jsx", ".ts", ".tsx"];
const packages = [
  "langfuse-core",
  "langfuse",
  "langfuse-otel",
  "langfuse-node",
  "langfuse-langchain",
  "langfuse-vercel",
];

const configs = packages.reduce((acc, x) => {
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
      external: [/node_modules/, ...packages],
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
      // we need to provide a mts version of the dts file for the typechecker to work in module contexts
      // without the .d.ts is interpreted as commonjs and the typechecker will complain about missing default exports
      output: [
        { file: `./${x}/lib/index.d.ts`, format: "cjs" },
        { file: `./${x}/lib/index.d.mts`, format: "es" },
      ],
      plugins: [
        dts.default(),
        // as we rollup the dts files, we can remove the original files/directory afterwards
        del({ hook: "buildEnd", targets: `./${x}/lib/${x}/` }),
      ],
    },
  ];
}, []);

export default configs;
