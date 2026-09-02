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
    // :host() (not :host-context()) is deliberate: it matches only the shadow
    // host element itself, never an ancestor, so a hostile host page cannot
    // flip the overlay's theme by adding the class to its own <html>. See I6.
    expect(css).toMatch(/:host\(\.omni-ai-light-mode\)\s*\{/);
    expect(css).not.toMatch(/:host-context\(\.omni-ai-light-mode\)\s*\{/);
  });
});

describe("no var(--...) usage references an undefined or non-canonical token", () => {
  // Every var(--x) usage across JS/HTML/CSS surfaces must use the canonical
  // --omni-* namespace AND actually be defined in lib/design-tokens.css.
  // This is the regression guard for two real bugs that slipped past every
  // earlier review pass: a 17-instance `var(--ai-*)` regression in
  // content.js, and settings.js's `var(--success)`/`var(--error)` (C2) —
  // both used dead, unprefixed token names that no rule here caught because
  // the "legacy token names" block above only checks CSS :root definitions,
  // never var() usages, and never looks at JS or HTML at all.
  const tokensCss = fs.readFileSync(path.join(__dirname, "../lib/design-tokens.css"), "utf8");

  const definedTokens = new Set(
    Array.from(tokensCss.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)).map((m) => m[1]),
  );

  const SURFACE_FILES = [
    "../content/content.js",
    "../settings.js",
    "../sidepanel/sidepanel.js",
    "../settings.html",
    "../sidepanel/sidepanel.html",
    "../content/overlay.css",
    "../settings.css",
    "../sidepanel/sidepanel.css",
  ];

  test.each(SURFACE_FILES)("%s only uses --omni-* tokens defined in design-tokens.css", (relPath) => {
    const filePath = path.join(__dirname, relPath);
    const content = fs.readFileSync(filePath, "utf8");
    const usages = Array.from(content.matchAll(/var\((--[a-zA-Z0-9-]+)/g)).map((m) => m[1]);

    const invalid = usages.filter(
      (token) => !token.startsWith("--omni-") || !definedTokens.has(token),
    );

    expect(invalid).toEqual([]);
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
