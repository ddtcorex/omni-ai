const FIXTURE_IDS = [
  "extVersion",
  "geminiApiKey",
  "apiModel",
  "modelSearch",
  "modelSource",
  "modelRefresh",
  "customModelName",
  "customModelGroup",
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
  "advancedProviderSettings",
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
    if (id === "apiModel") return `<select id="${id}"></select>`;
    if (id === "modelSearch") return `<input id="${id}" />`;
    if (id === "modelSource") return `<div id="${id}"></div>`;
    if (id === "modelRefresh") return `<button id="${id}"></button>`;
    if (id === "advancedProviderSettings")
      return `<details id="${id}"><summary></summary></details>`;
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
    // dynamically imported here, so the listener must be attached explicitly.
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

  it("auto-validates on blur for the Custom Gateway API key field too", async () => {
    jest.useFakeTimers();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    await Settings.loadSettings();
    Settings.setupEventListeners();

    // validateConfiguration() reads the *currently selected* provider off
    // #apiModel, not off whichever input blurred, so the fixture has to be
    // in "Custom Gateway is the active provider, with the other required
    // gateway fields already filled" state for the blur to reach sendMessage.
    document.getElementById("apiModel").value = "custom-gateway";
    document.getElementById("customModelName").value = "my-gateway-model";
    document.getElementById("customGatewayBaseUrl").value = "https://gateway.example.com/v1";

    const keyInput = document.getElementById("customGatewayApiKey");
    keyInput.value = "new-gateway-key";
    keyInput.dispatchEvent(new Event("blur"));
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "VALIDATE_CONFIG" }),
    );
    jest.useRealTimers();
  });

  it("auto-validates on blur for the Custom Gateway base URL field too", async () => {
    jest.useFakeTimers();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    await Settings.loadSettings();
    Settings.setupEventListeners();

    document.getElementById("apiModel").value = "custom-gateway";
    document.getElementById("customModelName").value = "my-gateway-model";

    const urlInput = document.getElementById("customGatewayBaseUrl");
    urlInput.value = "https://gateway.example.com/v1";
    urlInput.dispatchEvent(new Event("blur"));
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "VALIDATE_CONFIG" }),
    );
    jest.useRealTimers();
  });

  it("uses the shared ds-notice class for the validation message, not the old validation-message-only class", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await Settings.loadSettings();

    // Drive validateConfiguration() into its synchronous error branch (no
    // Custom Gateway base URL set) so showValidationStatus() runs without
    // needing to mock chrome.runtime.sendMessage.
    document.getElementById("apiModel").value = "custom-gateway";
    document.getElementById("customModelName").value = "my-gateway-model";
    await Settings.validateConfiguration();

    const el = document.getElementById("validationStatus");
    expect(el.className).toContain("ds-notice");
    expect(el.className).toContain("ds-notice--error");
    expect(el.className).not.toContain("validation-message");
  });

  it("auto-expands Advanced when a -custom model is selected", async () => {
    await Settings.loadSettings();
    Settings.setupEventListeners();
    document.getElementById("apiModel").innerHTML = '<option value="google-custom">x</option>';
    document.getElementById("apiModel").value = "google-custom";
    document.getElementById("apiModel").dispatchEvent(new Event("change"));
    expect(document.getElementById("advancedProviderSettings").open).toBe(true);
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

  describe("picker regressions", () => {
    const liveOpenai = [
      { id: "gpt-5.6-sol", label: "gpt-5.6-sol", createdAt: 2, state: "active", methods: null },
      { id: "gpt-5.7-nova", label: "gpt-5.7-nova", createdAt: 1, state: "active", methods: null },
    ];

    it("selects the fetched counterpart of a shipped saved id instead of blanking the select", () => {
      Settings.renderModelPicker({
        providerId: "openai",
        listed: liveOpenai,
        savedModelId: "openai-gpt-5.6-sol",
        fetchedAt: 1,
      });

      expect(document.getElementById("apiModel").value).toBe("gpt-5.6-sol");
    });

    it("does not pin the saved model inside a provider that does not own it", () => {
      Settings.renderModelPicker({
        providerId: "openai",
        listed: liveOpenai,
        savedModelId: "gemini-3.6-flash",
        fetchedAt: 1,
      });

      const openaiLabels = Array.from(
        document.querySelectorAll("#apiModel optgroup[label='OpenAI'] option"),
      ).map((o) => o.textContent);
      expect(openaiLabels.join(" ")).not.toContain("settings_modelNoLongerOffered");
    });

    it("finds a model past the cap when the search box is used", () => {
      const many = Array.from({ length: 30 }, (_, i) => ({
        id: `gpt-5.${i}-model`,
        label: `gpt-5.${i}-model`,
        createdAt: i,
        state: "active",
        methods: null,
      }));
      Settings.renderModelPicker({
        providerId: "openai",
        listed: many,
        savedModelId: null,
        fetchedAt: 1,
      });

      const input = document.getElementById("modelSearch");
      input.value = "gpt-5.29";
      input.dispatchEvent(new Event("input"));

      expect(Array.from(document.querySelectorAll("#apiModel option")).map((o) => o.value)).toEqual(
        ["gpt-5.29-model"],
      );
    });

    it("writes apiProvider next to apiModel when the picker is saved", async () => {
      Settings.renderModelPicker({
        providerId: "openai",
        listed: liveOpenai,
        savedModelId: "gpt-5.7-nova",
        fetchedAt: 1,
      });
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.sync.get.mockResolvedValue({});

      await Settings.saveSettings();

      const written = {};
      chrome.storage.local.set.mock.calls.forEach(([arg]) => Object.assign(written, arg));
      expect(written.apiModel).toBe("gpt-5.7-nova");
      expect(written.apiProvider).toBe("openai");
    });

    it("refreshes a provider the user switches into, once", async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.runtime.sendMessage.mockReset();
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, models: [], fetchedAt: 1 });
      Settings.renderModelPicker({ providerId: "google", listed: null, savedModelId: null });
      Settings.setupEventListeners();
      document.getElementById("openaiApiKey").value = "sk-test";

      const select = document.getElementById("apiModel");
      select.value = "openai-gpt-5.6-sol";
      select.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const calls = chrome.runtime.sendMessage.mock.calls.filter(([m]) => m.type === "LIST_MODELS");
      expect(calls.some(([m]) => m.payload.provider === "openai")).toBe(true);
    });
  });

  describe("catalog polish", () => {
    beforeEach(() => {
      chrome.runtime.getManifest = jest.fn(() => ({ version: "2.6.0" }));
      chrome.storage.sync.get.mockResolvedValue({});
      window.matchMedia = jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));
      chrome.runtime.sendMessage.mockReset();
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, models: [], fetchedAt: 1 });
    });

    it("keeps an in-progress selection when the picker re-renders", () => {
      Settings.renderModelPicker({
        providerId: "openai",
        listed: null,
        savedModelId: "gemini-3.6-flash",
      });
      const select = document.getElementById("apiModel");
      Settings.setupEventListeners();
      select.value = "openai-gpt-5.6-terra";
      select.dispatchEvent(new Event("change"));

      const input = document.getElementById("modelSearch");
      input.value = "";
      input.dispatchEvent(new Event("input"));

      expect(document.getElementById("apiModel").value).toBe("openai-gpt-5.6-terra");
    });

    it("disables the refresh control when the selected provider has no credential", () => {
      Settings.renderModelPicker({ providerId: "google", listed: null, savedModelId: null });
      expect(document.getElementById("modelRefresh").disabled).toBe(true);

      document.getElementById("geminiApiKey").value = "k";
      Settings.renderModelPicker({ providerId: "google", listed: null, savedModelId: null });
      expect(document.getElementById("modelRefresh").disabled).toBe(false);
    });

    it("says so when the provider catalog was truncated", async () => {
      chrome.storage.local.get.mockResolvedValue({
        apiModel: "gemini-3.6-flash",
        geminiApiKey: "k",
        modelCatalog: { google: { fetchedAt: Date.now(), models: [], truncated: true } },
      });
      await Settings.init();
      expect(document.getElementById("modelSource").textContent).toContain(
        "settings_modelsTruncated",
      );
    });

    it("queues a refresh that arrives while another is in flight", async () => {
      let release;
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.payload.provider === "google") {
          return new Promise((resolve) => {
            release = () => resolve({ success: true, models: [], fetchedAt: 1 });
          });
        }
        return Promise.resolve({ success: true, models: [], fetchedAt: 1 });
      });

      const first = Settings.refreshModelCatalog("google");
      const second = Settings.refreshModelCatalog("openai");
      release();
      await Promise.all([first, second]);

      const providers = chrome.runtime.sendMessage.mock.calls
        .filter(([m]) => m.type === "LIST_MODELS")
        .map(([m]) => m.payload.provider);
      expect(providers).toEqual(["google", "openai"]);
    });
  });

  describe("catalog refresh", () => {
    beforeEach(() => {
      chrome.runtime.getManifest = jest.fn(() => ({ version: "2.6.0" }));
      // Calls accumulate across this file's tests, so count only this test's.
      chrome.runtime.sendMessage.mockReset();
      chrome.storage.sync.get.mockResolvedValue({});
      // init() touches the theme manager, which jsdom does not implement.
      window.matchMedia = jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));
    });

    function storageWith(values) {
      chrome.storage.local.get.mockImplementation(async (keys) => {
        if (typeof keys === "string") return { [keys]: values[keys] };
        if (Array.isArray(keys)) {
          const out = {};
          keys.forEach((key) => {
            if (key in values) out[key] = values[key];
          });
          return out;
        }
        return { ...values };
      });
    }

    it("opening settings with a saved key and no cache fetches exactly one provider", async () => {
      storageWith({ apiModel: "gemini-3.6-flash", geminiApiKey: "k" });
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        models: [],
        truncated: false,
        fetchedAt: 1,
      });

      await Settings.init();

      const calls = chrome.runtime.sendMessage.mock.calls.filter(([m]) => m.type === "LIST_MODELS");
      expect(calls).toHaveLength(1);
      expect(calls[0][0].payload.provider).toBe("google");
    });

    it("opening settings with a fresh cache fetches nothing", async () => {
      storageWith({
        apiModel: "gemini-3.6-flash",
        geminiApiKey: "k",
        modelCatalog: { google: { fetchedAt: Date.now(), models: [], truncated: false } },
      });

      await Settings.init();

      const calls = chrome.runtime.sendMessage.mock.calls.filter(([m]) => m.type === "LIST_MODELS");
      expect(calls).toHaveLength(0);
    });

    it("a key blur that validates also refreshes that provider with the in form key", async () => {
      storageWith({ apiModel: "gemini-3.6-flash" });
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, models: [], fetchedAt: 1 });
      await Settings.init();
      Settings.setupEventListeners();

      const field = document.getElementById("geminiApiKey");
      field.value = "typed";
      field.dispatchEvent(new Event("blur"));
      await new Promise((resolve) => setTimeout(resolve, 600));

      const list = chrome.runtime.sendMessage.mock.calls
        .filter(([m]) => m.type === "LIST_MODELS")
        .pop();
      expect(list[0].payload).toMatchObject({ provider: "google", key: "typed" });
    });

    it("a failed refresh keeps the previous list and shows the notice", async () => {
      storageWith({
        apiModel: "gemini-3.6-flash",
        geminiApiKey: "k",
        modelCatalog: { google: { fetchedAt: 1, models: [], truncated: false } },
      });
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: "boom" });

      await Settings.init();

      expect(document.getElementById("modelSource").dataset.source).toBe("cache");
      expect(document.getElementById("modelSource").textContent).toContain(
        "settings_modelsRefreshFailed",
      );
    });
  });

  describe("model picker", () => {
    it("puts the saved model first in its own provider group", () => {
      Settings.renderModelPicker({
        providerId: "openai",
        listed: [
          {
            id: "gpt-5.7-nova",
            label: "gpt-5.7-nova",
            createdAt: 1,
            state: "active",
            methods: null,
          },
        ],
        savedModelId: "openai-gpt-5.6-sol",
      });

      const options = Array.from(
        document.querySelectorAll("#apiModel optgroup[label='OpenAI'] option"),
      ).map((o) => o.value);

      expect(options[0]).toBe("gpt-5.6-sol");
      expect(options).toContain("gpt-5.7-nova");
    });

    it("filters the options from the search box and says when nothing matches", () => {
      Settings.renderModelPicker({
        providerId: "openai",
        listed: [
          {
            id: "gpt-5.7-nova",
            label: "gpt-5.7-nova",
            createdAt: 1,
            state: "active",
            methods: null,
          },
          { id: "gpt-5.6-sol", label: "gpt-5.6-sol", createdAt: 2, state: "active", methods: null },
        ],
        savedModelId: null,
      });

      const input = document.getElementById("modelSearch");
      input.value = "nova";
      input.dispatchEvent(new Event("input"));
      expect(Array.from(document.querySelectorAll("#apiModel option")).map((o) => o.value)).toEqual(
        ["gpt-5.7-nova"],
      );

      input.value = "zzz";
      input.dispatchEvent(new Event("input"));
      expect(document.getElementById("modelSource").textContent).toContain(
        "settings_modelsNoMatch",
      );
    });

    it("renders the bundled list and marks the source when nothing was fetched", () => {
      Settings.renderModelPicker({ providerId: "google", listed: null, savedModelId: null });
      expect(document.getElementById("modelSource").dataset.source).toBe("bundled");
    });
  });
});
