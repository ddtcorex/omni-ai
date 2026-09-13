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

Strings per wave assume 186 keys (183 shipped plus the 3 Plan A adds); the real count is now 182 after the prefix-template fix recorded at the end of this file removed 4 keys. Confirm the real number with `node -e 'console.log(Object.keys(require("./_locales/en/messages.json")).length)'` before quoting it.

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

**Risk to state plainly:** 42 locales x 182 keys is roughly 7,800 AI-produced strings. Waves 1..7 are nine PRs of translator work. The structural tests prove the files are complete and well-formed; they cannot prove the Vietnamese or the Kannada reads naturally. That judgement stays with a human reviewer, wave by wave.

## Execution Record

**Wave 0** executed 2026-09-13 on `chore/i18n-wave-0`, off `master` at the merge of PR #158 (`176edb5`).

Delivered as planned: `tests/locales.test.js` (parses, key parity both ways, non-empty bodies, placeholder parity both ways, directory parity with `UI_LOCALE_CODES`), `scripts/locale-status.mjs`, `lib/languages.js`'s `toLocaleDir()`, the content script and `lib/i18n.js` now resolving a locale directory through it, and the 14 missing keys backfilled into `de es fr it ja ko pt zh` (448 lines, 8 files).

Findings and deviations:

1. **The parity test found no pre-existing placeholder violations.** No English message carries a `$1` or tag placeholder today, so the placeholder test is a forward guard and is labelled as such in the file. No existing locale had an empty message, a stray extra key, or a mismatched placeholder.
2. **No test asserts "differs from English", deliberately.** Every locale legitimately repeats 8 to 18 English values (brand names such as `Omni AI`, the `settings_customGateway*` strings, `Chat`). A hard assertion would need a large allowlist. `scripts/locale-status.mjs` reports the `identical-to-en` count for a human instead, and the test file says why.
3. **22 keys in `_locales/en/messages.json` have no `description` field** (the `settings_tooltip_*_s*` step strings and the `lang_*` names), and 15 further keys have a description in `en` but not in the translations (`sidepanel_*`, some `settings_*`). A "documents every key" test was written and then removed rather than backfilling 22 descriptions or maintaining an allowlist, because the field is maintainer-facing tooling text with no user impact and it is not what this wave is for. The status script now reports `no-description` so the gap stays visible.
4. **A generator bug cost two attempts and is worth remembering.** Appending JSON entries by string concatenation failed twice: the first attempt left a trailing comma on the last appended entry, and the second forgot that the file's *existing* last entry has no trailing comma at all. Both are the same class of mistake, and both were caught by parsing the file immediately after writing it rather than by the test suite. Always `JSON.parse` a file you just edited by text.

Gate results: `env -u NODE_ENV npm run verify` exit 0 (33 suites, 351 tests), `env -u NODE_ENV npx playwright test` 44 passed, `node scripts/locale-status.mjs` reports `0 of 9 locales are missing keys`.

**Wave 1** executed 2026-09-13 on `chore/i18n-wave-1`: `ar bn hi id ru ur`, 6 x 186 keys (the long-lived count is 182; see the prefix-template fix below).

How it was produced, which matters for how much to trust it: the six catalogues were translated in parallel by six independent translator agents, each given the English file, the same nine rules (key order, translate `message` only, keep `description` English, preserve placeholders, keep product names in Latin script, match the register of each string, standard terminology for that language, valid 2-space JSON, no trailing comma), and the same self-check command. Each reported `186 keys ok`. The parent then verified independently: the parity gate, `scripts/locale-status.mjs`, and a real-browser probe.

The real-browser probe is the part Jest cannot do. A throwaway Playwright script launched the unpacked extension with `--lang=<code>` and read `chrome.i18n.getMessage()` from the extension's own `settings.html` for four keys, comparing against each locale's own file. All six directories resolved 4 of 4 from their own file, which proves Chrome accepts these directory names, including the RTL and Devanagari ones. The probe was calibrated first against `vi` and `ja`, and an early surprise is worth recording: `chrome.i18n.getUILanguage()` still reported `en-US` under `--lang=vi`, so the probe had to compare resolved strings, not the reported UI language.

Findings:

1. **The six new directories were not enough on their own, and one translator agent caught why.** `UI_LOCALE_CODES` is what `toLocaleDir()` searches, so until `ar` is listed there, `toLocaleDir("ar")` returns `"en"` and the content script's fetched bundle never reaches Arabic even though Chrome's own `chrome.i18n.getMessage()` on an extension page already would. The directory, the registry entry and the parity test have to land together, which is why the plan's Step 5 exists.
2. **`identical-to-en` is 7 for five of the six locales** and 10 for `id`. For `ar bn hi ru ur` the seven are exactly the rule-4 product names (`Omni AI` twice, the four console/platform labels, `Custom Gateway`). `id` adds `preset_email`, `preset_chat`, `status_error`, `error_prefix`, `overlay_error` and `sidebar_tab_chat`, which is correct Indonesian rather than a missed translation.
3. **One trailing space was fixed by hand.** `hi`'s `error_apiKeyNotConfiguredFor` ended with a space and is concatenated as `${message} ${model}`, which would have rendered two spaces. Cosmetic, but the kind of thing a reviewer should not have to find.
4. **The translators flagged the same structural tension, and it is worth knowing about.** `error_apiKeyNotConfiguredFor` and `settings_tooltip_*_s1` ("Go to") are English-shaped prefix templates concatenated with a following token. In verb-final languages (Hindi, Bengali, Urdu) and in Arabic the prefix does not read naturally. Each solved it differently (colon suffix, "for this model" phrasing). It works, and a native reviewer may well prefer a different split; the real fix would be to turn these into a single message with a placeholder, which is a source change to `lib/ai-service.js` and out of this wave's scope.

Gate results: `env -u NODE_ENV npm run verify` exit 0 (33 suites, 387 tests), `env -u NODE_ENV npx playwright test` 44 passed, `node scripts/locale-status.mjs` reports `0 of 15 locales are missing keys`, and the browser probe reports all six directories accepted.

**Prefix-template fix** executed 2026-09-13 on `fix/i18n-prefix-templates`, before wave 2, because Tamil, Telugu, Marathi, Gujarati and Thai are all verb-final and would have inherited the same problem.

Two strings were built by concatenating a translated fragment with a value, which no translator can reorder:

1. `error_apiKeyNotConfiguredFor` was `${i18n.getMessage(key)} ${activeModel}` in `lib/ai-service.js`. It is now a placeholder message (`API key not configured for $MODEL$`, with `placeholders: { model: { content: "$1" } }`) and the call site passes `[activeModel]`. Every locale places `$MODEL$` where its own word order wants it, so Hindi reads `$MODEL$ के लिए ...` with the model first instead of a colon bolted on the end.
2. Each provider tooltip's first step was a bare `Go to` message followed by the anchor holding the brand name. It is now one message inside the link (`Go to Google AI Studio`), following the precedent already in the same file: `settings_geminiApiKeyHint` reads naturally in every language precisely because the brand lives inside its message. The four standalone brand keys (`settings_googleAiStudio`, `settings_groqConsole`, `settings_openaiPlatform`, `settings_anthropicConsole`) had no other use and were removed, so the catalogs dropped from 186 to 182 keys.

New coverage, because none existed for either string: `tests/locales.test.js` now asserts which messages take a substitution, that each declared placeholder is both defined and named in the message, that every locale declares the same placeholders as `en`, that every locale's four tooltip step-one sentences contain their brand, and that the tooltip markup wraps the message in the link rather than preceding it. `tests/lib/ai-service.test.js` asserts the model id arrives as a substitution argument rather than by string concatenation.

The browser probe was extended for this, and it is the check that matters: Chrome's `$NAME$` substitution is invisible to Jest because the test mock replaces `getMessage` entirely. Running the real extension with `--lang=<code>` and calling `getMessage("error_apiKeyNotConfiguredFor", ["gemini-3.6-flash"])` returns:

| Locale | Result |
| --- | --- |
| `en` | `API key not configured for gemini-3.6-flash` |
| `vi` | `Chưa cấu hình API key cho gemini-3.6-flash` |
| `hi` | `gemini-3.6-flash के लिए API कुंजी कॉन्फ़िगर नहीं है` |
| `ur` | `gemini-3.6-flash کے لیے API کلید کنفیگر نہیں ہے` |
| `ja` | `gemini-3.6-flash の API キーが設定されていません` |
| `ar` | `لم يتم تكوين مفتاح API لـ gemini-3.6-flash` |

No literal `$MODEL$` survives in any of them, and the model id lands in the language-natural position.

One test bug was mine, not the implementation's: the markup assertion first required `</a>` with no whitespace, but Prettier puts the anchor's closing bracket on its own line. The regex now allows whitespace before both `>`.

**Wave 2** executed 2026-09-13 on `chore/i18n-wave-2`: `tr ta te mr gu th`, 6 x 182 keys, produced the same way as wave 1 (six parallel translator agents, one per language, identical rules plus the two added by the prefix-template fix: keep the `$MODEL$` token and its `placeholders` block, and make each tooltip step-one sentence contain its brand).

The two new rules are what made this wave clean. Every one of the six put the model id in its own natural position without a workaround, and the browser probe confirms it:

| Locale | Resolved string |
| --- | --- |
| `tr` | `gemini-3.6-flash için API anahtarı yapılandırılmamış` |
| `ta` | `gemini-3.6-flash க்கு API விசை அமைக்கப்படவில்லை` |
| `te` | `gemini-3.6-flash కోసం API కీ కాన్ఫిగర్ చేయబడలేదు` |
| `mr` | `gemini-3.6-flash साठी API की कॉन्फिगर केलेली नाही` |
| `gu` | `gemini-3.6-flash માટે API કી ગોઠવેલી નથી` |
| `th` | `ยังไม่ได้ตั้งค่าคีย์ API สำหรับ gemini-3.6-flash` |

Every one carries the model id with no literal `$MODEL$` left behind, and the four verb-final languages put it before the verb. The directory probe also passed 4 of 4 for all six, so Chrome accepts every directory name.

Gate results: `env -u NODE_ENV npm run verify` exit 0 (33 suites, 458 tests), `env -u NODE_ENV npx playwright test` 44 passed, `node scripts/locale-status.mjs` reports `0 of 21 locales are missing keys`, and both browser probes pass.

**Overlay language chip fix** executed 2026-09-13 on `fix/i18n-ui-to-placeholder`, after wave 2 and before wave 3.

Wave 2's six translators each rendered `ui_to` differently (`→` in Tamil, `Hedef:` in Turkish, `లోకి` in Telugu, `เป็นภาษา` in Thai, `में` in Hindi, `માં` in Gujarati for the same string), which is the signature of a string that cannot be translated correctly rather than six stylistic choices. The cause was the same concatenation pattern the earlier fix round removed: `content/content.js` rendered `${flag} ${getMessage("ui_to")} ${languageName}`, so the marker had to sit in front of the name no matter what the language needed.

`ui_to` is now a `$LANGUAGE$` placeholder message and the call site passes the resolved language name as a substitution. This one needed one extra step the earlier fix did not: both i18n wrappers read `_locales/<lang>/messages.json` themselves and return `entry.message`, bypassing Chrome's own substitution, so a shared `applySubstitutions(message, placeholders, substitutions)` helper now fills the map in `lib/i18n.js`, and the content script's own wrapper imports and uses it. Without that the user would have seen a literal `$LANGUAGE$`.

The runtime result, read from a real extension with `--lang=<code>` (the chip receives the locale's own name for English):

| Locale | Chip |
| --- | --- |
| `en` | `To English` |
| `tr` | `İngilizce diline` |
| `ta` | `ஆங்கிலம் மொழிக்கு` |
| `te` | `ఆంగ్లం లోకి` |
| `hi` | `अंग्रेज़ी में` |
| `ur` | `انگریزی میں` |
| `ja` | `英語 へ` |
| `th` | `เป็นภาษาอังกฤษ` |

Turkish now attaches its dative to the name and Thai drops the space it should not have, both of which were impossible before.

New coverage: the parameterised-message list in `tests/locales.test.js` now includes `ui_to`, so its `placeholders` block and its `$LANGUAGE$` token are checked in all 22 files; a guard asserts the content script passes a substitution rather than interpolating beside the message; and `tests/lib/i18n.test.js` covers the local-bundle substitution path, including the case where no substitution is supplied.

Gate results: `env -u NODE_ENV npm run verify` exit 0 (33 suites, 463 tests), `env -u NODE_ENV npx playwright test` 44 passed, and the browser probe reports both placeholders resolving in every locale tested.

**Wave 3** executed 2026-09-13 on `chore/i18n-wave-3`: `nl pl uk sv da no`, 6 x 182 keys, same six-parallel-agent process, with three rules now instead of two (keep the `$MODEL$` block, keep the `$LANGUAGE$` block, name the brand in each tooltip's first step). Every locale passed the parity gate, and both browser probes report 6 of 6.

One design limitation surfaced by the Ukrainian agent and worth recording, because it is the honest limit of the `ui_to` fix: `$LANGUAGE$` is substituted with `resolveLanguageLabel()`, which returns a **nominative** label ("Англійська") or the language's own endonym. A locale whose marker needs a case ending attached to the name cannot express that, so `$LANGUAGE$ мовою` would render "Англійська мовою". Ukrainian used `Мова: $LANGUAGE$` instead, which is grammatical for every substituted value. The languages that put their marker in a separate word (Turkish `diline`, Tamil `மொழிக்கு`, Telugu `లోకి`, Hindi `में`) are unaffected. The `ui_to` description in all 28 catalogues now states the constraint rather than claiming the name "can be ordered by the translator".

Resolved strings, read from a real extension per locale:

| Locale | `error_apiKeyNotConfiguredFor` | `ui_to` |
| --- | --- | --- |
| `nl` | `API-sleutel niet geconfigureerd voor gemini-3.6-flash` | `Naar Engels` |
| `pl` | `Klucz API nie jest skonfigurowany dla gemini-3.6-flash` | `Na angielski` |
| `uk` | `Ключ API не налаштовано для gemini-3.6-flash` | `Мова: Англійська` |
| `sv` | `API-nyckeln är inte konfigurerad för gemini-3.6-flash` | `Till Engelska` |
| `da` | `API-nøglen er ikke konfigureret til gemini-3.6-flash` | `Til Engelsk` |
| `no` | `API-nøkkelen er ikke konfigurert for gemini-3.6-flash` | `Til Engelsk` |

**Wave 4** executed 2026-09-13 on `chore/i18n-wave-4`: `fi cs ro hu el he`, 6 x 182 keys, same process. All six passed the parity gate, the directory probe and the placeholder probe:

| Locale | `error_apiKeyNotConfiguredFor` | `ui_to` |
| --- | --- | --- |
| `fi` | `API-avainta ei ole määritetty kohteelle gemini-3.6-flash` | `Kieli: Englanti` |
| `cs` | `Klíč API není nakonfigurován pro gemini-3.6-flash` | `Jazyk: Angličtina` |
| `ro` | `Cheia API nu este configurată pentru gemini-3.6-flash` | `În Engleză` |
| `hu` | `A gemini-3.6-flash modellhez nincs beállítva API-kulcs` | `Nyelv: Angol` |
| `el` | `Το κλειδί API δεν έχει ρυθμιστεί για gemini-3.6-flash` | `Σε Αγγλικά` |
| `he` | `מפתח ה-API אינו מוגדר עבור gemini-3.6-flash` | `שפה: אנגלית` |

The `ui_to` constraint documented in wave 3 paid off: Finnish, Czech, Hungarian and Hebrew would all have needed a case ending or a prepositional inflection attached to the language name, and each used a separate marker or a colon label instead of forcing one. Hebrew also needed no special handling for right-to-left, since JSON is always logical order.

**Wave 5** executed 2026-09-13 on `chore/i18n-wave-5`: `ms ca hr sk sl bg`, 6 x 182 keys, same process. Parity gate, directory probe and placeholder probe all pass:

| Locale | `error_apiKeyNotConfiguredFor` | `ui_to` |
| --- | --- | --- |
| `ms` | `Kunci API belum dikonfigurasikan untuk gemini-3.6-flash` | `Ke Inggeris` |
| `ca` | `La clau API no està configurada per a gemini-3.6-flash` | `A Anglès` |
| `hr` | `API ključ nije konfiguriran za gemini-3.6-flash` | `Jezik: Engleski` |
| `sk` | `Kľúč API nie je nakonfigurovaný pre gemini-3.6-flash` | `Jazyk: Angličtina` |
| `sl` | `Ključ API ni nastavljen za gemini-3.6-flash` | `Jezik: Angleščina` |
| `bg` | `API ключът не е конфигуриран за gemini-3.6-flash` | `На Английски` |

Four of the six (Croatian, Slovak, Slovenian, Bulgarian) are case-inflecting Slavic languages and used the colon or preposition form the wave-3 constraint calls for; none attached an ending to the nominative token. Bulgarian's `на` happens to take the same form as the nominative label, so it reads naturally without a colon.

Two agents independently noticed a genuine inconsistency worth recording rather than fixing quietly: the `es` catalogue from wave 0/1 left `settings_customGatewayHint`, `settings_customGatewayUrlNote` and `settings_customGatewayKeyNote` in English, while Catalan translated them (rule 6 protects brand names, not whole sentences). Both are defensible readings, and the `identical-to-en` column in `scripts/locale-status.mjs` is what makes the divergence visible. A future pass should decide one way and align all 40 catalogues.
