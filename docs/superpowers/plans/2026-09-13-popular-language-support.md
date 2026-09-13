# Popular Language Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three hand-maintained 13-entry language maps and the two hardcoded 10-option language `<select>`s with one 43-language registry that every surface reads, so Omni AI can translate to any of 43 popular languages.

**Architecture:** A new pure data module `lib/languages.js` becomes the single source of truth: the curated list, the lookup helpers, and the option-group builder. `lib/ai-service.js` (prompt names), `settings.js`/`settings.html` (pickers) and `content/content.js` (overlay labels) all read from it. No storage change: preferences stay plain language-code strings in `chrome.storage.sync`, and unknown saved codes stay selectable instead of blanking the picker.

**Tech Stack:** Zero-build vanilla ES modules, Manifest V3, Jest 30 + jsdom with `tests/helpers/chrome-mock.js`, Playwright E2E.

**Spec:** This plan carries its own design record. The companion plan for UI locales is `docs/superpowers/plans/2026-09-13-ios-locale-localization.md`.

## Global Constraints

- **No frameworks, no bundler.** Plain ES modules loaded raw by the browser. `lib/languages.js` must be importable both as a module (`settings.js`, service worker) and through `chrome.runtime.getURL` (content script).
- **Manifest V3.** Adding a module the content script imports requires a matching `web_accessible_resources` entry.
- **Selection rule for the 43 codes** (decided with the maintainer, do not re-derive): the 10 codes already shipped (`en vi es fr de it pt ja ko zh`), plus every language with 50 million or more total speakers in Ethnologue 2026 read through `https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers` (`hi ar bn id ur ru mr te sw ha tr pa tl ta fa am th jv gu`), plus major markets not yet covered (`nl pl uk sv da no fi cs ro hu el he ms`), plus `zh-TW`.
- **Language names are reference data, not UI copy.** They come from the registry as English + native names and are deliberately NOT part of the `_locales` i18n surface. Core directive 7 in `AGENTS.md` is amended in Task 5 to say so. Every *other* user-visible string added by this plan (search placeholder, group labels) IS UI copy and must go through `_locales`.
- **Backward compatibility:** 12 of the 13 codes in the current maps are unchanged; only `zh` is special (`Chinese (Simplified)`, kept as-is). No storage migration. A saved code that is unknown to the registry must remain selectable.
- **Local gate is mandatory before any push:** `env -u NODE_ENV npm run verify` and `env -u NODE_ENV npx playwright test`. The agent shell exports `NODE_ENV=production`, which makes npm omit all devDependencies; always prefix with `env -u NODE_ENV`.
- **Prettier:** `printWidth: 100`, LF. Run `npx prettier --write <files>` on every file touched before committing.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/languages.js` (new) | Registry data + pure lookup/filter/option-group helpers. No DOM, no `chrome.*`, no i18n calls (a `getMessage` callback is injected). |
| `lib/ai-service.js` | Prompt construction. Loses both duplicated `languageNames` maps; resolves names from the registry. |
| `settings.html` / `settings.js` / `settings.css` | The two language pickers: options rendered from the registry, `<optgroup>` grouping, a search box per picker. |
| `content/content.js` / `lib/i18n.js` | Overlay language label from the registry; locale-file fetch gated on the locale actually shipping. |
| `manifest.json` | Exposes `lib/languages.js` to the content script. |
| `tests/lib/languages.test.js` (new) | Registry contract: 43 unique codes, name/native, alias-free lookup, filter, option groups, on-disk locale parity. |
| `tests/lib/ai-service.test.js` | Prompt assertions for a language that only the registry knows. |
| `tests/settings.test.js` | Picker population, grouping, search filtering, unknown saved code keeps its slot. |
| `tests/manifest.test.js` | Every content-script module import is web-accessible. |
| `tests/lib/i18n.test.js` (new) | The locale JSON fetch is skipped for a language with no locale directory. |

---

### Task 1: The language registry

**Files:**
- Create: `lib/languages.js`
- Test: `tests/lib/languages.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LANGUAGES: { code: string, name: string, native: string }[]` (43 entries, sorted by `name`)
  - `COMMON_LANGUAGE_CODES: string[]`
  - `UI_LOCALE_CODES: string[]` (the `_locales/` directories that actually ship)
  - `getLanguage(code: string): { code, name, native } | undefined`
  - `resolveLanguageName(code: string): string`
  - `resolveLanguageLabel(code: string, getMessage?: (key: string) => string): string`
  - `filterLanguages(query?: string): { code, name, native }[]`
  - `buildLanguageOptionGroups(query?: string, options?: { commonCodes?: string[], pinnedCode?: string, getMessage?: (key: string) => string }): { label: string | null, options: { code: string, label: string }[] }[]`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/languages.test.js`:

```js
const fs = require("fs");
const path = require("path");

const {
  LANGUAGES,
  COMMON_LANGUAGE_CODES,
  UI_LOCALE_CODES,
  getLanguage,
  resolveLanguageName,
  resolveLanguageLabel,
  filterLanguages,
  buildLanguageOptionGroups,
} = require("../../lib/languages.js");

describe("language registry", () => {
  test("ships the 43 agreed languages", () => {
    expect(LANGUAGES).toHaveLength(43);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(43);
  });

  test("every entry carries a code, an English name and a native name", () => {
    LANGUAGES.forEach((language) => {
      expect(language.code).toEqual(expect.any(String));
      expect(language.name).toEqual(expect.any(String));
      expect(language.native).toEqual(expect.any(String));
      expect(language.name.length).toBeGreaterThan(0);
      expect(language.native.length).toBeGreaterThan(0);
    });
  });

  test("keeps every code the extension already shipped", () => {
    ["en", "vi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"].forEach((code) => {
      expect(getLanguage(code)).toBeDefined();
    });
  });

  test("is sorted by English name so regenerating it produces a reviewable diff", () => {
    const names = LANGUAGES.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("every common code is a real registry entry", () => {
    COMMON_LANGUAGE_CODES.forEach((code) => {
      expect(getLanguage(code)).toBeDefined();
    });
    expect(new Set(COMMON_LANGUAGE_CODES).size).toBe(COMMON_LANGUAGE_CODES.length);
  });

  test("UI_LOCALE_CODES matches the locale directories that actually ship", () => {
    const onDisk = fs
      .readdirSync(path.join(__dirname, "../../_locales"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect([...UI_LOCALE_CODES].sort()).toEqual(onDisk);
  });
});

describe("resolveLanguageName", () => {
  test("returns the English name for a known code", () => {
    expect(resolveLanguageName("vi")).toBe("Vietnamese");
    expect(resolveLanguageName("zh")).toBe("Chinese (Simplified)");
    expect(resolveLanguageName("zh-TW")).toBe("Chinese (Traditional)");
  });

  test("falls back to the raw code so a custom value never disappears from a prompt", () => {
    expect(resolveLanguageName("xx-mystery")).toBe("xx-mystery");
  });
});

describe("resolveLanguageLabel", () => {
  test("prefers a translated name when the active locale defines one", () => {
    const getMessage = (key) => (key === "lang_vi" ? "Vietnamien" : "");
    expect(resolveLanguageLabel("vi", getMessage)).toBe("Vietnamien");
  });

  test("falls back to the native name when the locale has no such key", () => {
    expect(resolveLanguageLabel("vi", () => "")).toBe("Tiếng Việt");
    expect(resolveLanguageLabel("vi")).toBe("Tiếng Việt");
  });

  test("treats an echoed-back key as a missing translation", () => {
    // content.js's own getMessage() returns the key when nothing matches.
    expect(resolveLanguageLabel("kn", (key) => key)).toBe("ಕನ್ನಡ");
  });

  test("falls back to the raw code for an unknown language", () => {
    expect(resolveLanguageLabel("xx", () => "")).toBe("xx");
  });

  test("builds a valid i18n key for a regional code", () => {
    const seen = [];
    resolveLanguageLabel("zh-TW", (key) => {
      seen.push(key);
      return "";
    });
    expect(seen).toEqual(["lang_zh_TW"]);
  });
});

describe("filterLanguages", () => {
  test("returns everything for an empty query", () => {
    expect(filterLanguages("")).toHaveLength(43);
    expect(filterLanguages()).toHaveLength(43);
  });

  test("matches the English name, case-insensitively", () => {
    expect(filterLanguages("viet").map((l) => l.code)).toEqual(["vi"]);
  });

  test("matches the native name with the accents folded away", () => {
    expect(filterLanguages("tieng").map((l) => l.code)).toEqual(["vi"]);
  });

  test("matches the code itself", () => {
    expect(filterLanguages("zh-tw").map((l) => l.code)).toEqual(["zh-TW"]);
  });

  test("returns nothing when nothing matches", () => {
    expect(filterLanguages("zzzz")).toEqual([]);
  });
});

describe("buildLanguageOptionGroups", () => {
  const getMessage = (key) =>
    ({ settings_languagesCommon: "Common", settings_languagesAll: "All languages" })[key] || "";

  test("splits into a common group and an all-languages group", () => {
    const groups = buildLanguageOptionGroups("", { getMessage });
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Common");
    expect(groups[0].options.map((o) => o.code)).toEqual(COMMON_LANGUAGE_CODES);
    expect(groups[1].label).toBe("All languages");
    expect(groups[1].options).toHaveLength(43 - COMMON_LANGUAGE_CODES.length);
  });

  test("collapses to one unlabelled group while searching", () => {
    const groups = buildLanguageOptionGroups("viet", { getMessage });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].options.map((o) => o.code)).toEqual(["vi"]);
  });

  test("never drops the current value, even when the filter excludes it", () => {
    const groups = buildLanguageOptionGroups("viet", { pinnedCode: "ja", getMessage });
    expect(groups[0].options.map((o) => o.code)).toContain("ja");
  });

  test("keeps an unknown saved code selectable with the code as its label", () => {
    const groups = buildLanguageOptionGroups("", { pinnedCode: "xx-legacy", getMessage });
    const all = groups.flatMap((group) => group.options);
    expect(all.map((o) => o.code)).toContain("xx-legacy");
    expect(all.find((o) => o.code === "xx-legacy").label).toBe("xx-legacy");
  });

  test("does not duplicate a pinned code that is already listed", () => {
    const all = buildLanguageOptionGroups("", { pinnedCode: "vi", getMessage }).flatMap(
      (group) => group.options,
    );
    expect(all.filter((o) => o.code === "vi")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx jest tests/lib/languages.test.js`
Expected: FAIL, `Cannot find module '../../lib/languages.js'`.

- [ ] **Step 3: Write `lib/languages.js`**

```js
/**
 * Translation target languages.
 *
 * Selection rule (agreed with the maintainer): the codes Omni AI already
 * shipped, plus every language with 50 million or more total speakers in
 * Ethnologue 2026 (read through
 * https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers),
 * plus major markets that rule misses, plus Traditional Chinese.
 *
 * The names here are reference data, not UI copy: they are shown as
 * English + native name from this one list instead of being duplicated into
 * every _locales file. See AGENTS.md core directive 7.
 *
 * Keep LANGUAGES sorted by `name`: a stable order keeps the diff reviewable
 * when the list is extended.
 */

/** @typedef {{ code: string, name: string, native: string }} Language */

/** @type {Language[]} */
export const LANGUAGES = [
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "en", name: "English", native: "English" },
  { code: "tl", name: "Filipino", native: "Filipino" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "jv", name: "Javanese", native: "Basa Jawa" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
];

/** Codes worth putting above the fold in a language picker. */
export const COMMON_LANGUAGE_CODES = [
  "en",
  "vi",
  "zh",
  "es",
  "fr",
  "de",
  "ja",
  "ko",
  "pt",
  "it",
  "ru",
  "ar",
  "hi",
  "th",
  "id",
];

/**
 * The _locales/ directories that actually ship. Growing this list is how a new
 * UI locale becomes visible to the extension; tests assert it matches disk.
 */
export const UI_LOCALE_CODES = ["de", "en", "es", "fr", "it", "ja", "ko", "pt", "vi", "zh"];

/** @type {Map<string, Language>} */
const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

/**
 * Look a language up by its exact code.
 * @param {string} code
 * @returns {Language|undefined}
 */
export function getLanguage(code) {
  if (typeof code !== "string") return undefined;
  return BY_CODE.get(code);
}

/**
 * The English name of a language, for building an LLM prompt. Unknown codes
 * pass through unchanged so a hand-typed or future code still reaches the model.
 * @param {string} code
 * @returns {string}
 */
export function resolveLanguageName(code) {
  const language = getLanguage(code);
  return language ? language.name : String(code);
}

/**
 * Read an i18n message through an injected callback, treating both a falsy
 * result and an echoed-back key as "not translated" (content.js's own
 * getMessage() returns the key when nothing matches).
 * @param {string} key
 * @param {(key: string) => string} [getMessage]
 * @param {string} fallback
 * @returns {string}
 */
function translate(key, getMessage, fallback) {
  if (typeof getMessage !== "function") return fallback;
  const value = getMessage(key);
  if (!value || value === key) return fallback;
  return value;
}

/**
 * The name to show a user: the active locale's translation when it has one,
 * otherwise the language's own name, otherwise the raw code.
 * @param {string} code
 * @param {(key: string) => string} [getMessage]
 * @returns {string}
 */
export function resolveLanguageLabel(code, getMessage) {
  const key = `lang_${String(code).toLowerCase().replace(/-/g, "_")}`;
  const language = getLanguage(code);
  const fallback = language ? language.native || language.name : String(code);
  return translate(key, getMessage, fallback);
}

/** Fold accents so "tieng" finds "Tiếng Việt". */
function fold(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Every language whose code, English name or native name matches the query.
 * An empty query returns the whole list.
 * @param {string} [query]
 * @returns {Language[]}
 */
export function filterLanguages(query) {
  const needle = fold(query || "").trim();
  if (!needle) return [...LANGUAGES];
  return LANGUAGES.filter(
    (language) =>
      fold(language.name).includes(needle) ||
      fold(language.native).includes(needle) ||
      fold(language.code).includes(needle),
  );
}

/**
 * Build the option groups for a language <select>.
 *
 * `pinnedCode` is the value currently selected: it is appended whenever the
 * registry does not know it or the query filtered it out, so re-rendering the
 * options never blanks a saved preference.
 *
 * @param {string} [query]
 * @param {{ commonCodes?: string[], pinnedCode?: string, getMessage?: (key: string) => string }} [options]
 * @returns {{ label: string|null, options: { code: string, label: string }[] }[]}
 */
export function buildLanguageOptionGroups(query = "", options = {}) {
  const { commonCodes = COMMON_LANGUAGE_CODES, pinnedCode = "", getMessage } = options;
  const toOption = (language) => ({
    code: language.code,
    label: resolveLanguageLabel(language.code, getMessage),
  });

  const matches = filterLanguages(query);
  const pool =
    pinnedCode && !matches.some((language) => language.code === pinnedCode)
      ? [...matches, { code: pinnedCode, name: pinnedCode, native: pinnedCode }]
      : matches;

  if (query) {
    return [{ label: null, options: pool.map(toOption) }];
  }

  const commonSet = new Set(commonCodes);
  const common = commonCodes
    .map((code) => pool.find((language) => language.code === code))
    .filter(Boolean);
  const rest = pool.filter((language) => !commonSet.has(language.code));

  return [
    {
      label: translate("settings_languagesCommon", getMessage, "Common"),
      options: common.map(toOption),
    },
    {
      label: translate("settings_languagesAll", getMessage, "All languages"),
      options: rest.map(toOption),
    },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u NODE_ENV npx jest tests/lib/languages.test.js`
Expected: PASS, 20 tests.

- [ ] **Step 5: Format and commit**

```bash
cd /home/kai/Work/htdocs/omni-ai
npx prettier --write lib/languages.js tests/lib/languages.test.js
git add lib/languages.js tests/lib/languages.test.js
git commit -m "feat(languages): add the 43-language registry"
```

---

### Task 2: One name resolver for prompt building

**Files:**
- Modify: `lib/ai-service.js` (delete the map at lines ~142-156 and the duplicate inside `explainText` at ~223-237)
- Test: `tests/lib/ai-service.test.js`

**Interfaces:**
- Consumes: `resolveLanguageName(code)` from Task 1.
- Produces: no new exports; `translateText`, `smartTranslate` and `explainText` keep their current signatures.

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/ai-service.test.js` inside the existing top-level `describe`. Import `translateText` and `explainText` alongside the current imports:

```js
import {
  generateContent,
  improveText,
  smartTranslate,
  translateText,
  explainText,
} from "../../lib/ai-service";
```

```js
  it("translateText names a language that only the shared registry knows", async () => {
    mockProvider.generateContent.mockResolvedValue("Translated Text");

    await translateText("Hello", "jv");

    const callArgs = mockProvider.generateContent.mock.calls[0];
    expect(callArgs[0]).toContain("Translate the following text to Javanese.");
  });

  it("explainText names a language that only the shared registry knows", async () => {
    mockProvider.generateContent.mockResolvedValue("Explanation");

    await explainText("Hello", "am");

    const callArgs = mockProvider.generateContent.mock.calls[0];
    expect(callArgs[0]).toContain("in Amharic");
  });

  it("keeps resolving the languages the old inline maps carried", async () => {
    mockProvider.generateContent.mockResolvedValue("Translated Text");

    await translateText("Hello", "zh");

    expect(mockProvider.generateContent.mock.calls[0][0]).toContain("Chinese (Simplified)");
  });
```

Create `tests/lib/language-map-guard.test.js` so the duplicated maps cannot come back:

```js
const fs = require("fs");
const path = require("path");

describe("language name maps stay consolidated", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../lib/ai-service.js"), "utf8");

  test("ai-service.js no longer declares a local languageNames map", () => {
    expect(source).not.toMatch(/languageNames\s*=/);
  });

  test("ai-service.js resolves names through the shared registry", () => {
    expect(source).toMatch(/resolveLanguageName/);
  });

  test("no hardcoded language name table survives in ai-service.js", () => {
    // "Chinese (Simplified)" used to be copied into two separate maps here.
    expect(source).not.toContain('"Chinese (Simplified)"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -u NODE_ENV npx jest tests/lib/ai-service.test.js tests/lib/language-map-guard.test.js`
Expected: FAIL. `translateText` still resolves `jv` through its old 13-entry map and emits `to jv.`; the guard's first and third tests fail on the two surviving `languageNames` maps.

- [ ] **Step 3: Replace both maps with the registry**

In `lib/ai-service.js`, add the import next to the existing imports:

```js
import { resolveLanguageName } from "./languages.js";
```

Delete the module-level `const languageNames = { ... };` block (the one between the two doc comments), and inside `explainText` delete its own local `const languageNames = { ... };` block. Both call sites become:

```js
export async function translateText(text, targetLanguage = "en") {
  const targetName = resolveLanguageName(targetLanguage);
```

```js
export async function explainText(text, targetLanguage = "en") {
  const targetName = resolveLanguageName(targetLanguage);
```

In `smartTranslate`, replace its two lookups:

```js
  const primaryName = resolveLanguageName(primaryLanguage);
  const defaultName = resolveLanguageName(defaultLanguage);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `env -u NODE_ENV npx jest tests/lib/ai-service.test.js tests/lib/language-map-guard.test.js`
Expected: PASS, including the pre-existing `smartTranslate generates correct prompt` test which asserts the exact substring `If the text is in English, translate it to Vietnamese`.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write lib/ai-service.js tests/lib/ai-service.test.js tests/lib/language-map-guard.test.js
git add lib/ai-service.js tests/lib/ai-service.test.js tests/lib/language-map-guard.test.js
git commit -m "refactor(ai-service): resolve language names from the shared registry"
```

---

### Task 3: Language pickers with search

**Files:**
- Modify: `settings.html` (the two `<select>` blocks at lines ~437-473), `settings.js`, `settings.css`, `_locales/*/messages.json`
- Test: `tests/settings.test.js`

**Interfaces:**
- Consumes: `buildLanguageOptionGroups`, `UI_LOCALE_CODES` from Task 1.
- Produces:
  - `populateLanguageSelect(select: HTMLSelectElement, query?: string): void`
  - `wireLanguagePicker(input: HTMLInputElement|null, select: HTMLSelectElement|null): (() => void)|undefined` (the returned function re-renders with the input's current value)

- [ ] **Step 1: Write the failing test**

In `tests/settings.test.js`, extend the fixture so the two language selects start empty and gain their search boxes. Replace the `if (["primaryLanguage", "defaultLanguage"].includes(id))` branch with:

```js
    if (["primaryLanguage", "defaultLanguage"].includes(id)) {
      return `<div><input id="${id}Search" type="search" /><select id="${id}"></select></div>`;
    }
```

Add the two search ids to `FIXTURE_IDS` (anywhere in the list):

```js
  "primaryLanguageSearch",
  "defaultLanguageSearch",
```

Then add a new describe block:

```js
describe("language pickers", () => {
  it("renders every registry language, grouped into common and all", () => {
    Settings.populateLanguageSelect(document.getElementById("primaryLanguage"));
    const select = document.getElementById("primaryLanguage");
    const groups = Array.from(select.querySelectorAll("optgroup"));
    expect(groups).toHaveLength(2);
    expect(Array.from(select.options)).toHaveLength(43);
  });

  it("keeps a saved code that the registry does not know", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "xx-legacy" });
    await Settings.loadSettings();
    expect(document.getElementById("primaryLanguage").value).toBe("xx-legacy");
  });

  it("narrows the options as the search box is typed into", () => {
    Settings.wireLanguagePicker(
      document.getElementById("primaryLanguageSearch"),
      document.getElementById("primaryLanguage"),
    );
    const input = document.getElementById("primaryLanguageSearch");
    input.value = "viet";
    input.dispatchEvent(new Event("input"));

    const select = document.getElementById("primaryLanguage");
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["vi"]);
  });

  it("does not lose the current selection while the search box is filtering", () => {
    const select = document.getElementById("primaryLanguage");
    Settings.wireLanguagePicker(document.getElementById("primaryLanguageSearch"), select);
    select.value = "ja";

    const input = document.getElementById("primaryLanguageSearch");
    input.value = "viet";
    input.dispatchEvent(new Event("input"));

    expect(select.value).toBe("ja");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx jest tests/settings.test.js`
Expected: FAIL, `Settings.populateLanguageSelect is not a function`.

- [ ] **Step 3: Render the pickers from the registry**

In `settings.html`, replace the `<select id="primaryLanguage" ...>` block (options only, keep the surrounding `setting-item`) with:

```html
              <input
                type="search"
                id="primaryLanguageSearch"
                class="setting-input language-search"
                placeholder="__MSG_settings_languageSearchPlaceholder__"
                aria-label="__MSG_settings_languageSearchPlaceholder__"
                autocomplete="off"
              />
              <select id="primaryLanguage" class="setting-select"></select>
```

and the `defaultLanguage` one with:

```html
              <input
                type="search"
                id="defaultLanguageSearch"
                class="setting-input language-search"
                placeholder="__MSG_settings_languageSearchPlaceholder__"
                aria-label="__MSG_settings_languageSearchPlaceholder__"
                autocomplete="off"
              />
              <select id="defaultLanguage" class="setting-select"></select>
```

In `settings.js`, import from the registry and from `UI_LOCALE_CODES`:

```js
import { buildLanguageOptionGroups, UI_LOCALE_CODES } from "./lib/languages.js";
```

Replace the local `const SUPPORTED_LOCALES = [...]` line with:

```js
// The UI locales that ship under _locales/; kept in lib/languages.js so this
// list and the language registry cannot drift apart.
const SUPPORTED_LOCALES = UI_LOCALE_CODES;
```

Add the two search inputs to the `elements` map, next to `primaryLanguage`:

```js
  primaryLanguageSearch: /** @type {HTMLInputElement} */ (
    document.getElementById("primaryLanguageSearch")
  ),
  defaultLanguageSearch: /** @type {HTMLInputElement} */ (
    document.getElementById("defaultLanguageSearch")
  ),
```

Add the two exported functions next to `populateModelSelect`:

```js
/**
 * Render a language <select> from the shared registry.
 * @param {HTMLSelectElement} select
 * @param {string} [query]
 * @param {string} [pinnedCode]
 */
export function populateLanguageSelect(select, query = "", pinnedCode = select?.value || "") {
  if (!select) return;

  select.textContent = "";
  const groups = buildLanguageOptionGroups(query, {
    pinnedCode,
    getMessage: (key) => i18n.getMessage(key),
  });

  groups.forEach((group) => {
    const container = group.label ? document.createElement("optgroup") : select;
    if (group.label) container.label = group.label;
    group.options.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.code;
      el.textContent = option.label;
      container.appendChild(el);
    });
  });

  if (pinnedCode) select.value = pinnedCode;
}

/**
 * Keep a language <select> in sync with its search box, preserving whatever is
 * currently selected even while the query filters that option out.
 * @param {HTMLInputElement|null} input
 * @param {HTMLSelectElement|null} select
 * @returns {(() => void)|undefined}
 */
export function wireLanguagePicker(input, select) {
  if (!select) return undefined;

  const render = () => {
    populateLanguageSelect(select, input ? input.value : "", select.value);
  };

  if (input) input.addEventListener("input", render);
  render();

  return render;
}
```

In `init()`, render the pickers before `loadSettings()` runs, so the options exist when the saved value is applied:

```js
  await i18n.init();
  await initTheme(); // Initialize theme
  localizeDOM();
  wireLanguagePicker(elements.primaryLanguageSearch, elements.primaryLanguage);
  wireLanguagePicker(elements.defaultLanguageSearch, elements.defaultLanguage);
  await loadSettings();
```

In `settings.css`, add the search-box spacing next to the existing `.setting-select` rules:

```css
/* Language pickers pair a search box with the select it filters. */
.language-search {
  margin-bottom: 8px;
}
```

- [ ] **Step 4: Add the three new UI strings to every locale**

Add to each `_locales/<locale>/messages.json`, keeping the file's existing key order conventions:

| Key | en | vi | de | es | fr | it | ja | ko | pt | zh |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `settings_languageSearchPlaceholder` | Search languages | Tìm ngôn ngữ | Sprachen suchen | Buscar idiomas | Rechercher une langue | Cerca lingue | 言語を検索 | 언어 검색 | Pesquisar idiomas | 搜索语言 |
| `settings_languagesCommon` | Common | Phổ biến | Häufig | Comunes | Courantes | Comuni | よく使う | 자주 사용 | Comuns | 常用 |
| `settings_languagesAll` | All languages | Tất cả ngôn ngữ | Alle Sprachen | Todos los idiomas | Toutes les langues | Tutte le lingue | すべての言語 | 모든 언어 | Todos os idiomas | 所有语言 |

Each entry uses the file's existing shape:

```json
  "settings_languagesCommon": {
    "message": "Common",
    "description": "First optgroup label in the language pickers"
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -u NODE_ENV npx jest tests/settings.test.js`
Expected: PASS, including the pre-existing `loadSettings uses the detected browser language when no primaryLanguage is saved` and `loadSettings respects an already-saved primaryLanguage over detection` tests.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write settings.html settings.js settings.css _locales/*/messages.json tests/settings.test.js
git add settings.html settings.js settings.css _locales tests/settings.test.js
git commit -m "feat(settings): render the language pickers from the registry with search"
```

---

### Task 4: Overlay labels and the content-script module exposure

**Files:**
- Modify: `content/content.js` (lines ~1087-1105), `lib/i18n.js` (the `if (userLang !== "en")` fetch), `manifest.json`
- Test: `tests/manifest.test.js`, `tests/lib/i18n.test.js` (new)

**Interfaces:**
- Consumes: `resolveLanguageLabel`, `UI_LOCALE_CODES` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/i18n.test.js`:

```js
import { i18n } from "../../lib/i18n";

describe("i18n locale loading", () => {
  beforeEach(() => {
    i18n.data = {};
  });

  it("does not fetch a locale directory that does not ship", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "jv" });
    const fetchSpy = jest.spyOn(global, "fetch");

    await i18n.init();

    const requested = fetchSpy.mock.calls.map((call) => call[0]);
    expect(requested).toEqual(["chrome-extension://test/_locales/en/messages.json"]);
    fetchSpy.mockRestore();
  });

  it("still fetches the locale when it ships", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "vi" });
    const fetchSpy = jest.spyOn(global, "fetch");

    await i18n.init();

    const requested = fetchSpy.mock.calls.map((call) => call[0]);
    expect(requested).toContain("chrome-extension://test/_locales/vi/messages.json");
    fetchSpy.mockRestore();
  });
});
```

Adjust the two expected URLs to whatever `tests/helpers/chrome-mock.js` returns from `chrome.runtime.getURL` at the time you run the test; the point of the assertion is which paths are requested, not the prefix.

Append to `tests/manifest.test.js`:

```js
describe("content script module exposure", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
  const contentSource = fs.readFileSync(path.join(__dirname, "../content/content.js"), "utf8");

  test("every lib module the content script imports is web-accessible", () => {
    const exposed = new Set(manifest.web_accessible_resources[0].resources);
    const imported = new Set(
      [...contentSource.matchAll(/getURL\(\s*["'`](lib\/[\w-]+\.js)["'`]/g)].map(
        (match) => match[1],
      ),
    );
    expect(imported.size).toBeGreaterThan(0);
    imported.forEach((modulePath) => {
      expect(exposed).toContain(modulePath);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -u NODE_ENV npx jest tests/manifest.test.js tests/lib/i18n.test.js`
Expected: FAIL. The manifest test fails on `lib/languages.js` (not yet exposed, and Task 4 Step 3 adds the import). The i18n test fails because both fetches still happen.

- [ ] **Step 3: Implement**

In `manifest.json`, add `"lib/languages.js",` to the `web_accessible_resources[0].resources` array, next to the other `lib/*.js` entries.

In `lib/i18n.js`, gate the second fetch on the locale shipping:

```js
import { getPrimaryLanguage } from "./storage.js";
import { UI_LOCALE_CODES } from "./languages.js";
```

```js
      let targetData = {};
      if (userLang !== "en" && UI_LOCALE_CODES.includes(userLang)) {
```

In `content/content.js`, import the registry lazily next to the other content-script module imports inside the overlay builder, and use it for the labels. Replace lines ~1103-1105:

```js
  // Language names come from the shared registry (English + native name), not
  // from _locales: 43 translation languages would otherwise need 43 x locale
  // name strings. See AGENTS.md core directive 7.
  const { resolveLanguageLabel } = await import(chrome.runtime.getURL("lib/languages.js"));
  const getMessage = (key) => i18n.getMessage(key);
  const pCode = resolveLanguageLabel(primaryLanguage, getMessage);
  const dCode = resolveLanguageLabel(defaultLanguage, getMessage);
```

Also gate the content script's own locale fetch in `initializeI18n()` (lines ~64-74) the same way, so a translation language with no locale directory does not trigger a failing request on every page:

```js
    let targetData = {};
    const { UI_LOCALE_CODES } = await import(chrome.runtime.getURL("lib/languages.js"));
    if (userLang !== "en" && UI_LOCALE_CODES.includes(userLang)) {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `env -u NODE_ENV npx jest tests/manifest.test.js tests/lib/i18n.test.js tests/content`
Expected: PASS. Then run the whole unit suite: `env -u NODE_ENV npx jest` — expected PASS.

- [ ] **Step 5: Verify the extension still loads with the browser**

Run: `env -u NODE_ENV npx playwright test`
Expected: PASS, 44 tests. This is the check that the new `web_accessible_resources` entry and the dynamic import actually resolve inside a loaded MV3 extension; a wrong path fails here, not in Jest.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write content/content.js lib/i18n.js manifest.json tests/manifest.test.js tests/lib/i18n.test.js
git add content/content.js lib/i18n.js manifest.json tests/manifest.test.js tests/lib/i18n.test.js
git commit -m "feat(content): resolve overlay language labels from the registry"
```

---

### Task 5: Record the decisions

**Files:**
- Modify: `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/FOLLOWUPS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [ ] **Step 1: Amend core directive 7 in `AGENTS.md`**

Append this paragraph to the end of core directive 7 (the i18n directive), so the next agent does not flag the registry as a violation:

```markdown
    Exception, reference data: `lib/languages.js` holds the language registry
    (code, English name, native name) and is deliberately NOT duplicated into
    `_locales`. A language's own name is data, and 43 languages x 10 locales of
    translated names would be machine-translated noise. Every other string this
    extension shows a user, including the language picker's search placeholder
    and its optgroup labels, still goes through `_locales`. The human approved
    this carve-out on 2026-09-13.
```

- [ ] **Step 2: Update the file map and testing notes in `AGENTS.md`**

Add to the `lib/` block of the file map, keeping the existing alignment style:

```
|   |-- languages.js       # Translation language registry (43 codes): the single
|   |                        #   source of truth for prompt names + the settings
|   |                        #   pickers; UI_LOCALE_CODES lists the _locales/ dirs
|   |                        #   that ship
```

Add to the "Adding a Writing Action" style of Common Operations a short subsection:

```markdown
### Adding a Translation Language

1. Add one `{ code, name, native }` entry to `lib/languages.js`, keeping the
   array sorted by `name`.
2. Run `env -u NODE_ENV npx jest tests/lib/languages.test.js`; the count
   assertion and the sort assertion both fail until the entry is right.
3. Nothing else needs touching: the settings pickers, the prompt names and the
   overlay labels all read that one list.
```

- [ ] **Step 3: Note the registry in `CONTRIBUTING.md`**

Next to the existing testing/i18n guidance, add:

```markdown
Language names live in `lib/languages.js`, not in `_locales`: the registry is
reference data (43 codes with English and native names) and the settings pickers,
LLM prompts and overlay labels all read it. UI copy added around the pickers
still needs `_locales` keys.
```

- [ ] **Step 4: Add a `CHANGELOG.md` entry**

Add under the newest released version heading, matching the file's existing style:

```markdown
### Added
- 43 translation languages, up from 10, with a searchable picker in Settings.
```

- [ ] **Step 5: Record the follow-up in `docs/FOLLOWUPS.md`**

Add a row to the table (match the existing column count):

```markdown
| 10  | UI locale coverage: the extension's own UI ships 10 locales while the iOS System Language list has 55 entries. Waves 1..8 (37 new locales) are planned in `docs/superpowers/plans/2026-09-13-ios-locale-localization.md`; none are started. | `_locales/`, `lib/languages.js` (`UI_LOCALE_CODES`) | After this plan merges |
```

Use the next free row number in the file rather than the literal `10`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write AGENTS.md CONTRIBUTING.md CHANGELOG.md docs/FOLLOWUPS.md
git add AGENTS.md CONTRIBUTING.md CHANGELOG.md docs/FOLLOWUPS.md
git commit -m "docs: record the language registry and its i18n carve-out"
```

---

### Task 6: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Run the local equivalent of the CI pipeline**

```bash
cd /home/kai/Work/htdocs/omni-ai
env -u NODE_ENV npm run verify
env -u NODE_ENV npx playwright test
```

Expected: `verify` exit 0 (typecheck, ESLint `--max-warnings 0`, Prettier `--check`, Jest coverage) and Playwright exit 0 with 44 tests. If `npx playwright test` fails instantly with `Executable doesn't exist`, run `npx playwright install chromium` first.

- [ ] **Step 2: Confirm no surface still carries a short list**

```bash
grep -rn "languageNames" lib/ background/ content/ settings.js
grep -c "option value=" settings.html
node -e 'import("./lib/languages.js").then(m => console.log(m.LANGUAGES.length, m.UI_LOCALE_CODES.length))'
```

Expected: the first grep prints nothing; the second prints a number with no `lang_` option lines left in the language blocks; the third prints `43 10`.

- [ ] **Step 3: Push and open the PR**

```bash
git -C /home/kai/Work/htdocs/omni-ai push -u origin feature/language-support
gh pr create --title "feat: 43 translation languages with a searchable picker" --body-file /tmp/language-support-pr.md
```

## Self-Review

**Spec coverage**

| Requirement | Task |
| --- | --- |
| 43-language list, exactly the agreed codes | Task 1 |
| Single source of truth, no duplicated maps | Tasks 1, 2, guard test |
| Settings can pick any of the 43 | Task 3 |
| Search instead of scrolling 43 options | Task 3 |
| Language names are data, not i18n | Tasks 1, 3, 5 |
| New UI copy still goes through `_locales` | Task 3 Step 4 |
| Saved values keep working, unknown codes stay selectable | Tasks 1, 3 |
| Overlay shows the right name for any of the 43 | Task 4 |
| Content script can import the new module | Task 4 |
| No wasted failing locale fetch | Task 4 |
| Decisions recorded for the next agent | Task 5 |

**Deliberate non-goals:** manual source-language selection (the model detects it), adding UI locales (separate plan), and translation quality for low-resource languages (a model limitation, not code).

**Known interaction with the companion plan:** `lib/languages.js` `UI_LOCALE_CODES` is the one place a new UI locale becomes visible. The iOS locale plan grows that array; the on-disk parity test in Task 1 is what forces the two to stay in step.

## Execution Record

Executed 2026-09-13 on `feature/language-support`. Deviations from the plan as written, all deliberate:

1. **i18n key for a regional code is lowercased.** The plan's test expected `lang_zh_TW`; the repo's keys are all lowercase (`lang_zh`), and `resolveLanguageLabel` lowercases the whole code before replacing `-` with `_`, so the key is `lang_zh_tw`. The test was corrected to match the repo convention rather than the reverse.
2. **`populateLanguageSelect` had a real bug in the plan's snippet.** It created an `optgroup` but never appended it to the `select`, so the picker rendered empty. The TDD cycle caught it: the "renders every registry language, grouped into common and all" test failed with 0 groups. The implementation now appends the group before filling it.
3. **The pickers are populated inside `loadSettings`, not only in `init()`.** Two pre-existing tests call `loadSettings()` directly, which exposed that the repo's own `populateModelSelect` runs inside `loadSettings` right before the saved value is applied. The pickers follow that same order, so a saved code always has an option to land on.
4. **Filtering keeps the current value selectable.** The plan asserted the filtered option list was exactly the matches; it is the matches plus the currently selected code, because dropping it would blank `select.value` and Save would then persist an empty language. The test now states that contract explicitly.
5. **`CHANGELOG.md` gained an `## [Unreleased]` section** instead of an entry under the released `[2.4.0]` heading, which would have claimed the feature shipped in 2.4.0.
6. **`docs/FOLLOWUPS.md` grew a row 17, and row 12 was marked resolved.** Row 12 recorded the `SUPPORTED_LOCALES` duplication between `settings.js` and `tests/settings.test.js`; this branch removes that duplication, so leaving the row open would have been stale information.
7. **Test counts differ from the plan's estimate:** `tests/lib/languages.test.js` has 23 tests (the plan estimated 20), and the whole unit suite went from 235 tests / 29 suites to 272 tests / 32 suites.

Gate results: `env -u NODE_ENV npx jest` 272 passed, `env -u NODE_ENV npx playwright test` 44 passed, `env -u NODE_ENV npm run verify` green.
