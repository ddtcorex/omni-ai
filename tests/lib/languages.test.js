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

  test("is sorted by English name so extending it produces a reviewable diff", () => {
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
    // content.js's own getMessage() returns the key when nothing matches, so a
    // "translation" equal to the key must not win over the native name.
    expect(resolveLanguageLabel("sw", (key) => key)).toBe("Kiswahili");
  });

  test("falls back to the raw code for an unknown language", () => {
    expect(resolveLanguageLabel("xx", () => "")).toBe("xx");
  });

  test("builds a lowercase i18n key for a regional code", () => {
    const seen = [];
    resolveLanguageLabel("zh-TW", (key) => {
      seen.push(key);
      return "";
    });
    expect(seen).toEqual(["lang_zh_tw"]);
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

describe("searching by the name the picker displays", () => {
  // The Vietnamese locale translates the 10 shipped languages, so the label a
  // user reads is neither the English name nor the native one.
  const getMessage = (key) => ({ lang_zh: "Tiếng Trung", lang_ja: "Tiếng Nhật" })[key] || "";

  test("matches a translated label instead of returning nothing", () => {
    expect(filterLanguages("tiếng trung", getMessage).map((l) => l.code)).toEqual(["zh"]);
  });

  test("still matches the English and native names", () => {
    expect(filterLanguages("chinese (trad", getMessage).map((l) => l.code)).toEqual(["zh-TW"]);
    expect(filterLanguages("简体", getMessage).map((l) => l.code)).toEqual(["zh"]);
  });

  test("the option groups use the same matching, so the picker agrees with its search box", () => {
    const groups = buildLanguageOptionGroups("tiếng trung", { getMessage });
    expect(groups[0].options.map((o) => o.code)).toEqual(["zh"]);
  });

  test("treats a whitespace-only query as an empty one", () => {
    const groups = buildLanguageOptionGroups("   ", { getMessage });
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Common");
  });
});
