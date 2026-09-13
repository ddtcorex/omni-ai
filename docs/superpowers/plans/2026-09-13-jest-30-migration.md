# Jest 30 Migration (drop jest-chrome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move omni-ai's unit-test stack from jest 27.5.1 to jest 30.5.1 and replace the abandoned `jest-chrome` mock with a repo-owned, explicit chrome mock, so the dependency cluster is consistent again and dependabot PR #151 can be retired.

**Architecture:** Two independent changes, deliberately sequenced so each has its own failure surface. First a new repo-owned Chrome API mock (`tests/helpers/chrome-mock.js`) with its own unit test, swapped into `jest.setup.js` while jest is still 27 so parity with `jest-chrome` is proven before anything else moves. Only then the version bump (jest + jest-environment-jsdom to `^30.5.1`, `jest-chrome` removed), followed by triage of whatever jest 30 and jsdom 26 actually break. Documentation and the pull request close it out.

**Tech Stack:** Jest 30, jest-environment-jsdom 30, babel-jest 30 (already on master), jsdom 26 under the hood, Node 20 in CI and Node 24 locally.

**Spec:** none. This is a bounded change whose design was approved in session on 2026-09-13; the Architecture section above is the design record.

## Global Constraints

- CI runs **Node 20** (`.github/workflows/ci.yml`, `node-version: 20`); this machine runs Node 24. jest 30 supports `^18.14.0 || ^20.0.0 || >=22.0.0`, so both are in range, but Node 20 is the version that decides the merge.
- **No new dependencies.** Exactly one dependency is removed: `jest-chrome`.
- `babel-jest` stays at `^30.5.1` and `@babel/core` at `^7.28.6`. Do not start the Babel 7 to 8 major upgrade in this plan (dependabot PRs #140 and #142 were closed for exactly that reason).
- Coverage thresholds in `jest.config.js` must **not** be lowered. `collectCoverageFrom` already excludes `tests/**`, so the new helper needs no threshold entry.
- `service-worker.test.js` keeps its own hand-written chrome mock. Do not refactor it onto the shared helper in this plan.
- All code comments, commit messages and docs are English.
- Pre-push gate (from `AGENTS.md`): `npm run verify` **and** `npx playwright test` must both be green before any push. A red local state is never pushed.
- If a jest 30 breakage can only be made green by weakening an assertion, **stop and report** instead of changing the assertion.
- Git identity for this repo (remote is github.com, not sutunam): `git config user.name "Toan Do"` and `git config user.email "kaido4492@gmail.com"`.
- Never commit to `master`. All work happens on `chore/jest-30-migration`.

---

### Task 1: Repo-owned Chrome API mock

**Files:**
- Create: `tests/helpers/chrome-mock.js`
- Test: `tests/helpers/chrome-mock.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createChromeMock(): ChromeMock` exported from `tests/helpers/chrome-mock.js` via CommonJS (`module.exports = { createChromeMock }`). Every leaf method is a `jest.fn()`; every event object exposes `addListener`, `removeListener`, `hasListener`, `hasListeners`, `dispatch`, all `jest.fn()`s.

- [ ] **Step 1: Write the failing test**

Create `tests/helpers/chrome-mock.test.js`:

```js
const { createChromeMock } = require("./chrome-mock");

describe("chrome-mock helper", () => {
  it("creates an independent mock per call", () => {
    const first = createChromeMock();
    const second = createChromeMock();

    expect(first).not.toBe(second);
    expect(first.storage.local.get).not.toBe(second.storage.local.get);
  });

  it("exposes every Chrome API the extension calls, as jest.fn()s", () => {
    const chrome = createChromeMock();
    const methodPaths = [
      "runtime.getManifest",
      "runtime.getURL",
      "runtime.sendMessage",
      "runtime.connect",
      "runtime.openOptionsPage",
      "storage.local.get",
      "storage.local.set",
      "storage.local.remove",
      "storage.local.clear",
      "storage.local.getBytesInUse",
      "storage.sync.get",
      "storage.sync.set",
      "storage.sync.remove",
      "storage.sync.clear",
      "storage.sync.getBytesInUse",
      "storage.session.get",
      "storage.session.set",
      "storage.session.remove",
      "storage.session.clear",
      "storage.session.getBytesInUse",
      "tabs.query",
      "tabs.sendMessage",
      "tabs.create",
      "i18n.getMessage",
      "i18n.getUILanguage",
      "contextMenus.create",
      "contextMenus.removeAll",
      "sidePanel.setPanelBehavior",
      "sidePanel.open",
    ];

    for (const path of methodPaths) {
      const fn = path.split(".").reduce((node, key) => node[key], chrome);
      expect(typeof fn).toBe("function");
      // It must be a jest mock, not a plain function: the suite configures
      // every one of these with mockResolvedValue / mockImplementation.
      expect(typeof fn.mockImplementation).toBe("function");
    }
  });

  it("exposes every event the extension subscribes to, with addListener", () => {
    const chrome = createChromeMock();
    const eventPaths = [
      "runtime.onMessage",
      "runtime.onInstalled",
      "runtime.onConnect",
      "storage.onChanged",
      "tabs.onUpdated",
      "tabs.onActivated",
      "contextMenus.onClicked",
      "commands.onCommand",
    ];

    for (const path of eventPaths) {
      const event = path.split(".").reduce((node, key) => node[key], chrome);
      expect(typeof event.addListener.mockImplementation).toBe("function");
      expect(typeof event.removeListener).toBe("function");
      expect(typeof event.hasListener).toBe("function");
    }
  });

  it("keeps jest-chrome's undefined defaults for value properties and unstubbed methods", async () => {
    const chrome = createChromeMock();

    expect(chrome.runtime.id).toBeUndefined();
    expect(chrome.runtime.lastError).toBeUndefined();
    await expect(chrome.storage.local.get("apiModel")).resolves.toBeUndefined();
  });

  it("supports the storage mocking style the existing suite uses", async () => {
    const chrome = createChromeMock();

    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-3.6-flash" });
    await expect(chrome.storage.local.get("apiModel")).resolves.toEqual({
      apiModel: "gemini-3.6-flash",
    });
    expect(chrome.storage.local.get).toHaveBeenCalledWith("apiModel");

    chrome.storage.local.get.mockReset();
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(0);
  });

  it("lets a listener registered through addListener be invoked like the real event", () => {
    const chrome = createChromeMock();
    const listener = jest.fn();

    chrome.runtime.onMessage.addListener(listener);
    const registered = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    registered({ type: "PING" }, {}, jest.fn());

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
    expect(listener).toHaveBeenCalledWith({ type: "PING" }, {}, expect.any(Function));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/helpers/chrome-mock.test.js`

Expected: FAIL. `Cannot find module './chrome-mock' from 'tests/helpers/chrome-mock.test.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `tests/helpers/chrome-mock.js`:

```js
"use strict";

/**
 * Shared Chrome extension API mock for Jest unit tests.
 *
 * Replaces the abandoned `jest-chrome` package (last publish 0.8.0, peer
 * `jest@^26.0.1 || ^27.0.0`), which cannot be installed next to jest 30.
 *
 * The surface is explicit rather than a Proxy that fabricates a `jest.fn()`
 * for every property: when a test or a module under test reaches for a Chrome
 * API that is not listed here, it throws a TypeError instead of silently
 * receiving `undefined`, so the gap cannot be missed.
 *
 * Defaults mirror jest-chrome's: every method is a bare `jest.fn()` returning
 * `undefined`, and value properties (`runtime.id`, `runtime.lastError`) are
 * `undefined`. Tests keep configuring implementations themselves with
 * `mockResolvedValue` / `mockImplementation`, exactly as before.
 *
 * Call sites this covers, keep in sync when the extension adopts a new API:
 * - lib/storage.js, lib/history.js, lib/theme-manager.js: storage.*, storage.onChanged
 * - lib/ai-service.js, lib/providers/*: i18n.getMessage
 * - background/service-worker.js: runtime.*, contextMenus, commands, sidePanel, tabs.*
 * - content/content.js: runtime.getURL, runtime.sendMessage, runtime.lastError, i18n.*
 * - sidepanel/sidepanel.js: runtime.connect
 * - settings.js: runtime.getManifest, storage.*
 *
 * `chrome.runtime.Port` is a JSDoc type reference only, so it needs no runtime shape.
 */

function createEvent() {
  return {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(() => false),
    hasListeners: jest.fn(() => false),
    dispatch: jest.fn(),
  };
}

function createStorageArea() {
  return {
    clear: jest.fn(),
    get: jest.fn(),
    getBytesInUse: jest.fn(),
    remove: jest.fn(),
    set: jest.fn(),
  };
}

function createChromeMock() {
  return {
    runtime: {
      id: undefined,
      lastError: undefined,
      getManifest: jest.fn(),
      getURL: jest.fn(),
      sendMessage: jest.fn(),
      connect: jest.fn(),
      openOptionsPage: jest.fn(),
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onConnect: createEvent(),
    },
    storage: {
      local: createStorageArea(),
      sync: createStorageArea(),
      session: createStorageArea(),
      onChanged: createEvent(),
    },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn(),
      create: jest.fn(),
      onUpdated: createEvent(),
      onActivated: createEvent(),
    },
    i18n: {
      getMessage: jest.fn(),
      getUILanguage: jest.fn(),
    },
    contextMenus: {
      create: jest.fn(),
      removeAll: jest.fn(),
      onClicked: createEvent(),
    },
    commands: {
      onCommand: createEvent(),
    },
    sidePanel: {
      setPanelBehavior: jest.fn(),
      open: jest.fn(),
    },
  };
}

module.exports = { createChromeMock };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/helpers/chrome-mock.test.js`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/chrome-mock.js tests/helpers/chrome-mock.test.js
git commit -m "test(helpers): add explicit chrome API mock to replace jest-chrome"
```

---

### Task 2: Swap the mock into jest.setup.js (still on jest 27)

**Files:**
- Modify: `jest.setup.js:1`
- Modify: `package.json:55` (remove `jest-chrome`)
- Modify: `package-lock.json` (regenerated by npm)

**Interfaces:**
- Consumes: `createChromeMock()` from Task 1.
- Produces: `global.chrome` available to every test file, one instance per test file, with the same shape jest-chrome provided.

- [ ] **Step 1: Rewire the setup file**

Replace line 1 of `jest.setup.js`:

```js
Object.assign(global, require("jest-chrome"));
```

with:

```js
// Repo-owned Chrome API mock. `jest-chrome` is abandoned (peer jest ^26 || ^27)
// and blocks jest 30; see tests/helpers/chrome-mock.js for the covered surface.
global.chrome = require("./tests/helpers/chrome-mock").createChromeMock();
```

Leave the Node-global polyfill block below it untouched.

- [ ] **Step 2: Prove parity while jest is still 27**

Run: `npm test`

Expected: PASS, 28 test suites, 0 failures. `jest-chrome` is still installed but unused; any test that depended on a jest-chrome behavior this mock does not reproduce fails here, with the version bump still out of the picture.

- [ ] **Step 3: Run the full gate to confirm nothing else regressed**

Run: `npm run verify`

Expected: exit 0 (typecheck, lint with 0 warnings, prettier check, jest with coverage thresholds).

- [ ] **Step 4: Remove the dependency**

Run: `npm uninstall jest-chrome`

Expected: `package.json` no longer lists `jest-chrome`; `package-lock.json` loses `node_modules/jest-chrome` and its nested `@types/chrome@0.0.114`.

- [ ] **Step 5: Confirm nothing still references it**

Run: `grep -rn "jest-chrome" --include=*.js --include=*.json . --exclude-dir=node_modules`

Expected: no hits in `package.json`, `jest.setup.js` or `package-lock.json`. Hits in `AGENTS.md` are expected and fixed in Task 4.

- [ ] **Step 6: Re-run the gate without the package installed**

Run: `npm run verify`

Expected: exit 0. This is the real proof the mock is self-sufficient.

- [ ] **Step 7: Commit**

```bash
git add jest.setup.js package.json package-lock.json
git commit -m "test(setup): use the repo-owned chrome mock and drop jest-chrome"
```

---

### Task 3: Bump jest and jest-environment-jsdom to 30

**Files:**
- Modify: `package.json:54` (`jest`), `package.json:56` (`jest-environment-jsdom`)
- Modify: `package-lock.json`
- Modify: any test or config file that jest 30 or jsdom 26 genuinely breaks

**Interfaces:**
- Consumes: the shared mock wired in Task 2.
- Produces: `jest@30.5.1` and `jest-environment-jsdom@30.5.1` resolved in the lockfile, with `babel-jest@30.5.1` now matching.

- [ ] **Step 1: Bump both packages**

Run: `npm install --save-dev jest@^30.5.1 jest-environment-jsdom@^30.5.1`

- [ ] **Step 2: Confirm the resolved tree is consistent**

Run: `npm ls jest jest-environment-jsdom babel-jest jsdom`

Expected: `jest@30.5.1`, `jest-environment-jsdom@30.5.1`, `babel-jest@30.5.1`, `jsdom@26.x` (hoisted under jest-environment-jsdom). No `ERESOLVE`, no `invalid` markers.

- [ ] **Step 3: Run the unit suite**

Run: `npm test`

Expected: PASS. Anything that fails here is a real jest 30 or jsdom 26 behavior change, and is diagnosed in the next step rather than guessed at.

- [ ] **Step 4: Triage any failure to its root cause**

Known candidates, each with the command that isolates it:

- jsdom-heavy suites (`tests/settings.test.js`, `tests/design-system.test.js`, `tests/manifest.test.js`, `tests/design-tokens.test.js`):
  `npx jest tests/settings.test.js --verbose`
- fake timers (`tests/settings.test.js` uses `jest.useFakeTimers()` + `advanceTimersByTime`):
  `npx jest tests/settings.test.js -t "debounce" --verbose`
- provider streaming suites, which rely on the Node polyfills in `jest.setup.js`:
  `npx jest tests/lib/providers --verbose`
- config resolution complaints from jest 30 itself:
  `npx jest --showConfig | head -40`

Fix the cause, not the symptom. If the only way to green a test is to weaken or delete an assertion, stop and report the exact test, the exact failure text, and the proposed weakening, and wait for a decision.

- [ ] **Step 5: Run the full gate**

Run: `npm run verify`

Expected: exit 0.

- [ ] **Step 6: Run the e2e suite**

Run: `npx playwright test`

Expected: PASS. Playwright does not use jest, so a failure here means something outside the migration changed; investigate before proceeding.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): upgrade jest and jest-environment-jsdom to 30.5.1"
```

Add any test or config file changed during triage to the same commit.

---

### Task 4: Update the handbook

**Files:**
- Modify: `AGENTS.md:87` (file map: `Jest + jest-chrome + jsdom`)
- Modify: `AGENTS.md:162` (`npm test` line)
- Modify: `AGENTS.md:166` (`jest.setup.js` provides `jest-chrome` globals)

**Interfaces:**
- Consumes: the final state from Tasks 1 to 3.
- Produces: no code interface; documentation that matches reality.

- [ ] **Step 1: Update the three references**

Line 87 becomes:

```markdown
`-- tests/                   # Jest 30 + jsdom + tests/helpers/chrome-mock.js (`npm test`)
```

Line 162 becomes:

```markdown
npm test                  # Jest 30 (jsdom + the shared chrome mock in tests/helpers/)
```

Line 166 becomes:

```markdown
- Tests import ES modules through babel-jest; `jest.setup.js` installs `tests/helpers/chrome-mock.js` as the global `chrome`.
```

- [ ] **Step 2: Verify no stale reference remains**

Run: `grep -rn "jest-chrome" --include=*.md --include=*.js . --exclude-dir=node_modules --exclude-dir=coverage --exclude-dir=.git | grep -v "^./docs/" | grep -v package-lock`

Expected: only the deliberate mentions that explain the replacement (`jest.setup.js`, `tests/helpers/chrome-mock.js`, `tests/helpers/chrome-mock.test.js`, and the rationale comment in `tests/background/service-worker.test.js`). An allowlist grep scoped to `AGENTS.md README.md docs/` is NOT sufficient: it cannot see `CONTRIBUTING.md`, which is exactly how a stale "Unit: Jest + jest-chrome" line survived the first pass of this task.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: replace jest-chrome references with the shared chrome mock"
```

---

### Task 5: Full gate, branch, pull request

**Files:**
- No file changes; this task produces the branch and the pull request.

**Interfaces:**
- Consumes: every commit from Tasks 1 to 4.
- Produces: remote branch `chore/jest-30-migration` and a pull request into `master`.

- [ ] **Step 1: Confirm the branch and identity**

Run: `git branch --show-current && git config user.name && git config user.email`

Expected: `chore/jest-30-migration`, `Toan Do`, `kaido4492@gmail.com`. Fix the identity with `git config user.name "Toan Do"` / `git config user.email "kaido4492@gmail.com"` if it differs.

- [ ] **Step 2: Run the complete pre-push gate from a clean install**

Run: `rm -rf node_modules && npm ci && npm run verify && npx playwright test`

Expected: every command exits 0. `npm ci` succeeding is the specific thing that is red on dependabot PR #151 today, so it is checked explicitly rather than assumed.

- [ ] **Step 3: Push the branch**

Run: `git -C /home/kai/Work/htdocs/omni-ai push -u origin chore/jest-30-migration`

- [ ] **Step 4: Open the pull request**

Run:

```bash
gh pr create --base master --head chore/jest-30-migration \
  --title "chore(deps): migrate jest 27 to 30 and replace jest-chrome" \
  --body "Supersedes #151. Bumps jest and jest-environment-jsdom to ^30.5.1, removes the abandoned jest-chrome package (peer jest ^26 || ^27, which made npm ci fail with ERESOLVE), and replaces it with a repo-owned explicit chrome mock in tests/helpers/chrome-mock.js plus its unit test. Also removes the pre-existing mismatch of babel-jest 30 running under jest 27. Verified locally with npm ci, npm run verify and npx playwright test."
```

- [ ] **Step 5: Retire dependabot PR #151**

Run: `gh pr view 151 --json state --jq .state`

Expected: `CLOSED` (dependabot closes its own PR once the dependency reaches the bumped version on the default branch, which happens after this PR merges). If it is still `OPEN` after this PR merges, close it with a comment pointing at the merged PR.

---

## Self-Review

**Spec coverage:** the approved design named five workstreams (shared mock + its test, `jest.setup.js` rewire, version bump, docs, PR that supersedes #151). Tasks 1, 2, 3, 4 and 5 cover them in that order. The design also named "leave `service-worker.test.js` alone" and "do not weaken assertions"; both are recorded as Global Constraints.

**Placeholder scan:** no TBD, no "handle edge cases", no "similar to Task N". Every code step carries the full file content it produces. The one intentionally open-ended step is Task 3 Step 4, which is a bounded triage with named candidates, exact isolating commands and a stop-and-report rule, because the concrete jest 30 breakages cannot be known before the bump is run.

**Type consistency:** `createChromeMock()` is the only identifier crossing task boundaries, exported from `tests/helpers/chrome-mock.js` and consumed in `jest.setup.js` as `require("./tests/helpers/chrome-mock").createChromeMock()`. The path in the setup file is relative to the repository root, which is where `jest.setup.js` lives and what `setupFilesAfterEach` resolves against.

---

## Execution Record (2026-09-13)

Executed inline in one session. Commits on `chore/jest-30-migration`, in order:

| Commit    | Task | Subject                                                              |
| --------- | ---- | -------------------------------------------------------------------- |
| `aa0088e` | 0    | docs(plans): add jest 30 migration plan                              |
| `4bb0b8d` | 1    | test(helpers): add explicit chrome API mock to replace jest-chrome    |
| `ddd6c9f` | 2    | test(setup): use the repo-owned chrome mock and drop jest-chrome      |
| `e92a979` | 3    | chore(deps): upgrade jest and jest-environment-jsdom to 30.5.1        |
| `b428e17` | 4    | docs: replace jest-chrome references with the shared chrome mock      |
| `ae3953d` | 4    | docs(tooling): record why jest-chrome was dropped for the shared mock |

Verification actually run, from a clean `rm -rf node_modules`: `npm ci` exit 0, `npm run verify` exit 0 with 28 suites / 230 tests, `npx playwright test` exit 0 with 44 passed. jest 30 plus jsdom 26 needed **zero** changes to existing test files; the only new test files are the helper's own suite and the guard suite added after review.

### Deviations from this plan

1. **`CONTRIBUTING.md` and `docs/DEV-TOOLING.md` were also updated** (Task 4 named only `AGENTS.md`). Both contained prescriptive text telling contributors to use jest-chrome. The plan's verification step in Task 4 has been corrected to an exclusion grep because its allowlist is what let `CONTRIBUTING.md` slip through.
2. **An execution record and a guard suite were added after code review** (`tests/testing-stack.test.js`). The review found that the event half of the mock did not match the parity claim in its own comment: `hasListener` / `hasListeners` were hardcoded to `false` regardless of registered listeners, and `callListeners`, the idiom this repo's sidebar-chat plan teaches for driving `chrome.runtime.onConnect`, was missing. `createEvent` is now `Set`-backed with truthful `hasListener` / `hasListeners` / `getListeners` / `clearListeners` / `callListeners`, and the header comment states plainly that events are the one deliberate departure from jest-chrome rather than claiming full parity.
3. **Environment caveat discovered during execution:** this machine's shell exports `NODE_ENV=production`, so plain `npm ci` silently omits every devDependency (this repo has no runtime dependencies at all) and then fails at the `prepare` script with `sh: 1: husky: not found`. All npm commands in this plan's gates were run as `env -u NODE_ENV npm ...`. CI does not set `NODE_ENV`, so CI is unaffected, but a local run without the `env -u` prefix is not a valid reproduction of CI.
4. **The local Playwright suite needed `npx playwright install chromium`** for revision 1243 after `@playwright/test` moved to 1.63.0; without it all 44 e2e tests fail in about 10ms with `Executable doesn't exist`, which looks like a mass failure but is a missing browser.
