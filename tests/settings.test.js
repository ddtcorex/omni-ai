const FIXTURE_IDS = [
  "extVersion", "geminiApiKey", "apiModel", "customModelName", "customModelGroup",
  "googleKeyGroup", "groqApiKey", "groqKeyGroup", "openaiApiKey", "openaiKeyGroup",
  "anthropicApiKey", "anthropicKeyGroup", "customGatewayKeyGroup", "customGatewayBaseUrl",
  "customGatewayApiKey", "toggleApiKey", "validateBtn", "validationStatus", "themeSelector",
  "defaultPreset", "showFloatingButton", "primaryLanguage", "defaultLanguage", "shortcutsLink",
  "saveBtn", "saveStatus", "statTotalActions", "statWordsProcessed", "statWordsGenerated",
  "refreshHistory", "clearHistory", "historyList",
];

function buildFixture() {
  document.body.innerHTML = FIXTURE_IDS.map((id) => {
    if (id === "apiModel") return `<select id="${id}"></select>`;
    if (["themeSelector", "defaultPreset", "showFloatingButton", "primaryLanguage", "defaultLanguage"].includes(id)) {
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
});
