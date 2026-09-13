import { i18n } from "../../lib/i18n";

describe("i18n locale loading", () => {
  beforeEach(() => {
    i18n.data = {};
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
    chrome.runtime.getURL.mockImplementation(
      (resourcePath) => `chrome-extension://test/${resourcePath}`,
    );
  });

  test("does not fetch a locale directory that does not ship", async () => {
    // jv is a supported translation target, but there is no _locales/jv.
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "jv" });

    await i18n.init();

    expect(global.fetch.mock.calls.map((call) => call[0])).toEqual([
      "chrome-extension://test/_locales/en/messages.json",
    ]);
  });

  test("fetches the locale when it ships", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "vi" });

    await i18n.init();

    expect(global.fetch.mock.calls.map((call) => call[0])).toContain(
      "chrome-extension://test/_locales/vi/messages.json",
    );
  });

  test("falls back to en without a request when no language is saved", async () => {
    chrome.storage.sync.get.mockResolvedValue({});

    await i18n.init();

    expect(global.fetch.mock.calls.map((call) => call[0])).toEqual([
      "chrome-extension://test/_locales/en/messages.json",
    ]);
  });

  test("maps a regional variant onto the locale directory that ships", async () => {
    // zh-TW is a translation language; its strings come from the zh directory.
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "zh-TW" });

    await i18n.init();

    expect(global.fetch.mock.calls.map((call) => call[0])).toEqual([
      "chrome-extension://test/_locales/en/messages.json",
      "chrome-extension://test/_locales/zh/messages.json",
    ]);
  });

  test("does not fetch for en-US, which resolves to the already loaded en", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "en-US" });

    await i18n.init();

    expect(global.fetch.mock.calls.map((call) => call[0])).toEqual([
      "chrome-extension://test/_locales/en/messages.json",
    ]);
  });
});

describe("substitutions through the locally loaded locale bundle", () => {
  test("fills a $NAME$ placeholder from the bundle instead of returning it raw", () => {
    // lib/i18n.js reads _locales/<lang>/messages.json itself, so it bypasses
    // Chrome's own substitution and has to apply the placeholders map.
    i18n.data = {
      ui_to: { message: "To $LANGUAGE$", placeholders: { language: { content: "$1" } } },
    };

    expect(i18n.getMessage("ui_to", ["English"])).toBe("To English");
  });

  test("leaves the message untouched when no substitution is supplied", () => {
    i18n.data = {
      ui_to: { message: "To $LANGUAGE$", placeholders: { language: { content: "$1" } } },
    };

    expect(i18n.getMessage("ui_to")).toBe("To $LANGUAGE$");
  });
});
