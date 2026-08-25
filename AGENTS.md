# AGENTS.md — Omni AI Chrome Extension

> `CLAUDE.md` at the repo root is a symlink to `AGENTS.md` (same convention as the maestro-harness workspace). Claude Code follows the same rule set as every other agent. **Only edit `AGENTS.md`** — never edit `CLAUDE.md` directly or replace the symlink with a copy.

Welcome, agent. This is the handbook for working on **Omni AI**, a Manifest V3 Chrome extension ("Your All-in-One AI Browser Companion") built with **zero frameworks and zero build step**. Current version: **2.1.0**. Follow these directives for consistency, performance, and UI quality.

---

## 🎯 Core Directives

1.  **Stick to Vanilla**: No React, Vue, Tailwind, or bundler. Plain **ES modules (ES6+)** + modern CSS. The browser loads source files directly — there is no compile step in the dev loop.
2.  **Manifest V3 Compliance**: Service worker background (`"type": "module"`), no remote code, no MV2 APIs.
3.  **Shadow DOM Isolation (since v2.0)**: All content-script UI mounts inside a shadow root (`ensureUiRoot()` in `content/content.js`). Never inject overlay elements into the page DOM directly — styles are fetched from `content/overlay.css` and injected as a `<style>` inside the shadow root.
4.  **Provider Pattern**: All AI traffic goes through `lib/ai-service.js` → `lib/providers/*`. Never call `fetch()` against an AI API from UI code.
5.  **Storage Areas are a Contract**: Preferences that follow the user → `chrome.storage.sync`. Secrets & machine-local config → `chrome.storage.local`. See the Storage Map below and never mix areas (a mismatch shipped to prod before — see Known Issues).
6.  **Safety First**: Text read/replace must handle `input`, `textarea`, and `contenteditable` (see the strategy objects near the top of `content/content.js`). Always fall back gracefully.
7.  **i18n**: Any user-facing string goes through `chrome.i18n.getMessage()` / `lib/i18n.js` with keys in `_locales/*/messages.json` (10 locales: de en es fr it ja ko pt vi zh).

---

## 🧠 Skills Protocol (MANDATORY)

This repo **mandates** the superpowers process skills for every agent session (Claude Code, Codex, DSH, …). They are mounted at `.claude/skills/` and `.agents/skills/` as per-skill symlinks to the single source `~/.maestro-skills/skills/` (same convention as maestro-harness). Never copy or edit the symlinks' targets from here — upgrades happen once at the source.

1.  **Invoke `using-superpowers` before ANY response or action** in this repo, and let it route the task.
2.  Match the trigger, load the required skill FIRST — no exceptions, no rationalizing "it's a small change":

| Trigger | Required skill |
|---|---|
| New feature / component / behavior change | `brainstorming` |
| Bug, test failure, unexpected behavior | `systematic-debugging` |
| Implementing any feature or bugfix | `test-driven-development` |
| Multi-step work with requirements | `writing-plans` → execute via `subagent-driven-development` or `executing-plans` |
| About to claim done / commit / PR | `verification-before-completion` |
| Finished major task / pre-merge | `requesting-code-review` |
| Received review feedback | `receiving-code-review` |
| Work needing workspace isolation | `using-git-worktrees` |
| Creating or editing skills themselves | `writing-skills` |

3.  Implementation plans live in `docs/superpowers/plans/YYYY-MM-DD-<name>.md` (see the engineering-hygiene plan there as the working example).
4.  Direct human instructions and this file take precedence over skills; skipping a mandated workflow requires the human to say so explicitly.

---

## 🏗️ Architecture Overview

### File Map

```
omni-ai/
|-- manifest.json            # MV3; SW module; <all_urls> content script; commands; oauth2
|-- background/
|   `-- service-worker.js    # Message router, context menus, commands, OAuth, history writes
|-- content/
|   |-- content.js           # ~2000 lines: selection tracking, floating button, menus,
|   |                        #   overlay cards, text replacement, Shadow DOM host
|   `-- overlay.css          # Styles injected INTO the shadow root via fetch()
|-- popup/                   # Quick Ask chat popup (auth UI, page-context toggle)
|-- settings.{html,js,css}   # Options dashboard: providers, languages, theme, usage stats
|-- lib/
|   |-- ai-service.js        # Action functions (improveText, translateText, ...) +
|   |                        #   generateContent() dispatcher
|   |-- ai-providers.js      # AI_PROVIDERS registry: models, key-setting names, routing
|   |-- providers/           # gemini.js, openai.js, groq.js, custom-gateway.js, index.js
|   |-- history.js           # History + usage stats (storage.local)
|   |-- i18n.js              # Shared i18n wrapper (web_accessible_resource)
|   |-- theme-manager.js     # Theme apply/broadcast (storage.sync: omni_ai_theme)
|   |-- auth.js              # ⚠ currently unused (dead-code candidate)
|   `-- prompts.js           # ⚠ currently unused (dead-code candidate)
|-- _locales/                # chrome.i18n messages
|-- scripts/publish.sh       # Strips manifest "key", swaps prod OAuth client_id, zips dist/
`-- tests/                   # Jest + jest-chrome + jsdom (`npm test`)
```

### Message Protocol

Content script ⇄ service worker (`chrome.tabs.sendMessage` / content `runtime.onMessage`):

| Type | Direction | Purpose |
|---|---|---|
| `GET_SELECTION` | bg → content | Return `{ selection, isInput }` for the current selection |
| `PROCESSING_START` | bg → content | Show spinner state before an async action |
| `SHOW_RESULT` | bg → content | Render result card `{ action, result, error?, originalText?, isInput? }` |
| `REPLACE_SELECTION` | bg → content | Swap selection with the AI result |
| `SHOW_QUICK_ASK_OVERLAY` | bg → content | Open Quick Ask overlay (keyboard command) |
| `THEME_CHANGED` | bg → all tabs | Re-read theme after `omni_ai_theme` sync change |
| `PING` / `GET_PAGE_CONTENT` | popup/bg → content | Liveness check / page context for Quick Ask |

Popup/settings ⇄ service worker (`chrome.runtime.sendMessage`; handler MUST return `true` for async!):

| Type | Purpose |
|---|---|
| `QUICK_ASK` | Popup chat query (+ optional page context) |
| `WRITING_ACTION` | Action request with explicit text |
| `QUICK_ACTION` | Floating-menu actions (translate / smart_translate / grammar / rephrase / tone / …) |
| `VALIDATE_CONFIG` | Test provider credentials with a tiny prompt |
| `GET_API_KEY` | Read Gemini key |
| `SIGN_IN` / `SIGN_OUT` / `GET_USER` | Google identity (oauth2 in manifest) |

**Rule**: any `onMessage` listener case that responds asynchronously MUST `return true` immediately. A missing `return true` silently drops the response *and* falls through to the next `case` (this bug has shipped here — see Known Issues).

### Provider System

- Registry: `AI_PROVIDERS` in `lib/ai-providers.js` — each entry declares `id`, `name`, `keySetting` (storage key of its API key), and `models[]`.
- Routing: model IDs are provider-prefixed — `google-*`, `openai-*`, `groq-*`, `custom-*` — resolved by `getProvider()` in `lib/providers/index.js`. `custom-gateway` routes to the OpenAI-compatible gateway provider (SSE streaming + DeepSeek-style `reasoning_content` support).
- Every provider module exports `async generateContent(prompt, config)` where `config = { apiKey, model, maxTokens, temperature, topP, baseUrl? }`.
- Custom models use the `-custom` suffix convention; the actual model name comes from storage (`customModelName` / `customGatewayModelName`).

### Storage Map (the contract)

| Area | Keys |
|---|---|
| `sync` | `primaryLanguage`, `defaultLanguage`, `omni_ai_theme`, `user` (OAuth profile) |
| `local` | `geminiApiKey`, `openaiApiKey`, `groqApiKey`, `customGatewayApiKey`, `apiModel`, `currentPreset`, `customGatewayBaseUrl`, `customGatewayModelName`, `customModelName`, history/stats keys (see `lib/history.js`) |

---

## 🛠️ Common Operations

### Adding a New AI Provider

1. Create `lib/providers/[name].js` exporting `generateContent(prompt, config)`.
2. Register it in `lib/providers/index.js` (import, export, and a `modelName.startsWith("<prefix>-")` branch).
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
- [ ] Context-menu items (Improve / Explain / Translate) show result cards
- [ ] Keyboard shortcuts fire (Alt+O popup, Alt+A ask, Alt+R rephrase, Alt+T translate)
- [ ] Settings save/reload round-trips (keys stay local, languages/theme stay sync)
- [ ] Provider "Validate" passes for at least Gemini + Custom Gateway
- [ ] Service worker console clean after idle (no unhandled promise rejections)

---

## 🚀 Dev Loop & Tooling (speed)

- **Load unpacked** from `chrome://extensions` (dev mode). After edits: refresh the extension card (service worker / manifest changes) and reload target tabs (content-script changes). There is no HMR by default — see `docs/dev-tooling.md` for the recommended speed stack (auto-reload, lint, typecheck, E2E).
- The `manifest.json` `"key"` field pins a stable extension ID in dev; `scripts/publish.sh` strips it for store builds. Never change `key` casually.
- Debugging surfaces: SW inspector via `chrome://extensions` → "Inspect views: service worker"; content-script logs in page DevTools console (filter `[Omni AI]`).

## 📦 Release Flow

1. Bump `version` in `manifest.json` (+ `package.json`), update `CHANGELOG.md`.
2. `bash scripts/publish.sh` → `dist/omni-ai-vX.Y.Z.zip` (prod OAuth client_id swapped automatically).
3. Upload to Chrome Web Store dashboard. PRs merge feature → `develop` → `master`.

---

## ⚠️ Known Issues (fix on sight — do not copy these patterns)

1. **`GET_API_KEY` missing `return true`** (`background/service-worker.js`): if anyone sends this message, the async `sendResponse` is dropped and execution falls through into `VALIDATE_CONFIG`. No caller exists today, so it is latent — but fix before using it.
2. **Storage-area mismatch for language prefs**: `settings.js` / `content.js` / `lib/i18n.js` read/write `primaryLanguage` / `defaultLanguage` in `storage.sync`, but the service worker reads them from `storage.local` → background flows ignore the user's language settings.
3. **Stale tests**: `tests/lib/ai-service.test.js` asserts pre-v2.1.0 prompt wording (2 failures as of this writing).
4. **Dead code**: `lib/auth.js` and `lib/prompts.js` are imported nowhere.

---

## ✅ Agent Checklist (before you finish)

- [ ] No framework imports, no bundler assumptions — files still load raw in the browser
- [ ] New UI renders inside the Shadow DOM root using tokens (`--accent-purple`, `--glass-bg`, …) from `overlay.css` / `settings.css` — never hardcode colors
- [ ] Every new `onMessage` case that replies asynchronously returns `true`
- [ ] Text replacement verified for `input` + `textarea` + `contenteditable`
- [ ] User-facing strings added to `_locales/en/messages.json` (other locales can follow)
- [ ] `npm test` green; no leftover `console.log`s (warnings/errors OK)

---

_Maintained by ddtcorex with AI coding agents. Keep this file accurate — it is the single source of truth for agents working on Omni AI._
