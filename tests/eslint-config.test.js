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

  test("verify script runs format:check and lint:webext", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts.verify).toContain("format:check");
    expect(pkg.scripts.verify).toContain("lint:webext");
  });
});
