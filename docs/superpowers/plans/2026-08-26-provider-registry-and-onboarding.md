# Provider Registry Unification & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify model→provider routing onto one source of truth, add Anthropic Claude as a 5th provider with a refreshed model catalog, and make first install land on a Settings page that already has smart defaults — without breaking any already-installed v2.2.0 user's saved configuration.

**Architecture:** `lib/ai-providers.js` becomes the single registry (`AI_PROVIDERS` + a new `LEGACY_MODELS` map + a `DEFAULT_MODEL` constant); `lib/providers/index.js` resolves modules by looking a model up in that registry instead of guessing string prefixes. `settings.js` gains a few small, independently unit-testable pure exports (`detectSupportedLocale`) alongside its existing DOM-wiring code, and a new `tests/settings.test.js` drives it through a minimal but complete DOM fixture. No new pages, no backend, no build step.

**Tech Stack:** Manifest V3, vanilla ES modules, `chrome.storage`, Jest + jsdom + jest-chrome.

**Spec:** `docs/superpowers/specs/2026-08-26-provider-registry-and-onboarding-design.md`

## Global Constraints

- No framework, bundler, remote code, or MV2 API.
- Every user-visible string needs an `_locales/en/messages.json` key in the same commit (AGENTS.md hard rule); this plan also propagates each new key to the other 9 locales in the same task, matching this project's established practice.
- No Omni AI–operated backend and no free-trial-without-a-key path — BYOK stays the only model.
- A model ID that is no longer in `AI_PROVIDERS` must never silently change a user's stored selection — it must still render, labeled legacy.
- `getProviderByModel()`/registry lookups are the only mechanism allowed to map a model ID to a provider; no new prefix-string guessing.

---

### Task 1: Registry unification — one source of truth for model→provider

**Files:**
- Modify: `lib/providers/index.js`
- Modify: `lib/ai-providers.js:48-104` (`getApiModelName`)
- Modify: `lib/ai-service.js:6, 103, 117-125` (`getProviderById`)
- Test: `tests/lib/providers/index.test.js` (new)
- Modify: `tests/lib/ai-service.test.js:1-6` (mock shape)

**Interfaces:**
- Produces: `getProvider(modelName: string): ProviderModule` (existing signature, new implementation) and `getProviderModule(providerId: string): ProviderModule` (new), both exported from `lib/providers/index.js`. Later tasks (2, 3) rely on `getProvider`/`getProviderModule` resolving through the registry, not prefixes.

- [ ] **Step 1: Write a failing test proving today's router is coincidence, not correctness.**

Create `tests/lib/providers/index.test.js`:

```js
import { getProvider, getProviderModule, Gemini, OpenAI, Groq, CustomGateway } from "../../../lib/providers/index";
import { AI_PROVIDERS } from "../../../lib/ai-providers";

describe("Provider routing", () => {
  it("resolves every model in AI_PROVIDERS to its own provider's module, not by prefix guessing", () => {
    const expected = {
      google: Gemini,
      openai: OpenAI,
      groq: Groq,
      customGateway: CustomGateway,
    };

    Object.values(AI_PROVIDERS).forEach((provider) => {
      const module = expected[provider.id];
      if (!module) return; // providers registered in later tasks are covered there
      provider.models.forEach((model) => {
        expect(getProvider(model.id)).toBe(module);
      });
    });
  });

  it("falls back to Gemini for a totally unknown model id", () => {
    expect(getProvider("some-made-up-model")).toBe(Gemini);
  });

  it("getProviderModule resolves by provider id directly, not by faking a model-name prefix", () => {
    expect(getProviderModule("google")).toBe(Gemini);
    expect(getProviderModule("groq")).toBe(Groq);
    expect(getProviderModule("openai")).toBe(OpenAI);
    expect(getProviderModule("customGateway")).toBe(CustomGateway);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx jest tests/lib/providers/index.test.js`
Expected: FAIL — `getProviderModule` is not exported yet (the `getProvider` assertions may accidentally pass already since Gemini is the current fallback; that's exactly the coincidence this task removes).

- [ ] **Step 3: Rewrite `lib/providers/index.js` to route through the registry.**

```js
import { getProviderByModel } from "../ai-providers.js";
import * as Gemini from "./gemini.js";
import * as OpenAI from "./openai.js";
import * as Groq from "./groq.js";
import * as CustomGateway from "./custom-gateway.js";

export { Gemini, OpenAI, Groq, CustomGateway };

const MODULES = {
  google: Gemini,
  openai: OpenAI,
  groq: Groq,
  customGateway: CustomGateway,
};

export function getProviderModule(providerId) {
  return MODULES[providerId] || Gemini;
}

export function getProvider(modelName) {
  const provider = getProviderByModel(modelName);
  return provider ? getProviderModule(provider.id) : Gemini;
}
```

- [ ] **Step 4: Remove the fuzzy-match fallback tier from `getApiModelName()`.**

In `lib/ai-providers.js`, delete tier 3 (the `if (!modelId.includes("/")) { ... m.id.includes("-" + modelId) ... }` block at lines 90-100 per the current file) — keep tier 1 (exact id match), tier 2 (reverse lookup by `apiModel`), and the final `return modelId` fallback.

- [ ] **Step 5: Simplify `getProviderById()` in `lib/ai-service.js`.**

Replace:

```js
function getProviderById(id) {
  if (id === "customGateway") {
    return CustomGateway; // Return directly, not via getProvider() which relies on model name prefix
  }
  return getProvider(id + "-");
}
```

with:

```js
function getProviderById(id) {
  return getProviderModule(id);
}
```

Update the import at the top of `lib/ai-service.js` from `import { getProvider, CustomGateway } from "./providers/index.js";` to `import { getProvider, getProviderModule } from "./providers/index.js";` (the `CustomGateway` name is no longer referenced directly in this file).

- [ ] **Step 6: Update the `ai-service.test.js` mock to include the new export.**

In `tests/lib/ai-service.test.js:4-6`, change:

```js
jest.mock("../../lib/providers/index", () => ({
  getProvider: jest.fn(),
}));
```

to:

```js
jest.mock("../../lib/providers/index", () => ({
  getProvider: jest.fn(),
  getProviderModule: jest.fn(),
}));
```

and in the `beforeEach`, alongside the existing `Providers.getProvider.mockReturnValue(mockProvider);`, add `Providers.getProviderModule.mockReturnValue(mockProvider);` — the "generateContent uses Groq if model starts with groq-" test (line 75-99) passes an explicit `model` and no `provider` hint, so it still goes through `getProvider`, not `getProviderById`; this second mock only matters if a later test exercises the `providerHint` path, but stubbing it now avoids an `undefined is not a function` crash if one is added later.

- [ ] **Step 7: Run the full suite.**

Run: `npm test`
Expected: All suites pass, including the new `tests/lib/providers/index.test.js`.

- [ ] **Step 8: Commit.**

```bash
git add lib/providers/index.js lib/ai-providers.js lib/ai-service.js tests/lib/providers/index.test.js tests/lib/ai-service.test.js
git commit -m "refactor: route model->provider resolution through the registry, not prefix guessing"
```

---

### Task 2: Anthropic Claude provider

**Files:**
- Create: `lib/providers/anthropic.js`
- Modify: `lib/providers/index.js` (register in `MODULES`)
- Modify: `lib/ai-providers.js` (`AI_PROVIDERS.anthropic` entry)
- Modify: `settings.html` (new key-input block, mirroring the OpenAI block)
- Modify: `settings.js` (new `elements.anthropicApiKey`/`anthropicKeyGroup`, load/save wiring, `validateConfiguration()` branch)
- Modify: `background/service-worker.js` (`initializeSettings()` defaults)
- Test: `tests/lib/providers/anthropic.test.js` (new)
- Modify: `_locales/en/messages.json` + the other 9 locale files (new keys)

**Interfaces:**
- Consumes: `getApiModelName` from `lib/ai-providers.js` (Task 1's simplified version).
- Produces: `AI_PROVIDERS.anthropic` with `id: "anthropic"`, `keySetting: "anthropicApiKey"`, `models: [...]` — Task 3 reads this shape for the routing test loop.

- [ ] **Step 1: Write the failing provider test.**

Create `tests/lib/providers/anthropic.test.js`:

```js
import { generateContent } from "../../../lib/providers/anthropic";

describe("Anthropic Provider", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("throws error if apiKey is missing", async () => {
    await expect(generateContent("test", {})).rejects.toThrow("Anthropic API key not configured");
  });

  it("calls the Messages API with x-api-key auth and the anthropic-version header", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: "Response Text" }] }),
    });

    const config = { apiKey: "test-key", model: "claude-sonnet-5", temperature: 0.5, maxTokens: 100 };
    const result = await generateContent("Hello", config);

    expect(result).toBe("Response Text");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }),
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("handles API errors", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid x-api-key" } }),
    });

    const config = { apiKey: "bad-key", model: "claude-sonnet-5" };
    await expect(generateContent("test", config)).rejects.toThrow("invalid x-api-key");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails because the module doesn't exist.**

Run: `npx jest tests/lib/providers/anthropic.test.js`
Expected: FAIL — cannot find module `lib/providers/anthropic`.

- [ ] **Step 3: Create `lib/providers/anthropic.js`.**

```js
/**
 * Anthropic Provider
 * Handles interaction with the Claude Messages API
 */

import { getApiModelName } from "../ai-providers.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Generate content using Claude
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, temperature, topP, maxTokens }
 */
export async function generateContent(prompt, config) {
  const { apiKey, model, temperature = 0.7, topP = 0.95, maxTokens = 4096 } = config;

  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const claudeModel = getApiModelName(model) || "claude-sonnet-5";

  const body = {
    model: claudeModel,
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}
```

- [ ] **Step 4: Register it in `lib/providers/index.js`.**

```js
import * as Anthropic from "./anthropic.js";

export { Gemini, OpenAI, Groq, CustomGateway, Anthropic };

const MODULES = {
  google: Gemini,
  openai: OpenAI,
  groq: Groq,
  customGateway: CustomGateway,
  anthropic: Anthropic,
};
```

- [ ] **Step 5: Add the `AI_PROVIDERS.anthropic` entry in `lib/ai-providers.js`.**

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

- [ ] **Step 6: Run the provider and routing tests.**

Run: `npx jest tests/lib/providers/ --runInBand`
Expected: PASS, including Task 1's routing test now covering Anthropic's models too.

- [ ] **Step 7: Add `anthropicApiKey` to `initializeSettings()` defaults in `background/service-worker.js`.**

In the `defaults` object (around line 139-151), add `anthropicApiKey: ""` alongside the existing `geminiApiKey: ""`.

- [ ] **Step 8: Add the Anthropic key-input block to `settings.html`.**

Insert immediately after the closing `</div>` of the OpenAI key group (after line 214, before the `<!-- Custom Gateway -->` comment):

```html
<!-- Anthropic API Key -->
<div class="setting-item hidden" id="anthropicKeyGroup" data-provider="anthropic">
  <label class="setting-label" for="anthropicApiKey">
    <div class="label-header">
      <span class="label-text">__MSG_settings_anthropicKey__</span>
      <div class="tooltip-trigger">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div class="tooltip-popup">
          <p>__MSG_settings_tooltip_anthropic__</p>
          <ol>
            <li>
              __MSG_settings_tooltip_anthropic_s1__
              <a href="https://console.anthropic.com/settings/keys" target="_blank"
                >__MSG_settings_anthropicConsole__</a
              >
            </li>
            <li>__MSG_settings_tooltip_anthropic_s2__</li>
            <li>__MSG_settings_tooltip_anthropic_s3__</li>
          </ol>
        </div>
      </div>
    </div>
    <span class="label-hint">__MSG_settings_anthropicKeyHint__</span>
  </label>
  <div class="input-group">
    <input type="password" id="anthropicApiKey" class="setting-input" placeholder="sk-ant-..." />
  </div>
</div>
```

- [ ] **Step 9: Wire it up in `settings.js`.**

In the `elements` object (after `openaiKeyGroup`), add:

```js
anthropicApiKey: /** @type {HTMLInputElement} */ (document.getElementById("anthropicApiKey")),
anthropicKeyGroup: document.getElementById("anthropicKeyGroup"),
```

In `loadSettings()`, add `"anthropicApiKey"` to the `chrome.storage.local.get([...])` key list (alongside `"geminiApiKey"`, `"groqApiKey"`, `"openaiApiKey"`), and add:

```js
if (config.anthropicApiKey) elements.anthropicApiKey.value = config.anthropicApiKey;
```

In `saveSettings()`, add `anthropicApiKey: elements.anthropicApiKey.value.trim(),` to the `aiConfig` object.

In `validateConfiguration()`, add a branch to the provider-id `if/else if` chain (after the `openai` branch):

```js
} else if (provider.id === "anthropic") {
  apiKey = elements.anthropicApiKey.value.trim();
```

In `setupEventListeners()`'s `inputs` array, add `elements.anthropicApiKey,`.

- [ ] **Step 10: Add English message keys to `_locales/en/messages.json`.**

Add these entries (placed near the existing `settings_openaiKey`/`settings_tooltip_openai` block for readability, exact position doesn't matter — JSON key order is not significant):

```json
"settings_anthropicKey": {
  "message": "Anthropic API Key",
  "description": "Anthropic API key label"
},
"settings_anthropicKeyHint": {
  "message": "Get API key at console.anthropic.com",
  "description": "Anthropic API key hint"
},
"settings_tooltip_anthropic": {
  "message": "Get Anthropic API Key",
  "description": "Anthropic tooltip title"
},
"settings_tooltip_anthropic_s1": {
  "message": "Go to"
},
"settings_anthropicConsole": {
  "message": "Anthropic Console",
  "description": "Link text for Anthropic Console"
},
"settings_tooltip_anthropic_s2": {
  "message": "Sign up or Log in"
},
"settings_tooltip_anthropic_s3": {
  "message": "Create new API Key"
}
```

- [ ] **Step 11: Propagate the same 7 keys to the other 9 locale files.**

Add the equivalent block (same 7 keys, same structure — `description` fields are optional and can be omitted in non-English locales to match this repo's existing convention) to each of `_locales/{vi,es,fr,de,it,pt,ja,ko,zh}/messages.json`:

**vi:**
```json
"settings_anthropicKey": { "message": "Khóa API Anthropic" },
"settings_anthropicKeyHint": { "message": "Lấy khóa API tại console.anthropic.com" },
"settings_tooltip_anthropic": { "message": "Lấy Khóa API Anthropic" },
"settings_tooltip_anthropic_s1": { "message": "Truy cập" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "Đăng ký hoặc Đăng nhập" },
"settings_tooltip_anthropic_s3": { "message": "Tạo Khóa API mới" }
```

**es:**
```json
"settings_anthropicKey": { "message": "Clave API de Anthropic" },
"settings_anthropicKeyHint": { "message": "Consigue tu clave en console.anthropic.com" },
"settings_tooltip_anthropic": { "message": "Obtener Clave API de Anthropic" },
"settings_tooltip_anthropic_s1": { "message": "Ve a" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "Regístrate o inicia sesión" },
"settings_tooltip_anthropic_s3": { "message": "Crea una nueva clave API" }
```

**fr:**
```json
"settings_anthropicKey": { "message": "Clé API Anthropic" },
"settings_anthropicKeyHint": { "message": "Clé sur console.anthropic.com" },
"settings_tooltip_anthropic": { "message": "Obtenir une clé Anthropic" },
"settings_tooltip_anthropic_s1": { "message": "Accédez à" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "Inscrivez-vous ou connectez-vous" },
"settings_tooltip_anthropic_s3": { "message": "Créez une nouvelle clé API" }
```

**de:**
```json
"settings_anthropicKey": { "message": "Anthropic API-Schlüssel" },
"settings_anthropicKeyHint": { "message": "API-Schlüssel auf console.anthropic.com erhalten" },
"settings_tooltip_anthropic": { "message": "Anthropic-Schlüssel erhalten" },
"settings_tooltip_anthropic_s1": { "message": "Gehe zu" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "Registrieren oder Anmelden" },
"settings_tooltip_anthropic_s3": { "message": "Neuen API-Schlüssel erstellen" }
```

**it:**
```json
"settings_anthropicKey": { "message": "Chiave API Anthropic" },
"settings_anthropicKeyHint": { "message": "Ottieni la chiave su console.anthropic.com" },
"settings_tooltip_anthropic": { "message": "Ottieni Chiave API Anthropic" },
"settings_tooltip_anthropic_s1": { "message": "Vai su" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "Registrati o accedi" },
"settings_tooltip_anthropic_s3": { "message": "Crea una nuova chiave API" }
```

**pt:**
```json
"settings_anthropicKey": { "message": "Chave API Anthropic" },
"settings_anthropicKeyHint": { "message": "Obtenha sua chave em console.anthropic.com" },
"settings_tooltip_anthropic": { "message": "Obter Chave Anthropic" },
"settings_tooltip_anthropic_s1": { "message": "Vá ao" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "Registe-se ou faça login" },
"settings_tooltip_anthropic_s3": { "message": "Crie uma nova chave API" }
```

**ja:**
```json
"settings_anthropicKey": { "message": "Anthropic APIキー" },
"settings_anthropicKeyHint": { "message": "console.anthropic.com でAPIキーを取得できます" },
"settings_tooltip_anthropic": { "message": "Anthropic APIキーの取得" },
"settings_tooltip_anthropic_s1": { "message": "アクセス:" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "サインアップまたはログインします" },
"settings_tooltip_anthropic_s3": { "message": "新しいAPIキーを作成します" }
```

**ko:**
```json
"settings_anthropicKey": { "message": "Anthropic API 키" },
"settings_anthropicKeyHint": { "message": "console.anthropic.com에서 API 키를 받으세요" },
"settings_tooltip_anthropic": { "message": "Anthropic API 키 발급" },
"settings_tooltip_anthropic_s1": { "message": "다음으로 이동:" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "회원가입 또는 로그인합니다" },
"settings_tooltip_anthropic_s3": { "message": "새 API 키를 생성합니다" }
```

**zh:**
```json
"settings_anthropicKey": { "message": "Anthropic API 密钥" },
"settings_anthropicKeyHint": { "message": "在 console.anthropic.com 获取密钥" },
"settings_tooltip_anthropic": { "message": "获取 Anthropic 密钥" },
"settings_tooltip_anthropic_s1": { "message": "前往" },
"settings_anthropicConsole": { "message": "Anthropic Console" },
"settings_tooltip_anthropic_s2": { "message": "注册或登录账户" },
"settings_tooltip_anthropic_s3": { "message": "创建新的 API 密钥" }
```

- [ ] **Step 12: Run the full suite.**

Run: `npm test`
Expected: All suites pass. Also run `npm run typecheck` if `settings.html`'s new `id="anthropicApiKey"` needs to satisfy any JSDoc `@type` checks — it mirrors the existing `openaiApiKey` pattern exactly, so it should typecheck cleanly.

- [ ] **Step 13: Commit.**

```bash
git add lib/providers/anthropic.js lib/providers/index.js lib/ai-providers.js settings.html settings.js background/service-worker.js tests/lib/providers/anthropic.test.js _locales/*/messages.json
git commit -m "feat: add Anthropic Claude as a 5th AI provider"
```

---

### Task 3: Model catalog refresh + legacy fallback for existing users

**Files:**
- Modify: `lib/ai-providers.js` (curated model lists, `LEGACY_MODELS`, `DEFAULT_MODEL`)
- Modify: `lib/ai-service.js:9` (`DEFAULT_MODEL` import instead of local constant)
- Modify: `settings.js` (`populateModelSelect()` legacy injection, `loadSettings()` ordering fix, `DEFAULT_MODEL` import)
- Modify: `tests/lib/ai-service.test.js` (update hardcoded `"gemini-2.0-flash"` expectations)
- Modify: `e2e/quick-action-modal.spec.js:21`, `e2e/overlay-css-isolation.spec.js:23` (update seeded `apiModel` fixture value)
- Test: `tests/lib/ai-providers.test.js` (new — `LEGACY_MODELS` + `getApiModelName` coverage)
- Test: `tests/settings.test.js` (new — first test in this file; later tasks extend it)

**Interfaces:**
- Consumes: `getProvider`/`getProviderModule` from Task 1; `AI_PROVIDERS.anthropic` from Task 2.
- Produces: `DEFAULT_MODEL` (exported string constant) and `LEGACY_MODELS` (exported `{ [modelId]: providerId }` map), both from `lib/ai-providers.js`. Tasks 5-7 import `DEFAULT_MODEL` when they need "the default model."

- [ ] **Step 1: Write failing tests for the new registry exports.**

Create `tests/lib/ai-providers.test.js`:

```js
import { AI_PROVIDERS, LEGACY_MODELS, DEFAULT_MODEL, getApiModelName } from "../../lib/ai-providers";

describe("AI_PROVIDERS registry", () => {
  it("DEFAULT_MODEL points at a real, current model", () => {
    const allIds = Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id));
    expect(allIds).toContain(DEFAULT_MODEL);
  });

  it("every LEGACY_MODELS entry points at a real provider id, and is NOT also a current model", () => {
    const providerIds = new Set(Object.keys(AI_PROVIDERS));
    const allCurrentIds = new Set(Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id)));
    Object.entries(LEGACY_MODELS).forEach(([modelId, providerId]) => {
      expect(providerIds.has(providerId)).toBe(true);
      expect(allCurrentIds.has(modelId)).toBe(false);
    });
  });

  it("getApiModelName no longer fuzzy-matches an unrelated model by suffix", () => {
    // "70b" alone used to risk matching "groq-llama-3.3-70b" via the removed
    // substring-fallback tier; it must now just pass through unchanged.
    expect(getApiModelName("70b")).toBe("70b");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `npx jest tests/lib/ai-providers.test.js`
Expected: FAIL — `LEGACY_MODELS` and `DEFAULT_MODEL` are not exported yet.

- [ ] **Step 3: Replace the Google, OpenAI, and Groq model lists in `lib/ai-providers.js`.**

This is a partial edit: only the `google`, `openai`, and `groq` entries' `models` arrays change. Do not touch the `customGateway` or `anthropic` entries (the latter was added in Task 2) — leave them exactly as they are, in their existing position in the object.

Add the `DEFAULT_MODEL` export above `AI_PROVIDERS`:

```js
export const DEFAULT_MODEL = "gemini-3.6-flash";
```

Replace the `google.models` array with:

```js
models: [
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "google-custom", name: "Google Custom Model...", apiModel: "custom" },
],
```

Replace the `openai.models` array with:

```js
models: [
  { id: "openai-gpt-5.6-luna", name: "GPT-5.6 Luna", apiModel: "gpt-5.6-luna" },
  { id: "openai-gpt-5.6-terra", name: "GPT-5.6 Terra", apiModel: "gpt-5.6-terra" },
  { id: "openai-gpt-5.6-sol", name: "GPT-5.6 Sol", apiModel: "gpt-5.6-sol" },
  { id: "openai-custom", name: "OpenAI Custom Model...", apiModel: "custom" },
],
```

Replace the `groq.models` array with:

```js
models: [
  { id: "groq-gpt-oss-20b", name: "GPT-OSS 20B", apiModel: "openai/gpt-oss-20b" },
  { id: "groq-llama-3.3-70b", name: "Llama 3.3 70B", apiModel: "llama-3.3-70b-versatile" },
  { id: "groq-gpt-oss-120b", name: "GPT-OSS 120B", apiModel: "openai/gpt-oss-120b" },
  { id: "groq-custom", name: "Groq Custom Model...", apiModel: "custom" },
],
```

Add `LEGACY_MODELS` as a new export, after `AI_PROVIDERS`:

```js
export const LEGACY_MODELS = {
  "gemini-2.0-flash": "google",
  "gemini-2.5-flash-lite": "google",
  "gemini-2.5-flash": "google",
  "openai-gpt-4o": "openai",
  "openai-gpt-4o-mini": "openai",
  "openai-gpt-4-turbo": "openai",
  "groq-llama-3.1-8b": "groq",
};
```

Note `groq-llama-3.3-70b` is intentionally **not** in `LEGACY_MODELS` — it stays a current model (its `apiModel` value is unchanged), so no user is affected. `groq-gpt-oss-120b`'s id is unchanged too. Only `groq-llama-3.1-8b` (replaced by `groq-gpt-oss-20b`), the three `openai-*` entries, and the three bare `gemini-2.x-*` entries actually leave the catalog. Double-check this list against the actual diff before committing — it must exactly match which IDs stop appearing in `AI_PROVIDERS`.

- [ ] **Step 4: Point `lib/ai-service.js` at the shared `DEFAULT_MODEL`.**

Replace `const DEFAULT_MODEL = "gemini-2.0-flash";` (line 9) with an import:

```js
import { AI_PROVIDERS, getProviderByModel, DEFAULT_MODEL } from "./ai-providers.js";
```

(merge into the existing `lib/ai-providers.js` import on that line rather than adding a second import statement) and delete the old local `const DEFAULT_MODEL = ...` line.

- [ ] **Step 5: Fix `populateModelSelect()` in `settings.js` to accept the current model and inject a legacy option.**

Replace the existing import at `settings.js:4` (`import { AI_PROVIDERS, getProviderByModel } from "./lib/ai-providers.js";`) with:

```js
import { AI_PROVIDERS, getProviderByModel, LEGACY_MODELS, DEFAULT_MODEL } from "./lib/ai-providers.js";
```

Then replace the body of `populateModelSelect()`:

```js
function populateModelSelect(currentApiModel) {
  const select = elements.apiModel;
  select.innerHTML = "";

  const groupsByProvider = {};
  Object.values(AI_PROVIDERS).forEach((provider) => {
    const group = document.createElement("optgroup");
    group.label = provider.name;

    provider.models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      group.appendChild(option);
    });

    select.appendChild(group);
    groupsByProvider[provider.id] = group;
  });

  const knownIds = new Set(Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id)));
  if (currentApiModel && !knownIds.has(currentApiModel) && LEGACY_MODELS[currentApiModel]) {
    const group = groupsByProvider[LEGACY_MODELS[currentApiModel]];
    if (group) {
      const option = document.createElement("option");
      option.value = currentApiModel;
      option.textContent = `${i18n.getMessage("settings_legacyModelPrefix")} ${currentApiModel}`;
      group.insertBefore(option, group.firstChild);
    }
  }
}
```

- [ ] **Step 6: Move the `populateModelSelect()` call from `init()` into `loadSettings()`, after `apiModel` is known.**

In `init()` (around line 61-71), delete the standalone `populateModelSelect();` call. The select must not be populated until the plan knows whether the saved value is legacy — populating it blind (today's order) is exactly what would make a legacy value silently fail to select.

In `loadSettings()`, where `const savedModel = config.apiModel || "gemini-2.0-flash";` currently sits (line 445), replace with:

```js
const savedModel = config.apiModel || DEFAULT_MODEL;
populateModelSelect(savedModel);
elements.apiModel.value = savedModel;
```

(This replaces both the old hardcoded fallback and the line right after it that set `elements.apiModel.value = savedModel;` — there should be exactly one assignment to `elements.apiModel.value`, now sitting after `populateModelSelect(savedModel)`.)

- [ ] **Step 7: Add the "(Legacy)" message key — English first.**

In `_locales/en/messages.json`:

```json
"settings_legacyModelPrefix": {
  "message": "(Legacy)",
  "description": "Prefix shown before a model no longer in the active catalog but still selected by an existing user"
}
```

- [ ] **Step 8: Propagate to the other 9 locales.**

| Locale | Value |
|---|---|
| vi | `(Cũ)` |
| es | `(Antiguo)` |
| fr | `(Ancien)` |
| de | `(Veraltet)` |
| it | `(Obsoleto)` |
| pt | `(Legado)` |
| ja | `(旧)` |
| ko | `(레거시)` |
| zh | `(旧版)` |

Add `"settings_legacyModelPrefix": { "message": "<value>" }` to each locale's `messages.json`.

- [ ] **Step 9: Create the first `tests/settings.test.js` with a full DOM fixture.**

This is the first test file for `settings.js`. It has zero exports today; this task adds `export` to `init`, `loadSettings`, and `populateModelSelect` (no behavior change — same functions, just also exported) so tests can call them directly instead of relying on a `DOMContentLoaded` event that jsdom may have already fired before the test's listener attaches.

In `settings.js`, change the three function declarations from `function init() {`, `async function loadSettings() {`, `function populateModelSelect(currentApiModel) {` to `export function init() {`, `export async function loadSettings() {`, `export function populateModelSelect(currentApiModel) {`. Everything else about them is unchanged.

Create `tests/settings.test.js`:

```js
import fs from "fs";
import path from "path";

const FIXTURE_IDS = [
  "extVersion", "geminiApiKey", "apiModel", "customModelName", "customModelGroup",
  "googleKeyGroup", "groqApiKey", "groqKeyGroup", "openaiApiKey", "openaiKeyGroup",
  "anthropicApiKey", "anthropicKeyGroup", "customGatewayKeyGroup", "customGatewayBaseUrl",
  "customGatewayApiKey", "toggleApiKey", "validateBtn", "validationStatus", "themeSelector",
  "defaultPreset", "showFloatingButton", "primaryLanguage", "defaultLanguage", "shortcutsLink",
  "saveBtn", "saveStatus", "statTotalActions", "statWordsProcessed", "statWordsGenerated",
  "refreshHistory", "clearHistory", "historyList",
];

function buildFixture() {
  document.body.innerHTML = FIXTURE_IDS.map((id) => {
    if (id === "apiModel") return `<select id="${id}"></select>`;
    if (["themeSelector", "defaultPreset", "showFloatingButton", "primaryLanguage", "defaultLanguage"].includes(id)) {
      return `<select id="${id}"><option value="">-</option></select>`;
    }
    if (id === "toggleApiKey" || id === "validateBtn" || id === "shortcutsLink" || id === "saveBtn" || id === "refreshHistory" || id === "clearHistory") {
      return `<button id="${id}"><svg></svg><span></span></button>`;
    }
    return `<div id="${id}"></div>`;
  }).join("\n");
}

describe("settings.js", () => {
  let Settings;

  beforeEach(async () => {
    jest.resetModules();
    buildFixture();
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
    chrome.i18n.getMessage.mockImplementation((key) => key);
    chrome.i18n.getUILanguage = jest.fn().mockReturnValue("en-US");
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.local.get.mockResolvedValue({});
    Settings = await import("../settings.js");
  });

  it("populateModelSelect renders every current model plus a legacy option for an unknown saved id", () => {
    Settings.populateModelSelect("gemini-2.0-flash");
    const options = Array.from(document.getElementById("apiModel").options).map((o) => o.value);
    expect(options).toContain("gemini-2.0-flash");
    const legacyOption = Array.from(document.getElementById("apiModel").options).find(
      (o) => o.value === "gemini-2.0-flash",
    );
    expect(legacyOption.textContent).toContain("settings_legacyModelPrefix");
  });

  it("loadSettings selects the legacy option instead of leaving the select blank", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-2.0-flash" });
    await Settings.loadSettings();
    expect(document.getElementById("apiModel").value).toBe("gemini-2.0-flash");
  });

  it("loadSettings selects the real current model when nothing is legacy", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-3.6-flash" });
    await Settings.loadSettings();
    expect(document.getElementById("apiModel").value).toBe("gemini-3.6-flash");
  });
});
```

- [ ] **Step 10: Update `tests/lib/ai-service.test.js`'s hardcoded default-model expectations.**

Change every occurrence of `"gemini-2.0-flash"` used as *the default* (lines 58, 65, 70, 135) to `"gemini-3.6-flash"`. Leave the "uses Groq if model starts with groq-" test's `"groq-llama-3.3-70b"` (lines 77, 88, 92) unchanged — that model id is not being retired.

- [ ] **Step 11: Update the two e2e fixtures' seeded `apiModel`.**

In `e2e/quick-action-modal.spec.js:21` and `e2e/overlay-css-isolation.spec.js:23`, change `apiModel: "gemini-2.0-flash"` to `apiModel: "gemini-3.6-flash"`. These specs only need a syntactically valid stored model to satisfy a precondition — they don't assert on the Settings dropdown — so either string would technically work, but keeping fixtures on real, current data avoids the next reader wondering whether `gemini-2.0-flash` is significant.

- [ ] **Step 12: Run the full suite.**

Run: `npm run verify`
Expected: typecheck, lint, and all Jest suites (including the two new test files) pass.

- [ ] **Step 13: Commit.**

```bash
git add lib/ai-providers.js lib/ai-service.js settings.js tests/lib/ai-providers.test.js tests/settings.test.js tests/lib/ai-service.test.js e2e/quick-action-modal.spec.js e2e/overlay-css-isolation.spec.js _locales/*/messages.json
git commit -m "feat: refresh AI model catalog to current provider offerings, keep legacy selections visible"
```

---

### Task 4: First-run — open Settings on fresh install only

**Files:**
- Modify: `background/service-worker.js:71-82` (`onInstalled` listener)
- Modify: `tests/background/service-worker.test.js` (mock + new test)

**Interfaces:**
- No new exports; this task only changes the `onInstalled` listener body.

- [ ] **Step 1: Add `tabs.create` and `runtime.getURL` to the test's Chrome mock.**

In `tests/background/service-worker.test.js`, inside the `chromeMock` object built in `beforeEach` (around line 14-24), add `getURL: jest.fn((path) => path)` to the `runtime` block, and add `create: jest.fn()` to the existing `tabs` block (which currently only has `query` and `sendMessage`).

- [ ] **Step 2: Write the failing test.**

Add to `tests/background/service-worker.test.js`, near the existing `onInstalled` tests:

```js
it("opens a Settings tab on a fresh install, but not on a dev-reload update", async () => {
  await import("../../background/service-worker");
  const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];

  installed({ reason: "install" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: "settings.html" });

  chromeMock.tabs.create.mockClear();
  installed({ reason: "update" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(chromeMock.tabs.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run it and confirm it fails.**

Run: `npx jest tests/background/service-worker.test.js -t "opens a Settings tab"`
Expected: FAIL — `chromeMock.tabs.create` was never called.

- [ ] **Step 4: Update the `onInstalled` listener.**

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

- [ ] **Step 5: Run the focused test, then the full suite.**

Run: `npx jest tests/background/service-worker.test.js -t "opens a Settings tab"`
Expected: PASS.

Run: `npm test`
Expected: All suites pass.

- [ ] **Step 6: Commit.**

```bash
git add background/service-worker.js tests/background/service-worker.test.js
git commit -m "feat: open Settings automatically on first install"
```

---

### Task 5: Smart defaults — detected language, preselected provider

**Files:**
- Modify: `settings.js` (`detectSupportedLocale`, `loadSettings()` primary/default language fallback, initial focus)
- Modify: `tests/settings.test.js`

**Interfaces:**
- Produces: `export function detectSupportedLocale(uiLanguage: string, supported: string[], fallback: string): string` from `settings.js` — a pure function, no DOM/chrome dependency, importable and testable directly.

- [ ] **Step 1: Write failing pure-function tests (no DOM fixture needed for these).**

Add to `tests/settings.test.js`, as a separate top-level `describe` (does not need `beforeEach`'s fixture, but importing from the same module is fine since the module's top-level code is null-safe):

```js
describe("detectSupportedLocale", () => {
  const SUPPORTED = ["en", "vi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"];

  it("matches an exact supported language", () => {
    expect(Settings.detectSupportedLocale("fr", SUPPORTED, "en")).toBe("fr");
  });

  it("matches the primary subtag of a regional variant", () => {
    expect(Settings.detectSupportedLocale("pt-BR", SUPPORTED, "en")).toBe("pt");
    expect(Settings.detectSupportedLocale("zh-TW", SUPPORTED, "en")).toBe("zh");
  });

  it("falls back for an unsupported language", () => {
    expect(Settings.detectSupportedLocale("th", SUPPORTED, "en")).toBe("en");
  });

  it("falls back for an empty or missing input", () => {
    expect(Settings.detectSupportedLocale("", SUPPORTED, "en")).toBe("en");
    expect(Settings.detectSupportedLocale(undefined, SUPPORTED, "en")).toBe("en");
  });
});
```

(`Settings` here is the same `await import("../settings.js")` result from the outer `describe`'s `beforeEach` — Jest scopes `beforeEach` to the whole file by default, so this nested `describe` reuses it. If a linter flags reuse across `describe` blocks, move this block inside the existing top-level `describe("settings.js", ...)` instead of nesting a new one.)

- [ ] **Step 2: Run and confirm failure.**

Run: `npx jest tests/settings.test.js -t "detectSupportedLocale"`
Expected: FAIL — `detectSupportedLocale` is not exported yet.

- [ ] **Step 3: Implement and export `detectSupportedLocale` in `settings.js`.**

```js
const SUPPORTED_LOCALES = ["en", "vi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"];

/**
 * Map a browser UI-language tag to one of this extension's supported locales.
 * @param {string|undefined} uiLanguage - e.g. "pt-BR", from chrome.i18n.getUILanguage()
 * @param {string[]} supported - supported locale codes
 * @param {string} fallback - locale to use when nothing matches
 */
export function detectSupportedLocale(uiLanguage, supported, fallback) {
  if (!uiLanguage) return fallback;
  const primary = uiLanguage.split("-")[0].toLowerCase();
  return supported.includes(primary) ? primary : fallback;
}
```

- [ ] **Step 4: Wire it into `loadSettings()`'s language fallback, fixing the hardcoded `"vi"`.**

Replace:

```js
if (elements.primaryLanguage) elements.primaryLanguage.value = prefs.primaryLanguage || "vi";
if (elements.defaultLanguage) elements.defaultLanguage.value = prefs.defaultLanguage || "en";
```

with:

```js
const detectedLocale = detectSupportedLocale(
  chrome.i18n.getUILanguage(),
  SUPPORTED_LOCALES,
  "en",
);
if (elements.primaryLanguage) elements.primaryLanguage.value = prefs.primaryLanguage || detectedLocale;
if (elements.defaultLanguage) elements.defaultLanguage.value = prefs.defaultLanguage || "en";
```

`defaultLanguage` (the translation *target* language) intentionally keeps its plain `"en"` fallback — detection applies only to `primaryLanguage` (the user's own language), which is what the old hardcoded `"vi"` bug actually affected.

- [ ] **Step 5: Preselect the default provider and auto-focus its key input, only when nothing is configured yet.**

In `loadSettings()`, after the `populateModelSelect(savedModel); elements.apiModel.value = savedModel;` lines from Task 3, add:

```js
if (!config.apiModel && !config.geminiApiKey) {
  elements.geminiApiKey?.focus();
}
```

This only fires when both the model and the Gemini key are unset — i.e. genuinely nothing saved yet, not merely "user picked a different provider." A returning user who has any Gemini key saved, or who explicitly chose a different provider (which would have saved a non-empty `apiModel`), never has focus stolen.

- [ ] **Step 6: Add tests for both behaviors.**

Add to `tests/settings.test.js`:

```js
it("loadSettings uses the detected browser language when no primaryLanguage is saved", async () => {
  chrome.i18n.getUILanguage.mockReturnValue("fr-CA");
  chrome.storage.sync.get.mockResolvedValue({});
  await Settings.loadSettings();
  expect(document.getElementById("primaryLanguage").value).toBe("fr");
});

it("loadSettings respects an already-saved primaryLanguage over detection", async () => {
  chrome.i18n.getUILanguage.mockReturnValue("fr-CA");
  chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "ja" });
  await Settings.loadSettings();
  expect(document.getElementById("primaryLanguage").value).toBe("ja");
});

it("focuses the Gemini key input on a genuinely empty first load", async () => {
  chrome.storage.local.get.mockResolvedValue({});
  const focusSpy = jest.spyOn(document.getElementById("geminiApiKey"), "focus");
  await Settings.loadSettings();
  expect(focusSpy).toHaveBeenCalled();
});

it("does not steal focus when a Gemini key is already saved", async () => {
  chrome.storage.local.get.mockResolvedValue({ geminiApiKey: "existing-key" });
  const focusSpy = jest.spyOn(document.getElementById("geminiApiKey"), "focus");
  await Settings.loadSettings();
  expect(focusSpy).not.toHaveBeenCalled();
});
```

Note the `primaryLanguage` select element in the fixture from Task 3 (`<select id="primaryLanguage"><option value="">-</option></select>`) has no `<option value="fr">` etc. — assigning `.value = "fr"` to a native `<select>` with no matching `<option>` results in `.value === ""`, which would make the first two new tests above fail even with correct code. Update `buildFixture()` in `tests/settings.test.js` (from Task 3) so `primaryLanguage` and `defaultLanguage` each render `<option>` elements for all 10 `SUPPORTED_LOCALES` values, not the placeholder `<option value="">-</option>`.

- [ ] **Step 7: Run the focused tests, then the full suite.**

Run: `npx jest tests/settings.test.js`
Expected: PASS.

Run: `npm test`
Expected: All suites pass.

- [ ] **Step 8: Commit.**

```bash
git add settings.js tests/settings.test.js
git commit -m "fix: detect browser language for the primary-language default instead of hardcoding vi"
```

---

### Task 6: Auto-validate on key blur

**Files:**
- Modify: `settings.js` (`setupEventListeners()`)
- Modify: `tests/settings.test.js`

**Interfaces:**
- No new exports — `validateConfiguration` (already module-private) gains a second caller.

- [ ] **Step 1: Export `validateConfiguration` for direct test assertions.**

Change `async function validateConfiguration() {` to `export async function validateConfiguration() {` in `settings.js` (no behavior change).

- [ ] **Step 2: Write the failing test.**

Add to `tests/settings.test.js`:

```js
it("auto-validates when a key input loses focus with a new, non-empty value", async () => {
  jest.useFakeTimers();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.runtime.sendMessage.mockResolvedValue({ success: true });
  await Settings.loadSettings();

  const keyInput = document.getElementById("geminiApiKey");
  keyInput.value = "new-key-value";
  keyInput.dispatchEvent(new Event("blur"));
  jest.advanceTimersByTime(500);
  await Promise.resolve();

  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: "VALIDATE_CONFIG" }),
  );
  jest.useRealTimers();
});

it("does not auto-validate on blur when the key value is unchanged", async () => {
  jest.useFakeTimers();
  chrome.storage.local.get.mockResolvedValue({ geminiApiKey: "same-key" });
  await Settings.loadSettings();
  chrome.runtime.sendMessage.mockClear();

  const keyInput = document.getElementById("geminiApiKey");
  keyInput.dispatchEvent(new Event("blur"));
  jest.advanceTimersByTime(500);
  await Promise.resolve();

  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  jest.useRealTimers();
});
```

- [ ] **Step 3: Run and confirm failure.**

Run: `npx jest tests/settings.test.js -t "auto-validat"`
Expected: FAIL — no blur listener exists yet, `chrome.runtime.sendMessage` never called.

- [ ] **Step 4: Add the debounced blur listener in `setupEventListeners()`.**

```js
const keyInputsForAutoValidate = [
  elements.geminiApiKey,
  elements.groqApiKey,
  elements.openaiApiKey,
  elements.anthropicApiKey,
];

let autoValidateTimer;
let lastValidatedValue = "";

keyInputsForAutoValidate.forEach((input) => {
  if (!input) return;
  input.addEventListener("blur", () => {
    const value = input.value.trim();
    if (!value || value === lastValidatedValue) return;
    clearTimeout(autoValidateTimer);
    autoValidateTimer = setTimeout(() => {
      lastValidatedValue = value;
      validateConfiguration();
    }, 500);
  });
});
```

Place this in `setupEventListeners()`, after the existing `elements.validateBtn` click-listener block. `lastValidatedValue` is intentionally a single shared value, not per-input — this repo has exactly one visible key field at a time (`updateModelVisibility()` hides all others), so tracking "the last value we validated" globally is equivalent to tracking it per-field and is simpler.

- [ ] **Step 5: Run the focused tests, then the full suite.**

Run: `npx jest tests/settings.test.js`
Expected: PASS.

Run: `npm test`
Expected: All suites pass.

- [ ] **Step 6: Commit.**

```bash
git add settings.js tests/settings.test.js
git commit -m "feat: auto-validate API key on blur instead of requiring a manual click"
```

---

### Task 7: Settings restructure — Quick setup / Advanced

**Files:**
- Modify: `settings.html` (move `customModelGroup` + `customGatewayKeyGroup` into a `<details>`)
- Modify: `settings.css` (disclosure styling)
- Modify: `settings.js` (`updateModelVisibility()` auto-expand)
- Modify: `_locales/en/messages.json` + the other 9 locales (`settings_advanced` key)
- Modify: `tests/settings.test.js`

**Interfaces:**
- No new exports — `updateModelVisibility` (already module-private) gains one more responsibility; not exported, since it's only exercised indirectly through `loadSettings()`'s call to it in the tests below.

- [ ] **Step 1: Add the `settings_advanced` message key — English first.**

```json
"settings_advanced": {
  "message": "Advanced",
  "description": "Disclosure label for custom-model / custom-gateway settings, collapsed by default"
}
```

- [ ] **Step 2: Propagate to the other 9 locales.**

| Locale | Value |
|---|---|
| vi | `Nâng cao` |
| es | `Avanzado` |
| fr | `Avancé` |
| de | `Erweitert` |
| it | `Avanzate` |
| pt | `Avançado` |
| ja | `詳細設定` |
| ko | `고급` |
| zh | `高级` |

Add `"settings_advanced": { "message": "<value>" }` to each locale's `messages.json`.

- [ ] **Step 3: Restructure `settings.html`'s 🔑 section.**

Move the existing `<!-- Custom Model Input -->` block (currently at lines 53-66, right after the `apiModel` `<select>`) and the existing `<!-- Custom Gateway -->` block (currently at lines 217-267, right after the OpenAI key group) so both sit together inside one new `<details>`, placed after all provider key groups (google/groq/openai/anthropic) and before the `<!-- Validation -->` block:

```html
<details class="advanced-settings" id="advancedProviderSettings">
  <summary>__MSG_settings_advanced__</summary>

  <!-- Custom Model Input (moved here from right after the model select) -->
  <div class="setting-item hidden" id="customModelGroup">
    <label class="setting-label" for="customModelName">
      <span class="label-text">__MSG_settings_customModel__</span>
      <span class="label-hint">__MSG_settings_customModelHint__</span>
    </label>
    <div class="input-group">
      <input
        type="text"
        id="customModelName"
        class="setting-input"
        placeholder="__MSG_settings_customModelPlaceholder__"
      />
    </div>
  </div>

  <!-- Custom Gateway (moved here, unchanged internals) -->
  <div class="setting-item hidden" id="customGatewayKeyGroup" data-provider="customGateway">
    <!-- ...unchanged contents from the current file... -->
  </div>
</details>
```

Delete the original two locations entirely — this is a move, not a copy. The `<!-- Validation -->` block stays exactly where it is (last child of the outer `.setting-item`, after the `</details>` close tag), so it remains visible regardless of whether Advanced is expanded.

- [ ] **Step 4: Add disclosure styling to `settings.css`.**

```css
.advanced-settings {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.advanced-settings > summary {
  cursor: pointer;
  color: var(--accent-purple);
  font-weight: 600;
  font-size: 13px;
  list-style: none;
}

.advanced-settings > summary::-webkit-details-marker {
  display: none;
}

.advanced-settings > summary::before {
  content: "▸";
  display: inline-block;
  margin-right: 6px;
  transition: transform 0.15s ease;
}

.advanced-settings[open] > summary::before {
  transform: rotate(90deg);
}

.advanced-settings > .setting-item:first-of-type {
  margin-top: 12px;
}
```

- [ ] **Step 5: Auto-expand Advanced when a custom/gateway model is active.**

In `settings.js`, add `advancedDetails: document.getElementById("advancedProviderSettings"),` to the `elements` object. In `updateModelVisibility()`, after the existing custom-model-group show/hide block, add:

```js
const needsAdvanced = modelId.endsWith("-custom") || modelId === "custom-gateway";
if (needsAdvanced && elements.advancedDetails) {
  elements.advancedDetails.open = true;
}
```

This only ever opens it, never closes it — a user who manually expands Advanced and then picks a non-custom model keeps their own choice; the section just doesn't stay closed when the field it's hiding is actually required.

- [ ] **Step 6: Add `advancedProviderSettings` to the test fixture and write the failing test.**

Add `<details id="advancedProviderSettings"><summary></summary></details>` to `buildFixture()` in `tests/settings.test.js` (a real `<details>` element, not the generic `<div>` the helper uses for most ids — `.open` only exists on `<details>`).

```js
it("auto-expands Advanced when a -custom model is selected", async () => {
  await Settings.loadSettings();
  document.getElementById("apiModel").innerHTML = '<option value="google-custom">x</option>';
  document.getElementById("apiModel").value = "google-custom";
  document.getElementById("apiModel").dispatchEvent(new Event("change"));
  expect(document.getElementById("advancedProviderSettings").open).toBe(true);
});
```

- [ ] **Step 7: Run and confirm it fails, then implement (Steps 3-5 above), then confirm it passes.**

Run: `npx jest tests/settings.test.js -t "auto-expands"`
Expected: FAIL, then (after Steps 3-5) PASS.

- [ ] **Step 8: Run the full suite.**

Run: `npm run verify`
Expected: typecheck, lint, and all Jest suites pass.

- [ ] **Step 9: Commit.**

```bash
git add settings.html settings.css settings.js tests/settings.test.js _locales/*/messages.json
git commit -m "feat: collapse custom-model/custom-gateway fields into an Advanced disclosure"
```

---

### Task 8: Docs, changelog, and final verification

**Files:**
- Modify: `AGENTS.md` (Storage Map, "Adding a New AI Provider" steps, Provider System paragraph)
- Modify: `CHANGELOG.md`
- Modify: `docs/CHROME_WEBSTORE_LISTING.txt` (Quick Setup section)

- [ ] **Step 1: Update the AGENTS.md Storage Map table.**

Add `anthropicApiKey` to the `local` row's key list, next to the other per-provider keys.

- [ ] **Step 2: Simplify the "Adding a New AI Provider" steps.**

Replace step 2 ("Register it in `lib/providers/index.js` (import, export, and a `modelName.startsWith("<prefix>-")` branch)") with: "Register it in `lib/providers/index.js` — import the module and add one line to the `MODULES` map (`providerId: Module`)."

- [ ] **Step 3: Correct the Provider System paragraph's routing claim.**

Replace the sentence "Routing: model IDs are provider-prefixed — `google-*`, `openai-*`, `groq-*`, `custom-*` — resolved by `getProvider()` in `lib/providers/index.js`" with: "Routing: `getProvider(modelId)` in `lib/providers/index.js` looks the model up in `AI_PROVIDERS` (via `getProviderByModel()`) and returns that provider's module — model IDs are not required to follow any naming convention."

- [ ] **Step 4: Add a CHANGELOG entry.**

Under `## [Unreleased]` (create the section if the last release already closed it out), add:

```markdown
### Added
- Anthropic Claude as a 5th AI provider (Haiku 4.5, Sonnet 5, Opus 5, plus a custom-model slot).
- Settings now opens automatically on first install, with the browser's UI language detected for the primary-language default and the Gemini key field focused when nothing is configured yet.
- API keys auto-validate on blur instead of requiring a manual "Validate" click.
- Advanced provider settings (custom model name, custom gateway) are now collapsed by default under Settings, expanding automatically when relevant.

### Changed
- Refreshed the default model catalog on Google Gemini, OpenAI, and Groq to each provider's current lineup; a previously-selected model that's no longer offered still appears in Settings, labeled "(Legacy)".

### Fixed
- The primary-language default no longer hardcodes Vietnamese for users who never set a preference — it now falls back to the browser's detected UI language.

### Internal
- Model→provider resolution is now driven entirely by the `AI_PROVIDERS` registry instead of guessing provider prefixes from model-name strings in three different places.
```

- [ ] **Step 5: Add Anthropic to the CWS listing's Quick Setup section, once this ships.**

In `docs/CHROME_WEBSTORE_LISTING.txt`, add an "Anthropic Claude" block to the "QUICK SETUP" section, mirroring the existing Groq block's shape:

```
Anthropic Claude
1. Get a key at console.anthropic.com/settings/keys
2. Select Anthropic Claude in Settings for Haiku 4.5 / Sonnet 5 / Opus 5
```

- [ ] **Step 6: Run full verification.**

Run: `npm run verify`
Expected: typecheck + lint + all Jest suites pass.

Run: `npx playwright test`
Expected: all e2e specs pass (Task 3 updated the two specs that seeded a now-retired `apiModel`; no other e2e spec references model IDs).

Run: `bash scripts/publish.sh`
Expected: `dist/omni-ai-v2.2.0.zip` (or whatever the current `manifest.json` version is) builds cleanly; the dev `manifest.json` (with its pinned `"key"`) is restored afterward.

- [ ] **Step 7: Commit.**

```bash
git add AGENTS.md CHANGELOG.md docs/CHROME_WEBSTORE_LISTING.txt
git commit -m "docs: update provider docs, changelog, and CWS listing for Anthropic + onboarding work"
```

- [ ] **Step 8: Manual smoke check before considering this done (cannot be exercised by `npm test`).**

Load the unpacked extension in real Chrome and confirm: (1) uninstalling and reinstalling opens a Settings tab automatically; (2) with Chrome's language set to something other than Vietnamese, a fresh Settings load preselects that language, not Vietnamese; (3) pasting a real Gemini key and clicking away from the field triggers validation without pressing the Validate button; (4) selecting "Google Custom Model..." auto-expands the Advanced section; (5) Anthropic's key field, tooltip, and Validate flow work end-to-end with a real Claude API key. Record the outcome (and any deviation) before treating this plan as shipped.
