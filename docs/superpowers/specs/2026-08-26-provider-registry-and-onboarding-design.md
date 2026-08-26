# Design: Provider Registry Unification & Onboarding Simplification

**Date:** 2026-08-26 · **Status:** Approved-in-chat, pending spec review
**Owner:** ddtcorex · **Repo:** omni-ai (MV3, zero-build vanilla JS)

## Background & Evidence

Product-direction brainstorm against competitors (Merlin, Sider, Monica, Grammarly — see chat log for sources) surfaced two decisions:

1. Differentiate on **easy setup** and **staying focused/simple** rather than breadth of models/integrations — Monica's own users cite "bloated interface with features most users never touch" as a recurring complaint; Omni AI should not chase that shape.
2. The current AI Provider/model layer has a real architectural weakness, discovered while scoping the onboarding work, that has to be fixed *before* onboarding can be meaningfully simplified:

| # | Issue | Evidence |
|---|---|---|
| 1 | Two disconnected sources of truth for "which provider owns this model" | `AI_PROVIDERS` (`lib/ai-providers.js`) walks a `models[]` array; `getProvider()` (`lib/providers/index.js:8-22`) does independent `modelName.startsWith("google-"/"openai-"/"groq-"/"custom-")` string matching. Adding a provider requires editing both in a consistent way by hand (already true today per AGENTS.md's "Adding a New AI Provider" steps). |
| 2 | Prefix convention documented but not actually followed | AGENTS.md states model IDs are prefixed `google-*`/`openai-*`/`groq-*`/`custom-*`. In reality only the `*-custom` entries carry that prefix — real Gemini IDs (`gemini-2.0-flash`, …) have no `google-` prefix at all. `getProvider("gemini-2.0-flash")` only resolves correctly today because it falls through every `startsWith` check to the hardcoded final `return Gemini` fallback — correct by coincidence, not by logic. |
| 3 | Over-defensive fuzzy fallback | `getApiModelName()` (`lib/ai-providers.js:69-104`) has a 3rd-tier heuristic (`m.id.includes("-" + modelId) \|\| m.id.endsWith(modelId)`) that guesses a model from ID suffixes — masks bugs rather than surfacing them. |
| 4 | No onboarding/first-run flow exists at all | `grep` for onboarding/first-run/welcome across `settings.{html,js}`, `popup/*`, `background/service-worker.js` returns nothing. `manifest.json` has no `chrome_url_overrides`/onboarding wiring. Users must self-navigate icon → gear → scroll to 🔑 section. |
| 5 | Language default is hardcoded, not detected | `settings.js:415` — `elements.primaryLanguage.value = prefs.primaryLanguage \|\| "vi"` — every user who has never saved a preference defaults to Vietnamese regardless of browser locale. |
| 6 | Model catalog is stale | Registered models (`gpt-4o`, `gpt-4-turbo`, `gemini-2.0-flash`, …) have been superseded on all three provider APIs since this repo's knowledge was current. Verified against each provider's own docs on 2026-08-26 (not inferred): [OpenAI Models](https://developers.openai.com/api/docs/models), [Gemini API Models](https://ai.google.dev/gemini-api/docs/models), [Groq Supported Models](https://console.groq.com/docs/models), [Claude Models overview](https://platform.claude.com/docs/en/models/overview). |

Adding a 5th provider (Anthropic/Claude — requested explicitly, and a real market gap: Merlin/Sider both surface Claude, Omni AI does not) makes issue #1–#3 non-optional: Claude model IDs (`claude-sonnet-5`, …) have the exact same "no real prefix" shape as Gemini's, so bolting Claude onto the existing prefix-guessing router would require yet another special case instead of fixing the underlying design.

## Goals

1. One source of truth for model→provider resolution; adding a provider means editing the registry once, not two unrelated files.
2. Add Anthropic Claude as a 5th provider using the same `generateContent(prompt, config)` contract as the other three.
3. Refresh the model catalog on all providers to current, non-preview, production-grade options — curated to 3 tiers (cheap/fast, balanced-default, flagship) + a custom-model slot each, matching today's shape (no net growth in dropdown length per provider).
4. A first-time install lands the user on Settings with sensible defaults already chosen (detected UI language, a preselected provider/model) so the *only* required action is pasting one API key.
5. Settings' provider section is visually split into an always-visible "Quick setup" and a collapsed-by-default "Advanced" — no capability removed, just decluttered by default.
6. None of the above breaks an already-installed v2.2.0 user: if their stored `apiModel` is no longer in the registry, the Settings model dropdown still shows and preserves it (labeled legacy) instead of silently jumping to a different model.

## Non-Goals

- No Omni AI–operated backend/proxy, no free-trial-without-a-key path (explicitly rejected — would contradict the "no middleman sees your prompts" privacy claim already published in `docs/CHROME_WEBSTORE_LISTING.txt` and change the product's business model, not just its UX).
- No dedicated onboarding wizard page (`onboarding.html`) in this pass — reusing Settings as the landing surface avoids a second page to localize/maintain forever. Revisit only if smart-defaults-into-Settings turns out to be an insufficient first impression.
- Not touching the writing-action feature set (grammar/rephrase/translate/tone/summarize/emoji) or the editor-adapter layer — out of scope for this spec.
- Not adding `claude-fable-5` to the curated list (priced/positioned as a slower, pricier "long-running agent" tier — a poor fit for a text-rewrite assistant's default 3 tiers); reachable via the `anthropic-custom` model slot if a user wants it.

---

## Part 1 — Provider/Model Registry Unification

`AI_PROVIDERS` in `lib/ai-providers.js` becomes the **only** place that encodes model→provider ownership. `lib/providers/index.js` stops guessing prefixes and instead:

```js
import { getProviderByModel } from "../ai-providers.js";
import * as Gemini from "./gemini.js";
import * as OpenAI from "./openai.js";
import * as Groq from "./groq.js";
import * as CustomGateway from "./custom-gateway.js";
import * as Anthropic from "./anthropic.js";

const MODULES = {
  google: Gemini,
  openai: OpenAI,
  groq: Groq,
  customGateway: CustomGateway,
  anthropic: Anthropic,
};

export function getProvider(modelName) {
  const provider = getProviderByModel(modelName);
  return (provider && MODULES[provider.id]) || Gemini;
}
```

Adding a provider going forward: add its `AI_PROVIDERS` entry + one line in `MODULES`. No prefix string to keep in sync anywhere.

`getApiModelName()` drops its 3rd fallback tier (fuzzy suffix/substring matching). Remaining tiers: (1) exact model-id match → its `apiModel` (or the id itself if `apiModel` is `"custom"`), (2) reverse lookup by `apiModel` value (handles callers that already pass a raw API model name), (3) return the input as-is — this last tier is what makes true custom models (`customModelName`, `customGatewayModelName`) work; it stays.

**Why safe:** every existing model ID in the registry still resolves via tier 1, which is unchanged. Only the heuristic tier — which had no test coverage and no known caller relying on it — is removed.

## Part 2 — New Anthropic Provider

`lib/providers/anthropic.js`, mirroring the shape of `lib/providers/gemini.js` / `openai.js`:

- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: config.apiKey`, `anthropic-version: 2023-06-01`, `content-type: application/json` — **not** `Authorization: Bearer`, which is the pattern every other provider module here uses; this is the one real branch-point vs. the existing modules.
- Body: `{ model: getApiModelName(config.model), max_tokens: config.maxTokens, temperature: config.temperature, top_p: config.topP, messages: [{ role: "user", content: prompt }] }`
- Response text: `data.content[0].text`

`AI_PROVIDERS.anthropic`:

```js
anthropic: {
  id: "anthropic",
  name: "Anthropic Claude",
  keySetting: "anthropicApiKey",
  models: [
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "anthropic-custom", name: "Anthropic Custom Model...", apiModel: "custom" },
  ],
},
```

New storage key `anthropicApiKey` (`storage.local`, same area/pattern as `geminiApiKey`/`openaiApiKey`/`groqApiKey`) — added to `initializeSettings()`'s defaults merge and to the AGENTS.md Storage Map table.

Settings UI gets a 4th key-input block (`anthropicKeyGroup`, `data-provider="anthropic"`) following the exact markup pattern of the existing three, including a tooltip with numbered steps linking to `console.anthropic.com/settings/keys`.

## Part 3 — Model Catalog Refresh

All model IDs below were read directly from each provider's own docs on 2026-08-26 (cited above), not inferred — several are newer than this repo's/my own training data, and picking a wrong literal ID would silently break every API call for that tier.

| Provider | Fast/cheap | Balanced (default) | Flagship |
|---|---|---|---|
| Google Gemini | `gemini-3.5-flash-lite` | `gemini-3.6-flash` | `gemini-2.5-pro` |
| OpenAI | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| Groq | `openai/gpt-oss-20b` | `llama-3.3-70b-versatile` | `openai/gpt-oss-120b` |
| Anthropic | `claude-haiku-4-5-20251001` | `claude-sonnet-5` | `claude-opus-5` |

Notable picks, not the obvious "latest" option:

- **Gemini flagship is `gemini-2.5-pro`, not `gemini-3.1-pro-preview`.** Google's own docs flag preview models as having tighter rate limits and a history of being retired/replaced on short notice (`gemini-3-pro-preview` was retired 2026-03-09 in favor of `gemini-3.1-pro-preview`). Shipping a preview model as the flagship default for an installed base is a maintenance liability; `gemini-2.5-pro` is the stable, non-preview equivalent.
- **Groq fast/cheap tier is `openai/gpt-oss-20b`, not the existing `llama-3.1-8b-instant`.** Both are still listed "Production" on Groq's docs, but keeping `llama-3.3-70b-versatile` *and* `llama-3.1-8b-instant` would put two Llama entries in a 3-slot list; swapping in the newer, cheaper `gpt-oss-20b` keeps the 3 tiers diverse.
- Everything else in the table is each provider's own recommended default for its tier.

### Legacy-model fallback (protects v2.2.0 users)

Prefix-matching a legacy ID back to its provider would repeat the exact mistake Part 1 fixes (Google's old `gemini-2.0-flash` etc. carry no provider prefix at all). Instead, add a small static `LEGACY_MODELS` table next to `AI_PROVIDERS` in `lib/ai-providers.js` — a snapshot of the models being removed in this refresh, each explicitly mapped to its provider id:

```js
export const LEGACY_MODELS = {
  "gemini-2.0-flash": "google",
  "gemini-2.5-flash-lite": "google",
  "gemini-2.5-flash": "google",
  "openai-gpt-4o": "openai",
  "openai-gpt-4o-mini": "openai",
  "openai-gpt-4-turbo": "openai",
  "groq-llama-3.3-70b": "groq",
  "groq-llama-3.1-8b": "groq",
  "groq-gpt-oss-120b": "groq",
};
```

`populateModelSelect()` in `settings.js` builds the `<select>` purely from `AI_PROVIDERS`. After building it, compare the freshly-loaded `apiModel` storage value against the known current IDs; if unknown, look it up in `LEGACY_MODELS` and synthesize one `<option>` — `(Legacy) <stored-id>` — inside that provider's `<optgroup>`, then select it. The user keeps working exactly as before; nothing silently changes their active model. No migration/deletion of stored values — this is purely a display-layer accommodation. Any *future* catalog refresh appends to `LEGACY_MODELS` rather than replacing it, so this stays a durable, explicit mechanism rather than a one-off patch.

---

## Part 4 — Onboarding Simplification

### First-run trigger

`chrome.runtime.onInstalled` currently treats `"install"` and `"update"` identically (both run `initializeSettings()` + `createContextMenus()` — `background/service-worker.js:71-82`, deliberately unified earlier this project to fix context-menus not surviving a dev reload). Add one branch, without disturbing that shared behavior:

```js
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    initializeSettings();
    createContextMenus();
  }
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  }
});
```

A dev-mode unpacked-extension reload fires `"update"`, so this does not spam a new tab on every reload during development.

### Smart defaults

- **Language auto-detect** (fixes issue #5 above): replace the hardcoded `"vi"` fallback in `settings.js` `loadSettings()` with detection via `chrome.i18n.getUILanguage()`, mapped to one of the 10 supported locale codes (`en, vi, es, fr, de, it, pt, ja, ko, zh`) by matching the primary language subtag (e.g. `"pt-BR"` → `"pt"`); unmatched languages fall back to `"en"`. Applies to both `primaryLanguage` and `defaultLanguage` on first load only — an existing saved preference is never overwritten.
- **Provider preselect:** `apiModel` defaults to the Gemini balanced tier (`gemini-3.6-flash`) when nothing is stored yet — Gemini is the only provider with a documented free tier, so it's the lowest-friction first choice. In that same "nothing stored yet" case only, the Gemini key input auto-focuses on page load; a returning user who already has a key configured never has focus stolen from them.

### Auto-validate

Each API-key `<input>` gets a `blur` listener: if the field is non-empty and its value changed since the last successful validation, call the existing `validateConfiguration()` logic after a ~500ms debounce (guards against blur-during-paste double-fires). The manual "Validate" button stays for deliberate re-checks. Reuses the existing `VALIDATE_CONFIG` message and `validationStatus` UI — no new message protocol entries.

### Settings restructure (Quick setup / Advanced)

Split the 🔑 section (`settings.html`) into two blocks:

- **Quick setup** (always visible): AI Model select + exactly the key-input block matching the currently selected provider (the existing `data-provider` show/hide logic already does this — no new mechanism, just a new visual grouping) + validation status.
- **Advanced** (`<details>`, closed by default — native HTML, no new JS/CSS framework needed per Core Directive 1): Custom Gateway base URL + key, Custom Model Name inputs. These already only apply when a `-custom` model is selected, so they're rarely relevant to a first-run user.

No field moves storage area, no field is removed — purely a visual/DOM reorganization plus one `<details>` wrapper.

---

## i18n Impact

New message keys needed in `_locales/en/messages.json` (and, per this project's actual practice this session, all 10 locales together):

- Anthropic provider name, key label, key hint, and 3-step tooltip (mirroring `settings_tooltip_gemini_*`)
- `settings_advanced` (the `<details>` summary label)
- `settings_legacyModelPrefix` (the "(Legacy)" label used in the synthesized option)

No changes to existing keys' meaning — this is additive only.

## Testing

| Area | Test |
|---|---|
| `lib/providers/anthropic.js` | New `tests/lib/providers/anthropic.test.js`, mirroring `gemini.test.js` — request shape (`x-api-key`/`anthropic-version` headers, body), response parsing, error handling. |
| `lib/providers/index.js` routing | New test: every model ID in every `AI_PROVIDERS` entry resolves via `getProvider()` to that provider's module (a loop-driven test, not one assertion per model — stays correct as the catalog changes). |
| `lib/ai-providers.js` | Test `getApiModelName()` still resolves tiers 1–2 correctly and no longer fuzzy-matches an unrelated model by suffix. |
| `background/service-worker.js` onInstalled | Extend existing tests: `"install"` opens a Settings tab exactly once; `"update"` does not. |
| `settings.js` smart defaults | Language-detection mapping table (a representative set of UI-language inputs → expected locale, including an unsupported-language case falling back to `"en"`); legacy-model injection (stored unknown `apiModel` produces a visible, selected legacy option instead of silently changing). |
| `settings.js` auto-validate | Blur with a changed, non-empty key value triggers validation after debounce; blur with an unchanged value does not re-trigger. |

No new Playwright/E2E specs anticipated — no real page interaction surface changes (Settings is an extension-owned page, not content-script UI).

## Docs Impact

- AGENTS.md: Storage Map table gains `anthropicApiKey`; "Adding a New AI Provider" steps 1–2 collapse into one ("register in `AI_PROVIDERS`, add its module to `MODULES` in `providers/index.js`"); Provider System paragraph's `google-*`/`openai-*`/… prefix claim is corrected to describe registry-driven lookup instead.
- `docs/CHROME_WEBSTORE_LISTING.txt`: add Anthropic/Claude to the provider list in "Quick Setup" once this ships (tracked as a release-checklist item already, per the AGENTS.md Release Flow step added earlier this session).

## Rollout

1. **Batch 1** (foundation, no user-visible change): registry unification (Part 1) + its tests. Verifies nothing regresses before anything else builds on top of it.
2. **Batch 2**: Anthropic provider (Part 2) + model catalog refresh with legacy fallback (Part 3). These ship together since the catalog refresh's test plan already covers "every model resolves via the unified router," which includes Anthropic's new entries.
3. **Batch 3**: Onboarding simplification (Part 4) — independent of Batches 1–2 at the code level, but sequenced last because "first thing a new user sees" should land on top of an already-correct, already-tested provider list rather than the other way around.
