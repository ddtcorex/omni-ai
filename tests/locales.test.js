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

/**
 * Every placeholder in a message, in order: Chrome's `$NAME$` named form, a
 * `$1` positional reference, and `<tag>` markup. A `$NAME$` token is the form
 * that actually appears inside a `message`; the positional `$1` normally lives
 * in `placeholders.<name>.content` and is matched here only because a
 * translation that moves it into the visible string is exactly the mistake this
 * check exists to catch. No English message contains a bare currency-like `$5`,
 * so the positional pattern stays unambiguous.
 */
const placeholders = (message) => [
  ...[...message.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\$/g)].map((match) => match[0].toUpperCase()),
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

describe("messages that take a substitution", () => {
  const en = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../_locales/en/messages.json"), "utf8"),
  );
  const parameterised = Object.entries(en)
    .filter(([, entry]) => entry.placeholders)
    .map(([key]) => key);

  test("the substitute-taking messages are exactly the ones that need it", () => {
    // A prefix template glued together with string concatenation cannot be
    // reordered by a translator, which breaks verb-final languages. Any message
    // that is concatenated with a dynamic value belongs in this list.
    expect(parameterised).toEqual(["error_apiKeyNotConfiguredFor"]);
  });

  test.each(parameterised)("en declares a placeholder definition for %s", (key) => {
    const placeholders = en[key].placeholders;
    expect(Object.keys(placeholders).length).toBeGreaterThan(0);
    Object.values(placeholders).forEach((definition) => {
      expect(definition.content).toMatch(/^\$\d+$/);
    });
  });

  test.each(parameterised)("en's %s message names each declared placeholder", (key) => {
    Object.keys(en[key].placeholders).forEach((name) => {
      expect(en[key].message).toContain(`$${name.toUpperCase()}$`);
    });
  });

  test.each(localeDirs)("%s declares the same placeholders as en", (locale) => {
    const messages = readMessages(locale);
    const differences = parameterised
      .filter((key) => key in messages)
      .filter(
        (key) =>
          JSON.stringify(Object.keys(messages[key].placeholders || {}).sort()) !==
          JSON.stringify(Object.keys(en[key].placeholders).sort()),
      );
    expect(differences).toEqual([]);
  });
});

describe("UI copy that must not be glued together from fragments", () => {
  const settingsHtml = fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8");
  const providers = ["gemini", "groq", "openai", "anthropic"];
  const brandByProvider = {
    gemini: "Google AI Studio",
    groq: "Groq Console",
    openai: "OpenAI Platform",
    anthropic: "Anthropic Console",
  };

  test.each(providers)("%s's first tooltip step is one link wrapping the message", (provider) => {
    // The old markup emitted a bare "Go to" message and then the anchor, so a
    // verb-final language had to accept English word order or add punctuation
    // to fake it. One message inside the link lets each locale order it.
    // Prettier wraps the anchor's own closing bracket onto the next line, so
    // both the opening and closing tags allow whitespace before their ">".
    const pattern = new RegExp(
      `<li>\\s*<a[^>]+>\\s*__MSG_settings_tooltip_${provider}_s1__\\s*</a\\s*>\\s*</li>`,
    );
    expect(settingsHtml).toMatch(pattern);
  });

  test.each(providers)("%s's first step names its brand inside the message", (provider) => {
    const brand = brandByProvider[provider];
    const key = `settings_tooltip_${provider}_s1`;
    const missing = localeDirs.filter(
      (locale) => !readMessages(locale)[key].message.includes(brand),
    );
    expect(missing).toEqual([]);
  });

  test("the now-unused standalone brand keys are gone", () => {
    const deleted = [
      "settings_googleAiStudio",
      "settings_groqConsole",
      "settings_openaiPlatform",
      "settings_anthropicConsole",
    ];
    const survivors = localeDirs.filter((locale) =>
      deleted.some((key) => key in readMessages(locale)),
    );
    expect(survivors).toEqual([]);
    expect(deleted.some((key) => settingsHtml.includes(key))).toBe(false);
  });
});
