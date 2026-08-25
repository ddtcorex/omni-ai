# Omni AI Engineering Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 known bugs, then give Omni AI a high-speed, guarded development loop: conventions tooling (ESLint/Prettier/typecheck), a formalized GitFlow, an expanded test suite, and GitHub CI — all preserving the zero-build vanilla-JS directive.

**Architecture:** No bundler enters the dev loop. Type checking is JSDoc-based (`tsc --checkJs`), linting is ESLint flat config, dev reload is Mozilla `web-ext`, E2E is Playwright against bundled Chromium (`channel: 'chromium'` — Chrome removed side-load flags). CI gates PRs with `npm run verify`; a tag-triggered workflow packages and releases zips produced by the existing `scripts/publish.sh`.

**Tech Stack:** Vanilla ES modules · Manifest V3 · Jest 27 + jest-chrome (kept) · web-ext · TypeScript checker-only · ESLint 10 · Prettier · Playwright · GitHub Actions

**Spec:** `AGENTS.md` (Known Issues §, Storage Map, Verification Checklist) + `docs/dev-tooling.md` (verified tooling research, wiring snippets).

## Global Constraints

- **Zero-build:** browser loads source files raw; NO bundler, NO framework (AGENTS.md Core Directive 1)
- **MV3 only**; background is `"type": "module"` service worker
- **Storage contract:** `sync` = user prefs (`primaryLanguage`, `defaultLanguage`, `omni_ai_theme`, `user`); `local` = keys/config/history — never mix areas (AGENTS.md Directive 5)
- Every async `runtime.onMessage` reply MUST `return true`
- User-facing strings via `_locales/*/messages.json` (i18n)
- Node ≥ 20 (web-ext 10.x requirement)
- Conventional Commits (`feat|fix|chore|docs|style|refactor|test:`) — already de facto in `git log`
- `scripts/publish.sh` stays the packaging source of truth (strips `manifest.key`, swaps prod OAuth client_id)
- License GPL-3.0 unchanged; do not touch `manifest.json` `"key"`

## File Structure (what this plan creates/changes)

```
omni-ai/
|-- background/service-worker.js      # MODIFY  T1,T2: storage area + return true
|-- tests/background/service-worker.test.js  # MODIFY  T1,T2: new cases
|-- tests/lib/ai-service.test.js      # MODIFY  T3: current prompt wording
|-- lib/auth.js                       # DELETE  T4 (dead code)
|-- lib/prompts.js                    # DELETE  T4 (dead code)
|-- package.json                      # MODIFY  T5: devDeps + scripts
|-- tsconfig.json                     # CREATE  T5: checkJs config
|-- .gitignore                        # MODIFY  T5: profile/test artifacts
|-- eslint.config.js                  # CREATE  T6
|-- .prettierrc.json                  # CREATE  T6
|-- .prettierignore                   # CREATE  T6
|-- .editorconfig                     # CREATE  T7
|-- CONTRIBUTING.md                   # CREATE  T7,T8: conventions + GitFlow
|-- .github/workflows/ci.yml          # CREATE  T9
|-- .github/workflows/release.yml     # CREATE  T10
|-- tests/lib/providers/custom-gateway.test.js  # CREATE T11
|-- tests/lib/providers/openai.test.js          # CREATE T11
|-- playwright.config.js              # CREATE  T12
|-- e2e/extension.fixtures.js         # CREATE  T12
|-- e2e/smoke.spec.js                 # CREATE  T12
|-- AGENTS.md                         # MODIFY  T1-T4: retire fixed Known Issues
```

---

## Phase A — Correctness (bug fixes first, everything else builds on green)

### Task 1: Fix language-prefs storage-area mismatch (Known Issue #2)

**Files:**
- Modify: `background/service-worker.js` (all `storage.local` reads of `primaryLanguage`/`defaultLanguage` — around lines 499–537 and 627–637)
- Modify: `tests/background/service-worker.test.js`
- Modify: `AGENTS.md` (Known Issues)

**Interfaces:**
- Consumes: existing `handleQuickAction` message flow (`QUICK_ACTION` → `smart_translate`)
- Produces: service worker reads BOTH language keys exclusively from `chrome.storage.sync` — matches writers (`settings.js` saveSettings) and readers (`content.js`, `lib/i18n.js`)

- [ ] **Step 1: Note the harness facts (verified against the current file)**

`tests/background/service-worker.test.js` builds a MANUAL chrome mock (`chromeMock`) in `beforeEach` (not jest-chrome), auto-mocks `../../lib/ai-service` + `../../lib/history` via top-level `jest.mock`, and triggers messages via `const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0]`. Append every new test INSIDE the existing `describe("Service Worker Integration")` so it inherits that `beforeEach`.

- [ ] **Step 2: Write the failing test**

Add inside the existing `describe("Service Worker Integration")` (after the WRITING_ACTION test):

```js
it("QUICK_ACTION smart_translate reads languages from storage.sync", async () => {
  const AIService = await import("../../lib/ai-service");
  const History = await import("../../lib/history");

  await import("../../background/service-worker");
  const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

  AIService.smartTranslate.mockResolvedValue("TRANSLATED");
  History.addToHistory.mockResolvedValue({});
  chromeMock.tabs.query.mockResolvedValue([{ id: 123, url: "http://example.com" }]);
  chromeMock.storage.sync.get.mockResolvedValue({ primaryLanguage: "en", defaultLanguage: "vi" });

  const sendResponse = jest.fn();
  const returned = listener(
    { type: "QUICK_ACTION", payload: { action: "smart_translate", preset: "casual", text: "xin chao" } },
    {},
    sendResponse,
  );
  expect(returned).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const syncKeys = chromeMock.storage.sync.get.mock.calls.map((c) => c[0]).flat();
  expect(syncKeys).toEqual(expect.arrayContaining(["primaryLanguage", "defaultLanguage"]));
  // regression guard: the local area must no longer be consulted for these keys
  const localKeys = chromeMock.storage.local.get.mock.calls.map((c) => c[0]).flat();
  expect(localKeys).not.toContain("primaryLanguage");
  expect(localKeys).not.toContain("defaultLanguage");
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest tests/background/service-worker.test.js`
Expected: FAIL — `storage.local` was called with `"primaryLanguage"` (regression-guard assertion trips).

- [ ] **Step 4: Implement the fix**

In `background/service-worker.js`, change every language-pref read from local to sync (5 sites):

```js
// BEFORE: await chrome.storage.local.get("primaryLanguage");
await chrome.storage.sync.get("primaryLanguage");
// BEFORE: await chrome.storage.local.get("defaultLanguage");
await chrome.storage.sync.get("defaultLanguage");
```

Sites: `handleQuickAction` (translate/smart_translate/translate_primary/translate_default/explain) and `processSelectedText` (translate_primary/translate_default). Do NOT touch API-key/model reads — those legitimately live in `local`.

- [ ] **Step 5: Run to verify green**

Run: `npm test`
Expected: all suites PASS (the 2 pre-existing stale failures in ai-service.test.js are fixed in Task 3 — if they are the ONLY failures, that is acceptable at this checkpoint).

- [ ] **Step 6: Retire the Known Issue**

In `AGENTS.md` Known Issues: delete item 2. In Storage Map nothing changes (sync was always the intent).

- [ ] **Step 7: Commit**

```bash
git add background/service-worker.js tests/background/service-worker.test.js AGENTS.md
git commit -m "fix(background): read language prefs from storage.sync to match writers"
```

---

### Task 2: Fix GET_API_KEY missing `return true` (Known Issue #1)

**Files:**
- Modify: `background/service-worker.js` (case `GET_API_KEY`, ~line 220)
- Modify: `tests/background/service-worker.test.js`
- Modify: `AGENTS.md` (Known Issues)

**Interfaces:**
- Produces: `GET_API_KEY` responds `{ success: true, apiKey: string }` asynchronously; listener returns `true` (channel stays open)

- [ ] **Step 1: Write the failing test**

Add inside `describe("Service Worker Integration")` (same harness as Task 1):

```js
it("GET_API_KEY keeps channel open and replies asynchronously", async () => {
  await import("../../background/service-worker");
  const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

  chromeMock.storage.local.get.mockResolvedValue({ geminiApiKey: "k-test" });
  const sendResponse = jest.fn();
  const returned = listener({ type: "GET_API_KEY" }, {}, sendResponse);

  expect(returned).toBe(true); // FAILS before the fix: handler returns undefined
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(sendResponse).toHaveBeenCalledWith({ success: true, apiKey: "k-test" });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/background/service-worker.test.js`
Expected: FAIL — `returned` is `undefined` (no `return true`) and/or fall-through triggered `VALIDATE_CONFIG` ("API Key is missing").

- [ ] **Step 3: Implement**

```js
    case "GET_API_KEY":
      getApiKey()
        .then((key) => sendResponse({ success: true, apiKey: key }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
```

- [ ] **Step 4: Verify + retire Known Issue #1**

Run: `npm test` — new test passes. Remove item 1 from `AGENTS.md` Known Issues.

- [ ] **Step 5: Commit**

```bash
git add background/service-worker.js tests/background/service-worker.test.js AGENTS.md
git commit -m "fix(background): return true for async GET_API_KEY response"
```

---

### Task 3: Sync stale prompt tests with v2.1.0 wording (Known Issue #3)

**Files:**
- Modify: `tests/lib/ai-service.test.js` (lines ~113, ~125–126)

**Interfaces:** Consumes: current `getSystemPrompt()` output in `lib/ai-service.js:306-334`

- [ ] **Step 1: Update assertions to the shipped prompts**

```js
// test "improveText generates correct prompt"
expect(callArgs[0]).toContain(
  "You are a helpful writing assistant who uses simple, everyday language",
);

// test "rephrase prefers simple words and uses lower default temperature"
expect(callArgs[0]).toContain("simple, common words that ordinary people use in daily life");
expect(callArgs[0]).toContain("Avoid fancy, formal, or rare vocabulary");
// temperature assertion (0.15) stays as-is — behavior unchanged
```

Rule going forward (also in Task 7's CONTRIBUTING): prompt-wording changes ship together with their test updates in one commit.

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: 18/18 PASS — suite fully green for the first time.

- [ ] **Step 3: Retire Known Issue #3 + commit**

Remove item 3 from `AGENTS.md` Known Issues, then:

```bash
git add tests/lib/ai-service.test.js AGENTS.md
git commit -m "test(ai-service): update prompt assertions to v2.1.0 simple-language wording"
```

---

### Task 4: Delete dead code (`lib/auth.js`, `lib/prompts.js`)

**Files:**
- Delete: `lib/auth.js`, `lib/prompts.js`
- Modify: `AGENTS.md` (file map ⚠ markers + Known Issues item 4)

- [ ] **Step 1: Re-verify zero references**

Run: `grep -rn "lib/auth\|lib/prompts\|from \"./auth\|from \"./prompts" background/ content/ popup/ settings.js lib/ tests/ || echo CLEAN`
Expected: `CLEAN` (if anything appears, STOP and reassess instead of deleting).

- [ ] **Step 2: Delete + update docs**

```bash
git rm lib/auth.js lib/prompts.js
```

In `AGENTS.md`: drop the two ⚠ file-map lines and remove Known Issue 4.

- [ ] **Step 3: Verify + commit**

Run: `npm test` → PASS (nothing imported them).

```bash
git add AGENTS.md
git commit -m "chore(lib): remove unused auth and prompts modules"
```

---

## Phase B — Conventions tooling (the speed stack, zero-build preserved)

### Task 5: Dev dependencies, npm scripts, typecheck config

**Files:**
- Modify: `package.json`, `.gitignore`
- Create: `tsconfig.json`

**Interfaces:**
- Produces (consumed by CI in Task 9): scripts `dev`, `typecheck`, `lint`, `lint:webext`, `verify`, `e2e`

- [ ] **Step 1: Install**

```bash
npm i -D web-ext typescript @types/chrome eslint@^10 globals eslint-config-prettier prettier @playwright/test
```

- [ ] **Step 2: Wire scripts**

In `package.json` `scripts`:

```json
{
  "dev": "web-ext run --target chromium --source-dir . --chromium-profile ./.webext-profile",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "lint:webext": "web-ext lint --source-dir .",
  "test": "jest",
  "e2e": "playwright test",
  "verify": "npm run typecheck && npm run lint && npm test",
  "package": "bash scripts/publish.sh"
}
```

Also fix metadata while here: delete `"main": "settings.js"`, rewrite `description` without the leading `"> "`.

- [ ] **Step 3: Lenient-first tsconfig**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
  },
  "include": ["lib/**/*.js", "background/**/*.js", "content/**/*.js", "popup/**/*.js", "settings.js"]
}
```

- [ ] **Step 4: Run typecheck — apply the decision rule**

Run: `npx tsc --noEmit`
- If ≤ 20 errors and each is a small annotation fix (`@param {string}` etc.): fix them now in the same commit.
- If more / any structural: keep config as-is, add `"exclude": ["<problem-dir>"]` for the worst dir, and record a follow-up TODO in CONTRIBUTING ("tighten checkJs incrementally"). CI must enter green.

- [ ] **Step 5: Ignore dev artifacts**

Append to `.gitignore`:

```
# Extension dev tooling
.webext-profile/
test-results/
playwright-report/
```

- [ ] **Step 6: Verify + commit**

Run: `npm run verify` → green.

```bash
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore(tooling): add web-ext/typescript-checkjs/eslint/prettier/playwright with npm scripts"
```

---

### Task 6: ESLint flat config + Prettier (one-time format commit)

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`

**Interfaces:** Consumes: `globals`, `eslint-config-prettier` (Task 5). Produces: `npm run lint` exit-code gate for CI.

- [ ] **Step 1: Create `eslint.config.js`** (repo is `"type": "commonjs"` → CommonJS)

```js
const globals = require("globals");

module.exports = [
  { ignores: ["dist/**", "node_modules/**", ".webext-profile/**", "coverage/**", "playwright-report/**", "test-results/**"] },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-var": "warn",
      eqeqeq: ["warn", "smart"],
    },
  },
  {
    files: ["tests/**/*.js", "e2e/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
];
```

Warn-level (not error) on day one = deterministic green; tightening to `--max-warnings=0` is an explicit follow-up after cleanup.

- [ ] **Step 2: Autofix + triage**

Run: `npx eslint . --fix && npx eslint .`
Fix remaining errors manually (expected: few). Warnings may remain. Run `npm test`.

- [ ] **Step 3: Prettier config + one-time format**

`.prettierrc.json`:

```json
{ "printWidth": 100, "endOfLine": "lf" }
```

`.prettierignore`:

```
dist/
node_modules/
package-lock.json
.webext-profile/
playwright-report/
test-results/
```

Run: `npx prettier --write . && npm run verify`
Expected: green. The format diff is large — it lands alone so blame stays bisectable.

- [ ] **Step 4: Two commits**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json package-lock.json \
  && git commit -m "chore(conventions): add eslint flat config and prettier"
git add -A && git commit -m "style: one-time prettier pass across sources"
```

---

### Task 7: `.editorconfig` + `CONTRIBUTING.md` (coding conventions)

**Files:**
- Create: `.editorconfig`, `CONTRIBUTING.md`

- [ ] **Step 1: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 2: Create `CONTRIBUTING.md`** — conventions half (GitFlow half lands in Task 8)

```markdown
# Contributing to Omni AI

Agent/human contributors alike: `AGENTS.md` is the technical handbook (architecture, message protocol,
storage contract, checklists) and `docs/dev-tooling.md` documents the toolchain. This file covers HOW we work.

## Skills Are Mandatory
Superpowers process skills are symlinked at `.claude/skills/` + `.agents/skills/`. Every session starts
with `using-superpowers` and follows AGENTS.md § Skills Protocol (brainstorming → features,
systematic-debugging → bugs, TDD → implementation, verification-before-completion → done claims).

## Code Conventions
- Vanilla ES modules only — no frameworks, no bundler (see AGENTS.md Core Directives)
- Style enforced by ESLint + Prettier (`npm run lint`); formatting via `npx prettier --write <files>`
- Types: annotate new/changed functions with JSDoc; `npm run typecheck` must stay green
- Storage areas are a contract: prefs → `chrome.storage.sync`, secrets/config → `chrome.storage.local`
- Any async `onMessage` reply must `return true`
- User-facing strings go through `_locales/*/messages.json` (add to `en` first)

## Commit Convention (Conventional Commits)
`feat|fix|chore|docs|style|refactor|test: imperative summary` — e.g. `fix(content): preserve newlines in textarea replace`.
Prompt-wording changes in `lib/ai-service.js` MUST update `tests/lib/ai-service.test.js` in the SAME commit.

## Testing Policy
- Unit: Jest + jest-chrome (`npm test`) — required for `lib/` and `background/` changes
- E2E: Playwright (`npm run e2e`) — required for content-script UI behavior changes
- Before opening a PR: `npm run verify` green locally

## PR Checklist
- [ ] `npm run verify` green
- [ ] New UI renders inside the Shadow DOM root using existing CSS tokens
- [ ] Manual smoke per AGENTS.md checklist when touching content scripts
```

- [ ] **Step 3: Verify + commit**

```bash
git add .editorconfig CONTRIBUTING.md
git commit -m "docs(conventions): add contributing guide and editorconfig"
```

---

## Phase C — GitFlow

### Task 8: Formalize branching & release model

**Files:**
- Modify: `CONTRIBUTING.md` (append section)

**Context:** repo already has `master` + `origin/develop`; history merges PRs into `master` with `chore: release vX.Y.Z` commits — we formalize exactly this, plus release branches.

- [ ] **Step 1: Append the model to `CONTRIBUTING.md`**

```markdown
## Branching Model (GitFlow-lite)
- `master` — production only. Every commit here is tagged `vX.Y.Z`. Protected.
- `develop` — integration branch. Always shippable.
- `feature/<short-name>` — cut FROM develop, PR back INTO develop.
- `fix/<short-name>` — same as feature/ for bugfixes.
- `release/vX.Y.Z` — cut FROM develop when version-up time (bump manifest/package + CHANGELOG),
  PR INTO master, then tag. Merge-back the release commit into develop.
- `hotfix/<desc>` — critical fix cut FROM master, PR INTO master, tag patch bump,
  then merge back into develop.

Rules:
1. Never commit directly to `master` or `develop` — PRs only.
2. Squash-merge is fine for feature branches; merge commits for releases.
3. Version bumps happen ONLY in release/hotfix branches (Keep-a-Changelog CHANGELOG.md updated there).
4. Tags (`v2.2.0`…) trigger `.github/workflows/release.yml` (packaging + GitHub Release).
```

- [ ] **Step 2: Sync local branches**

```bash
git fetch origin && git switch develop && git pull --ff-only origin develop
```

- [ ] **Step 3: Branch protection (GitHub UI checklist — manual, record in PR description)**

On github.com → Settings → Branches → Add rule for `master` AND `develop`:
- Require pull request before merging (1 approval is fine solo)
- Require status checks: `verify` (appears after first CI run, Task 9)
- Block force pushes & deletions

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md && git commit -m "docs(gitflow): formalize branching and release model"
```

---

## Phase D — GitHub CI

### Task 9: PR/push CI (`ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** Consumes: `npm run verify`, `npm run e2e` (Tasks 5, 12). Produces: required status check named `verify` (used by Task 8 protection rules).

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master, develop]

jobs:
  verify:
    name: verify (typecheck + lint + unit)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run verify

  e2e:
    name: e2e (playwright)
    runs-on: ubuntu-latest
    continue-on-error: true   # flip to false in Task 12 once smoke spec is stable
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

- [ ] **Step 2: Local dry-run sanity**

Run: `act` is NOT assumed — validate statically: `npx yaml-lint .github/workflows/ci.yml` (or `node -e "require('fs').readFileSync('.github/workflows/ci.yml')" && echo ok` if yaml-lint isn't available). Real validation happens on first push.

- [ ] **Step 3: Push and watch first run**

Push the branch → PR into `develop` → check the Actions tab: `verify` must be green; `e2e` allowed to fail (nothing to run yet — Playwright exits 0 with "no tests found"? If it ERRORS instead, add `--pass-with-no-tests` equivalent: `npx playwright test || test -f playwright-report/.no-tests-marker` — simplest correct form: leave as-is until Task 12 adds specs, since `continue-on-error: true` absorbs it).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add verify + e2e workflows for PRs and develop/master pushes"
```

---

### Task 10: Tag-triggered release workflow (`release.yml`)

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:** Consumes: `scripts/publish.sh` (unchanged — strips dev key, swaps prod OAuth client_id, writes `dist/omni-ai-v$VERSION.zip`). Trigger: tags `v*` pushed after merging a release branch (Task 8 model).

- [ ] **Step 1: Confirm tag convention**

Run: `git tag -l | tail -5`
Expected: `vX.Y.Z` style (matches CHANGELOG). If different, adjust the `tags` filter below.

- [ ] **Step 2: Create the workflow**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  package:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build store zip (publish.sh strips dev key + swaps OAuth client_id)
        run: |
          sudo apt-get update -y && sudo apt-get install -y zip
          bash scripts/publish.sh
      - uses: actions/upload-artifact@v4
        with:
          name: chrome-web-store-zip
          path: dist/*.zip
      - name: Attach zip to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.zip
          generate_release_notes: true
      # Optional CWS upload — enable after storing repo secrets:
      #   CWS_APP_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
      # - name: Upload to Chrome Web Store
      #   env:
      #     EXTENSION_ID: ${{ secrets.CWS_APP_ID }}
      #     CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
      #     CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
      #     REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
      #   run: npx chrome-webstore-upload-cli upload --source dist/*.zip --auto-publish
```

- [ ] **Step 3: Dry-run the packaging leg locally**

Run: `npm run package && unzip -l dist/omni-ai-v*.zip | tail -3`
Expected: zip lists `manifest.json` (without `"key"`), all source dirs. Restore check: `git diff --stat` shows no dirty `manifest.json` afterwards.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): package store zip and attach to GitHub Releases on v* tags"
```

---

## Phase E — Test suite expansion

### Task 11: Provider unit tests — Custom Gateway (incl. SSE parser) + OpenAI

**Files:**
- Create: `tests/lib/providers/custom-gateway.test.js`
- Create: `tests/lib/providers/openai.test.js`

**Interfaces:** Consumes: `generateContent(prompt, config)` contract of `lib/providers/custom-gateway.js` and `lib/providers/openai.js`. These are characterization tests of shipped behavior — if one fails, that is a REAL bug: fix the provider, not the test (then note it in the commit).

- [ ] **Step 1: Custom Gateway tests**

```js
"use strict";
const { ReadableStream: NodeReadableStream } = require("node:stream/web");
const { TextEncoder: NodeTextEncoder } = require("node:util");

function sseResponse(chunks, contentType = "text/event-stream") {
  const encoder = new NodeTextEncoder();
  const stream = new NodeReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return { ok: true, headers: new Map([["content-type", contentType]]), body: stream };
}

// adapter so the provider's `response.headers.get(...)` works with our Map
function wrapHeaders(res) {
  res.headers = { get: (k) => (k.toLowerCase() === "content-type" ? [...res.headers][0][1] : null) };
  return res;
}

describe("custom-gateway provider", () => {
  let generateContent;
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
    global.ReadableStream = global.ReadableStream || NodeReadableStream;
    global.TextEncoder = global.TextEncoder || NodeTextEncoder;
    generateContent = require("../../../lib/providers/custom-gateway.js").generateContent;
  });

  test("throws without baseUrl", async () => {
    await expect(generateContent("hi", { apiKey: "k", model: "m" })).rejects.toThrow(/base url/i);
  });

  test("parses standard SSE deltas", async () => {
    global.fetch.mockResolvedValue(
      wrapHeaders(sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        "data: [DONE]\n\n",
      ])),
    );
    await expect(generateContent("hi", { baseUrl: "https://gw.example/", apiKey: "k", model: "m" }))
      .resolves.toBe("Hello");
  });

  test("falls back to DeepSeek-style reasoning_content", async () => {
    global.fetch.mockResolvedValue(
      wrapHeaders(sseResponse(['data: {"choices":[{"delta":{"reasoning_content":"abc"}}]}\n\n'])),
    );
    await expect(generateContent("hi", { baseUrl: "https://gw.example", model: "deepseek-r" }))
      .resolves.toBe("abc");
  });

  test("handles malformed bare-JSON lines (no data: prefix)", async () => {
    global.fetch.mockResolvedValue(
      wrapHeaders(sseResponse(['{"choices":[{"message":{"content":"plain"}}]}\n'])),
    );
    await expect(generateContent("hi", { baseUrl: "https://gw.example", model: "m" }))
      .resolves.toBe("plain");
  });

  test("non-streaming JSON maps message.content and strips trailing slash in URL", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "answer" } }] }),
    });
    await expect(generateContent("hi", { baseUrl: "https://gw.example/", apiKey: "k", model: "gpt-x" }))
      .resolves.toBe("answer");
    expect(global.fetch.mock.calls[0][0]).toBe("https://gw.example/chat/completions");
  });

  test("surfaces gateway error messages", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: async () => ({ error: { message: "quota exceeded" } }),
    });
    await expect(generateContent("hi", { baseUrl: "https://gw.example", model: "m" }))
      .rejects.toThrow("quota exceeded");
  });
});
```

Note: `sseResponse`'s `headers` is replaced by `wrapHeaders` to mimic `response.headers.get()` without pulling in undici internals. If the runtime `Response` class is available under jsdom+Node 20, prefer the direct `new Response(stream, { headers })` form from `docs/dev-tooling.md` §4 and drop the wrapper.

- [ ] **Step 2: OpenAI provider test**

First: `cat lib/providers/openai.js` — then write, aligned to its actual endpoint/fields:

```js
describe("openai provider", () => {
  let generateContent;
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
    generateContent = require("../../../lib/providers/openai.js").generateContent;
  });

  test("POSTs chat/completions with Bearer auth and returns message.content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    await expect(generateContent("prompt", { apiKey: "sk-test", model: "gpt-4o-mini", temperature: 0.3 }))
      .resolves.toBe("ok");
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain("api.openai.com");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body).model).toBe("gpt-4o-mini");
  });

  test("throws on http error payloads", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: async () => ({ error: { message: "invalid key" } }),
    });
    await expect(generateContent("p", { apiKey: "bad", model: "gpt-4o" })).rejects.toThrow("invalid key");
  });
});
```

- [ ] **Step 3: Run**

Run: `npx jest tests/lib/providers -v`
Expected: ALL PASS. Any failure = real provider bug discovered → fix provider in a separate `fix(providers): …` commit, keep tests as written.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/providers/
git commit -m "test(providers): characterize custom-gateway SSE parsing and openai mapping"
```

---

### Task 12: Playwright E2E smoke + promote the CI e2e job

**Files:**
- Create: `playwright.config.js`, `e2e/extension.fixtures.js`, `e2e/smoke.spec.js`
- Modify: `.github/workflows/ci.yml` (flip `continue-on-error`)

**Interfaces:** Consumes: unpacked extension = repo root; Shadow DOM host created by `content/content.js` (`OMNI_UI_HOST_ID` constant, ~line 110). Produces: `npm run e2e` green; CI `e2e` becomes a required check candidate.

- [ ] **Step 1: Host-id constant (verified)**

`content/content.js:114` → `const OMNI_UI_HOST_ID = "omni-ai-shadow-host"` — used verbatim below.

- [ ] **Step 2: Create `playwright.config.js`**

```js
module.exports = {
  testDir: "e2e",
  timeout: 30000,
  use: { headless: true },
};
```

- [ ] **Step 3: Create `e2e/extension.fixtures.js`** (pattern from docs/dev-tooling.md §4)

```js
const { chromium } = require("@playwright/test");
const http = require("node:http");
const path = require("node:path");

const EXT_PATH = path.resolve(__dirname, "..");

async function launchWithExtension() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", // REQUIRED post flag-removal; enables headless
    headless: true,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  return { context, sw };
}

function serveFixtureHtml(html) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { launchWithExtension, serveFixtureHtml };
```

- [ ] **Step 4: Create `e2e/smoke.spec.js`**

```js
const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

const HOST_SEL = "#omni-ai-shadow-host"; // OMNI_UI_HOST_ID, content/content.js:114

const FIXTURE = `<!doctype html><html><body>
<p id="target">The quick brown fox jumps over the lazy dog.</p>
</body></html>`;

test("selecting text mounts the Omni AI shadow UI", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    // drag-select the sentence
    const box = await page.locator("#target").boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    const host = page.locator(HOST_SEL);
    await expect(host).toHaveCount(1);
    const mounted = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const root = el && el.shadowRoot;
      return !!root && root.querySelectorAll("[class*='omni']").length > 0;
    }, HOST_SEL);
    expect(mounted).toBe(true);
  } finally {
    await context.close();
    server.close();
  }
});
```

(The host element itself is 0×0 — assert on shadow-root CONTENT, not visibility.)

- [ ] **Step 5: Run locally**

Run: `npm run e2e`
Expected: PASS. If flaky on timing, raise `timeout` in the config — do NOT add sleeps. If `chromium` channel is unavailable, run `npx playwright install chromium` first.

- [ ] **Step 6: Promote CI e2e job**

In `.github/workflows/ci.yml`: change `continue-on-error: true` → `false`.

- [ ] **Step 7: Full verify + commits**

Run: `npm run verify && npm run e2e` → all green.

```bash
git add playwright.config.js e2e/ .github/workflows/ci.yml
git commit -m "test(e2e): shadow-DOM smoke spec via playwright chromium; make e2e CI blocking"
```

---

## Final Task: Closeout

- [ ] Run `npm run verify && npm run e2e` on the integration branch — full green
- [ ] `AGENTS.md` Known Issues section now empty → replace with "None currently 🎉" line; Dev Loop section already points at `docs/dev-tooling.md`
- [ ] Merge plan-execution branch → `develop` (PR), watch both CI jobs green
- [ ] Follow-up backlog (NOT this plan): tighten `no-unused-vars` to error + `--max-warnings=0`; flip `strict: true` incrementally; add `lint:webext` to CI once warning baseline is triaged; CWS upload secrets + uncomment release job
