// tests/design-tokens.test.js
const fs = require("fs");
const path = require("path");

describe("lib/design-tokens.css", () => {
  const css = fs.readFileSync(path.join(__dirname, "../lib/design-tokens.css"), "utf8");

  const CRITICAL_TOKENS = [
    "--omni-bg-primary",
    "--omni-text-primary",
    "--omni-accent",
    "--omni-accent-gradient",
    "--omni-success",
    "--omni-warning",
    "--omni-error",
    "--omni-radius-sm",
    "--omni-radius-md",
    "--omni-radius-lg",
    "--omni-spacing-xs",
    "--omni-spacing-md",
    "--omni-spacing-2xl",
    "--omni-font-family",
    "--omni-transition-fast",
  ];

  test.each(CRITICAL_TOKENS)("defines %s", (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  test("defines light-mode overrides for both plain-document and shadow-DOM contexts", () => {
    expect(css).toMatch(/:root\.omni-ai-light-mode\s*\{/);
    expect(css).toMatch(/:host-context\(\.omni-ai-light-mode\)\s*\{/);
  });
});
