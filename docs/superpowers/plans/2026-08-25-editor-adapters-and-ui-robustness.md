# Composer Adapters and Floating Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Omni AI work safely in TinyMCE iframe editors and common web-chat composers, while allowing users to disable the floating action button without disabling shortcuts.

**Architecture:** A classic-script adapter registry owns editor detection, selection snapshots, and replacement. The content script remains the UI/message coordinator. Each frame has its own registry instance; the service worker records the most recently focused editor frame so keyboard commands route to the active TinyMCE/chat composer rather than always to the top document.

**Tech Stack:** Manifest V3 classic content scripts, vanilla JavaScript, Chrome storage, Jest + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-25-editor-adapters-and-ui-robustness-design.md`

## Global Constraints

- No framework, bundler, remote code, or MV2 API.
- User-visible copy must have an `_locales/en/messages.json` key.
- Preferences use `chrome.storage.local`; `showFloatingButton` defaults to `true` for existing users too.
- A replacement is successful only when the target document has changed; synthetic paste/keyboard events are never treated as a successful edit.
- Closed Shadow DOM and canvas editors remain Copy-only fallback.
- Every content-script UI element stays inside the existing Shadow DOM host.

---

### Task 1: Floating-button preference

**Files:** `background/service-worker.js`, `settings.html`, `settings.js`, `content/content.js`, `_locales/en/messages.json`, `tests/background/service-worker.test.js`

- [x] **Step 1: Write a failing install-default test.** Assert installation writes `settings.showFloatingButton: true`, including when a previous settings object exists without that property. The test catches a shallow settings merge that drops the new default.
- [x] **Step 2: Run the focused test and confirm it fails because the key is absent.**
- [x] **Step 3: Implement a deep merge in `initializeSettings()`.** Keep existing values, add `showFloatingButton: true` when absent, and save the merged `settings` object.
- [x] **Step 4: Add a localized Settings select.** Its values are `on` and `off`; `loadSettings()` reads the local settings object and `saveSettings()` preserves sibling settings while storing the boolean.
- [x] **Step 5: Add the content-script cache and storage listener.** Default it to enabled, read local settings at startup, hide any currently shown button immediately when disabled, and make `presentQuickActionButton()` return before creating UI. Do not gate keyboard/menu result overlays.
- [x] **Step 6: Run the focused test, then `npm test`.**

### Task 2: Testable editor-adapter registry

**Files:** create `content/editor-adapters.js`, create `tests/content/editor-adapters.test.js`, modify `manifest.json`, `content/content.js`

- [x] **Step 1: Write failing registry tests.** Cover `textarea → standard`, a nested `contenteditable → richText`, a normal paragraph → `static`, selected rich-text replacement, full rich-text replacement, and open-shadow host discovery. Each test must assert observable text after the operation, not only dispatched events.
- [x] **Step 2: Run the focused test file and confirm it fails because `editor-adapters.js` is absent.**
- [x] **Step 3: Create the classic-script registry.** Expose `self.OMNI_EDITOR_ADAPTERS` with `resolveAdapter`, `getEditableHost`, and `replaceViaAdapters`. Implement `standard`, `richText`, and `static` adapters. `richText` restores the captured range, tries native `execCommand('insertText')`, and falls back to DOM Range replacement plus bubbling `input`; it returns false unless the editable's visible text changed.
- [x] **Step 4: Use the registry from `content/content.js`.** Remove the local strategy definitions, retain the existing call sites through `getContext()`, and await `replaceViaAdapters()` when replacing. Failed replacement leaves the result card available for Copy and logs only a developer warning.
- [x] **Step 5: Load the registry before `content.js` in the manifest.**
- [x] **Step 6: Run `npx jest tests/content/editor-adapters.test.js --runInBand`, then `npm test`.**

### Task 3: Frame-aware editor support

**Files:** `manifest.json`, `content/content.js`, `background/service-worker.js`, `tests/background/service-worker.test.js`, `tests/content/editor-adapters.test.js`

- [x] **Step 1: Write failing tests.** Assert the manifest has `all_frames` and `match_about_blank`; assert an `EDITOR_FOCUSED` runtime message records `{ tabId, frameId }`; assert a keyboard command sends `GET_SELECTION` and follow-up messages with the recorded `frameId`.
- [x] **Step 2: Run focused tests and confirm they fail on the missing frame routing.**
- [x] **Step 3: Enable frame injection.** Add `all_frames: true` and `match_about_blank: true`. This allows the iframe document in TinyMCE 6/7 to receive the adapter and its own Shadow-DOM UI.
- [x] **Step 4: Report focus from the frame.** When the active target resolves to a non-static adapter, content sends `EDITOR_FOCUSED`; service worker records the sender frame for the tab. On commands, target that frame when known and fall back to the top frame otherwise.
- [x] **Step 5: Run focused tests and `npm test`.**

### Task 4: Site compatibility and handoff verification

**Files:** `content/editor-adapters.js`, `CONTRIBUTING.md`, `CHANGELOG.md`, `AGENTS.md`

- [x] **Step 1: Add hostname hints only for host resolution/precedence.** Required hosts: `discord.com`, `web.telegram.org`, `app.slack.com`, `teams.microsoft.com`. All use the generic rich-text adapter; no app-specific scraping or private-framework API is permitted.
- [x] **Step 2: Add tests that each hostname resolves a real editable to `richText`; an unknown host follows the same generic fallback.**
- [x] **Step 3: Document a manual matrix.** TinyMCE 6/7, Discord, Telegram Web, Slack, and Teams each require: floating button visibility, selected replacement, full-draft replacement, shortcut routing, and Copy fallback.
- [x] **Step 4: Add an Unreleased changelog entry and update the File Map in `AGENTS.md`.**
- [x] **Step 5: Run `npm run verify` and `bash scripts/publish.sh`.** Record the output and any live-only limitations before handoff.
  - `npm run verify` (typecheck + lint + jest): all green — 8 suites / 50 tests passed, no type or lint errors.
  - `bash scripts/publish.sh`: built `dist/omni-ai-v2.1.0.zip` successfully; dev `manifest.json` (with `key`) was restored after packaging.
  - **Live-only limitation:** the manual compatibility matrix in `CONTRIBUTING.md` (TinyMCE 6/7, Discord, Telegram Web, Slack, Microsoft Teams) requires loading the unpacked extension in a real Chrome browser against live/demo pages — it cannot be exercised by `npm test`/jsdom and was not run in this session. This should be completed before shipping to users.
