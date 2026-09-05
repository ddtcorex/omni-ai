const fs = require("fs");
const path = require("path");

describe("eslint.config.js severities", () => {
  const configSrc = fs.readFileSync(path.join(__dirname, "../eslint.config.js"), "utf8");

  test("no-unused-vars is an error, not a warning", () => {
    expect(configSrc).toMatch(/"no-unused-vars":\s*\[\s*"error"/);
  });

  test("eqeqeq is an error, not a warning", () => {
    expect(configSrc).toMatch(/eqeqeq:\s*\[\s*"error"/);
  });

  test("lint script enforces zero warnings", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts.lint).toContain("--max-warnings 0");
  });

  test("verify script runs format:check but not lint:webext", () => {
    // web-ext lint fails on 2 Firefox-only manifest errors (BACKGROUND_SERVICE_WORKER_NOFALLBACK,
    // ADDON_ID_REQUIRED) that are inapplicable to this Chrome-only MV3 extension and unfixable
    // without adding Firefox-only manifest fields purely to satisfy an irrelevant linter. Ruling:
    // lint:webext stays out of the blocking verify chain; see .github/workflows/ci.yml for its
    // non-blocking CI step instead.
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts.verify).toContain("format:check");
    expect(pkg.scripts.verify).not.toContain("lint:webext");
  });

  test("lint:webext remains available as its own manually-runnable script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts["lint:webext"]).toBe("web-ext lint --source-dir .");
  });
});
