# Design: Editor Adapters & UI Robustness

**Date:** 2026-08-25 · **Status:** Approved-in-chat, pending spec review
**Owner:** ddtcorex · **Repo:** omni-ai (MV3, zero-build vanilla JS)

## Background & Evidence

Four user-reported issues, investigated per systematic-debugging Phase 1 (static evidence; runtime repro fixtures are part of implementation):

| # | Issue | Evidence gathered |
|---|---|---|
| 1 | Need a config toggle for the floating master icon (keyboard-shortcuts-only mode) | Single gate point exists: `presentQuickActionButton()` (`content/content.js:832`). Settings object pattern already lives in `chrome.storage.local` (`settings: { autoClose, showNotifications }`, seeded in service-worker `initializeSettings`). |
| 2 | Many chat tools unsupported (input structures differ) | Only 3 strategies exist (`standard`, `richText`, `static`, `content.js:231-365`). `richText` relies on `window.getSelection` + `document.execCommand("insertText")` only. `getEditableHost()` (`content.js:377`) walks light DOM only. The supplied TinyMCE 7 markup places its editable `body#tinymce` in `.tox-edit-area__iframe`; manifest content scripts have no `"all_frames": true`, so it is unreachable. React-controlled editors (Lexical/ProseMirror/Draft) ignore plain `execCommand` mutations. |
| 3 | Modal content sometimes overflows its frame | `.omni-ai-content-area` has `white-space: pre-wrap` (`overlay.css:411`) but **zero occurrences** of `overflow-wrap` / `word-break` / `min-width` guards in the entire stylesheet → long unbroken tokens (URLs, code) cannot wrap. |
| 4 | Host page occasionally overrides extension CSS | Two candidate root causes: (a) `ensureUiStyles()` (`content.js:152-191`) fetches `overlay.css` via `fetch(chrome.runtime.getURL(...))`; on pages whose CSP blocks `connect-src` the fetch fails, the `catch` only warns, and the empty stylesheet is cached forever in `omniUiCssText` / `omniUiStylePromise` (no retry) → fully unstyled UI that *looks* like CSS override; (b) inheritable-property leakage is already mitigated by host `all: initial !important` (`content.js:120-131`), but internal wrappers carry no defensive resets beyond a `:where()` (specificity-0) block. |

Issues 3 and 4 share a failure surface: when (4a) triggers, the overlay loses ALL layout rules, which presents as (3)-style overlap/breakage. Both get independent fixes.

## Goals

1. Users can disable the floating quick-action button from Settings; keyboard shortcuts and context menus keep working.
2. AI actions read text from, and **fully replace results back into**, TinyMCE (including recent iframe variants), Discord, Telegram Web, Slack, Microsoft Teams, and other major editor frameworks (ChatGPT, Claude, Gemini web, X/Twitter, Facebook, LinkedIn, Notion). Google Docs is explicitly degraded-mode (canvas rendering — DOM text does not exist).
3. Overlay content never overflows regardless of token shape.
4. Extension styling is immune to host-page CSP and host styles.

## Non-Goals

- No framework adoption, no bundler (Core Directive 1).
- No per-site scraping integrations (brittle; rejected approach B).
- No support for canvas-rendered text manipulation beyond selection-paste simulation (Google Docs degraded mode).
- Not touching provider/AI-service layers.

---

## Feature 1 — Floating Button Toggle

- **Storage:** extend the existing `settings` object in `storage.local`: `settings.showFloatingButton` (boolean, default `true`). Seeded by `initializeSettings()` defaults merge; absent key ⇒ enabled (backward compatible).
- **Gate:** first line check inside `presentQuickActionButton()`. A module-level cached flag (`floatingButtonEnabled`) is read at content-script init and updated live via a `chrome.storage.onChanged` listener watching `area === "local" && changes.settings`.
- **Settings UI:** toggle row in `settings.html` General section ("Show floating button", helper text mentions shortcuts remain); wired through the existing `loadSettings()/saveSettings()` pair in `settings.js`; i18n keys added to `_locales/en/messages.json` first, other locales may follow.
- **Behavior when off:** no floating button ever appears; `PROCESSING_START` spinner (which reuses the button) is skipped gracefully — background flows still send `SHOW_RESULT` cards, which remain available.

---

## Fix Set A — Stylesheet Delivery (issue 4a)

Replace the fetch-and-cache pipeline with declarative injection:

- In `ensureUiStyles()`, instead of fetching CSS text, append `<link rel="stylesheet" href="chrome.runtime.getURL("content/overlay.css")">` inside the shadow root (idempotent — reuse existing node).
- Rationale: `chrome-extension:` subresource loads inside a content-script shadow root are not subject to page CSP, load once, never leave an empty-cache failure mode, and auto-update on extension reload.
- Delete: `omniUiCssText`, `omniUiStylePromise`, fetch chain, and the `isContextValid()` early-empty path (keep `isContextValid()` gating elsewhere).
- Defense-in-depth (after root cause, per skill): add inheritable-property resets (`font-size`, `color`, `direction`) to the internal wrapper rule set alongside the existing `:where()` block.
- **Verification fixture:** test page with `<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">` — old code renders unstyled, new code styled.

## Fix Set B — Overflow Hardening (issue 3)

- On `.omni-ai-content-area` and result-text nodes: `overflow-wrap: anywhere; word-break: normal; min-width: 0;` (keep `white-space: pre-wrap`).
- Ensure card containers keep `max-height` + `overflow-y: auto` (already present at `overlay.css:118-119, 401-402`).
- **Verification fixture:** paragraph containing a 200-char unbroken URL plus code block with long lines; assert no horizontal scroll on the shadow host.

---

## Editor Adapter Layer (issue 2)

### Architecture

Generalize the existing ordered-strategy lookup (`getContext()`, `content.js:367`) into an **adapter registry**. The current resolver already shows strain: its first branch tests an undefined flag (`strategies.run_standard`, dead code — standard inputs only match via the later fallback), and strategy order is implicit. The registry makes precedence explicit and data-driven. Each adapter implements one interface:

```js
{
  id: "framework-contenteditable",       // stable id, used by site hints + logs
  match(el) -> bool,                    // cheapest checks first
  getText(el, selState) -> { text, isSelection, fullText },
  getRect(el, selState) -> DOMRect,
  beginReplace(el, selState) -> replaceState,   // snapshot ranges/focus
  applyReplace(el, replaceState, newText),      // performs insertion
}
```

Resolution order (first `match()` wins, falling through on `applyReplace` failure where safe):

| Order | Adapter | Targets | Mechanism |
|---|---|---|---|
| 1 | `standard` (exists) | input/textarea | value surgery + `input` event |
| 2 | `rich-execCommand` (generalized from today's `richText`) | TinyMCE, classic CE editors, generic contenteditable | restore the captured selection → `execCommand("insertText")` → verify the document changed and the editor emitted `input` |
| 3 | `framework-contenteditable` | ChatGPT, Slack (Lexical), Discord, Telegram Web, Microsoft Teams, modern Draft | use the same native edit path with app-specific host resolution and post-apply verification of the visible draft; dispatch an `InputEvent` only as a compatibility notification, never as the primary mutation mechanism |
| 4 | `copy-fallback` | editors that reject programmatic replacement; Google Docs (degraded) | retain the result card and Copy action; never simulate a trusted paste event |
| 5 | `static` (exists) | page text, read-only | unchanged |

- **Shadow piercing:** rewrite `getEditableHost()` to walk `composedTree` parents (`node.getRootNode().host` chains) so open-shadow editors resolve to their true editable root. Closed shadow roots are out of reach (browser limitation, documented).
- **Iframes:** add `"all_frames": true` + `"match_about_blank"` to the manifest content-script entry; per-frame instances self-gate via the existing `isContextValid()` and only mount UI when an editable is focused/selected. Blast-radius note: scripts now inject into ad/restricted frames too — acceptable because UI mounts lazily; revisit if perf regressions appear.
- **Site hints:** hostname→adapter-preference map consulted BEFORE generic matching (including `discord.com`, `web.telegram.org`, `app.slack.com`, and `teams.microsoft.com` → `framework-contenteditable`; `chatgpt.com→framework-contenteditable`, `notion.so→rich-execCommand`, `docs.google.com→copy-fallback(degraded)`). A hint changes only host resolution and adapter precedence; it must not scrape messages or depend on internal framework state. A failed verification falls through to the next safe adapter.
- **Google Docs degraded mode:** the result card offers Copy; no attempt is made to simulate a trusted paste event. This is a browser security limitation, not a bug.

### Failure semantics

`applyReplace` returns boolean success only after it verifies that the editor document/draft changed to the requested text. On failure: try the next matching safe adapter; if all fail, retain the result card with its Copy button and `console.warn("[Omni AI] replace failed via <adapterId>")`. Synthetic keyboard, paste, and `beforeinput` events are never treated as proof of replacement because JavaScript cannot create browser-trusted user input.

### Testing

- Unit (jsdom): each adapter against structural fixtures (textarea; contenteditable; iframe document; nested open-shadow editable). Assert the expected document changes, selection is restored, and failure produces `ok: false` rather than a false success.
- E2E/manual matrix (documented in CONTRIBUTING): TinyMCE 6/7 iframe demos, Discord, Telegram Web, Slack, and Microsoft Teams are required rows, each recording read, selected replacement, full-draft replacement, and safe Copy fallback. Other public sites listed above are additional coverage. Proprietary internals may shift — adapters fail soft by design.
- Telemetry-free: failures log locally only.

---

## Rollout

1. **Batch 1** (low risk): Feature 1 + Fix B + defense-in-depth resets.
2. **Batch 2**: Fix A (link-based stylesheet) with CSP fixture proof.
3. **Batch 3**: adapter layer — implement in table order (2→3→4→shadow→iframe→Docs-degraded), each behind its own unit tests; spec §Editor Adapter Layer is the contract.
