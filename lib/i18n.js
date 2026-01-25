export const i18n = {
  data: {},

  async init() {
    try {
      const { primaryLanguage } =
        await chrome.storage.sync.get("primaryLanguage");
      const userLang = primaryLanguage || "en";

      const enUrl = chrome.runtime.getURL("_locales/en/messages.json");
      const enRes = await fetch(enUrl);
      const enData = await enRes.json();

      let targetData = {};
      if (userLang !== "en") {
        try {
          const targetUrl = chrome.runtime.getURL(
            `_locales/${userLang}/messages.json`,
          );
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
