module.exports = {
  setupFilesAfterEnv: ["./jest.setup.js"],
  testEnvironment: "jsdom",
  // Scope Jest to tests/**/*.test.js ONLY: Playwright's e2e/*.spec.js specs
  // match Jest's default "*.spec" pattern and crash when run under jsdom.
  // Mirror guard of playwright.config.js testDir/testMatch scoping.
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  // Honest coverage accounting: without this, Jest only reports coverage for
  // files some test happens to `require` — content.js and sidepanel.js were
  // both silently invisible (reported nowhere, not even as 0%) before this,
  // which is how a large, frequently-buggy file's total lack of unit tests
  // went unnoticed. See docs/superpowers/specs/2026-09-02-code-quality-system-design.md.
  collectCoverageFrom: [
    "**/*.js",
    "!node_modules/**",
    "!tests/**",
    "!e2e/**",
    "!jest.config.js",
    "!jest.setup.js",
    "!eslint.config.js",
    "!playwright.config.js",
    "!scripts/**",
    "!coverage/**",
    "!dist/**",
    "!.claude/**",
  ],
  coverageThreshold: {
    // Global floor: a regression tripwire, not a target. Note: Jest buckets
    // coverage by threshold specificity — files already matched by a more
    // specific glob below (lib/providers/**, content/positioning.js,
    // lib/theme-manager.js) are excluded from this "global" bucket, so its
    // real denominator is the *remaining* files only, not the whole-repo
    // aggregate (~35%). Re-measured directly: that remaining-files bucket is
    // ~29.42% statements / 26.14% branches / 28.3% functions / 29.9% lines.
    // Floored a few points below those numbers, not the whole-repo one.
    global: {
      statements: 26,
      branches: 23,
      functions: 25,
      lines: 26,
    },
    // Already well-tested; small buffer below its current ~90% aggregate.
    // Directory form (no "**/*.js" glob) so Jest aggregates across the
    // provider files instead of enforcing this threshold per-file — a
    // per-file glob here fails individually on groq.js/openai.js, which sit
    // at 50% functions coverage even though the directory aggregate is ~70%.
    "./lib/providers/": {
      statements: 85,
      branches: 65,
      functions: 65,
      lines: 85,
    },
    // Extracted pure-logic module from the design-system plan; currently
    // 100%. Small buffer, not 100%, so one untested edge case doesn't fail
    // the build outright.
    "./content/positioning.js": {
      statements: 95,
      branches: 85,
      functions: 95,
      lines: 95,
    },
    // Brought from 29% to ~56% via TDD during the design-system plan (Task 3
    // there). Floor a bit below that to lock in the improvement.
    "./lib/theme-manager.js": {
      statements: 50,
      branches: 40,
      functions: 40,
      lines: 50,
    },
    // content.js and sidepanel.js deliberately have NO per-file threshold
    // here: both are covered by Playwright e2e today (e2e/quick-action-modal.spec.js,
    // e2e/overlay-css-isolation.spec.js, e2e/smoke.spec.js for the former;
    // e2e/sidepanel.spec.js for the latter), not Jest units, so their 0%
    // Jest coverage is expected and shows up honestly in reports instead of
    // being hidden. As pure-logic helpers get extracted out of either file
    // (as content/positioning.js already was), add a threshold entry for
    // each extracted file here — a realistic ratchet for large, DOM-heavy
    // files rather than a big-bang rewrite or an unenforceable global 100%.
  },
};
