/**
 * Translation target languages.
 *
 * Selection rule, agreed with the maintainer on 2026-09-13: the codes Omni AI
 * already shipped, plus every language with 50 million or more total speakers
 * in Ethnologue 2026 (read through
 * https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers),
 * plus major markets that rule misses, plus Traditional Chinese.
 *
 * The names here are reference data, not UI copy: they are shown as English +
 * native name from this one list instead of being duplicated into every
 * _locales file. See the exception recorded under core directive 7 in
 * AGENTS.md.
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
export const UI_LOCALE_CODES = [
  "ar",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en_GB",
  "es",
  "es_419",
  "fi",
  "fr",
  "fr_CA",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "kk",
  "kn",
  "ko",
  "lt",
  "ml",
  "mr",
  "ms",
  "nl",
  "no",
  "or",
  "pa",
  "pl",
  "pt",
  "pt_PT",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
  "zh_HK",
  "zh_TW",
];

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
 * @param {string} fallback
 * @param {(key: string) => string} [getMessage]
 * @returns {string}
 */
function translate(key, fallback, getMessage) {
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
  return translate(key, fallback, getMessage);
}

/**
 * The _locales directory name to read a language's UI strings from.
 *
 * Chrome names locale directories with an underscore (`zh_TW`) while language
 * codes use a hyphen (`zh-TW`), and a language can be a valid translation
 * target without shipping a locale at all (`jv`). Regional variants fall back
 * to their base language, and anything with no directory resolves to `en`.
 * @param {string} code
 * @returns {string}
 */
export function toLocaleDir(code) {
  const normalized = String(code).replace(/-/g, "_");
  const candidates = [normalized, normalized.split("_")[0]];
  return candidates.find((candidate) => UI_LOCALE_CODES.includes(candidate)) || "en";
}

/**
 * Fold accents so "tieng" finds "Tiếng Việt".
 * @param {string} value
 * @returns {string}
 */
function fold(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Every language that matches the query by code, English name, native name, or
 * the label the picker actually shows for the active locale. An empty query
 * returns the whole list.
 *
 * Matching the displayed label matters: the Vietnamese locale labels `zh`
 * "Tiếng Trung", so without it a user who types exactly what they read gets an
 * empty list.
 * @param {string} [query]
 * @param {(key: string) => string} [getMessage]
 * @returns {Language[]}
 */
export function filterLanguages(query, getMessage) {
  const needle = fold(query || "").trim();
  if (!needle) return [...LANGUAGES];
  return LANGUAGES.filter(
    (language) =>
      fold(language.name).includes(needle) ||
      fold(language.native).includes(needle) ||
      fold(language.code).includes(needle) ||
      fold(resolveLanguageLabel(language.code, getMessage)).includes(needle),
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

  const needle = String(query || "").trim();
  const matches = filterLanguages(needle, getMessage);
  const pool =
    pinnedCode && !matches.some((language) => language.code === pinnedCode)
      ? [...matches, { code: pinnedCode, name: pinnedCode, native: pinnedCode }]
      : matches;

  if (needle) {
    return [{ label: null, options: pool.map(toOption) }];
  }

  const commonSet = new Set(commonCodes);
  const common = commonCodes
    .map((code) => pool.find((language) => language.code === code))
    .filter(Boolean);
  const rest = pool.filter((language) => !commonSet.has(language.code));

  // The English strings below are last-resort fallbacks for a caller that
  // passes no getMessage; every shipped locale defines both keys.
  return [
    {
      label: translate("settings_languagesCommon", "Common", getMessage),
      options: common.map(toOption),
    },
    {
      label: translate("settings_languagesAll", "All languages", getMessage),
      options: rest.map(toOption),
    },
  ];
}
