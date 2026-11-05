import { getStats, resetStats } from "./lib/history.js";
import { i18n } from "./lib/i18n.js";
import {
  initTheme,
  applyTheme,
  getThemePreference,
  setThemePreference,
} from "./lib/theme-manager.js";
import { AI_PROVIDERS, getApiModelName, DEFAULT_MODEL } from "./lib/ai-providers.js";
import { selectionFromStored } from "./lib/model-selection.js";
import {
  getSyncPreferences,
  setSyncPreferences,
  getLocalAiConfig,
  setLocalAiConfig,
  getSettingsBag,
} from "./lib/storage.js";
import { buildLanguageOptionGroups, LANGUAGES } from "./lib/languages.js";
import { renderNotice } from "./lib/notice.js";

/**
 * Omni AI: Options Page Script
 * Handles settings UI and storage
 */

// DOM Elements
const elements = {
  extVersion: document.getElementById("extVersion"),
  geminiApiKey: /** @type {HTMLInputElement} */ (document.getElementById("geminiApiKey")), // Google Key
  providerPicker: document.getElementById("providerPicker"),
  modelPicker: document.getElementById("modelPicker"),
  modelHint: document.getElementById("modelHint"),
  modelFilter: /** @type {HTMLInputElement|null} */ (document.getElementById("modelFilter")),
  modelFilterRow: document.getElementById("modelFilterRow"),
  modelMore: /** @type {HTMLButtonElement|null} */ (document.getElementById("modelMore")),
  modelShown: document.getElementById("modelShown"),
  keyStatus: document.getElementById("keyStatus"),
  keyStatusRow: document.getElementById("keyStatusRow"),
  modelRefresh: /** @type {HTMLButtonElement|null} */ (document.getElementById("modelRefresh")),
  customModelName: /** @type {HTMLInputElement} */ (document.getElementById("customModelName")),
  googleKeyGroup: document.getElementById("googleKeyGroup"), // Renamed from geminiKeyGroup to match provider
  groqApiKey: /** @type {HTMLInputElement} */ (document.getElementById("groqApiKey")),
  groqKeyGroup: document.getElementById("groqKeyGroup"),
  openaiApiKey: /** @type {HTMLInputElement} */ (document.getElementById("openaiApiKey")),
  openaiKeyGroup: document.getElementById("openaiKeyGroup"),
  anthropicApiKey: /** @type {HTMLInputElement} */ (document.getElementById("anthropicApiKey")),
  anthropicKeyGroup: document.getElementById("anthropicKeyGroup"),
  customGatewayKeyGroup: document.getElementById("customGatewayKeyGroup"),
  customGatewayBaseUrl: /** @type {HTMLInputElement} */ (
    document.getElementById("customGatewayBaseUrl")
  ),
  customGatewayApiKey: /** @type {HTMLInputElement} */ (
    document.getElementById("customGatewayApiKey")
  ),
  toggleApiKey: document.getElementById("toggleApiKey"),
  validateBtn: /** @type {HTMLButtonElement} */ (document.getElementById("validateBtn")),
  validationStatus: document.getElementById("validationStatus"),
  // Theme
  themeSelector: /** @type {HTMLSelectElement} */ (document.getElementById("themeSelector")),
  // Preferences
  defaultPreset: /** @type {HTMLSelectElement} */ (document.getElementById("defaultPreset")),
  showFloatingButton: /** @type {HTMLSelectElement} */ (
    document.getElementById("showFloatingButton")
  ),
  primaryLanguage: /** @type {HTMLSelectElement} */ (document.getElementById("primaryLanguage")),
  defaultLanguage: /** @type {HTMLSelectElement} */ (document.getElementById("defaultLanguage")),
  shortcutsLink: document.getElementById("shortcutsLink"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),

  // History Stats
  statTotalActions: document.getElementById("statTotalActions"),
  statWordsProcessed: document.getElementById("statWordsProcessed"),
  statWordsGenerated: document.getElementById("statWordsGenerated"),
  refreshHistoryBtn: document.getElementById("refreshHistory"),
  clearHistoryBtn: document.getElementById("clearHistory"),
  historyList: document.getElementById("historyList"),
  flashActionsList: document.getElementById("flashActionsList"),
};

// State
let isGeminiKeyVisible = false;

// For detecting a first-time user's default Primary Language, not for the
// Settings UI's own display locale (that's UI_LOCALE_CODES, a different,
// narrower list): primaryLanguage is a translation target, so a browser UI
// language with no shipped _locales/ directory (e.g. Amharic) should still be
// recognized if it's one of the 43 translation languages.
const SUPPORTED_LOCALES = LANGUAGES.map((language) => language.code);

// Flash Actions: shown on hovering the floating quick-action icon, so common
// actions can run without opening the full quick-action menu.
const DEFAULT_FLASH_ACTIONS = ["smart_translate", "rephrase", "grammar"];
const MAX_FLASH_ACTIONS = 4;

/**
 * Disable unchecked flash-action checkboxes once MAX_FLASH_ACTIONS are
 * checked, so the floating icon's hover row can't grow unbounded; re-enable
 * them once the count drops back under the cap.
 */
function updateFlashActionCap() {
  if (!elements.flashActionsList) return;
  /** @type {HTMLInputElement[]} */
  const boxes = Array.from(elements.flashActionsList.querySelectorAll("[data-flash-action]"));
  const checkedCount = boxes.filter((box) => box.checked).length;
  boxes.forEach((box) => {
    box.disabled = !box.checked && checkedCount >= MAX_FLASH_ACTIONS;
  });
}

/**
 * Map a browser UI-language tag to one of this extension's supported locales.
 * @param {string|undefined} uiLanguage - e.g. "pt-BR", from chrome.i18n.getUILanguage()
 * @param {string[]} supported - supported locale codes
 * @param {string} fallback - locale to use when nothing matches
 */
export function detectSupportedLocale(uiLanguage, supported, fallback) {
  if (!uiLanguage) return fallback;
  const primary = uiLanguage.split("-")[0].toLowerCase();
  return supported.includes(primary) ? primary : fallback;
}

/**
 * Initialize options page
 */
export async function init() {
  if (elements.extVersion)
    elements.extVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  await i18n.init();
  await initTheme(); // Initialize theme
  localizeDOM();
  await loadSettings();
  await loadStats();
  setupEventListeners();
}

/**
 * The AI provider card: provider, its credentials, then a model.
 *
 * `selection` is what the card shows right now; nothing reaches storage
 * before Save. `drafts` keeps each provider's own choice for this page's
 * lifetime, so switching away and back restores it.
 */
/** @type {import("./lib/model-selection.js").Selection} */
let selection = { providerId: null, modelId: null, customName: "" };
/** @type {Map<string, { modelId: string|null, customName: string }>} */
const drafts = new Map();

/**
 * Make a row of role="radio" buttons one tab stop: arrows move the focus,
 * Space and Enter choose.
 * @param {HTMLElement|null} container
 * @param {(button: HTMLElement) => void} onSelect
 */
function bindRadioGroup(container, onSelect) {
  if (!container) return;
  const radios = () =>
    /** @type {HTMLElement[]} */ (Array.from(container.querySelectorAll('[role="radio"]')));
  const items = radios();
  const active = items.find((el) => el.getAttribute("aria-checked") === "true") || items[0];
  items.forEach((el) => (el.tabIndex = el === active ? 0 : -1));
  if (container.dataset.radioBound) return;
  container.dataset.radioBound = "true";
  container.addEventListener("keydown", (event) => {
    const list = radios();
    const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (index < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      list[(index + step + list.length) % list.length].focus();
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onSelect(list[index]);
    }
  });
}

/**
 * @param {string} label
 * @param {boolean} checked
 * @returns {HTMLButtonElement}
 */
function choiceButton(label, checked) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice ds-pill";
  button.setAttribute("role", "radio");
  button.setAttribute("aria-checked", String(checked));
  button.textContent = label;
  return button;
}

/** Render the provider row from the registry. */
function renderProviderPicker() {
  const row = elements.providerPicker;
  if (!row) return;
  row.textContent = "";
  Object.values(AI_PROVIDERS).forEach((provider) => {
    const button = choiceButton(provider.name, provider.id === selection.providerId);
    button.dataset.provider = provider.id;
    button.addEventListener("click", () => selectProvider(provider.id));
    row.appendChild(button);
  });
  bindRadioGroup(row, (button) => selectProvider(button.dataset.provider));
}

/** Remember the shown provider's choice before another one replaces it. */
function keepDraft() {
  if (selection.providerId) {
    drafts.set(selection.providerId, {
      modelId: selection.modelId,
      customName: selection.customName,
    });
  }
}

/**
 * Show a provider: its row checked, its credentials, its models.
 * @param {string} providerId
 */
export function selectProvider(providerId, { focus = true } = {}) {
  if (!AI_PROVIDERS[providerId]) return;
  keepDraft();
  const draft = drafts.get(providerId) || { modelId: null, customName: "" };
  selection = { providerId, modelId: draft.modelId, customName: draft.customName };
  renderProviderPicker();
  if (focus) {
    /** @type {HTMLElement|null|undefined} */ (
      elements.providerPicker?.querySelector(`[data-provider="${providerId}"]`)
    )?.focus({ preventScroll: true });
  }
  showKeyGroup();
  if (elements.customModelName) elements.customModelName.value = selection.customName;
  renderModelArea();
}

/** Show only the selected provider's credential fields. */
function showKeyGroup() {
  document.querySelectorAll(".setting-item[data-provider]").forEach((group) => {
    group.classList.toggle(
      "hidden",
      /** @type {HTMLElement} */ (group).dataset.provider !== selection.providerId,
    );
  });
}

/** The model area for the selected provider. */
function renderModelArea() {
  if (elements.modelHint) {
    elements.modelHint.textContent = selection.providerId
      ? i18n.getMessage(
          selection.providerId === "customGateway"
            ? "settings_modelsEnterGatewayUrl"
            : "settings_modelsEnterKey",
        )
      : i18n.getMessage("settings_modelsChooseProvider");
  }
}

/**
 * Render a language <select> from the shared registry.
 *
 * `pinnedCode` is the value that must stay selected: the registry appends it as
 * an option whenever it is unknown or filtered out, so a saved preference never
 * blanks the select.
 * @param {HTMLSelectElement|null} select
 * @param {string} [query]
 * @param {string} [pinnedCode]
 */
export function populateLanguageSelect(select, query = "", pinnedCode = select?.value || "") {
  if (!select) return;

  select.textContent = "";
  const groups = buildLanguageOptionGroups(query, {
    pinnedCode,
    getMessage: (key) => i18n.getMessage(key),
  });

  /**
   * @param {{ code: string, label: string }} option
   * @returns {HTMLOptionElement}
   */
  const buildOption = (option) => {
    const el = document.createElement("option");
    el.value = option.code;
    el.textContent = option.label;
    return el;
  };

  groups.forEach((group) => {
    if (!group.label) {
      group.options.forEach((option) => select.appendChild(buildOption(option)));
      return;
    }
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.options.forEach((option) => optgroup.appendChild(buildOption(option)));
    select.appendChild(optgroup);
  });

  if (pinnedCode) select.value = pinnedCode;
}

/**
 * Resolve every __MSG_key__ token in a string against the current i18n data.
 * @param {string} template
 * @returns {string}
 */
function resolveMessageTokens(template) {
  return template.replace(/__MSG_(\w+)__/g, (match, key) => i18n.getMessage(key) || match);
}

/**
 * localizeDOM() replaces __MSG_key__ tokens in place, so after the first call
 * the DOM only holds already-resolved text: nothing left for a plain
 * "scan for __MSG_" pass to find. That made a second call (e.g. after Save
 * changes Primary Language) a silent no-op. This cache remembers each
 * element's ORIGINAL token template the first time it's seen, so every later
 * call can still re-resolve it against fresh i18n data.
 * @type {{ attributes: Array<{el: Element, attr: string, template: string}>, textNodes: Array<{node: Text, template: string}> } | null}
 */
let localizationCache = null;

/**
 * Localize the DOM
 */
export function localizeDOM() {
  document.title = i18n.getMessage("extName") + " - " + i18n.getMessage("settings_title");

  if (!localizationCache) {
    localizationCache = { attributes: [], textNodes: [] };

    const elementsWithAttributes = document.querySelectorAll(
      '[title*="__MSG_"], [placeholder*="__MSG_"], [aria-label*="__MSG_"]',
    );
    elementsWithAttributes.forEach((el) => {
      ["title", "placeholder", "aria-label"].forEach((attr) => {
        const val = el.getAttribute(attr);
        if (val && val.includes("__MSG_")) {
          localizationCache.attributes.push({ el, attr, template: val });
        }
      });
    });

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      // @ts-expect-error legacy 4th argument (expandEntityReferences) is ignored by Chromium
      false,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("__MSG_")) {
        localizationCache.textNodes.push({ node, template: node.nodeValue });
      }
    }
  }

  localizationCache.attributes.forEach(({ el, attr, template }) => {
    el.setAttribute(attr, resolveMessageTokens(template));
  });
  localizationCache.textNodes.forEach(({ node, template }) => {
    node.nodeValue = resolveMessageTokens(template);
  });
}

/**
 * Load usage statistics
 */
async function loadStats() {
  try {
    const stats = await getStats();
    elements.statTotalActions.textContent = stats.totalActions || 0;
    elements.statWordsProcessed.textContent = stats.totalWordsProcessed || 0;
    elements.statWordsGenerated.textContent = stats.totalWordsGenerated || 0;

    // Future: Load history list if desired
  } catch (error) {
    console.error("Failed to load stats:", error);
  }
}

/**
 * Set up event listeners
 */
export function setupEventListeners() {
  // A typed model name replaces the buttons' choice for this provider.
  elements.customModelName?.addEventListener("input", () => {
    selection.customName = elements.customModelName.value;
    if (selection.customName.trim()) selection.modelId = null;
    renderModelArea();
  });

  // Theme preview listener
  if (elements.themeSelector) {
    elements.themeSelector.addEventListener("change", (e) => {
      applyTheme(/** @type {HTMLSelectElement} */ (e.target).value);
    });
  }

  // Validate button
  if (elements.validateBtn) {
    elements.validateBtn.addEventListener("click", validateConfiguration);
  }

  // Flash Actions cap: re-evaluate on every checkbox change
  if (elements.flashActionsList) {
    elements.flashActionsList.addEventListener("change", updateFlashActionCap);
  }

  // Toggle API key visibility
  elements.toggleApiKey.addEventListener("click", toggleApiKeyVisibility);

  // Save button
  elements.saveBtn.addEventListener("click", saveSettings);

  // Shortcuts link (handle Chrome extension URLs)
  elements.shortcutsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  // History actions
  elements.refreshHistoryBtn.addEventListener("click", async () => {
    await loadStats();
  });

  elements.clearHistoryBtn.addEventListener("click", async () => {
    if (confirm(i18n.getMessage("settings_confirmClearHistory"))) {
      await resetStats();
      await loadStats();
    }
  });

  // Auto-save on change (optional)
  const inputs = [
    elements.geminiApiKey,
    elements.groqApiKey,
    elements.openaiApiKey,
    elements.anthropicApiKey,
    elements.customGatewayBaseUrl,
    elements.customGatewayApiKey,
    elements.defaultPreset,
    elements.primaryLanguage,
    elements.defaultLanguage,
  ];

  inputs.forEach((input) => {
    if (input)
      input.addEventListener("change", () => {
        // Debounce auto-save if desired
      });
  });
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  isGeminiKeyVisible = !isGeminiKeyVisible;
  elements.geminiApiKey.type = isGeminiKeyVisible ? "text" : "password";

  // Update icon
  const svg = elements.toggleApiKey.querySelector("svg");
  if (isGeminiKeyVisible) {
    svg.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    svg.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

/**
 * Validate current configuration
 */
export async function validateConfiguration() {
  const provider = selection.providerId ? AI_PROVIDERS[selection.providerId] : null;
  if (!provider) return;

  const customName = selection.customName.trim();
  const validModelId =
    customName ||
    (selection.modelId ? getApiModelName(selection.modelId) || selection.modelId : "");
  if (!validModelId) {
    showValidationStatus(i18n.getMessage("settings_errorChooseModel"), "error");
    return;
  }

  // Get the Key and extra config for Custom Gateway
  let apiKey = "";
  let baseUrl = "";

  if (provider.id === "google") {
    apiKey = elements.geminiApiKey.value.trim();
  } else if (provider.id === "groq") {
    apiKey = elements.groqApiKey.value.trim();
  } else if (provider.id === "openai") {
    apiKey = elements.openaiApiKey.value.trim();
  } else if (provider.id === "anthropic") {
    apiKey = elements.anthropicApiKey.value.trim();
  } else if (provider.id === "customGateway") {
    apiKey = elements.customGatewayApiKey.value.trim();
    baseUrl = elements.customGatewayBaseUrl.value.trim();

    if (!baseUrl) {
      showValidationStatus(i18n.getMessage("settings_errorNoGatewayUrl"), "error");
      return;
    }
  }

  if (!apiKey && provider.id !== "customGateway") {
    showValidationStatus(i18n.getMessage("settings_errorNoApiKey"), "error");
    return;
  }

  showValidationStatus(i18n.getMessage("settings_validating"), "processing");
  setButtonLoading(true);

  try {
    const payload = { provider: provider.id, model: validModelId, key: apiKey };
    if (provider.id === "customGateway") {
      payload.baseUrl = baseUrl;
    }
    const response = await chrome.runtime.sendMessage({
      type: "VALIDATE_CONFIG",
      payload,
    });

    setButtonLoading(false);

    if (response.success) {
      showValidationStatus(i18n.getMessage("settings_configValid"), "success");
    } else {
      // The icon and colour already say it failed; the provider's words follow.
      showValidationStatus(response.error, "error");
    }
  } catch (err) {
    setButtonLoading(false);
    showValidationStatus(
      `${i18n.getMessage("settings_connectionFailed")}: ${err.message}`,
      "error",
    );
  }
}

/**
 * Set button loading state
 */
function setButtonLoading(isLoading) {
  const btn = elements.validateBtn;
  if (!btn) return;

  if (isLoading) {
    btn.classList.add("loading");
    btn.disabled = true;
    const svg = btn.querySelector("svg");
    if (svg) svg.classList.add("ds-spin-icon");
    // Change icon to refresh/spinner
    btn.querySelector("span").textContent = i18n.getMessage("settings_checking");
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    const svg = btn.querySelector("svg");
    if (svg) svg.classList.remove("ds-spin-icon");
    btn.querySelector("span").textContent = i18n.getMessage("settings_validate");
  }
}

/**
 * Show validation status
 */
function showValidationStatus(message, type) {
  // One notice shape everywhere, and the provider's text is set as text.
  renderNotice(elements.validationStatus, type, message);
}

export async function loadSettings() {
  try {
    // 1. Load Sync Preferences
    const currentTheme = await getThemePreference();
    /** @type {Record<string, any>} */
    const prefs = await getSyncPreferences();

    if (elements.themeSelector) {
      elements.themeSelector.value = currentTheme;
      applyTheme(elements.themeSelector.value);
    }
    const detectedLocale = detectSupportedLocale(
      chrome.i18n.getUILanguage(),
      SUPPORTED_LOCALES,
      "en",
    );
    // Render the language pickers from the shared registry right before the
    // saved value is applied, the same order populateModelSelect() uses, so a
    // saved code the registry does not know still gets an option to land on.
    const desiredPrimaryLanguage = prefs.primaryLanguage || detectedLocale;
    const desiredDefaultLanguage = prefs.defaultLanguage || "en";
    if (elements.primaryLanguage) {
      populateLanguageSelect(elements.primaryLanguage, "", desiredPrimaryLanguage);
      elements.primaryLanguage.value = desiredPrimaryLanguage;
    }
    if (elements.defaultLanguage) {
      populateLanguageSelect(elements.defaultLanguage, "", desiredDefaultLanguage);
      elements.defaultLanguage.value = desiredDefaultLanguage;
    }

    // 2. Load Local AI Config
    /** @type {Record<string, any>} */
    const config = await getLocalAiConfig();

    if (config.geminiApiKey) elements.geminiApiKey.value = config.geminiApiKey;
    if (config.groqApiKey) elements.groqApiKey.value = config.groqApiKey;
    if (config.openaiApiKey) elements.openaiApiKey.value = config.openaiApiKey;
    if (config.anthropicApiKey) elements.anthropicApiKey.value = config.anthropicApiKey;

    // Custom Gateway config
    if (elements.customGatewayBaseUrl)
      elements.customGatewayBaseUrl.value = config.customGatewayBaseUrl || "";
    if (elements.customGatewayApiKey)
      elements.customGatewayApiKey.value = config.customGatewayApiKey || "";

    // The provider card shows the stored choice. An install that only ever
    // saved a Gemini key runs Gemini's default model, so it shows that.
    const saved = selectionFromStored(
      config.apiModel || !config.geminiApiKey
        ? config
        : { ...config, apiModel: DEFAULT_MODEL, apiProvider: "google" },
    );
    drafts.clear();
    selection = { providerId: null, modelId: null, customName: "" };
    if (saved.providerId) {
      drafts.set(saved.providerId, { modelId: saved.modelId, customName: saved.customName });
      selectProvider(saved.providerId, { focus: false });
    } else {
      renderProviderPicker();
      showKeyGroup();
      renderModelArea();
    }
    const validPresets = ["professional", "casual", "friendly", "direct", "confident"];
    if (config.currentPreset && validPresets.includes(config.currentPreset)) {
      elements.defaultPreset.value = config.currentPreset;
    } else {
      elements.defaultPreset.value = "professional";
    }
    if (elements.showFloatingButton) {
      elements.showFloatingButton.value =
        config.settings?.showFloatingButton === false ? "off" : "on";
    }
    if (elements.flashActionsList) {
      const flashActions = config.settings?.flashActions || DEFAULT_FLASH_ACTIONS;
      elements.flashActionsList.querySelectorAll("[data-flash-action]").forEach((el) => {
        const box = /** @type {HTMLInputElement} */ (el);
        box.checked = flashActions.includes(box.dataset.flashAction);
      });
      updateFlashActionCap();
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

/**
 * Save settings to storage
 */
export async function saveSettings() {
  try {
    // Preferences to Sync
    const preferences = {
      primaryLanguage: elements.primaryLanguage.value,
      defaultLanguage: elements.defaultLanguage.value,
    };
    await setSyncPreferences(preferences);
    await setThemePreference(elements.themeSelector.value);

    // AI Config to Local
    /** @type {Record<string, any>} */
    const existingLocalSettings = await getSettingsBag();
    const aiConfig = {
      geminiApiKey: elements.geminiApiKey.value.trim(),
      groqApiKey: elements.groqApiKey.value.trim(),
      openaiApiKey: elements.openaiApiKey.value.trim(),
      anthropicApiKey: elements.anthropicApiKey.value.trim(),
      currentPreset: elements.defaultPreset.value,
      customGatewayBaseUrl: elements.customGatewayBaseUrl.value.trim(),
      customGatewayApiKey: elements.customGatewayApiKey.value.trim(),
      settings: {
        ...(existingLocalSettings || {}),
        showFloatingButton: elements.showFloatingButton?.value !== "off",
        flashActions: elements.flashActionsList
          ? /** @type {HTMLInputElement[]} */ (
              Array.from(elements.flashActionsList.querySelectorAll("[data-flash-action]"))
            )
              .filter((box) => box.checked)
              .map((box) => box.dataset.flashAction)
          : (existingLocalSettings?.flashActions ?? DEFAULT_FLASH_ACTIONS),
      },
    };

    await setLocalAiConfig(aiConfig);

    // Primary Language may have just changed: re-run i18n and re-localize
    // this page's own UI immediately (content.js's onPrimaryLanguageChanged
    // listener already handles it for other open tabs' overlays).
    await i18n.init();
    localizeDOM();
    if (elements.primaryLanguage) {
      populateLanguageSelect(elements.primaryLanguage, "", preferences.primaryLanguage);
    }
    if (elements.defaultLanguage) {
      populateLanguageSelect(elements.defaultLanguage, "", preferences.defaultLanguage);
    }

    showSaveStatus(i18n.getMessage("settings_saved"), "success");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showSaveStatus(i18n.getMessage("settings_failedToSave"), "error");
  }
}

/**
 * Show save status message
 */
function showSaveStatus(message, type = "success") {
  renderNotice(elements.saveStatus, type === "success" ? "success" : "error", message);

  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    elements.saveStatus.classList.remove("visible");
  }, 3000);
}

let saveStatusTimer;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
