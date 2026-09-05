# Code Quality System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Omni AI's existing CI/lint/test setup into a genuinely strict, mostly-mechanical quality gate — closing 3 verified lint/format gaps, making test coverage honest and floored instead of aspirational, and enforcing the Provider Pattern and Storage Map conventions via ESLint instead of prose in `AGENTS.md`.

**Architecture:** All changes land inside the existing `verify`/`e2e` CI jobs (no new required-check names, no branch-protection changes needed). A new `lib/storage.js` becomes the typed owner of every Storage Map key not already owned by `lib/theme-manager.js`/`lib/history.js`; two new ESLint flat-config rules (zero new dependencies) then ban direct `fetch()` and direct `chrome.storage.*` access outside their designated files, with narrow, commented inline exceptions for the handful of call sites that genuinely don't fit (local-resource fetches, session-scoped ephemeral frame tracking, the one-time install/update defaults merge).

**Tech Stack:** ESLint 10 flat config, Jest 27 coverage (`coverageThreshold` per path glob), Prettier 3, husky + lint-staged (new), GitHub Actions, Dependabot.

**Spec:** `docs/superpowers/specs/2026-09-02-code-quality-system-design.md`

## Global Constraints

- No new ESLint plugin dependencies for the Provider Pattern / Storage Map rules — use `eslint.config.js`'s existing flat-config file-glob override mechanism (already used for the `tests/**`/`e2e/**` globals override).
- `husky`/`lint-staged` are a local convenience layer only — CI (`npm run verify`) remains the actual, non-bypassable gate; do not present the pre-commit hook as a substitute for it anywhere in docs or commit messages.
- The `return true` async-`onMessage` convention is **not** lint-automatable (control-flow analysis beyond a plain AST rule) — do not attempt to build a custom rule for it. Its enforcement mechanism is the PR template checklist + existing test coverage in `tests/background/service-worker.test.js`, not lint.
- Every task must leave `npm run verify` passing before its commit — the repo is lint/format-clean today (after Task 1's one-time reformat) and no task in this plan should turn that red for the tasks after it.
- Zero new user-facing behavior changes and zero i18n keys — this plan touches build/CI/lint tooling and internal module boundaries only.

---

## File Structure

**New files:**
- `lib/storage.js` — typed getter/setter functions for every Storage Map key not already owned by `lib/theme-manager.js` (`omni_ai_theme`) or `lib/history.js` (history/usage-stats keys): `primaryLanguage`, `defaultLanguage` (sync); every provider's `*ApiKey`, `apiModel`, `currentPreset`, `customGatewayBaseUrl`, `customGatewayModelName`, `customModelName`, the `settings` bag (local).
- `tests/lib/storage.test.js` — unit tests for every exported function in `lib/storage.js`.
- `.github/dependabot.yml` — weekly npm dependency-update PRs.
- `.github/CODEOWNERS` — whole-repo ownership.
- `.github/pull_request_template.md` — mirrors `AGENTS.md`'s Agent Checklist as literal checkboxes.
- `.husky/pre-commit` — runs `lint-staged`.

**Modified files:**
- `package.json` — `lint` gains `--max-warnings 0`; new `format`/`format:check` scripts; `verify` gains `format:check` and `lint:webext`; new `devDependencies` (`husky`, `lint-staged`); new `lint-staged` config block; `prepare` script to install husky hooks.
- `eslint.config.js` — `no-unused-vars`/`eqeqeq` promoted to `"error"`; two new rule blocks (Provider Pattern, Storage Map).
- `jest.config.js` — explicit `collectCoverageFrom`; per-glob `coverageThreshold`.
- `.github/workflows/ci.yml` — `verify` job gains an `npm audit --omit=dev --audit-level=high` step.
- `AGENTS.md`, `CHANGELOG.md`, `README.md`, `CONTRIBUTING.md`, `docs/FOLLOWUPS.md`, `docs/design-system/MASTER.md`, `lib/design-system.css`, `e2e/quick-action-modal.spec.js`, `e2e/sidepanel.spec.js`, `settings.js`, `sidepanel/sidepanel.js`, `tests/background/service-worker.test.js`, `tests/content/editor-adapters.test.js`, `tests/design-tokens.test.js`, `tests/lib/ai-providers.test.js`, `tests/lib/theme-manager.test.js`, `tests/settings.test.js` — Prettier reformat only (Task 1), no logic changes.
- `settings.js`, `lib/i18n.js` — Storage Map migration (Task 5).
- `lib/ai-service.js`, `content/content.js` — Storage Map migration (Task 6).
- `background/service-worker.js` — Storage Map migration + the 6 documented inline ESLint exceptions (Task 7).

## Task Dependency Notes

Tasks 1–3 are independent of each other and of the storage work; land them first, in order, since Task 1's reformat is the largest mechanical diff and easiest to review in isolation. Tasks 4→5→6→7 are strictly sequential: Task 4 creates `lib/storage.js`; Tasks 5 and 6 migrate consumers to it (in either order — they touch disjoint files) but must land **before** Task 7, because Task 7 is the one that actually turns on the Storage Map ESLint rule, and turning it on before every consumer is migrated would fail CI immediately. Tasks 8–10 are independent of everything else and of each other. Task 11 (final verification) must be last.

---

### Task 1: Reformat with Prettier, then close the 3 verified lint/format gaps

**Files:**
- Modify: `package.json`
- Modify: `eslint.config.js`
- Modify: every file `npx prettier --check .` currently flags (verified list below)

**Interfaces:**
- Produces: `npm run lint` fails on any warning (not just errors); `npm run format`/`npm run format:check` scripts; `npm run verify` includes format and manifest-lint checks.

`npx prettier --check .` currently fails on exactly these 17 files (verified by running it): `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `README.md`, `docs/FOLLOWUPS.md`, `docs/design-system/MASTER.md`, `e2e/quick-action-modal.spec.js`, `e2e/sidepanel.spec.js`, `lib/design-system.css`, `settings.js`, `sidepanel/sidepanel.js`, `tests/background/service-worker.test.js`, `tests/content/editor-adapters.test.js`, `tests/design-tokens.test.js`, `tests/lib/ai-providers.test.js`, `tests/lib/theme-manager.test.js`, `tests/settings.test.js`. This must be fixed **before** `format:check` is added to `verify`, or CI breaks immediately on this task's own commit.

- [ ] **Step 1: Reformat the whole repo**

Run: `npx prettier --write .`

- [ ] **Step 2: Review the diff is formatting-only**

Run: `git diff --stat` — expect only the 17 files listed above (plus none else). Read through `git diff -- settings.js sidepanel/sidepanel.js` specifically (the two non-test, non-doc source files affected) to confirm every change is whitespace/quote-style only, no logic touched.

- [ ] **Step 3: Run the full suite to confirm the reformat didn't break anything**

Run: `npm run verify && npx playwright test`
Expected: PASS (same counts as before this task — 141 unit / 19 e2e as of this plan's writing).

- [ ] **Step 4: Write a failing test for the lint severity change**

There's no existing test file for `eslint.config.js` itself; add one:

```js
// tests/eslint-config.test.js
const { execSync } = require("child_process");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/eslint-config.test.js`
Expected: FAIL — none of the four assertions hold against the current `eslint.config.js`/`package.json`.

- [ ] **Step 3: Make the changes**

In `eslint.config.js`, change the `rules` block:

```js
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-var": "warn",
      eqeqeq: ["error", "smart"],
    },
```

(`no-var` stays `"warn"` — a style preference already effectively enforced by Prettier's own formatting choices, not a correctness bug the way an unused variable or a loose `==` comparison can be.)

In `package.json`'s `"scripts"` block, change `"lint"` and `"verify"`, and add `"format"`/`"format:check"`:

```json
    "lint": "eslint . --max-warnings 0",
    "lint:webext": "web-ext lint --source-dir .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "jest",
    "e2e": "playwright test",
    "verify": "npm run typecheck && npm run lint && npm run format:check && npm run lint:webext && npm test",
```

(Full `"scripts"` block after this change, for context — only `lint`/`verify` change and `format`/`format:check` are new; `dev`/`typecheck`/`test`/`e2e`/`package` are unchanged from today.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/eslint-config.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full verify suite**

Run: `npm run verify`
Expected: PASS — this is the real end-to-end proof that `--max-warnings 0`, `format:check`, and `lint:webext` all pass cleanly on the just-reformatted tree.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "style: reformat with Prettier; enforce zero lint warnings and format/manifest checks in verify"
```

---

### Task 2: Honest, floored coverage

**Files:**
- Modify: `jest.config.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `collectCoverageFrom` covering the whole repo; `coverageThreshold` per path glob — later tasks (5, 6, 7) that add real test coverage to `lib/storage.js` must keep these thresholds passing, not need to raise them (thresholds here are floors below current numbers, not aspirational targets).

Freshly re-verified coverage (this plan's own run, `npx jest --coverage --coverageReporters=text` with an explicit whole-repo `collectCoverageFrom` — see Task's Step 1 for the exact command): **35.46% statements / 31.42% branches / 31.87% functions / 36.17% lines** overall. This supersedes the spec's cited 17.49%/16.25% — the design-system branch (merged since the spec was written) added `content/positioning.js` (100% covered) and substantially improved `lib/theme-manager.js` (29.16% → 56.52% statements) via TDD. `content.js` and `sidepanel.js` both still report flatly **0%** across all four metrics (confirmed unchanged) since no Jest test imports either — both are exercised by Playwright e2e instead. `lib/providers/**` is at 90.47% statements (close to the spec's cited ~90%, no material change).

- [ ] **Step 1: Confirm today's honest baseline yourself before setting thresholds**

Run:
```bash
npx jest --coverage --coverageReporters=text --collectCoverageFrom='["**/*.js","!node_modules/**","!tests/**","!e2e/**","!jest.config.js","!jest.setup.js","!eslint.config.js","!playwright.config.js","!scripts/**","!coverage/**","!dist/**"]'
```
Expected: the per-file table matches the numbers cited above (allow small drift if Task 1's reformat or intervening work changed line counts, but the overall shape — `content.js`/`sidepanel.js` at 0%, `lib/providers/**` near 90% — should hold). If it's meaningfully different, use the numbers you actually see for the thresholds below instead of the ones in this plan.

- [ ] **Step 2: Write the config**

Replace `jest.config.js` in full:

```js
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
  ],
  coverageThreshold: {
    // Global floor: a regression tripwire, not a target. Set a few points
    // below the honest baseline (~35% as of this plan) so it catches a large
    // new untested file landing, without implying 30% is an acceptable goal.
    global: {
      statements: 30,
      branches: 27,
      functions: 27,
      lines: 30,
    },
    // Already well-tested; small buffer below its current ~90%.
    "./lib/providers/**/*.js": {
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
```

- [ ] **Step 3: Run coverage to confirm the thresholds pass**

Run: `npm test -- --coverage`
Expected: PASS, all threshold groups satisfied.

- [ ] **Step 4: Prove the threshold actually catches a regression, then revert the probe**

Temporarily comment out one test in `tests/lib/providers/anthropic.test.js` (pick any one `test(...)` block) to drop that directory's coverage below 85%, run `npm test -- --coverage`, confirm it now FAILS with a coverage-threshold error naming `lib/providers`, then restore the file exactly (`git checkout -- tests/lib/providers/anthropic.test.js`) and re-run `npm test -- --coverage` to confirm PASS again. This is the regression test for the regression-detection mechanism itself (per the spec's own Testing section) — do not skip it.

- [ ] **Step 5: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jest.config.js
git commit -m "test: make coverage honest (whole-repo collectCoverageFrom) and floor it per path glob"
```

---

### Task 3: Provider Pattern ESLint rule

**Files:**
- Modify: `eslint.config.js`
- Modify: `content/content.js` (2 inline exceptions)
- Modify: `lib/i18n.js` (1 inline exception)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: any future `fetch(` call added outside `lib/providers/**` (and not carrying a documented `eslint-disable` comment) fails lint immediately.

Every current `fetch(` call site outside `lib/providers/**` (verified via `grep -rn "fetch(" --include="*.js" .`, excluding `node_modules`/`dist`/`tests`/`e2e`/`lib/providers`): `content/content.js:60`, `content/content.js:67`, `content/content.js:189` (all fetching a local extension resource — locale JSON or CSS — via `chrome.runtime.getURL(...)`, never an AI provider), and `lib/i18n.js:10`, `lib/i18n.js:17` (same: locale JSON). None of these are AI-provider calls; all five need a documented inline exception, since the rule bans `fetch(` as a call expression regardless of its argument (a selector precise enough to distinguish "fetches `chrome.runtime.getURL(...)`" from "fetches an arbitrary URL" would be a fragile, hard-to-maintain esquery expression — an inline exception per legitimate site is more maintainable and, cheaply, forces any *new* fetch call to justify itself explicitly).

- [ ] **Step 1: Write a failing test proving the rule fires**

```js
// Add to tests/eslint-config.test.js
const { ESLint } = require("eslint");

describe("Provider Pattern ESLint rule", () => {
  test("flags a fetch() call in a non-provider file", async () => {
    const eslint = new ESLint({ cwd: path.join(__dirname, "..") });
    const results = await eslint.lintText('fetch("https://api.example.com");\n', {
      filePath: "settings.js",
    });
    const messages = results[0].messages;
    expect(messages.some((m) => /fetch/i.test(m.message))).toBe(true);
  });

  test("does not flag a fetch() call inside lib/providers/**", async () => {
    const eslint = new ESLint({ cwd: path.join(__dirname, "..") });
    const results = await eslint.lintText('fetch("https://api.example.com");\n', {
      filePath: "lib/providers/probe.js",
    });
    const messages = results[0].messages;
    expect(messages.some((m) => /fetch/i.test(m.message))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/eslint-config.test.js -t "Provider Pattern"`
Expected: FAIL — both assertions fail (no rule exists yet to flag or exempt anything).

- [ ] **Step 3: Add the rule**

In `eslint.config.js`, add a new config object (after the main `rules` block, before the `tests/**`/`e2e/**` override):

```js
  {
    ignores: ["lib/providers/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Only lib/providers/*.js may call fetch() directly (Provider Pattern, AGENTS.md Core Directive #4). Route AI-provider calls through lib/ai-service.js. If this is a legitimate non-AI fetch (a local extension resource via chrome.runtime.getURL, for example), add a commented eslint-disable-next-line explaining why.",
        },
      ],
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/eslint-config.test.js -t "Provider Pattern"`
Expected: PASS (2/2).

- [ ] **Step 5: Run lint to find the 5 real call sites that now need exceptions**

Run: `npm run lint`
Expected: FAIL, listing exactly `content/content.js:60`, `content/content.js:67`, `content/content.js:189`, `lib/i18n.js:10`, `lib/i18n.js:17` (confirm the line numbers match — they may have drifted a line or two from Task 1's reformat; use whatever `npm run lint`'s own output reports).

- [ ] **Step 6: Add the 5 inline exceptions**

In `content/content.js`, immediately above each of the two `fetch(` calls in its own local i18n-init function (around line 60 and 67 as of this plan; confirm against your own `npm run lint` output from Step 5):

```js
      // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
      const enRes = await fetch(enUrl);
```
```js
          // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
          const targetRes = await fetch(targetUrl);
```

And above the CSS-fetch call (around line 189, inside `ensureUiStyles()`'s `Promise.all(sheetPaths.map(...))`):

```js
        fetch(chrome.runtime.getURL(p)).then((response) => { // eslint-disable-line no-restricted-syntax -- local extension resource (design tokens/overlay CSS via chrome.runtime.getURL), not an AI provider call.
```

(Use `eslint-disable-line` here instead of `eslint-disable-next-line` since the call is on the same line as the `.map()` callback opening — match whichever inline-comment form actually lands the disable on the correct line once you see the real current code; the important part is the exact reasoning text, not the disable-comment's exact placement mechanics.)

In `lib/i18n.js`, immediately above each of its two `fetch(` calls (lines 10 and 17):

```js
      // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
      const enRes = await fetch(enUrl);
```
```js
          // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
          const targetRes = await fetch(targetUrl);
```

- [ ] **Step 7: Run lint to confirm clean**

Run: `npm run lint`
Expected: PASS (0 warnings, 0 errors).

- [ ] **Step 8: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add eslint.config.js content/content.js lib/i18n.js tests/eslint-config.test.js
git commit -m "feat: enforce the Provider Pattern via ESLint (no fetch() outside lib/providers/**)"
```

---

### Task 4: `lib/storage.js` — typed owner for the remaining Storage Map keys

**Files:**
- Create: `lib/storage.js`
- Create: `tests/lib/storage.test.js`

**Interfaces:**
- Produces (all async, all thin wrappers with no default-value opinions — callers keep applying their own fallbacks exactly as before, so this task changes *where* storage is accessed, not *what* any call site does with the result):
  - `getSyncPreferences(): Promise<{primaryLanguage?: string, defaultLanguage?: string}>`
  - `setSyncPreferences(prefs: {primaryLanguage: string, defaultLanguage: string}): Promise<void>`
  - `getPrimaryLanguage(): Promise<string|undefined>`
  - `getDefaultLanguage(): Promise<string|undefined>`
  - `getApiKey(keyName: string): Promise<string|undefined>` — generic, `keyName` is e.g. `"geminiApiKey"`
  - `getApiModel(): Promise<string|undefined>`
  - `getCurrentPreset(): Promise<string|undefined>`
  - `getCustomModelName(): Promise<string|undefined>`
  - `getCustomGatewayConfig(): Promise<{customGatewayBaseUrl?: string, customGatewayApiKey?: string, customGatewayModelName?: string}>`
  - `getLocalAiConfig(): Promise<Record<string, any>>` — bulk read matching `settings.js`'s `loadSettings()` shape exactly (all local AI-config keys plus `settings` in one round trip)
  - `setLocalAiConfig(config: Record<string, any>): Promise<void>`
  - `getSettingsBag(): Promise<Record<string, any>|undefined>`

```js
// lib/storage.js
/**
 * Omni AI - Storage
 * Typed owner for every Storage Map key not already owned by
 * lib/theme-manager.js (omni_ai_theme) or lib/history.js (history/usage
 * stats). See AGENTS.md's Storage Map and
 * docs/superpowers/specs/2026-09-02-code-quality-system-design.md.
 */

// ============================================
// Sync preferences (primaryLanguage, defaultLanguage)
// ============================================

export async function getSyncPreferences() {
  return chrome.storage.sync.get(["primaryLanguage", "defaultLanguage"]);
}

export async function setSyncPreferences(prefs) {
  return chrome.storage.sync.set(prefs);
}

export async function getPrimaryLanguage() {
  const { primaryLanguage } = await chrome.storage.sync.get("primaryLanguage");
  return primaryLanguage;
}

export async function getDefaultLanguage() {
  const { defaultLanguage } = await chrome.storage.sync.get("defaultLanguage");
  return defaultLanguage;
}

// ============================================
// Local AI config (keys, model, preset, custom gateway, custom model)
// ============================================

const LOCAL_AI_CONFIG_KEYS = [
  "geminiApiKey",
  "groqApiKey",
  "openaiApiKey",
  "anthropicApiKey",
  "apiModel",
  "customModelName",
  "currentPreset",
  "customGatewayBaseUrl",
  "customGatewayApiKey",
  "customGatewayModelName",
  "settings",
];

export async function getLocalAiConfig() {
  return chrome.storage.local.get(LOCAL_AI_CONFIG_KEYS);
}

export async function setLocalAiConfig(config) {
  return chrome.storage.local.set(config);
}

export async function getApiKey(keyName) {
  const result = await chrome.storage.local.get(keyName);
  return result[keyName];
}

export async function getApiModel() {
  const { apiModel } = await chrome.storage.local.get("apiModel");
  return apiModel;
}

export async function getCurrentPreset() {
  const { currentPreset } = await chrome.storage.local.get("currentPreset");
  return currentPreset;
}

export async function getCustomModelName() {
  const { customModelName } = await chrome.storage.local.get("customModelName");
  return customModelName;
}

export async function getCustomGatewayConfig() {
  return chrome.storage.local.get([
    "customGatewayBaseUrl",
    "customGatewayApiKey",
    "customGatewayModelName",
  ]);
}

export async function getSettingsBag() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings;
}
```

- [ ] **Step 1: Write the failing tests**

```js
// tests/lib/storage.test.js
import {
  getSyncPreferences,
  setSyncPreferences,
  getPrimaryLanguage,
  getDefaultLanguage,
  getLocalAiConfig,
  setLocalAiConfig,
  getApiKey,
  getApiModel,
  getCurrentPreset,
  getCustomModelName,
  getCustomGatewayConfig,
  getSettingsBag,
} from "../../lib/storage.js";

describe("lib/storage.js", () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
  });

  test("getSyncPreferences reads both language keys in one call", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "vi", defaultLanguage: "en" });
    await expect(getSyncPreferences()).resolves.toEqual({
      primaryLanguage: "vi",
      defaultLanguage: "en",
    });
    expect(chrome.storage.sync.get).toHaveBeenCalledWith(["primaryLanguage", "defaultLanguage"]);
  });

  test("setSyncPreferences writes both language keys", async () => {
    chrome.storage.sync.set.mockResolvedValue(undefined);
    await setSyncPreferences({ primaryLanguage: "fr", defaultLanguage: "de" });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      primaryLanguage: "fr",
      defaultLanguage: "de",
    });
  });

  test("getPrimaryLanguage returns undefined when unset (no opinionated default)", async () => {
    chrome.storage.sync.get.mockResolvedValue({});
    await expect(getPrimaryLanguage()).resolves.toBeUndefined();
  });

  test("getDefaultLanguage returns the stored value", async () => {
    chrome.storage.sync.get.mockResolvedValue({ defaultLanguage: "ja" });
    await expect(getDefaultLanguage()).resolves.toBe("ja");
  });

  test("getLocalAiConfig reads all local AI-config keys including settings in one call", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-3.6-flash" });
    await getLocalAiConfig();
    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      "geminiApiKey",
      "groqApiKey",
      "openaiApiKey",
      "anthropicApiKey",
      "apiModel",
      "customModelName",
      "currentPreset",
      "customGatewayBaseUrl",
      "customGatewayApiKey",
      "customGatewayModelName",
      "settings",
    ]);
  });

  test("setLocalAiConfig writes the given config object as-is", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    const config = { geminiApiKey: "abc", apiModel: "gemini-3.6-flash" };
    await setLocalAiConfig(config);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(config);
  });

  test("getApiKey reads a named key generically", async () => {
    chrome.storage.local.get.mockResolvedValue({ anthropicApiKey: "sk-ant-xyz" });
    await expect(getApiKey("anthropicApiKey")).resolves.toBe("sk-ant-xyz");
    expect(chrome.storage.local.get).toHaveBeenCalledWith("anthropicApiKey");
  });

  test("getApiModel returns undefined when unset", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await expect(getApiModel()).resolves.toBeUndefined();
  });

  test("getCurrentPreset returns the stored value", async () => {
    chrome.storage.local.get.mockResolvedValue({ currentPreset: "casual" });
    await expect(getCurrentPreset()).resolves.toBe("casual");
  });

  test("getCustomModelName returns the stored value", async () => {
    chrome.storage.local.get.mockResolvedValue({ customModelName: "llama-3.1-8b-instant" });
    await expect(getCustomModelName()).resolves.toBe("llama-3.1-8b-instant");
  });

  test("getCustomGatewayConfig reads all three gateway keys in one call", async () => {
    chrome.storage.local.get.mockResolvedValue({ customGatewayBaseUrl: "https://x.test/v1" });
    await getCustomGatewayConfig();
    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      "customGatewayBaseUrl",
      "customGatewayApiKey",
      "customGatewayModelName",
    ]);
  });

  test("getSettingsBag returns the stored settings object", async () => {
    chrome.storage.local.get.mockResolvedValue({ settings: { showFloatingButton: false } });
    await expect(getSettingsBag()).resolves.toEqual({ showFloatingButton: false });
  });

  test("getSettingsBag returns undefined when never saved", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await expect(getSettingsBag()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/lib/storage.test.js`
Expected: FAIL — `lib/storage.js` does not exist yet.

- [ ] **Step 3: Create `lib/storage.js`**

Use the full file content shown above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/lib/storage.test.js`
Expected: PASS (13/13).

- [ ] **Step 5: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/storage.js tests/lib/storage.test.js
git commit -m "feat: add lib/storage.js as the typed owner for the remaining Storage Map keys"
```

---

### Task 5: Migrate `settings.js` and `lib/i18n.js` to `lib/storage.js`

**Files:**
- Modify: `settings.js:1-3` (imports), `settings.js:481-553` (`loadSettings()`), `settings.js:555-599` (`saveSettings()`)
- Modify: `lib/i18n.js:1-9` (`init()`)
- Modify: `tests/settings.test.js` (read its current mocking pattern first, adapt to the new import)

**Interfaces:**
- Consumes: `getSyncPreferences`, `setSyncPreferences`, `getLocalAiConfig`, `setLocalAiConfig`, `getPrimaryLanguage` from `lib/storage.js` (Task 4).

- [ ] **Step 1: Update `settings.js`'s imports**

Add to the top of `settings.js` (alongside its existing `import { initTheme, applyTheme } from "./lib/theme-manager.js";`):

```js
import { getSyncPreferences, setSyncPreferences, getLocalAiConfig, setLocalAiConfig } from "./lib/storage.js";
```

- [ ] **Step 2: Migrate `loadSettings()`**

Replace the two direct `chrome.storage.*.get()` calls (currently `settings.js:486` and `settings.js:502-514`) with the storage.js equivalents. The theme value is now read via `theme-manager.js`'s own exported `getThemePreference()` instead of a raw `chrome.storage.sync.get(THEME_KEY)` — that avoids duplicating the exact key-reading logic `theme-manager.js` already owns and exports for this purpose (a small, deliberate architectural improvement — each owner module reads only its own keys).

**Flagging a small, intentional behavior side-effect, not a regression:** today, `settings.js`'s own code defaults the theme `<select>` to `"system"` when unset (`prefs[THEME_KEY] || "system"`), while `getThemePreference()` defaults to `THEMES.LIGHT`. This inconsistency already exists in the current codebase — the design-system plan (merged, released as v2.3.0) made `content.js`'s overlay use `getThemePreference()`'s canonical `"light"` default, but never updated `settings.js`'s own `<select>` to match, so today the two can disagree for a user who's never touched the selector. Routing through `getThemePreference()` here fixes that inconsistency as a side effect of this migration — mention it in this task's commit message, don't silently absorb it as an unrelated diff.

Update `settings.js`'s existing `theme-manager.js` import line to add it:

```js
import { initTheme, applyTheme, getThemePreference } from "./lib/theme-manager.js";
```

```js
export async function loadSettings() {
  try {
    // 1. Load Sync Preferences
    const currentTheme = await getThemePreference();
    const prefs = await getSyncPreferences();

    if (elements.themeSelector) {
      elements.themeSelector.value = currentTheme;
      applyTheme(elements.themeSelector.value);
    }
    const detectedLocale = detectSupportedLocale(
      chrome.i18n.getUILanguage(),
      SUPPORTED_LOCALES,
      "en",
    );
    if (elements.primaryLanguage) elements.primaryLanguage.value = prefs.primaryLanguage || detectedLocale;
    if (elements.defaultLanguage) elements.defaultLanguage.value = prefs.defaultLanguage || "en";

    // 2. Load Local AI Config
    /** @type {Record<string, any>} */
    const config = await getLocalAiConfig();

    if (config.geminiApiKey) elements.geminiApiKey.value = config.geminiApiKey;
    if (config.groqApiKey) elements.groqApiKey.value = config.groqApiKey;
    if (config.openaiApiKey) elements.openaiApiKey.value = config.openaiApiKey;
    if (config.anthropicApiKey) elements.anthropicApiKey.value = config.anthropicApiKey;
    if (config.customModelName) elements.customModelName.value = config.customModelName;

    // Custom Gateway config
    if (elements.customGatewayBaseUrl)
      elements.customGatewayBaseUrl.value = config.customGatewayBaseUrl || "";
    if (elements.customGatewayApiKey)
      elements.customGatewayApiKey.value = config.customGatewayApiKey || "";

    // Load custom model name for selected provider
    const savedModel = config.apiModel || DEFAULT_MODEL;
    populateModelSelect(savedModel);
    elements.apiModel.value = savedModel;
    if (!config.apiModel && !config.geminiApiKey) {
      elements.geminiApiKey?.focus();
    }
    if (savedModel === "custom-gateway" && config.customGatewayModelName) {
      elements.customModelName.value = config.customGatewayModelName;
    }
    const validPresets = ["professional", "casual", "friendly", "direct", "confident"];
    if (config.currentPreset && validPresets.includes(config.currentPreset)) {
      elements.defaultPreset.value = config.currentPreset;
    } else {
      elements.defaultPreset.value = "professional";
    }
    if (elements.showFloatingButton) {
      elements.showFloatingButton.value =
        config.settings?.showFloatingButton === false ? "off" : "on";
    }

    updateModelVisibility();
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}
```

**Note for the implementer:** `theme-manager.js` must actually export a `getThemePreference` function taking no arguments and returning the raw preference string (it does — confirmed present from the design-system plan's Task 3). Read `lib/theme-manager.js`'s current exports yourself before this step to confirm the name and signature haven't changed since.

- [ ] **Step 3: Migrate `saveSettings()`**

Replace `settings.js:558-598`:

```js
async function saveSettings() {
  try {
    // Preferences to Sync
    const preferences = {
      primaryLanguage: elements.primaryLanguage.value,
      defaultLanguage: elements.defaultLanguage.value,
    };
    await setSyncPreferences(preferences);
    await setThemePreference(elements.themeSelector.value); // theme-manager.js owns this key; import it alongside getThemePreference above

    // AI Config to Local
    /** @type {Record<string, any>} */
    const existingLocalSettings = await getSettingsBag(); // import getSettingsBag from ./lib/storage.js alongside the others
    const aiConfig = {
      geminiApiKey: elements.geminiApiKey.value.trim(),
      groqApiKey: elements.groqApiKey.value.trim(),
      openaiApiKey: elements.openaiApiKey.value.trim(),
      anthropicApiKey: elements.anthropicApiKey.value.trim(),
      apiModel: elements.apiModel.value,
      customModelName: elements.customModelName.value.trim(),
      currentPreset: elements.defaultPreset.value,
      customGatewayBaseUrl: elements.customGatewayBaseUrl.value.trim(),
      customGatewayApiKey: elements.customGatewayApiKey.value.trim(),
      settings: {
        ...(existingLocalSettings || {}),
        showFloatingButton: elements.showFloatingButton?.value !== "off",
      },
    };

    // Save custom model name to gateway-specific key if custom gateway is selected
    if (elements.apiModel.value === "custom-gateway") {
      aiConfig.customGatewayModelName = elements.customModelName.value.trim();
    }
    await setLocalAiConfig(aiConfig);

    showSaveStatus(i18n.getMessage("settings_saved"), "success");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showSaveStatus(i18n.getMessage("settings_failedToSave"), "error");
```

(the function's remaining lines — the `setTimeout` clearing the status message, the closing braces — are unchanged; only the storage-access lines change). Update the import line from Step 1 to also bring in `setThemePreference` from `theme-manager.js` and `getSettingsBag` from `storage.js`:

```js
import { initTheme, applyTheme, getThemePreference, setThemePreference } from "./lib/theme-manager.js";
import { getSyncPreferences, setSyncPreferences, getLocalAiConfig, setLocalAiConfig, getSettingsBag } from "./lib/storage.js";
```

**Note for the implementer:** confirm `theme-manager.js` exports `setThemePreference` with this exact name/signature (`(theme: string) => Promise<void>`) before this step — it's listed in the module's existing exports per `lib/theme-manager.js`'s own file (read it to confirm) and the design-system plan's Task 3 description of it.

- [ ] **Step 4: Migrate `lib/i18n.js`'s `init()`**

```js
import { getPrimaryLanguage } from "./storage.js";

export const i18n = {
  data: {},

  async init() {
    try {
      const primaryLanguage = await getPrimaryLanguage();
      const userLang = primaryLanguage || "en";
      // ...rest of the function unchanged (fetch calls already have their
      // eslint-disable-next-line comments from Task 3)
```

- [ ] **Step 5: Update `tests/settings.test.js`'s mocking**

Read `tests/settings.test.js`'s current mocking setup first (it currently exercises `loadSettings()`/`saveSettings()` against a raw `chrome.storage.*` mock, per the existing file — this plan's research didn't capture its exact current structure). Update whatever mocks/assertions target the old direct `chrome.storage.sync.get(["primaryLanguage","defaultLanguage",THEME_KEY])` / `chrome.storage.local.get([...])` call shapes to match the new `getSyncPreferences()`/`getThemePreference()`/`getLocalAiConfig()` calls instead — since these are still thin wrappers around the exact same underlying `chrome.storage.*` mock, most assertions on the *mock itself* (e.g. `chrome.storage.local.set` was called with X) should keep working unchanged; only assertions that inspected the *exact multi-key array shape* of a `.get()` call may need updating to match `lib/storage.js`'s internal key lists instead.

- [ ] **Step 6: Run settings tests**

Run: `npx jest tests/settings.test.js`
Expected: PASS. Fix any assertions Step 5 identified as needing updates until this is green.

- [ ] **Step 7: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add settings.js lib/i18n.js tests/settings.test.js
git commit -m "$(cat <<'EOF'
refactor: migrate settings.js and lib/i18n.js to lib/storage.js

Side effect: the theme <select> now reads via theme-manager.js's
getThemePreference() instead of duplicating its own chrome.storage.sync
read with a different default (settings.js defaulted to "system",
getThemePreference() defaults to "light" -- the same inconsistency the
design-system plan already fixed for the in-page overlay, never
propagated to Settings' own selector).
EOF
)"
```

---

### Task 6: Migrate `lib/ai-service.js` and `content/content.js` to `lib/storage.js`

**Files:**
- Modify: `lib/ai-service.js:34-56` (`generateContent()`'s custom-model resolution), `lib/ai-service.js:95` (gateway config read), `lib/ai-service.js:302-310` (`getProviderKey()`/`getModel()`)
- Modify: `content/content.js:47` (`initializeI18n()`), `content/content.js:858` (`showQuickActionMenu()`), `content/content.js:1106` (`handleAction()`'s tone-preset read)
- Modify: `tests/lib/ai-service.test.js` (read its current mocking pattern first, adapt to the new import)

**Interfaces:**
- Consumes: `getCustomGatewayConfig`, `getCustomModelName`, `getApiKey`, `getApiModel`, `getSyncPreferences`, `getCurrentPreset` from `lib/storage.js` (Task 4).

- [ ] **Step 1: Migrate `lib/ai-service.js`'s custom-model resolution**

Add the import at the top of `lib/ai-service.js`:

```js
import { getCustomGatewayConfig, getCustomModelName, getApiKey, getApiModel } from "./storage.js";
```

Replace the three `chrome.storage.local.get(...)` calls in the custom-model-resolution block (`lib/ai-service.js:34-56`):

```js
  if (activeModel.endsWith("-custom") || activeModel === "custom-gateway") {
    if (activeModel === "custom-gateway") {
      const { customGatewayModelName } = await getCustomGatewayConfig();
      if (customGatewayModelName) {
        activeModel = customGatewayModelName;
      }
      providerId = providerId || "customGateway";
    } else if (providerId === "customGateway") {
      const { customGatewayModelName } = await getCustomGatewayConfig();
      if (customGatewayModelName) {
        activeModel = customGatewayModelName;
      }
    } else {
      const providerKey = activeModel.split("-")[0];
      const customModelName = await getCustomModelName();
      if (customModelName) {
        activeModel = customModelName;
        providerId = providerId || providerKey;
      }
    }

    // Update isCustomGatewayModel after resolution
    isCustomGatewayModel = providerId === "customGateway";
  }
```

- [ ] **Step 2: Migrate the gateway-base-URL read**

Find the `chrome.storage.local.get(["customGatewayBaseUrl"])` call at `lib/ai-service.js:95` (read the surrounding function first — it wasn't part of this plan's research reads beyond confirming the line exists) and replace it with the same `getCustomGatewayConfig()` call (it already returns `customGatewayBaseUrl` alongside the other two gateway keys — destructure just the field this call site needs).

- [ ] **Step 3: Migrate `getProviderKey()`/`getModel()`**

Replace `lib/ai-service.js:302-310`:

```js
async function getProviderKey(keyName) {
  return getApiKey(keyName);
}

async function getModel() {
  const model = await getApiModel();
  return model || "";
}
```

(`getProviderKey()`/`getModel()` stay as private local functions with their existing names — only their bodies change to delegate to `lib/storage.js` — since they're called elsewhere in this same file and this plan's research didn't map every call site; keeping the names avoids needing to.)

- [ ] **Step 4: Migrate `content/content.js`'s three call sites**

Add the import near `content.js`'s other top-level imports:

```js
import { getSyncPreferences, getCurrentPreset } from "../lib/storage.js";
```

(Confirm `content.js`'s actual import style first — it may use dynamic `import()` for other lib modules rather than static imports, per the design-system plan's pattern for `lib/theme-manager.js`, since content scripts are classic scripts, not ES modules, for most of the file. If `content.js` is NOT natively an ES module, use the same dynamic-import pattern already established there: `const { getSyncPreferences, getCurrentPreset } = await import(chrome.runtime.getURL("lib/storage.js"));` at each call site, or hoist one shared dynamic import the way `ensureUiTheme()` does for `theme-manager.js` — match whichever pattern the file already uses, don't introduce a third style.)

Replace `content.js:42-54` (`initializeI18n()`'s callback-style read):

```js
async function initializeI18n() {
  try {
    let primaryLanguage = "en";
    if (isContextValid()) {
      try {
        const { getPrimaryLanguage } = await import(chrome.runtime.getURL("lib/storage.js"));
        primaryLanguage = (await getPrimaryLanguage()) || "en";
      } catch {
        primaryLanguage = "en";
      }
    }
```

(This also resolves a small pre-existing inconsistency worth calling out, not fixing here: `content.js`'s own i18n init previously defaulted to `"en"` on any error including context-invalidation, same as `lib/i18n.js`'s module-level `init()` — the two are still two separate implementations of "read primaryLanguage and load messages," which is a pre-existing duplication out of this plan's scope to merge.)

Replace `content.js:858` (inside `showQuickActionMenu()`):

```js
      const data = await getSyncPreferences();
      primaryLanguage = data.primaryLanguage || "vi";
      defaultLanguage = data.defaultLanguage || "en";
```

(Read the surrounding `try`/`catch` at `content.js:841-851` first — from this plan's earlier research, this call sits inside a `try` block already; keep that structure, only replace the `chrome.storage.sync.get(["primaryLanguage", "defaultLanguage"])` line itself.)

Replace `content.js:1106`:

```js
    const currentPreset = await getCurrentPreset();
```

(the surrounding `const validTones = [...]` logic below it is unchanged.)

- [ ] **Step 5: Update `tests/lib/ai-service.test.js`'s mocking**

Read its current mocking setup first (not captured in this plan's research). Same principle as Task 5 Step 5: most assertions against the underlying `chrome.storage.local` mock should keep working since `lib/storage.js` is a thin pass-through; only assertions checking the exact `.get()` call-argument shape may need adjusting.

- [ ] **Step 6: Run the affected unit tests**

Run: `npx jest tests/lib/ai-service.test.js`
Expected: PASS. Fix any assertions Step 5 identified as needing updates.

- [ ] **Step 7: Run the full verify + e2e suites**

Run: `npm run verify && npx playwright test`
Expected: PASS — the e2e run specifically exercises `content.js`'s real behavior in a browser, which Jest alone can't for this file.

- [ ] **Step 8: Commit**

```bash
git add lib/ai-service.js content/content.js tests/lib/ai-service.test.js
git commit -m "refactor: migrate lib/ai-service.js and content.js to lib/storage.js"
```

---

### Task 7: Migrate `background/service-worker.js`, then turn on the Storage Map ESLint rule

**Files:**
- Modify: `background/service-worker.js` (language-preference reads at lines ~446-476, ~559-592; `getApiKey()` at ~653-656; documented inline exceptions for the session-storage frame tracker at ~22-45, the bulk defaults-merge at ~183-189, and the theme-change tab-broadcast listener at ~230)
- Modify: `eslint.config.js` (adds the Storage Map rule — must be the last file-touching step in this task, after every consumer above is migrated)
- Modify: `tests/background/service-worker.test.js` (read its current mocking pattern first — it already provides a full `chrome.storage.{local,session}` mock per this plan's research, so most tests should need no changes; only tests asserting the exact shape of a `.get()` call may need updating)

**Interfaces:**
- Consumes: `getSyncPreferences`, `getApiKey` from `lib/storage.js` (Task 4).

This is the **capstone** task: the Storage Map ESLint rule can only be turned on once every consumer (Tasks 5, 6, and this task) is migrated, or CI breaks immediately on files not yet touched. Do the migration steps first, confirm `npm run verify` passes with the rule still absent, then add the rule as the final step and confirm it also passes (proving nothing was missed).

- [ ] **Step 1: Migrate the language-preference reads**

Add the import near `service-worker.js`'s existing imports:

```js
import { getSyncPreferences, getApiKey as getStoredApiKey } from "../lib/storage.js";
```

(Aliased as `getStoredApiKey` because this file already has its own locally-defined `getApiKey()` function at line ~653 with a different, narrower signature — see Step 3.)

Replace each of the seven `chrome.storage.sync.get(...)` call sites for `primaryLanguage`/`defaultLanguage` (at `service-worker.js:446`, `:452`, `:461`, `:467`, `:476`, `:559`, `:566`, `:572`, `:582`, `:588` — confirm the exact current set via `grep -n 'chrome.storage.sync.get' background/service-worker.js` first, since line numbers may have shifted since this plan's research reads) with `getSyncPreferences()`, destructuring only the field(s) each specific `case` actually uses. For example, the `"translate"` case (currently `service-worker.js:444-448`):

```js
    case "translate": {
      const { defaultLanguage } = await getSyncPreferences();
      result = await translateText(selectedText, options.targetLanguage || defaultLanguage || "en");
      break;
    }
```

and the `"smart_translate"` case (currently `service-worker.js:450-457`):

```js
    case "smart_translate": {
      const { primaryLanguage, defaultLanguage } = await getSyncPreferences();
      result = await smartTranslate(selectedText, primaryLanguage || "vi", defaultLanguage || "en");
      break;
    }
```

Apply the same pattern (replace the single-purpose `chrome.storage.sync.get("primaryLanguage")`/`chrome.storage.sync.get("defaultLanguage")` calls with `getSyncPreferences()`, destructuring only what's used) to every remaining case in both the `processSelectedText()`-style switch (lines ~444-479) and the second switch handling the equivalent context-menu/`WRITING_ACTION` path (lines ~556-594) — the two switches mirror each other exactly per this plan's research reads, so the same five-case transformation applies twice.

- [ ] **Step 2: Run the affected tests**

Run: `npx jest tests/background/service-worker.test.js`
Expected: PASS (adjust any `.get()`-call-shape assertions per the note in the Files section above).

- [ ] **Step 3: Migrate `getApiKey()`**

Replace `service-worker.js:653-656`:

```js
/**
 * Get API key from storage
 */
async function getApiKey() {
  return (await getStoredApiKey("geminiApiKey")) || "";
}
```

- [ ] **Step 4: Run tests again, then the full verify suite**

Run: `npx jest tests/background/service-worker.test.js && npm run verify`
Expected: PASS.

- [ ] **Step 5: Commit the migration (rule not yet added)**

```bash
git add background/service-worker.js
git commit -m "refactor: migrate background/service-worker.js's language/API-key reads to lib/storage.js"
```

- [ ] **Step 6: Write a failing test proving the Storage Map rule fires**

```js
// Add to tests/eslint-config.test.js
describe("Storage Map ESLint rule", () => {
  test("flags a direct chrome.storage.local.get() call in a non-owner file", async () => {
    const eslint = new ESLint({ cwd: path.join(__dirname, "..") });
    const results = await eslint.lintText('chrome.storage.local.get("x");\n', {
      filePath: "settings.js",
    });
    const messages = results[0].messages;
    expect(messages.some((m) => /storage/i.test(m.message))).toBe(true);
  });

  test("does not flag chrome.storage usage inside lib/storage.js itself", async () => {
    const eslint = new ESLint({ cwd: path.join(__dirname, "..") });
    const results = await eslint.lintText('chrome.storage.local.get("x");\n', {
      filePath: "lib/storage.js",
    });
    const messages = results[0].messages;
    expect(messages.some((m) => /storage/i.test(m.message))).toBe(false);
  });

  test("does not flag chrome.storage usage inside lib/theme-manager.js or lib/history.js", async () => {
    const eslint = new ESLint({ cwd: path.join(__dirname, "..") });
    for (const filePath of ["lib/theme-manager.js", "lib/history.js"]) {
      const results = await eslint.lintText('chrome.storage.sync.get("x");\n', { filePath });
      expect(results[0].messages.some((m) => /storage/i.test(m.message))).toBe(false);
    }
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest tests/eslint-config.test.js -t "Storage Map"`
Expected: FAIL — no rule exists yet.

- [ ] **Step 8: Add the rule**

In `eslint.config.js`, extend the Provider Pattern config object added in Task 3 (or add a sibling one — either is fine, they can share the same `ignores`-shaped ESLint object structure) with a second restricted-syntax entry. Full updated block:

```js
  {
    ignores: ["lib/providers/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Only lib/providers/*.js may call fetch() directly (Provider Pattern, AGENTS.md Core Directive #4). Route AI-provider calls through lib/ai-service.js. If this is a legitimate non-AI fetch (a local extension resource via chrome.runtime.getURL, for example), add a commented eslint-disable-next-line explaining why.",
        },
      ],
    },
  },
  {
    ignores: ["lib/theme-manager.js", "lib/history.js", "lib/storage.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.object.name='chrome'][object.object.property.name='storage']",
          message:
            "Only lib/theme-manager.js (omni_ai_theme), lib/history.js (history/usage stats), and lib/storage.js (everything else) may access chrome.storage.* directly (Storage Map contract, AGENTS.md). Route new storage access through one of those three, or add a commented eslint-disable-next-line explaining why this call is a genuine exception (e.g. session-scoped ephemeral state, a one-time bulk defaults merge).",
        },
      ],
    },
  },
```

**Note for the implementer:** verify this selector's exact shape against the two test cases in Step 6 before moving on — `MemberExpression[object.object.object.name='chrome']...` targets the `sync`/`local`/`session` segment of a `chrome.storage.sync.get(...)` call (i.e. matches on the `chrome.storage.sync` member expression, three levels deep: `chrome` → `.storage` → `.sync`/`.local`/`.session`). If the two Step-6 tests don't both pass with this exact selector, adjust it (esquery selector debugging is iterative) until they do — do not proceed to Step 9 with a rule that hasn't been proven against both test cases.

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest tests/eslint-config.test.js -t "Storage Map"`
Expected: PASS (3/3).

- [ ] **Step 10: Run lint to find every remaining direct call site needing an exception**

Run: `npm run lint`
Expected: FAIL, listing every `chrome.storage.*` access in `background/service-worker.js` not yet migrated — this should be exactly: the session-storage frame-tracker (`getActiveEditorFrame`/`rememberActiveEditorFrame`/`clearActiveEditorFrame`, 3 call sites), the bulk `onInstalled` defaults-merge (`chrome.storage.local.get(null)` / `chrome.storage.local.set(merged)`, 2 call sites), and the theme-change tab-broadcast listener (`chrome.storage.onChanged.addListener(...)`, 1 call site) — 6 total. If `npm run lint` shows anything else, a call site was missed in Tasks 5–7's earlier steps; go back and migrate it instead of adding an exception here.

- [ ] **Step 11: Add the 6 documented inline exceptions**

Above `getActiveEditorFrame`'s `chrome.storage.session.get(...)` call:

```js
async function getActiveEditorFrame(tabId) {
  if (activeEditorFrames.has(tabId)) return activeEditorFrames.get(tabId);

  // eslint-disable-next-line no-restricted-syntax -- ephemeral, per-tab, session-scoped frame-routing state; not a Storage Map preference/secret, doesn't fit lib/storage.js's typed-key model.
  const stored = await chrome.storage.session.get(activeEditorFrameKey(tabId));
  const frameId = stored[activeEditorFrameKey(tabId)];
  if (Number.isInteger(frameId)) activeEditorFrames.set(tabId, frameId);
  return frameId;
}

function rememberActiveEditorFrame(tabId, frameId) {
  activeEditorFrames.set(tabId, frameId);
  // eslint-disable-next-line no-restricted-syntax -- see getActiveEditorFrame above.
  return chrome.storage.session.set({ [activeEditorFrameKey(tabId)]: frameId });
}

function clearActiveEditorFrame(tabId) {
  activeEditorFrames.delete(tabId);
  // eslint-disable-next-line no-restricted-syntax -- see getActiveEditorFrame above.
  return chrome.storage.session.remove(activeEditorFrameKey(tabId));
}
```

Above the bulk defaults-merge in the `onInstalled` handler:

```js
  /** @type {Record<string, any>} */
  // eslint-disable-next-line no-restricted-syntax -- one-time (well, on every install/update) bulk read-merge-write of every default; doesn't fit a per-key typed accessor.
  const existing = await chrome.storage.local.get(null);
  const merged = {
    ...defaults,
    ...existing,
    settings: { ...defaults.settings, ...(existing.settings || {}) },
  };
  // eslint-disable-next-line no-restricted-syntax -- see above.
  await chrome.storage.local.set(merged);
```

Above the theme-change broadcast listener:

```js
// eslint-disable-next-line no-restricted-syntax -- observes omni_ai_theme changes to broadcast THEME_CHANGED to tabs; lib/theme-manager.js owns the key itself but has no concept of "broadcast to all tabs" (a service-worker-only capability).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.omni_ai_theme) {
```

- [ ] **Step 12: Run lint to confirm clean**

Run: `npm run lint`
Expected: PASS (0 warnings, 0 errors).

- [ ] **Step 13: Run the full verify + e2e suites**

Run: `npm run verify && npx playwright test`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add eslint.config.js background/service-worker.js tests/eslint-config.test.js
git commit -m "feat: enforce the Storage Map contract via ESLint (no chrome.storage.* outside 3 owner files)"
```

---

### Task 8: Pre-commit hook (husky + lint-staged)

**Files:**
- Modify: `package.json`
- Create: `.husky/pre-commit`

**Interfaces:**
- Consumes: nothing.
- Produces: `git commit` runs ESLint + Prettier against staged files locally; does not replace CI.

- [ ] **Step 1: Install the two dev dependencies**

Run: `npm install --save-dev husky lint-staged`

- [ ] **Step 2: Add the `prepare` script and `lint-staged` config to `package.json`**

Add `"prepare": "husky"` to `"scripts"`, and a top-level `"lint-staged"` key:

```json
  "scripts": {
    ...(existing scripts unchanged)...
    "prepare": "husky"
  },
  "lint-staged": {
    "*.js": ["eslint --max-warnings 0", "prettier --check"],
    "*.{css,html,md,json}": ["prettier --check"]
  }
```

- [ ] **Step 3: Initialize husky and the pre-commit hook**

Run: `npx husky init` (creates `.husky/pre-commit` with the default `npm test` content), then replace its content:

```sh
npx lint-staged
```

- [ ] **Step 4: Verify the hook fires**

Stage a file with a deliberate lint violation (e.g. `console.log(1==1)` appended to a scratch file, `git add` it), run `git commit -m "test"` , confirm the commit is REJECTED with a lint error, then `git reset` and discard the scratch file before continuing.

- [ ] **Step 5: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .husky
git commit -m "chore: add husky + lint-staged pre-commit hook (local fast-feedback only, not a CI replacement)"
```

---

### Task 9: Dependency hygiene (Dependabot + scoped `npm audit`)

**Files:**
- Create: `.github/dependabot.yml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.

Re-verified before writing this task: `npm audit --omit=dev --audit-level=high` reports **0 vulnerabilities** (production dependencies are entirely clean — this `package.json` in fact has no `"dependencies"` key at all, only `"devDependencies"`, so this check is currently vacuous but protects against a future production dependency shipping with a known vulnerability). The FULL `npm audit --audit-level=high` (no `--omit=dev`) currently reports **11 high-severity findings**, all transitive dependencies of `web-ext` (`js-yaml`, `lodash`, `picomatch`, `ws`) — verified that neither `npm audit fix` nor `npm audit fix --force` can resolve them (both dry-runs leave the same 21 total vulnerabilities). Since `web-ext` is a devDependency used only for `npm run dev` and `npm run lint:webext` and never ships in the built extension zip (`scripts/publish.sh` zips only source files, not `node_modules`), this plan scopes the blocking gate to `--omit=dev` rather than the spec's literal (unscoped) wording — an unscoped gate would fail CI immediately and permanently until an upstream `web-ext` fix exists, which isn't a real fix, just a broken build. This deviation is deliberate; do not "fix" it back to the unscoped form.

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

- [ ] **Step 2: Add the audit step to `ci.yml`'s `verify` job**

In `.github/workflows/ci.yml`, add a step to the `verify` job, after `npm ci` and before `npm run verify`:

```yaml
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
      - run: npm run verify
```

- [ ] **Step 3: Confirm the new step passes locally**

Run: `npm audit --omit=dev --audit-level=high`
Expected: PASS (`found 0 vulnerabilities`).

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml .github/workflows/ci.yml
git commit -m "chore: add Dependabot + a production-scoped npm audit CI gate"
```

---

### Task 10: PR template + CODEOWNERS

**Files:**
- Create: `.github/pull_request_template.md`
- Create: `.github/CODEOWNERS`

**Interfaces:**
- Consumes: nothing.

- [ ] **Step 1: Create `.github/CODEOWNERS`**

Per the user's explicit choice (whole-repo ownership, not path-scoped):

```
* @ddtcorex
```

- [ ] **Step 2: Create `.github/pull_request_template.md`**

Mirrors `AGENTS.md`'s "Agent Checklist" section as literal checkboxes:

```markdown
## Summary

<!-- What does this PR do, and why? -->

## Agent Checklist

- [ ] No framework imports, no bundler assumptions — files still load raw in the browser
- [ ] New UI renders inside the Shadow DOM root using tokens (`--omni-accent`, `--omni-glass-bg`, …) from `lib/design-tokens.css` / components from `lib/design-system.css` — never hardcode colors
- [ ] Every new `onMessage` case that replies asynchronously returns `true`
- [ ] Text replacement verified for `input` + `textarea` + `contenteditable`
- [ ] Every user-facing string goes through i18n (`_locales/en/messages.json`) — zero hardcoded visible text
- [ ] `npm test` green; no leftover `console.log`s (warnings/errors OK)

## Test Plan

<!-- How was this verified? Commands run, manual smoke steps, screenshots if UI changed. -->
```

- [ ] **Step 3: Commit**

```bash
git add .github/CODEOWNERS .github/pull_request_template.md
git commit -m "chore: add CODEOWNERS and a PR template mirroring AGENTS.md's Agent Checklist"
```

---

### Task 11: Final verification

**Files:**
- Modify: `AGENTS.md` (File Map gains `lib/storage.js`; note the two new ESLint rules somewhere appropriate, e.g. near the Storage Map table and the Provider Pattern directive)

**Interfaces:**
- Consumes: the completed state of Tasks 1–10 (must run last).

- [ ] **Step 1: Update `AGENTS.md`**

In the File Map's `lib/` block, add a line for `lib/storage.js` (mirroring the existing `theme-manager.js`/`history.js` entries' style — one line noting it owns the remaining Storage Map keys). Near Core Directive #4 (Provider Pattern) and the Storage Map section, add a one-line note that both are now ESLint-enforced, not just documented (e.g. "enforced via `eslint.config.js`'s `no-restricted-syntax` rules, not just this prose").

- [ ] **Step 2: Run the complete verification suite**

Run: `npm run verify && npx playwright test`
Expected: PASS — every unit test, lint (including both new rules), format check, manifest lint, typecheck, and e2e spec green.

- [ ] **Step 3: Confirm the pre-commit hook and CI step are both wired correctly one more time**

Run: `git log -1 --format=%H` then `git show --stat HEAD` to eyeball that Task 8's `.husky/pre-commit` and Task 9's `dependabot.yml`/`ci.yml` changes are all present in history (a sanity check that no task's commit was accidentally skipped).

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: reflect lib/storage.js and the new ESLint enforcement in AGENTS.md"
```

---

## Self-Review Notes

(Recorded here per the writing-plans skill's self-review requirement — not part of the plan an implementer follows.)

- **Spec coverage:** Architecture §1 (lint/format gaps) → Task 1. §2 (coverage) → Task 2. §3 (Provider Pattern + Storage Map) → Tasks 3–7. §4 (the `return true` limitation) → stated in Global Constraints, no task needed (correctly, per the spec, since it's explicitly not automatable). §5 (pre-commit hook) → Task 8. §6 (dependency hygiene) → Task 9. §7 (PR template + CODEOWNERS) → Task 10. Testing section's three bullets → Task 1 Step 5 (verify stays green), Task 2 Step 4 (coverage-threshold regression proof), Tasks 3/7 (ESLint rule fail/pass proofs). Every "Open Question for the Implementation Plan" the spec listed is resolved: ESLint severities (Task 1), `web-ext lint` placement (folded into `verify`, Task 1), CODEOWNERS granularity (whole-repo, per direct user confirmation during this plan's writing).
- **Deviations from the spec's literal text, and why (flagging per this plan's own re-verification mandate):** (1) Coverage thresholds use freshly re-measured numbers (~35%/~31%/~85%/~95%/~56% depending on glob) instead of the spec's stale evidence (17.49%/~90%), since the design-system branch landed between the spec being written and this plan. (2) The Provider Pattern rule needs 5 documented inline exceptions (content.js ×3, lib/i18n.js ×2) for legitimate local-resource fetches the spec's evidence-gathering didn't check for. (3) The Storage Map rule's scope expanded beyond the spec's enumerated key list to also cover the `settings` bag and (via documented exceptions, not migration) the session-storage frame tracker and the bulk `onInstalled` defaults-merge — both real `chrome.storage.*` access patterns the spec's Architecture §3 didn't enumerate. (4) The dependency-hygiene gate is scoped to `npm audit --omit=dev` rather than the spec's unscoped wording, since an unscoped gate would fail permanently on 11 unfixable `web-ext`-transitive high-severity findings that never ship to end users.
- **Type/name consistency:** every `lib/storage.js` export name introduced in Task 4 (`getSyncPreferences`, `setSyncPreferences`, `getPrimaryLanguage`, `getDefaultLanguage`, `getApiKey`, `getApiModel`, `getCurrentPreset`, `getCustomModelName`, `getCustomGatewayConfig`, `getLocalAiConfig`, `setLocalAiConfig`, `getSettingsBag`) is consumed by name identically in Tasks 5, 6, and 7 — cross-checked against Task 4's own test file's import list, which names the same twelve functions.
- **Known research gaps, flagged inline rather than silently guessed** (matching the design-system plan's established, accepted pattern for this): Task 5 Step 5 and Task 6 Step 5 ask the implementer to read `tests/settings.test.js`/`tests/lib/ai-service.test.js`'s current mocking structure themselves (not captured in this plan's research reads); Task 6 Step 4 asks the implementer to confirm `content.js`'s actual import style for `lib/` modules (static vs. dynamic) before choosing the exact migration shape; Task 6 Steps 1–2 ask the implementer to read `lib/ai-service.js`'s surrounding function at line 95 themselves.
