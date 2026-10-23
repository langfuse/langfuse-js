import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", node: "src/node/index.ts" },
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  removeNodeProtocol: false,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  outExtension: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".mjs",
  }),
});
