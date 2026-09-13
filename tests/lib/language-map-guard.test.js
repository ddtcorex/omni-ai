const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "../..", ...parts), "utf8");

describe("the language registry stays the single source of truth", () => {
  const aiService = read("lib", "ai-service.js");
  const settingsHtml = read("settings.html");
  const contentSource = read("content", "content.js");

  test("ai-service.js no longer declares a local languageNames map", () => {
    expect(aiService).not.toMatch(/languageNames\s*=/);
  });

  test("ai-service.js resolves names through the shared registry", () => {
    expect(aiService).toMatch(/resolveLanguageName/);
  });

  test("no hardcoded language name table survives in ai-service.js", () => {
    // "Chinese (Simplified)" used to be copied into two separate maps here.
    expect(aiService).not.toContain('"Chinese (Simplified)"');
  });

  test("no second language table can hide behind a different variable name", () => {
    // The deleted map keyed the shipped codes to English names. An object
    // literal carrying five or more of those keys is a reintroduced table.
    const shippedCodes = [
      "en",
      "es",
      "fr",
      "de",
      "it",
      "pt",
      "ja",
      "ko",
      "zh",
      "vi",
      "ru",
      "ar",
      "hi",
    ];
    const found = shippedCodes.filter((code) =>
      new RegExp(`(^|[\\s,{])"?${code}"?\\s*:\\s*["'\`]`, "m").test(aiService),
    );
    expect(found).toEqual([]);
  });

  test.each(["primaryLanguage", "defaultLanguage"])(
    "settings.html ships no hardcoded options in #%s",
    (id) => {
      const match = settingsHtml.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
      expect(match).not.toBeNull();
      expect(match[1].trim()).toBe("");
    },
  );

  test("settings.html carries no per-language i18n options", () => {
    expect(settingsHtml).not.toMatch(/__MSG_lang_/);
  });

  test("the content script reads language labels from the registry", () => {
    expect(contentSource).toMatch(/resolveLanguageLabel/);
  });

  test("the content script no longer builds a language label from an i18n key", () => {
    expect(contentSource).not.toMatch(/getMessage\(`lang_\$\{/);
  });
});
