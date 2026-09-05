const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// Runs the real `eslint.config.js` through the actual ESLint class, but in a
// plain `node` child process rather than requiring "eslint" directly inside
// this Jest test process. Reason: this repo's pinned jest@27 (jest-resolve
// predates package.json "exports" support) cannot resolve eslint@10's
// ESM-only transitive deps (@eslint/plugin-kit, @eslint/config-array, ...),
// so `require("eslint")` crashes inside Jest with "Cannot use import
// statement outside a module" even though plain Node resolves the same
// package fine. Shelling out sidesteps Jest's module resolver while still
// exercising the genuine ESLint API against the genuine flat config — no
// mocking of ESLint or the rule itself.
function lintTextViaRealEslint(code, filePath) {
  const script = `
    const { ESLint } = require("eslint");
    (async () => {
      const eslint = new ESLint({ cwd: ${JSON.stringify(path.join(__dirname, ".."))} });
      const results = await eslint.lintText(${JSON.stringify(code)}, { filePath: ${JSON.stringify(filePath)} });
      process.stdout.write(JSON.stringify(results[0].messages));
    })();
  `;
  const stdout = execFileSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

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

describe("Provider Pattern ESLint rule", () => {
  test("flags a fetch() call in a non-provider file", () => {
    const messages = lintTextViaRealEslint('fetch("https://api.example.com");\n', "settings.js");
    expect(messages.some((m) => /fetch/i.test(m.message))).toBe(true);
  });

  test("does not flag a fetch() call inside lib/providers/**", () => {
    const messages = lintTextViaRealEslint(
      'fetch("https://api.example.com");\n',
      "lib/providers/probe.js",
    );
    expect(messages.some((m) => /fetch/i.test(m.message))).toBe(false);
  });
});
