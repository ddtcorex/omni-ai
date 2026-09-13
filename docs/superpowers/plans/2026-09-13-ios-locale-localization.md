# iOS Locale Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize the extension's own UI into every language in Apple's iOS 26 "System Language" list, so the 10 shipped locales become 52.

**Architecture:** Each locale is a `_locales/<dir>/messages.json` file. Chrome resolves the active UI language against those directories and falls back to `en` for any missing key, so coverage can land in waves without breaking anything. A key-parity test plus a placeholder-parity test make each wave self-verifying; a small status script tells the translator what is still missing or still identical to English.

**Tech Stack:** Chrome `_locales` i18n, zero-build vanilla ES modules, Jest 30 + jsdom, Playwright E2E.

**Spec:** Companion plan for the translation-language registry: `docs/superpowers/plans/2026-09-13-popular-language-support.md`. This plan assumes Plan A has merged (`lib/languages.js` and `UI_LOCALE_CODES` exist).

## Global Constraints

- **Source of truth for the target set:** Apple's iOS 26 "System Language" list, read from `https://www.apple.com/ios/feature-availability/`, section id `system-language-system-language`, 55 entries. Do not add or drop languages; take the list as it stands.
- **Only UI copy is translated.** Language *names* in the pickers stay in `lib/languages.js` (see Plan A and the AGENTS.md carve-out). Do not add `lang_<code>` keys for the new locales.
- **Translations in this plan are AI-produced.** The agent writes them; the maintainer, or a native speaker, reviews each wave before the wave's PR merges. Never claim a wave is verified for translation quality without that review; say "structurally verified, awaiting human review" instead.
- **Placeholders are load-bearing.** `$1`, `$2`, `<tag>`-style markup and trailing punctuation inside a message must survive translation exactly. The parity test enforces this.
- **Local gate before every push:** `env -u NODE_ENV npm run verify` and `env -u NODE_ENV npx playwright test`. The agent shell exports `NODE_ENV=production`, which makes npm omit devDependencies.
- **Prettier:** `printWidth: 100`, LF. Run `npx prettier --write` on every touched JSON before committing.

## Target Set and Directory Mapping

The 55 Apple entries collapse to 13 already covered and 42 new directories. "Fallback" means: no separate directory is created, and Chrome resolves the language against the base directory instead.

| # | Apple System Language entry | Language code | `_locales` dir | Action |
| --- | --- | --- | --- | --- |
| 1 | Arabic | `ar` | `ar` | new |
| 2 | Bangla | `bn` | `bn` | new |
| 3 | Bulgarian | `bg` | `bg` | new |
| 4 | Catalan | `ca` | `ca` | new |
| 5 | Chinese, Simplified | `zh` | `zh` | ships |
| 6 | Chinese, Traditional (Hong Kong) | `zh-HK` | `zh_HK` | new |
| 7 | Chinese, Traditional (Taiwan) | `zh-TW` | `zh_TW` | new |
| 8 | Croatian | `hr` | `hr` | new |
| 9 | Czech | `cs` | `cs` | new |
| 10 | Danish | `da` | `da` | new |
| 11 | Dutch | `nl` | `nl` | new |
| 12 | English (Australia) | `en-AU` | `en` | fallback |
| 13 | English (India) | `en-IN` | `en` | fallback |
| 14 | English (United Kingdom) | `en-GB` | `en_GB` | new |
| 15 | English (United States) | `en-US` | `en` | fallback |
| 16 | Finnish | `fi` | `fi` | new |
| 17 | French (Canada) | `fr-CA` | `fr_CA` | new |
| 18 | French (France) | `fr` | `fr` | ships |
| 19 | German | `de` | `de` | ships |
| 20 | Greek | `el` | `el` | new |
| 21 | Gujarati | `gu` | `gu` | new |
| 22 | Hebrew | `he` | `he` | new |
| 23 | Hindi | `hi` | `hi` | new |
| 24 | Hungarian | `hu` | `hu` | new |
| 25 | Indonesian | `id` | `id` | new |
| 26 | Italian | `it` | `it` | ships |
| 27 | Japanese | `ja` | `ja` | ships |
| 28 | Kannada | `kn` | `kn` | new |
| 29 | Kazakh | `kk` | `kk` | new |
| 30 | Korean | `ko` | `ko` | ships |
| 31 | Lithuanian | `lt` | `lt` | new |
| 32 | Malay | `ms` | `ms` | new |
| 33 | Malayalam | `ml` | `ml` | new |
| 34 | Marathi | `mr` | `mr` | new |
| 35 | Norwegian | `no` | `no` | new |
| 36 | Odia | `or` | `or` | new |
| 37 | Polish | `pl` | `pl` | new |
| 38 | Portuguese (Brazil) | `pt` | `pt` | ships |
| 39 | Portuguese (Portugal) | `pt-PT` | `pt_PT` | new |
| 40 | Punjabi | `pa` | `pa` | new |
| 41 | Romanian | `ro` | `ro` | new |
| 42 | Russian | `ru` | `ru` | new |
| 43 | Slovak | `sk` | `sk` | new |
| 44 | Slovenian | `sl` | `sl` | new |
| 45 | Spanish (Latin America) | `es-419` | `es_419` | new |
| 46 | Spanish (Spain) | `es` | `es` | ships |
| 47 | Spanish (United States) | `es-US` | `es` | fallback |
| 48 | Swedish | `sv` | `sv` | new |
| 49 | Tamil | `ta` | `ta` | new |
| 50 | Telugu | `te` | `te` | new |
| 51 | Thai | `th` | `th` | new |
| 52 | Turkish | `tr` | `tr` | new |
| 53 | Ukrainian | `uk` | `uk` | new |
| 54 | Urdu | `ur` | `ur` | new |
| 55 | Vietnamese | `vi` | `vi` | ships |

Note the two deliberate interpretation calls, both re-derivable from the table above: the four English variants share one directory, and Persian is absent because Apple's System Language list does not include it, even though Plan A's translation registry does.

## File Structure

| File | Responsibility |
| --- | --- |
| `tests/locales.test.js` (new) | Structural contract for every locale: valid JSON, complete key set, placeholder parity, no empty messages. |
| `scripts/locale-status.mjs` (new) | Human-readable per-locale report: missing keys and values still identical to English. |
| `lib/languages.js` | Gains `toLocaleDir(code)` and a grown `UI_LOCALE_CODES`. |
| `content/content.js`, `lib/i18n.js` | Ask for the locale directory through `toLocaleDir` instead of the raw language code. |
| `_locales/<dir>/messages.json` | One file per wave language. |

## Wave Order

| Wave | Locales | Strings | Rationale |
| --- | --- | --- | --- |
| 0 | infrastructure + backfill `de es fr it ja ko pt zh` | 112 backfilled | Makes the parity test meaningful before 42 new files exist |
| 1 | `hi ar bn ru id ur` | 1,116 | Largest speaker populations |
| 2 | `tr ta te mr gu th` | 1,116 | Next by reach |
| 3 | `nl pl uk sv da no` | 1,116 | European markets |
| 4 | `fi cs ro hu el he` | 1,116 | Remaining European + Hebrew |
| 5 | `ms ca hr sk sl bg` | 1,116 | Remaining single-language markets |
| 6 | `lt kk kn ml or pa` | 1,116 | Remaining Apple entries |
| 7 | `zh_TW zh_HK pt_PT es_419 fr_CA en_GB` | 1,116 | Regional script and market variants |

Strings per wave assume 186 keys (183 shipped plus the 3 Plan A adds). Confirm the real number with `node -e 'console.log(Object.keys(require("./_locales/en/messages.json")).length)'` before quoting it.

---

### Task 0: Locale infrastructure and the missing-key backfill

**Files:**
- Create: `tests/locales.test.js`, `scripts/locale-status.mjs`
- Modify: `lib/languages.js`, `content/content.js`, `lib/i18n.js`, `_locales/{de,es,fr,it,ja,ko,pt,zh}/messages.json`

**Interfaces:**
- Consumes: `UI_LOCALE_CODES` from Plan A.
- Produces: `toLocaleDir(code: string): string` in `lib/languages.js`, returning e.g. `"zh_TW"` for `"zh-TW"` and `"en"` for `"en-AU"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/locales.test.js`:

```js
const fs = require("fs");
const path = require("path");

const { UI_LOCALE_CODES } = require("../lib/languages.js");

const localesRoot = path.join(__dirname, "../_locales");
const localeDirs = fs
  .readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const readMessages = (locale) =>
  JSON.parse(fs.readFileSync(path.join(localesRoot, locale, "messages.json"), "utf8"));

/** Every $1-style and <tag>-style placeholder in a message, in order. */
const placeholders = (message) => [
  ...[...message.matchAll(/\$\d+/g)].map((match) => match[0]),
  ...[...message.matchAll(/<\/?[a-z][\w-]*>/gi)].map((match) => match[0]),
];

describe("locale files", () => {
  const en = readMessages("en");
  const enKeys = Object.keys(en);

  test.each(localeDirs)("%s/messages.json parses and is non-empty", (locale) => {
    expect(Object.keys(readMessages(locale))).not.toHaveLength(0);
  });

  test.each(localeDirs)("%s defines every key en defines", (locale) => {
    const keys = Object.keys(readMessages(locale));
    expect(enKeys.filter((key) => !keys.includes(key))).toEqual([]);
  });

  test.each(localeDirs)("%s defines no key en does not define", (locale) => {
    const keys = new Set(enKeys);
    expect(Object.keys(readMessages(locale)).filter((key) => !keys.has(key))).toEqual([]);
  });

  test.each(localeDirs)("%s gives every message a non-empty string body", (locale) => {
    const messages = readMessages(locale);
    const empty = Object.entries(messages)
      .filter(([, entry]) => !entry || typeof entry.message !== "string" || !entry.message.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  test.each(localeDirs)("%s keeps en's placeholders in every message", (locale) => {
    const messages = readMessages(locale);
    const mismatched = Object.keys(en).filter((key) => {
      const expected = placeholders(en[key].message);
      if (expected.length === 0) return false;
      const actual = placeholders(messages[key].message);
      return JSON.stringify(actual) !== JSON.stringify(expected);
    });
    expect(mismatched).toEqual([]);
  });

  test("ships exactly the locale directories the registry advertises", () => {
    expect([...localeDirs].sort()).toEqual([...UI_LOCALE_CODES].sort());
  });
});
```

Create `scripts/locale-status.mjs`:

```js
#!/usr/bin/env node
/**
 * Report which keys a locale is missing, and which of its values are still
 * byte-identical to English (the usual sign of an unfinished translation).
 *
 * Usage: node scripts/locale-status.mjs [locale ...]
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localesRoot = join(root, "_locales");

const read = (locale) => JSON.parse(readFileSync(join(localesRoot, locale, "messages.json"), "utf8"));

const en = read("en");
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((locale) => locale !== "en")
      .sort();

let incomplete = 0;
for (const locale of targets) {
  const messages = read(locale);
  const missing = Object.keys(en).filter((key) => !(key in messages));
  const identical = Object.keys(en).filter((key) => messages[key]?.message === en[key].message);
  if (missing.length || identical.length) incomplete += 1;
  console.log(
    `${locale.padEnd(7)} keys=${String(Object.keys(messages).length).padStart(3)} ` +
      `missing=${String(missing.length).padStart(3)} identical-to-en=${String(identical.length).padStart(3)}`,
  );
  if (missing.length) console.log(`  missing:   ${missing.join(", ")}`);
  if (identical.length) console.log(`  identical: ${identical.join(", ")}`);
}
console.log(`\n${incomplete} of ${targets.length} locales need work.`);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -u NODE_ENV npx jest tests/locales.test.js && env -u NODE_ENV node scripts/locale-status.mjs`
Expected: FAIL on 8 locales with a non-empty "defines every key en defines" list; the status script prints `missing=14` for `de es fr it ja ko pt zh`.

- [ ] **Step 3: Backfill the 14 missing keys**

For each of `de es fr it ja ko pt zh`, add the 14 keys the status script lists, translated. They are `command_openPanel`, `command_openQuickMenu`, `settings_flashActions`, `settings_flashActionsHint`, `settings_flashAction_translatePrimary`, `settings_flashAction_translateDefault`, `error_apiKeyNotConfigured_gemini`, `error_apiKeyNotConfigured_openai`, and the rest of the list the script prints, with the same `message`/`description` shape en uses.

- [ ] **Step 4: Add `toLocaleDir` and use it for the locale fetch**

In `lib/languages.js`:

```js
/**
 * The _locales directory name for a language code. Chrome names locale
 * directories with an underscore ("zh_TW"), while language codes use a hyphen
 * ("zh-TW"); the four English variants all resolve to the base "en" directory.
 * @param {string} code
 * @returns {string}
 */
export function toLocaleDir(code) {
  const normalized = String(code).replace(/-/g, "_");
  const candidates = [normalized, normalized.split("_")[0]];
  return candidates.find((candidate) => UI_LOCALE_CODES.includes(candidate)) || "en";
}
```

Add the matching test to `tests/lib/languages.test.js`:

```js
describe("toLocaleDir", () => {
  test("maps a hyphenated code to Chrome's underscore directory name", () => {
    expect(toLocaleDir("zh-TW")).toBe("zh"); // until zh_TW ships in wave 7
    expect(toLocaleDir("vi")).toBe("vi");
  });

  test("resolves a regional variant to its base language when no directory ships", () => {
    expect(toLocaleDir("en-AU")).toBe("en");
    expect(toLocaleDir("xx")).toBe("en");
  });
});
```

Update that test's first expectation to `"zh_TW"` in wave 7, once that directory exists.

In `lib/i18n.js` and `content/content.js`'s `initializeI18n()`, replace the `UI_LOCALE_CODES.includes(userLang)` gate with a directory lookup:

```js
import { toLocaleDir } from "./languages.js";
```

```js
      const localeDir = toLocaleDir(userLang);
      let targetData = {};
      if (localeDir !== "en") {
        const targetUrl = chrome.runtime.getURL(`_locales/${localeDir}/messages.json`);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -u NODE_ENV npx jest tests/locales.test.js tests/lib/languages.test.js tests/lib/i18n.test.js`
Expected: PASS. `env -u NODE_ENV node scripts/locale-status.mjs` now prints `0 identical-to-en` counts only where translations are genuinely the same word (for example `"Omni AI"`).

- [ ] **Step 6: Format, gate, commit**

```bash
npx prettier --write tests/locales.test.js scripts/locale-status.mjs lib/languages.js content/content.js lib/i18n.js _locales/*/messages.json
env -u NODE_ENV npm run verify
git add -A && git commit -m "test(i18n): enforce locale key and placeholder parity, backfill 8 locales"
```

---

### Task 1..7: One locale wave each

Waves 1 through 7 are the same procedure over a different locale set (see the Wave Order table). For wave N, replace `<dir>` with each directory the wave lists.

**Files (per wave):**
- Create: `_locales/<dir>/messages.json` for each directory in the wave
- Modify: `lib/languages.js` (`UI_LOCALE_CODES`)
- Test: `tests/locales.test.js` (no edit needed; it is data-driven)

- [ ] **Step 1: Confirm the key set to translate**

```bash
node -e 'const m=require("./_locales/en/messages.json");console.log(Object.keys(m).length)'
node scripts/locale-status.mjs
```

Expected: the key count (186 if Plan A has merged) and a status table showing the current gaps.

- [ ] **Step 2: Produce each locale file**

For each `<dir>` in the wave:

1. Copy the key order of `_locales/en/messages.json` exactly; do not reorder or drop keys.
2. Translate only the `message` values. Keep `description` values in English, since they are maintainer-facing tooling notes, not user copy.
3. Preserve every placeholder from the English value verbatim and in the same order.
4. Leave proper nouns and product names untranslated: `Omni AI`, `Gemini`, `OpenAI`, `Groq`, `Anthropic`, keyboard shortcuts (`Alt+O`), and API-key field labels.
5. Keep translations of similar length to the English source; the Settings layout and the overlay cards have fixed widths.

Writing the files by script is fine and preferred for the mechanical parts (copying the key order), but every value must be an actual translation, not a copy of the English string. The status script's `identical-to-en` column is what catches a sloppy wave.

- [ ] **Step 3: Run the structural gate**

Run: `env -u NODE_ENV npx jest tests/locales.test.js && env -u NODE_ENV node scripts/locale-status.mjs <dir>`
Expected: PASS, and `missing=0` for every new locale. `identical-to-en` should contain only strings that are genuinely identical across languages.

- [ ] **Step 4: Verify a locale actually resolves in a loaded extension**

```bash
env -u NODE_ENV npx playwright test
```

Then confirm by hand that the new locale is reachable: load the unpacked extension with the browser UI language set to that locale (`chrome://settings/languages`), open Settings, and check that a string from the new file renders instead of English. This is the step that catches a directory name Chrome does not recognize, which no Jest test can see. Before starting the wave, also confirm every planned directory name appears in Chrome's documented list of supported `_locales` names (`https://developer.chrome.com/docs/extensions/reference/api/i18n`); if a name is not accepted, map it to the nearest accepted directory and record the substitution in this plan's mapping table rather than inventing a name.

- [ ] **Step 5: Grow the advertised locale list**

Add each new directory to `UI_LOCALE_CODES` in `lib/languages.js`. The parity test in `tests/locales.test.js` (`ships exactly the locale directories the registry advertises`) fails until this is done and the directories exist.

- [ ] **Step 6: Format, gate, commit**

```bash
npx prettier --write _locales/*/messages.json lib/languages.js
env -u NODE_ENV npm run verify
env -u NODE_ENV npx playwright test
git add -A && git commit -m "feat(i18n): add <locale list> UI locales"
```

- [ ] **Step 7: Hand the wave to a human reviewer**

Report, per locale, the string count and any translation the agent is unsure about. Do not describe the wave as translation-verified until a human has reviewed it. Mark it `structurally verified, awaiting human review`.

- [ ] **Step 8: Open the wave's PR**

One PR per wave, targeting `master`, so a reviewer can reject one wave without unwinding the others:

```bash
git -C /home/kai/Work/htdocs/omni-ai push -u origin chore/i18n-wave-<N>
gh pr create --title "feat(i18n): UI locales wave <N>" --body-file /tmp/i18n-wave-<N>.md
```

## Self-Review

**Spec coverage**

| Requirement | Task |
| --- | --- |
| Exactly Apple's iOS 26 System Language list | Mapping table, enforced by `UI_LOCALE_CODES` parity |
| Every Apple entry either ships or falls back deliberately | Mapping table, 13 covered / 42 new |
| 42 new locales, in reviewable waves | Wave Order table, Tasks 1..7 |
| Translation quality is not overclaimed | Global Constraints, Task N Step 7 |
| Placeholders survive translation | `tests/locales.test.js` placeholder test |
| Locale directory names Chrome accepts | Task N Step 4 |
| Language codes and directory names stop being confused | `toLocaleDir` in Task 0 |
| Existing 8 locales' gaps closed first | Task 0 Steps 2..3 |

**Deliberate non-goals:** translating language *names* into each locale (they come from `lib/languages.js`), the Apple "Translate App" and "System-Wide Translation" lists (21 and 27 entries, narrower than the System Language list the maintainer chose), and Cantonese/Shanghainese/Flemish/Valencian as separate locales, since Apple files them under the Chinese, Dutch and Catalan entries and Chrome has no directory names for them.

**Risk to state plainly:** 42 locales x 186 keys is roughly 7,800 AI-produced strings. Waves 1..7 are nine PRs of translator work. The structural tests prove the files are complete and well-formed; they cannot prove the Vietnamese or the Kannada reads naturally. That judgement stays with a human reviewer, wave by wave.
