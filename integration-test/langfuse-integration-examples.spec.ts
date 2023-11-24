import { spawnSync } from "child_process";
import { join } from "path";

describe("Test Node Example", () => {
  it("runs", () => {
    const cwd = join(__dirname, "..", "examples", "example-node");
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
    const resultDependencies = spawnSync("npm", ["run", "build:dependencies"], {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });

    expect(resultDependencies.status).toBe(0);

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
    const resultDependencies = spawnSync("npm", ["run", "build:dependencies"], {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });

    expect(resultDependencies.status).toBe(0);

    const result = spawnSync("npm", ["run", "build"], {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });

    expect(result.status).toBe(0);
  });
});
