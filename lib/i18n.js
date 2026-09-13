import { getPrimaryLanguage } from "./storage.js";
import { toLocaleDir } from "./languages.js";

/**
 * Fill a message's `$NAME$` placeholders from a substitutions array.
 *
 * Both i18n wrappers in this repo read `_locales/<lang>/messages.json`
 * themselves and return `entry.message` directly, which bypasses Chrome's own
 * substitution. Any message carrying a `placeholders` map therefore has to be
 * filled here, or the user sees a literal `$LANGUAGE$`.
 *
 * @param {string} message
 * @param {Record<string, { content: string }>} [placeholders]
 * @param {string[]} [substitutions]
 * @returns {string}
 */
export function applySubstitutions(message, placeholders, substitutions) {
  if (!message || !placeholders || !substitutions || substitutions.length === 0) return message;
  return Object.entries(placeholders).reduce((accumulated, [name, definition]) => {
    const position = Number(String(definition.content).replace("$", "")) - 1;
    const value = substitutions[position];
    if (value === undefined) return accumulated;
    // Chrome matches the placeholder name case-insensitively (`$NAME$` in the
    // message, `name` as the map key).
    return accumulated.replace(new RegExp(`\\$${name}\\$`, "gi"), String(value));
  }, message);
}

export const i18n = {
  data: {},

  async init() {
    try {
      const primaryLanguage = await getPrimaryLanguage();
      const userLang = primaryLanguage || "en";

      const enUrl = chrome.runtime.getURL("_locales/en/messages.json");
      // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
      const enRes = await fetch(enUrl);
      const enData = await enRes.json();

      let targetData = {};
      // primaryLanguage is a translation language, and only some of those ship
      // a _locales directory. toLocaleDir() maps the code to a directory (or
      // en), so the rest do not trigger a failing request on every page load.
      const localeDir = toLocaleDir(String(userLang));
      if (localeDir !== "en") {
        try {
          const targetUrl = chrome.runtime.getURL(`_locales/${localeDir}/messages.json`);
          // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
          const targetRes = await fetch(targetUrl);
          targetData = await targetRes.json();
        } catch (e) {
          console.warn("Failed to load locale:", localeDir, e);
        }
      }

      this.data = { ...enData, ...targetData };
    } catch (e) {
      console.error("Localization init failed", e);
    }
  },

  getMessage(key, substitutions) {
    const entry = this.data && this.data[key];
    if (entry) {
      return applySubstitutions(entry.message, entry.placeholders, substitutions);
    }
    return chrome.i18n.getMessage(key, substitutions);
  },
};
