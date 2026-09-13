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
});
