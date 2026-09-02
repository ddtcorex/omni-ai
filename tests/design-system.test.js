const fs = require("fs");
const path = require("path");

describe("lib/design-system.css", () => {
  const css = fs.readFileSync(path.join(__dirname, "../lib/design-system.css"), "utf8");

  const CLASSES = [
    ".ds-icon-btn",
    ".ds-btn-primary",
    ".ds-btn-primary--lg",
    ".ds-btn-secondary",
    ".ds-spinner",
    ".ds-card",
    ".ds-card--accent",
    ".ds-card--success",
    ".ds-card--error",
    ".ds-card--processing",
  ];

  test.each(CLASSES)("defines %s", (selector) => {
    const escaped = selector.replace(/[.-]/g, "\\$&");
    expect(css).toMatch(new RegExp(`${escaped}\\s*\\{|${escaped}[,:\\s]`));
  });

  test("respects prefers-reduced-motion for the spinner animation", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  test(".ds-card--accent reserves trailing space, since it's always followed by another element (a reply or an input)", () => {
    const match = css.match(/\.ds-card--accent\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/margin-bottom\s*:/);
  });
});
