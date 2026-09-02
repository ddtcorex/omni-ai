# AGENTS.md — Omni AI Chrome Extension

> `CLAUDE.md` at the repo root is a symlink to `AGENTS.md` (same convention as the maestro-harness workspace). Claude Code follows the same rule set as every other agent. **Only edit `AGENTS.md`** — never edit `CLAUDE.md` directly or replace the symlink with a copy.

Welcome, agent. This is the handbook for working on **Omni AI**, a Manifest V3 Chrome extension ("Your All-in-One AI Browser Companion") built with **zero frameworks and zero build step**. Current version: **2.2.0**. Follow these directives for consistency, performance, and UI quality.

---

## 🎯 Core Directives

1.  **Stick to Vanilla**: No React, Vue, Tailwind, or bundler. Plain **ES modules (ES6+)** + modern CSS. The browser loads source files directly — there is no compile step in the dev loop.
2.  **Manifest V3 Compliance**: Service worker background (`"type": "module"`), no remote code, no MV2 APIs.
3.  **Shadow DOM Isolation (since v2.0)**: All content-script UI mounts inside a shadow root (`ensureUiRoot()` in `content/content.js`). Never inject overlay elements into the page DOM directly — styles are fetched from `content/overlay.css` and injected as a `<style>` inside the shadow root.
4.  **Provider Pattern**: All AI traffic goes through `lib/ai-service.js` → `lib/providers/*`. Never call `fetch()` against an AI API from UI code.
5.  **Storage Areas are a Contract**: Preferences that follow the user → `chrome.storage.sync`. Secrets & machine-local config → `chrome.storage.local`. See the Storage Map below and never mix areas (a mismatch shipped to prod before).
6.  **Safety First**: Text read/replace must handle `input`, `textarea`, and `contenteditable` through `content/editor-adapters.js`. Always fall back gracefully.
7.  **i18n (MANDATORY — every user-visible string)**: Omni AI ships 10 locales and any of them may be active. EVERY string a user can see — overlay cards, toasts, buttons, menu labels, hints, placeholders, error/notification copy — MUST come from `chrome.i18n.getMessage()` / `lib/i18n.js` with its key added to `_locales/en/messages.json` in the same commit (other locales may follow later). A hardcoded user-facing string in source is a **review blocker**, not a nitpick. Developer-only `console.*` output is exempt.

---

## 🧠 Skills Protocol (MANDATORY)

This repo **mandates** the superpowers process skills for every agent session (Claude Code, Codex, DSH, …). Skills resolve through your environment's superpowers install — this file only defines **when** each one applies here.

1.  **Invoke `using-superpowers` before ANY response or action** in this repo, and let it route the task.
2.  Match the trigger, load the required skill FIRST — no exceptions, no rationalizing "it's a small change":

| Trigger                                   | Required skill                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| New feature / component / behavior change | `brainstorming`                                                                  |
| Bug, test failure, unexpected behavior    | `systematic-debugging`                                                           |
| Implementing any feature or bugfix        | `test-driven-development`                                                        |
| Multi-step work with requirements         | `writing-plans` → execute via `subagent-driven-development` or `executing-plans` |
| About to claim done / commit / PR         | `verification-before-completion`                                                 |
| Finished major task / pre-merge           | `requesting-code-review`                                                         |
| Received review feedback                  | `receiving-code-review`                                                          |
| Work needing workspace isolation          | `using-git-worktrees`                                                            |
| Creating or editing skills themselves     | `writing-skills`                                                                 |

3.  Implementation plans live in `docs/superpowers/plans/YYYY-MM-DD-<name>.md`; completed plans are pruned once their work has merged (see `docs/FOLLOWUPS.md` for anything still outstanding from a finished plan).
4.  Direct human instructions and this file take precedence over skills; skipping a mandated workflow requires the human to say so explicitly.

---

## 🏗️ Architecture Overview

### File Map

```
omni-ai/
|-- manifest.json            # MV3; SW module; <all_urls> content script; commands; side_panel
|-- background/
|   `-- service-worker.js    # Message router, context menus, commands, side panel registration, history writes
|-- content/
|   |-- editor-adapters.js   # Classic-script registry for standard/rich-text/static editors
|   |-- positioning.js       # Pure helpers: clampToViewport, getRectEndPoint (classic script, tested via tests/content/positioning.test.js)
|   |-- content.js           # ~2000 lines: selection tracking, floating button, menus,
|   |                        #   overlay cards, text replacement, Shadow DOM host
|   `-- overlay.css          # Styles injected INTO the shadow root via fetch()
|-- sidepanel/                # Page Tools (Summarize / Smart Translate / Explain the
|                             #   active tab) -- opened via chrome.sidePanel, registered
|                             #   with chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})
|                             #   in background/service-worker.js. Replaced the old Quick
|                             #   Ask chat popup (both the action.default_popup and the
|                             #   later standalone-window versions): a side panel is
|                             #   docked to the browser window and doesn't force-close on
|                             #   blur, so it never had the ibus/Super+Space IME bug those
|                             #   two popup mechanisms did.
|-- settings.{html,js,css}   # Options dashboard: providers, languages, theme, usage stats
|-- lib/
|   |-- design-tokens.css    # Canonical --omni-* custom properties (see docs/design-system/MASTER.md)
|   |-- design-system.css    # Shared component classes: .ds-icon-btn, .ds-btn-*, .ds-spinner, .ds-card (see docs/design-system/MASTER.md)
|   |-- ai-service.js        # Action functions (improveText, translateText, ...) +
|   |                        #   generateContent() dispatcher
|   |-- ai-providers.js      # AI_PROVIDERS registry: models, key-setting names, routing
|   |-- providers/           # gemini.js, openai.js, groq.js, anthropic.js, custom-gateway.js, index.js
|   |-- history.js           # History + usage stats (storage.local)
|   |-- i18n.js              # Shared i18n wrapper (web_accessible_resource)
|   `-- theme-manager.js     # Theme apply/broadcast (storage.sync: omni_ai_theme)
|-- _locales/                # chrome.i18n messages
|-- scripts/publish.sh       # Strips manifest "key", zips dist/
`-- tests/                   # Jest + jest-chrome + jsdom (`npm test`)
```

### Message Protocol

Content script ⇄ service worker (`chrome.tabs.sendMessage` / content `runtime.onMessage`):

| Type                        | Direction          | Purpose                                                                  |
| --------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `GET_SELECTION`             | bg → content       | Return `{ selection, isInput }` for the current selection                |
| `PROCESSING_START`          | bg → content       | Show spinner state before an async action                                |
| `SHOW_RESULT`               | bg → content       | Render result card `{ action, result, error?, originalText?, isInput? }` |
| `REPLACE_SELECTION`         | bg → content       | Swap selection with the AI result                                        |
| `SHOW_QUICK_ASK_OVERLAY`    | bg → content       | Open Quick Ask overlay (keyboard command)                                |
| `THEME_CHANGED`             | bg → all tabs      | Re-read theme after `omni_ai_theme` sync change                          |
| `GET_PAGE_CONTENT`          | sidepanel → content | Page content for the side panel's Page Tools actions (`sidepanel.js` `getActivePageContent()`) |

Side panel/settings ⇄ service worker (`chrome.runtime.sendMessage`; handler MUST return `true` for async!):

| Type              | Purpose                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------|
| `QUICK_ASK`       | In-page Quick Ask overlay query (Alt+A / right-click "Ask Omni AI"), sent from `content.js`'s `handleAskAction()` — not from a popup |
| `WRITING_ACTION`  | Action request with explicit text                                                                                                    |
| `QUICK_ACTION`    | Floating-menu actions (translate / smart_translate / grammar / rephrase / tone / …), also used by the side panel's Page Tools buttons (summarize / smart_translate / explain) |
| `VALIDATE_CONFIG` | Test provider credentials with a tiny prompt                                                                                         |
| `GET_API_KEY`     | Read Gemini key                                                                                                                       |

**Rule**: any `onMessage` listener case that responds asynchronously MUST `return true` immediately. A missing `return true` silently drops the response _and_ falls through to the next `case` (a bug of exactly this shape has shipped here before).

### Provider System

- Registry: `AI_PROVIDERS` in `lib/ai-providers.js` — each entry declares `id`, `name`, `keySetting` (storage key of its API key), and `models[]`.
- Routing: `getProvider(modelId)` in `lib/providers/index.js` looks the model up in `AI_PROVIDERS` (via `getProviderByModel()`) and returns that provider's module — model IDs are not required to follow any naming convention. `custom-gateway` routes to the OpenAI-compatible gateway provider (SSE streaming + DeepSeek-style `reasoning_content` support).
- Every provider module exports `async generateContent(prompt, config)` where `config = { apiKey, model, maxTokens, temperature, topP, baseUrl? }`.
- Custom models use the `-custom` suffix convention; the actual model name comes from storage (`customModelName` / `customGatewayModelName`).

### Storage Map (the contract)

| Area      | Keys                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync`    | `primaryLanguage`, `defaultLanguage`, `omni_ai_theme` |
| `local`   | `geminiApiKey`, `openaiApiKey`, `groqApiKey`, `anthropicApiKey`, `customGatewayApiKey`, `apiModel`, `currentPreset`, `customGatewayBaseUrl`, `customGatewayModelName`, `customModelName`, history/stats keys (see `lib/history.js`) |
| `session` | `omni_ai_active_frame_<tabId>` (most recently focused editor frame for command routing)                                                                                                                         |

---

## 🛠️ Common Operations

### Adding a New AI Provider

1. Create `lib/providers/[name].js` exporting `generateContent(prompt, config)`.
2. Register it in `lib/providers/index.js` — import the module and add one line to the `MODULES` map (`providerId: Module`).
3. Add the registry entry (models + `keySetting`) to `AI_PROVIDERS` in `lib/ai-providers.js`.
4. Add key/model inputs to `settings.html` plus load/save wiring in `settings.js`.
5. Add tests under `tests/lib/providers/`.

### Adding a Writing Action (e.g. "Simplify")

1. Add the action function/prompt in `lib/ai-service.js` (system prompts live in `getSystemPrompt()`).
2. Route it in `handleQuickAction()` in `background/service-worker.js`.
3. Add the button + icon to `showQuickActionMenu()` in `content/content.js`.
4. Add display-name mapping and i18n keys in `_locales/*/messages.json`.

### Editing Content-Script UI

All markup/styles live inside the Shadow DOM root. To style: edit `content/overlay.css` (fetched into the shadow root — keep it self-contained, no reliance on page styles). Keep the `.omni-ai-*` class prefix inside the shadow tree.

---

## 🧪 Testing & Verification

```bash
npm test                  # Jest (jsdom + jest-chrome mocks)
bash scripts/publish.sh   # Build zip into dist/ (strips dev key, swaps client_id)
```

- Tests import ES modules through babel-jest; `jest.setup.js` provides `jest-chrome` globals.
- When you change prompt wording in `lib/ai-service.js`, update `tests/lib/ai-service.test.js` **in the same commit** — its assertions are exact substrings.

### Manual smoke checklist (load unpacked)

- [ ] Selection floating button appears; menu opens on plain pages AND inside inputs/textareas/contenteditable editors
- [ ] Replace works for both plain inputs and rich editors
- [ ] Context-menu items (Translate / Rephrase / Add Emoji / Summarize / Ask Omni AI) show result cards; Ask opens the Quick Ask overlay instead
- [ ] Keyboard shortcuts fire (Alt+A ask, Alt+R rephrase, Alt+T translate, Alt+F grammar). Chrome only auto-binds up to 4 declared `suggested_key` shortcuts per extension — `manifest.json`'s `commands` is deliberately kept at exactly 4 so all of them actually work on install; don't add a 5th `suggested_key` without reading `docs/FOLLOWUPS.md` #8 first (Playwright's test Chromium channel hangs loading the extension past that limit).
- [ ] Settings save/reload round-trips (keys stay local, languages/theme stay sync)
- [ ] Provider "Validate" passes for at least Gemini + Custom Gateway
- [ ] Clicking the toolbar icon opens the side panel (not a popup or a new window); Summarize/Smart Translate/Explain work against a real page and the panel stays open across tab switches
- [ ] Floating button and result card stay fully on-screen when a selection/focus is near each of the four viewport edges (regression check for the design-system plan's clampToViewport fix)
- [ ] "Back" button returns to the action menu after both a click-triggered AND a keyboard-shortcut-triggered (Alt+R/T/F) result
- [ ] Service worker console clean after idle (no unhandled promise rejections)

---

## 🚀 Dev Loop & Tooling (speed)

- **Load unpacked** from `chrome://extensions` (dev mode). After edits: refresh the extension card (service worker / manifest changes) and reload target tabs (content-script changes). There is no HMR by default — see `docs/DEV-TOOLING.md` for the recommended speed stack (auto-reload, lint, typecheck, E2E).
- The `manifest.json` `"key"` field pins a stable extension ID in dev; `scripts/publish.sh` strips it for store builds. Never change `key` casually.
- Debugging surfaces: SW inspector via `chrome://extensions` → "Inspect views: service worker"; content-script logs in page DevTools console (filter `[Omni AI]`).

## 📦 Release Flow

1. Bump `version` in `manifest.json` (+ `package.json`), update `CHANGELOG.md`, and update the version badge in `README.md` (`img.shields.io/badge/version-X.Y.Z-blue`) — the only remaining hardcoded copy; nothing enforces it matches. (`settings.html`'s displayed version is read live from `chrome.runtime.getManifest().version` in `settings.js` `init()` — don't hardcode it there again.)
2. `npm run verify` + `npx playwright test` + `bash scripts/publish.sh` (confirms `dist/omni-ai-vX.Y.Z.zip` builds cleanly and the dev `manifest.json` — including its pinned `"key"` — is restored afterward).
3. Commit the version bump directly to `master` (there is no `develop` branch currently — PRs merge feature branches straight into `master`), then `git tag -a vX.Y.Z -m "Release vX.Y.Z"` and `git push origin vX.Y.Z`. The tag push triggers `.github/workflows/release.yml`, which builds the store zip and publishes the GitHub Release automatically — do not run `gh release create` manually.
4. Before uploading, check `docs/CHROME_WEBSTORE_LISTING.txt` against what actually changed (keyboard shortcuts, context-menu items, feature list) and update it in the same commit if it drifted — it's the source of truth for the CWS dashboard's description field, and nothing enforces it stays in sync (same class of drift as the hardcoded version strings in step 1).
5. Upload the built zip to the Chrome Web Store dashboard when ready to ship publicly (not automated — see the commented CWS upload block in `release.yml` for wiring it up), pasting `docs/CHROME_WEBSTORE_LISTING.txt`'s content into the description field if it changed.

---

## ⚠️ Known Issues (fix on sight — do not copy these patterns)

None currently. 🎉

---

## ✅ Agent Checklist (before you finish)

- [ ] No framework imports, no bundler assumptions — files still load raw in the browser
- [ ] New UI renders inside the Shadow DOM root using tokens (`--accent-purple`, `--glass-bg`, …) from `overlay.css` / `settings.css` — never hardcode colors
- [ ] Every new `onMessage` case that replies asynchronously returns `true`
- [ ] Text replacement verified for `input` + `textarea` + `contenteditable`
- [ ] Every user-facing string goes through i18n (`_locales/en/messages.json`) — zero hardcoded visible text
- [ ] `npm test` green; no leftover `console.log`s (warnings/errors OK)

---

_Maintained by ddtcorex with AI coding agents. Keep this file accurate — it is the single source of truth for agents working on Omni AI._
