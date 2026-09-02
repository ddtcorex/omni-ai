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

describe("no legacy token names remain in any surface", () => {
  const overlayCss = fs.readFileSync(path.join(__dirname, "../content/overlay.css"), "utf8");
  const settingsCss = fs.readFileSync(path.join(__dirname, "../settings.css"), "utf8");
  const sidepanelCss = fs.readFileSync(path.join(__dirname, "../sidepanel/sidepanel.css"), "utf8");

  test.each([
    ["content/overlay.css", overlayCss],
    ["settings.css", settingsCss],
    ["sidepanel/sidepanel.css", sidepanelCss],
  ])("%s no longer defines its own --ai-*/unprefixed token :root block", (_name, css) => {
    expect(css).not.toMatch(/--ai-[a-z-]+\s*:/);
    expect(css).not.toMatch(/--accent-purple\s*:/);
    expect(css).not.toMatch(/--bg-primary\s*:/);
    expect(css).not.toMatch(/--radius-md\s*:/);
  });
});
