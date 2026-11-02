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
    ".ds-surface",
    ".ds-pill",
    ".ds-field",
    ".ds-shimmer",
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

  test("the primary button uses the AA gradient and never lifts on hover", () => {
    const block = css.match(/\.ds-btn-primary\s*\{([^}]*)\}/)[1];
    expect(block).toContain("var(--omni-button-gradient)");
    expect(css).not.toMatch(/translateY/);
  });

  test("the page backdrop is a class on body, painted by ::before, in both documents", () => {
    expect(css).toMatch(/body\.ds-backdrop::before\s*\{/);
    for (const rel of ["../settings.html", "../sidepanel/sidepanel.html"]) {
      const html = fs.readFileSync(path.join(__dirname, rel), "utf8");
      expect(html).toMatch(/<body[^>]*class="[^"]*\bds-backdrop\b/);
    }
  });

  test("the shimmer hides through its own .hidden rule, since these pages have no generic one", () => {
    expect(css).toMatch(/\.ds-shimmer\.hidden\s*\{[^}]*display:\s*none/);
  });
});

describe("the page stylesheets read the AA glass text tokens, not the page ones", () => {
  // --omni-text-muted is 2.56:1 on the light glass and about 4.0:1 on the dark
  // one, so it fails AA wherever these two surfaces paint it. The glass text
  // tokens are the AA companions.
  test.each(["../settings.css", "../sidepanel/sidepanel.css"])("%s", (rel) => {
    const text = fs.readFileSync(path.join(__dirname, rel), "utf8");
    expect(text).not.toMatch(/--omni-text-muted\b/);
    expect(text).not.toMatch(/--omni-text-tertiary\b/);
  });
});

describe("the page stylesheets carry no colour literal except #fff", () => {
  // Tokens are the only colour source on the two page surfaces; a literal that
  // duplicates a token value is how the surfaces drifted from the overlay in
  // the first place.
  test.each(["../settings.css", "../sidepanel/sidepanel.css"])("%s", (rel) => {
    const text = fs.readFileSync(path.join(__dirname, rel), "utf8");
    const hexes = (text.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(
      (colour) => colour.toLowerCase() !== "#fff",
    );
    expect(hexes).toEqual([]);
    expect(text).not.toMatch(/\brgba?\(/);
    // URL-encoded hex inside a data: URI is still a colour literal.
    expect(text).not.toMatch(/%23[0-9a-fA-F]{3,8}\b/);
  });
});
