import { getPrimaryLanguage } from "./storage.js";
import { UI_LOCALE_CODES } from "./languages.js";

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
      // primaryLanguage is a translation language, and 43 of those exist while
      // only UI_LOCALE_CODES ship under _locales/. Skipping the request for the
      // rest avoids a 404 and a console warning on every page load.
      if (userLang !== "en" && UI_LOCALE_CODES.includes(userLang)) {
        try {
          const targetUrl = chrome.runtime.getURL(`_locales/${userLang}/messages.json`);
          // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
          const targetRes = await fetch(targetUrl);
          targetData = await targetRes.json();
        } catch (e) {
          console.warn("Failed to load locale:", userLang, e);
        }
      }

      this.data = { ...enData, ...targetData };
    } catch (e) {
      console.error("Localization init failed", e);
    }
  },

  getMessage(key) {
    if (this.data && this.data[key]) {
      return this.data[key].message;
    }
    return chrome.i18n.getMessage(key);
  },
};
