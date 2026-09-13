const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const packageJson = require("../package.json");

/**
 * Guards the invariants the 2026-09-13 jest 30 migration established.
 *
 * They live in a test rather than in review discipline because the migration's
 * own documentation check used an allowlist of files (`grep -rn "jest-chrome"
 * AGENTS.md README.md docs/`), which could not see CONTRIBUTING.md and let a
 * stale "Unit: Jest + jest-chrome" line survive the migration commit.
 */
describe("testing stack", () => {
  const majorOf = (range) =>
    Number(
      String(range)
        .replace(/[^\d.]/g, "")
        .split(".")[0],
    );

  it("does not depend on jest-chrome", () => {
    expect(Object.keys(packageJson.devDependencies)).not.toContain("jest-chrome");
  });

  it("keeps jest and jest-environment-jsdom on the same major version, at 30 or above", () => {
    const jestMajor = majorOf(packageJson.devDependencies.jest);

    expect(jestMajor).toBeGreaterThanOrEqual(30);
    expect(majorOf(packageJson.devDependencies["jest-environment-jsdom"])).toBe(jestMajor);
  });

  it("never requires jest-chrome from source or tests", () => {
    const roots = ["lib", "background", "content", "sidepanel", "tests"];
    const offenders = [];

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.name.endsWith(".js")) continue;

        const source = fs.readFileSync(fullPath, "utf8");
        if (/require\(\s*["']jest-chrome["']\s*\)|from\s+["']jest-chrome["']/.test(source)) {
          offenders.push(path.relative(repoRoot, fullPath));
        }
      }
    };

    for (const root of roots) walk(path.join(repoRoot, root));

    expect(offenders).toEqual([]);
  });

  it("installs the shared chrome mock as the global chrome in jest.setup.js", () => {
    const setup = fs.readFileSync(path.join(repoRoot, "jest.setup.js"), "utf8");

    expect(setup).toMatch(/global\.chrome\s*=/);
    expect(setup).toContain("tests/helpers/chrome-mock");
  });
});
