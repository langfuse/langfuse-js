import { spawnSync } from "child_process";
import { join } from "path";

describe("Test Different Module Conventions", () => {
  it.each([["test:cjs"], ["test:mjs"], ["test:ts-nodenext"], ["test:ts-cjs"]])(
    "should correctly execute %s",
    (testCommand) => {
      const result = spawnSync("npm", ["run", testCommand], {
        cwd: join(__dirname, "modules"),
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("Did construct objects and called them.");
      expect(result.status).toBe(0);
    }
  );

  it.each([["test:tsc-nodenext"], ["test:tsc-cjs"]])("should typecheck %s", (testCommand) => {
    const result = spawnSync("npm", ["run", testCommand], {
      cwd: join(__dirname, "modules"),
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
  });
});
