const FIXTURE_IDS = [
  "extVersion",
  "geminiApiKey",
  "providerPicker",
  "modelPicker",
  "modelHint",
  "modelRefresh",
  "customModelName",
  "googleKeyGroup",
  "groqApiKey",
  "groqKeyGroup",
  "openaiApiKey",
  "openaiKeyGroup",
  "anthropicApiKey",
  "anthropicKeyGroup",
  "customGatewayKeyGroup",
  "customGatewayBaseUrl",
  "customGatewayApiKey",
  "toggleApiKey",
  "validateBtn",
  "validationStatus",
  "themeSelector",
  "defaultPreset",
  "showFloatingButton",
  "primaryLanguage",
  "defaultLanguage",
  "shortcutsLink",
  "saveBtn",
  "saveStatus",
  "statTotalActions",
  "statWordsProcessed",
  "statWordsGenerated",
  "refreshHistory",
  "clearHistory",
  "historyList",
  "flashActionsList",
];

const FLASH_ACTION_IDS = [
  "smart_translate",
  "translate_primary",
  "translate_default",
  "grammar",
  "rephrase",
  "reply",
  "emoji",
  "tone",
  "summarize",
  "explain",
];

function buildFixture() {
  document.body.innerHTML = FIXTURE_IDS.map((id) => {
    if (id === "modelRefresh") return `<button id="${id}"></button>`;
    if (["primaryLanguage", "defaultLanguage"].includes(id)) {
      // The options are rendered from lib/languages.js at runtime, which is
      // exactly what these tests exercise, so the fixture ships an empty select.
      return `<select id="${id}"></select>`;
    }
    if (["themeSelector", "defaultPreset", "showFloatingButton"].includes(id)) {
      return `<select id="${id}"><option value="">-</option></select>`;
    }
    if (
      [
        "geminiApiKey",
        "groqApiKey",
        "openaiApiKey",
        "anthropicApiKey",
        "customGatewayApiKey",
        "customGatewayBaseUrl",
        "customModelName",
      ].includes(id)
    ) {
      // Real inputs, not divs: saveSettings() calls .trim() on these, so a div
      // fixture made every Save click throw after the language had been written.
      return `<input id="${id}" />`;
    }
    // Key groups as settings.html marks them, so updateModelVisibility() can
    // find the group of the selected model's provider.
    const keyGroups = {
      googleKeyGroup: "google",
      groqKeyGroup: "groq",
      openaiKeyGroup: "openai",
      anthropicKeyGroup: "anthropic",
      customGatewayKeyGroup: "customGateway",
    };
    if (keyGroups[id]) {
      return `<div id="${id}" class="setting-item hidden" data-provider="${keyGroups[id]}"></div>`;
    }
    if (id === "flashActionsList") {
      const boxes = FLASH_ACTION_IDS.map(
        (action) => `<label><input type="checkbox" data-flash-action="${action}" /></label>`,
      ).join("\n");
      return `<div id="${id}">${boxes}</div>`;
    }
    if (
      id === "toggleApiKey" ||
      id === "validateBtn" ||
      id === "shortcutsLink" ||
      id === "saveBtn" ||
      id === "refreshHistory" ||
      id === "clearHistory"
    ) {
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

  it("loadSettings auto-detects a translation-only language that has no shipped UI locale", async () => {
    // "am" (Amharic) is one of the 43 translation languages but ships no
    // _locales/am/ directory, so it's absent from UI_LOCALE_CODES. Detecting
    // the default Primary Language must still recognize it: that setting is
    // "your main language for quick actions" (a translation target), not a
    // choice of which locale to display Settings in.
    chrome.i18n.getUILanguage.mockReturnValue("am");
    chrome.storage.sync.get.mockResolvedValue({});
    await Settings.loadSettings();
    expect(document.getElementById("primaryLanguage").value).toBe("am");
  });

  it("loadSettings respects an already-saved primaryLanguage over detection", async () => {
    chrome.i18n.getUILanguage.mockReturnValue("fr-CA");
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "ja" });
    await Settings.loadSettings();
    expect(document.getElementById("primaryLanguage").value).toBe("ja");
  });

  describe("Flash Actions", () => {
    function checkedFlashActions() {
      return Array.from(document.querySelectorAll("[data-flash-action]"))
        .filter((el) => el.checked)
        .map((el) => el.dataset.flashAction)
        .sort();
    }

    it("loadSettings checks the default flash actions when none are saved", async () => {
      chrome.storage.local.get.mockResolvedValue({});
      await Settings.loadSettings();
      expect(checkedFlashActions()).toEqual(["grammar", "rephrase", "smart_translate"].sort());
    });

    it("loadSettings checks exactly the flash actions saved in settings.flashActions", async () => {
      chrome.storage.local.get.mockResolvedValue({
        settings: { flashActions: ["summarize", "explain"] },
      });
      await Settings.loadSettings();
      expect(checkedFlashActions()).toEqual(["explain", "summarize"].sort());
    });

    it("saveSettings persists the checked flash actions into settings.flashActions", async () => {
      chrome.storage.local.get.mockResolvedValue({});
      await Settings.loadSettings();
      Settings.setupEventListeners();

      // saveSettings() reads .value off every provider-key field regardless
      // of which one changed; the fixture only has genuine <input>s for
      // fields an earlier test already covers, so prime the rest here.
      [
        "geminiApiKey",
        "groqApiKey",
        "openaiApiKey",
        "anthropicApiKey",
        "customGatewayApiKey",
        "customModelName",
        "customGatewayBaseUrl",
      ].forEach((id) => {
        document.getElementById(id).value = "";
      });

      document
        .querySelectorAll("[data-flash-action]")
        .forEach((el) => /** @type {HTMLInputElement} */ (el.checked = false));
      document.querySelector('[data-flash-action="tone"]').checked = true;
      document.querySelector('[data-flash-action="emoji"]').checked = true;

      chrome.storage.local.set.mockClear();
      document.getElementById("saveBtn").click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const [savedArg] = chrome.storage.local.set.mock.calls.at(-1);
      expect(savedArg.settings.flashActions.sort()).toEqual(["emoji", "tone"]);
    });

    it("disables the remaining checkboxes once 4 flash actions are checked, and re-enables them when one is unchecked", async () => {
      chrome.storage.local.get.mockResolvedValue({});
      await Settings.loadSettings();
      Settings.setupEventListeners();

      // Default state has 3 checked (rephrase, grammar, smart_translate);
      // checking a 4th should trip the cap.
      const explainBox = /** @type {HTMLInputElement} */ (
        document.querySelector('[data-flash-action="explain"]')
      );
      explainBox.checked = true;
      explainBox.dispatchEvent(new Event("change", { bubbles: true }));

      const boxes = Array.from(document.querySelectorAll("[data-flash-action]"));
      const unchecked = boxes.filter((b) => !(/** @type {HTMLInputElement} */ (b).checked));
      expect(unchecked.every((b) => /** @type {HTMLInputElement} */ (b).disabled)).toBe(true);

      explainBox.checked = false;
      explainBox.dispatchEvent(new Event("change", { bubbles: true }));
      expect(boxes.every((b) => !(/** @type {HTMLInputElement} */ (b).disabled))).toBe(true);
    });
  });
});

describe("language pickers", () => {
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

  it("renders every registry language, grouped into common and all", () => {
    Settings.populateLanguageSelect(document.getElementById("primaryLanguage"));
    const select = document.getElementById("primaryLanguage");
    const groups = Array.from(select.querySelectorAll("optgroup"));
    expect(groups).toHaveLength(2);
    expect(Array.from(select.options)).toHaveLength(43);
  });

  it("keeps a saved code that the registry does not know", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "xx-legacy" });
    await Settings.loadSettings();
    expect(document.getElementById("primaryLanguage").value).toBe("xx-legacy");
  });

  it("saveSettings persists the selected primary and default language", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "ja", defaultLanguage: "en" });
    await Settings.loadSettings();
    Settings.setupEventListeners();
    // A real theme value, so the save path exercises theme persistence
    // instead of throwing on the fixture's empty select.
    document.getElementById("themeSelector").value = "dark";
    document.getElementById("primaryLanguage").value = "vi";

    document.getElementById("saveBtn").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [saved] = chrome.storage.sync.set.mock.calls.at(-1);
    expect(saved.primaryLanguage).toBe("vi");
    expect(saved.defaultLanguage).toBe("en");
  });

  it("re-localizes the page's own UI immediately after Save changes Primary Language, without a reload", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "en", defaultLanguage: "en" });
    await Settings.loadSettings();
    Settings.setupEventListeners();
    document.getElementById("themeSelector").value = "dark";

    // Stand-in for the __MSG_-templated static text settings.html ships;
    // buildFixture()'s minimal DOM has none of its own.
    const probe = document.createElement("span");
    probe.textContent = "__MSG_settings_saved__";
    document.body.appendChild(probe);

    chrome.i18n.getMessage.mockImplementation((key) => `en:${key}`);
    Settings.localizeDOM();
    expect(probe.textContent).toBe("en:settings_saved");

    chrome.i18n.getMessage.mockImplementation((key) => `vi:${key}`);
    document.getElementById("primaryLanguage").value = "vi";
    document.getElementById("saveBtn").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(probe.textContent).toBe("vi:settings_saved");
  });
});

describe("localizeDOM", () => {
  let Settings;

  beforeEach(async () => {
    jest.resetModules();
    buildFixture();
    chrome.i18n.getMessage.mockImplementation((key) => `translated:${key}`);
    Settings = await import("../settings.js");
  });

  it("resolves a __MSG_ token in aria-label, not just title and placeholder", () => {
    const el = document.createElement("input");
    el.setAttribute("aria-label", "__MSG_settings_languageSearchPlaceholder__");
    document.body.appendChild(el);

    Settings.localizeDOM();

    expect(el.getAttribute("aria-label")).toBe("translated:settings_languageSearchPlaceholder");
  });
});
