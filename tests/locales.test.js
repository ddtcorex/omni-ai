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

  test("ships exactly the locale directories the registry advertises", () => {
    expect([...localeDirs].sort()).toEqual([...UI_LOCALE_CODES].sort());
  });

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

  // Forward guard. No English message carries a placeholder today, so this test
  // is currently vacuous; it starts protecting the moment one is added, because
  // a translation that drops `$1` silently breaks the string it is spliced into.
  // It says nothing about translation QUALITY: several keys are legitimately
  // identical to English (brand names, "Chat"), which is why no test asserts
  // "differs from en". Run `node scripts/locale-status.mjs` for that report.
  test.each(localeDirs)("%s keeps en's placeholders in every message", (locale) => {
    const messages = readMessages(locale);
    const mismatched = Object.keys(en).filter((key) => {
      if (!(key in messages)) return false;
      const expected = placeholders(en[key].message);
      if (expected.length === 0) return false;
      return JSON.stringify(placeholders(messages[key].message)) !== JSON.stringify(expected);
    });
    expect(mismatched).toEqual([]);
  });

  test.each(localeDirs)("%s adds no placeholder en does not have", (locale) => {
    const messages = readMessages(locale);
    const invented = Object.keys(en).filter((key) => {
      if (!(key in messages)) return false;
      const expected = placeholders(en[key].message);
      const actual = placeholders(messages[key].message);
      return actual.some((token) => !expected.includes(token));
    });
    expect(invented).toEqual([]);
  });
});
