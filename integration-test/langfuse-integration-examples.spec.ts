import { spawnSync } from "child_process";
import { join } from "path";

function prepareExample(cwd: string): void {
  const yarnResult = spawnSync("yarn", {
    cwd,
    encoding: "utf-8",
    stdio: "inherit",
  });

  expect(yarnResult.status).toBe(0);

  const resultDependencies = spawnSync("npm", ["run", "build:dependencies"], {
    cwd,
    encoding: "utf-8",
    stdio: "inherit",
  });

  expect(resultDependencies.status).toBe(0);
}

describe("Test Node Example", () => {
  it("runs", () => {
    const cwd = join(__dirname, "..", "examples", "example-node");
    prepareExample(cwd);

    const result = spawnSync("npm", ["run", "start"], {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });

    expect(result.status).toBe(0);
  });
});

describe("Test Web Example", () => {
  it("builds", () => {
    const cwd = join(__dirname, "..", "examples", "example-web");
    prepareExample(cwd);

    const result = spawnSync("npm", ["run", "build"], {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });

    expect(result.status).toBe(0);
  });
});

describe("Test Web Next.js Example", () => {
  it("builds", () => {
    const cwd = join(__dirname, "..", "examples", "example-web-nextjs");
    prepareExample(cwd);

    const result = spawnSync("npm", ["run", "build"], {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });

    expect(result.status).toBe(0);
  });
});
