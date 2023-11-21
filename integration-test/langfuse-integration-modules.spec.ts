import { spawnSync } from "child_process";
import { join } from "path";

describe("Integration Test", () => {
  it.each([["commonjs.cjs"], ["esm.mjs"]])("should correctly execute %s file in modules directory", (file) => {
    const result = spawnSync("node", [join("src", file)], {
      cwd: join(__dirname, "modules"),
      encoding: "utf-8",
    });
    console.log(result);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Did construct objects and called them");
  });
});
