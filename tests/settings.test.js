const FIXTURE_IDS = [
  "extVersion", "geminiApiKey", "apiModel", "customModelName", "customModelGroup",
  "googleKeyGroup", "groqApiKey", "groqKeyGroup", "openaiApiKey", "openaiKeyGroup",
  "anthropicApiKey", "anthropicKeyGroup", "customGatewayKeyGroup", "customGatewayBaseUrl",
  "customGatewayApiKey", "advancedProviderSettings", "toggleApiKey", "validateBtn", "validationStatus", "themeSelector",
  "defaultPreset", "showFloatingButton", "primaryLanguage", "defaultLanguage", "shortcutsLink",
  "saveBtn", "saveStatus", "statTotalActions", "statWordsProcessed", "statWordsGenerated",
  "refreshHistory", "clearHistory", "historyList",
];

const SUPPORTED_LOCALES = ["en", "vi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"];

function buildFixture() {
  document.body.innerHTML = FIXTURE_IDS.map((id) => {
    if (id === "apiModel") return `<select id="${id}"></select>`;
    if (id === "advancedProviderSettings") return `<details id="${id}"><summary></summary></details>`;
    if (["primaryLanguage", "defaultLanguage"].includes(id)) {
      const options = SUPPORTED_LOCALES.map((code) => `<option value="${code}">${code}</option>`).join("");
      return `<select id="${id}">${options}</select>`;
    }
    if (["themeSelector", "defaultPreset", "showFloatingButton"].includes(id)) {
      return `<select id="${id}"><option value="">-</option></select>`;
    }
    if (id === "toggleApiKey" || id === "validateBtn" || id === "shortcutsLink" || id === "saveBtn" || id === "refreshHistory" || id === "clearHistory") {
      return `<button id="${id}"><svg></svg><span></span></button>`;
    }
    return `<div id="${id}"></div>`;
  }).join("\n");
}

describe("settings.js", () => {
  let Settings;

  beforeEach(async () => {
    jest.resetModules();
    buildFixture();
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
    chrome.i18n.getMessage.mockImplementation((key) => key);
    chrome.i18n.getUILanguage = jest.fn().mockReturnValue("en-US");
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.local.get.mockResolvedValue({});
    Settings = await import("../settings.js");
  });

  it("populateModelSelect renders every current model plus a legacy option for an unknown saved id", () => {
    Settings.populateModelSelect("gemini-2.0-flash");
    const options = Array.from(document.getElementById("apiModel").options).map((o) => o.value);
    expect(options).toContain("gemini-2.0-flash");
    const legacyOption = Array.from(document.getElementById("apiModel").options).find(
      (o) => o.value === "gemini-2.0-flash",
    );
    expect(legacyOption.textContent).toContain("settings_legacyModelPrefix");
  });

  it("loadSettings selects the legacy option instead of leaving the select blank", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-2.0-flash" });
    await Settings.loadSettings();
    expect(document.getElementById("apiModel").value).toBe("gemini-2.0-flash");
  });

  it("loadSettings selects the real current model when nothing is legacy", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-3.6-flash" });
    await Settings.loadSettings();
    expect(document.getElementById("apiModel").value).toBe("gemini-3.6-flash");
  });

  describe("detectSupportedLocale", () => {
    const SUPPORTED = ["en", "vi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"];

    it("matches an exact supported language", () => {
      expect(Settings.detectSupportedLocale("fr", SUPPORTED, "en")).toBe("fr");
    });

    it("matches the primary subtag of a regional variant", () => {
      expect(Settings.detectSupportedLocale("pt-BR", SUPPORTED, "en")).toBe("pt");
      expect(Settings.detectSupportedLocale("zh-TW", SUPPORTED, "en")).toBe("zh");
    });

    it("falls back for an unsupported language", () => {
      expect(Settings.detectSupportedLocale("th", SUPPORTED, "en")).toBe("en");
    });

    it("falls back for an empty or missing input", () => {
      expect(Settings.detectSupportedLocale("", SUPPORTED, "en")).toBe("en");
      expect(Settings.detectSupportedLocale(undefined, SUPPORTED, "en")).toBe("en");
    });
  });

  it("loadSettings uses the detected browser language when no primaryLanguage is saved", async () => {
    chrome.i18n.getUILanguage.mockReturnValue("fr-CA");
    chrome.storage.sync.get.mockResolvedValue({});
    await Settings.loadSettings();
    expect(document.getElementById("primaryLanguage").value).toBe("fr");
  });

  it("loadSettings respects an already-saved primaryLanguage over detection", async () => {
    chrome.i18n.getUILanguage.mockReturnValue("fr-CA");
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "ja" });
    await Settings.loadSettings();
    expect(document.getElementById("primaryLanguage").value).toBe("ja");
  });

  it("focuses the Gemini key input on a genuinely empty first load", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const focusSpy = jest.spyOn(document.getElementById("geminiApiKey"), "focus");
    await Settings.loadSettings();
    expect(focusSpy).toHaveBeenCalled();
  });

  it("does not steal focus when a Gemini key is already saved", async () => {
    chrome.storage.local.get.mockResolvedValue({ geminiApiKey: "existing-key" });
    const focusSpy = jest.spyOn(document.getElementById("geminiApiKey"), "focus");
    await Settings.loadSettings();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("auto-validates when a key input loses focus with a new, non-empty value", async () => {
    jest.useFakeTimers();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    await Settings.loadSettings();
    // Production wiring happens inside init() on "DOMContentLoaded", which
    // has already fired on jsdom's document by the time this module is
    // dynamically imported here — so the listener must be attached explicitly.
    Settings.setupEventListeners();

    const keyInput = document.getElementById("geminiApiKey");
    keyInput.value = "new-key-value";
    keyInput.dispatchEvent(new Event("blur"));
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "VALIDATE_CONFIG" }),
    );
    jest.useRealTimers();
  });

  it("does not auto-validate on blur when the key value is unchanged", async () => {
    jest.useFakeTimers();
    chrome.storage.local.get.mockResolvedValue({ geminiApiKey: "same-key" });
    await Settings.loadSettings();
    Settings.setupEventListeners();
    chrome.runtime.sendMessage.mockClear();

    const keyInput = document.getElementById("geminiApiKey");
    keyInput.dispatchEvent(new Event("blur"));
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("auto-expands Advanced when a -custom model is selected", async () => {
    await Settings.loadSettings();
    Settings.setupEventListeners();
    document.getElementById("apiModel").innerHTML = '<option value="google-custom">x</option>';
    document.getElementById("apiModel").value = "google-custom";
    document.getElementById("apiModel").dispatchEvent(new Event("change"));
    expect(document.getElementById("advancedProviderSettings").open).toBe(true);
  });
});
