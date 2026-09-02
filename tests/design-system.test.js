const fs = require("fs");
const path = require("path");

describe("lib/design-system.css", () => {
  const css = fs.readFileSync(path.join(__dirname, "../lib/design-system.css"), "utf8");

  const CLASSES = [
    ".ds-icon-btn",
    ".ds-btn-primary",
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
});
