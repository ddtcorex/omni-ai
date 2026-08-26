const FIXTURE_IDS = [
  "extVersion", "geminiApiKey", "apiModel", "customModelName", "customModelGroup",
  "googleKeyGroup", "groqApiKey", "groqKeyGroup", "openaiApiKey", "openaiKeyGroup",
  "anthropicApiKey", "anthropicKeyGroup", "customGatewayKeyGroup", "customGatewayBaseUrl",
  "customGatewayApiKey", "toggleApiKey", "validateBtn", "validationStatus", "themeSelector",
  "defaultPreset", "showFloatingButton", "primaryLanguage", "defaultLanguage", "shortcutsLink",
  "saveBtn", "saveStatus", "statTotalActions", "statWordsProcessed", "statWordsGenerated",
  "refreshHistory", "clearHistory", "historyList",
];

const SUPPORTED_LOCALES = ["en", "vi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"];

function buildFixture() {
  document.body.innerHTML = FIXTURE_IDS.map((id) => {
    if (id === "apiModel") return `<select id="${id}"></select>`;
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
});
