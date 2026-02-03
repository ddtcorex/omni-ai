import { getStats, resetStats } from "./lib/history.js";
import { i18n } from "./lib/i18n.js";
import {
  initTheme,
  getThemePreference,
  setThemePreference,
  applyTheme,
} from "./lib/theme-manager.js";
import { AI_PROVIDERS, getProviderByModel } from "./lib/ai-providers.js";

/**
 * Omni AI - Options Page Script
 * Handles settings UI and storage
 */

// DOM Elements
const elements = {
  geminiApiKey: document.getElementById("geminiApiKey"), // Google Key
  apiModel: document.getElementById("apiModel"),
  customModelName: document.getElementById("customModelName"),
  customModelGroup: document.getElementById("customModelGroup"),
  googleKeyGroup: document.getElementById("googleKeyGroup"), // Renamed from geminiKeyGroup to match provider
  groqApiKey: document.getElementById("groqApiKey"),
  groqKeyGroup: document.getElementById("groqKeyGroup"),
  openaiApiKey: document.getElementById("openaiApiKey"),
  openaiKeyGroup: document.getElementById("openaiKeyGroup"),
  ollamaEndpoint: document.getElementById("ollamaEndpoint"),
  ollamaKeyGroup: document.getElementById("ollamaKeyGroup"),
  toggleApiKey: document.getElementById("toggleApiKey"),
  validateBtn: document.getElementById("validateBtn"),
  validationStatus: document.getElementById("validationStatus"),
  // Theme
  themeSelector: document.getElementById("themeSelector"),
  // Preferences
  defaultPreset: document.getElementById("defaultPreset"),
  primaryLanguage: document.getElementById("primaryLanguage"),
  defaultLanguage: document.getElementById("defaultLanguage"),
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
};

// State
let isGeminiKeyVisible = false;

/**
 * Initialize options page
 */
async function init() {
  await i18n.init();
  await initTheme(); // Initialize theme
  localizeDOM();
  populateModelSelect();
  await loadSettings();
  await loadStats();
  setupEventListeners();
  updateModelVisibility(); // Initial check
}

/**
 * Populate AI Models dropdown
 */
function populateModelSelect() {
  const select = elements.apiModel;
  select.innerHTML = ""; // Clear existing

  Object.values(AI_PROVIDERS).forEach((provider) => {
    const group = document.createElement("optgroup");
    group.label = provider.name;

    provider.models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      group.appendChild(option);
    });

    select.appendChild(group);
  });
}

/**
 * Localize the DOM
 */
function localizeDOM() {
  document.title =
    i18n.getMessage("extName") + " - " + i18n.getMessage("settings_title");
  // Localize attributes (title and placeholder)
  const elementsWithAttributes = document.querySelectorAll(
    '[title*="__MSG_"], [placeholder*="__MSG_"]',
  );
  elementsWithAttributes.forEach((el) => {
    ["title", "placeholder"].forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val && val.includes("__MSG_")) {
        el.setAttribute(
          attr,
          val.replace(/__MSG_(\w+)__/g, (match, key) => {
            return i18n.getMessage(key) || match;
          }),
        );
      }
    });
  });

  // Localize text content in body
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (text.includes("__MSG_")) {
      node.nodeValue = text.replace(/__MSG_(\w+)__/g, (match, key) => {
        return i18n.getMessage(key) || match;
      });
    }
  }
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
function setupEventListeners() {
  // Model change listener
  elements.apiModel.addEventListener("change", updateModelVisibility);

  // Theme preview listener
  if (elements.themeSelector) {
    elements.themeSelector.addEventListener("change", (e) => {
      applyTheme(e.target.value);
    });
  }

  // Validate button
  if (elements.validateBtn) {
    elements.validateBtn.addEventListener("click", validateConfiguration);
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
    elements.ollamaEndpoint,
    elements.apiModel,
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
 * Update model visibility based on selection
 */
/**
 * Update model visibility based on selection
 */
function updateModelVisibility() {
  const modelId = elements.apiModel.value;
  const provider = getProviderByModel(modelId);

  // Hide all groups first
  const groups = document.querySelectorAll(".setting-item[data-provider]");
  groups.forEach((el) => el.classList.add("hidden"));

  // Handle Custom Model Input
  if (modelId.endsWith("-custom")) {
    elements.customModelGroup.classList.remove("hidden");
  } else {
    elements.customModelGroup.classList.add("hidden");
  }

  if (provider) {
    // Show matching group based on data-provider attribute
    const activeGroup = document.querySelector(
      `.setting-item[data-provider="${provider.id}"]`,
    );
    if (activeGroup) {
      activeGroup.classList.remove("hidden");
    }
  }
}

/**
 * Validate current configuration
 */
async function validateConfiguration() {
  const modelId = elements.apiModel.value;
  const provider = getProviderByModel(modelId);
  if (!provider) return;

  let validModelId = modelId;

  // Custom Model handling
  if (modelId.endsWith("-custom")) {
    const customName = elements.customModelName.value.trim();
    if (!customName) {
      showValidationStatus(
        i18n.getMessage("settings_errorNoCustomModel"),
        "error",
      );
      return;
    }
    validModelId = customName;
  }

  // Get the Key
  let apiKey = "";
  if (provider.id === "google") {
    apiKey = elements.geminiApiKey.value.trim();
  } else if (provider.id === "groq") {
    apiKey = elements.groqApiKey.value.trim();
  } else if (provider.id === "openai") {
    apiKey = elements.openaiApiKey.value.trim();
  } else if (provider.id === "ollama") {
    apiKey = elements.ollamaEndpoint.value.trim();
  }

  if (!apiKey) {
    showValidationStatus(i18n.getMessage("settings_errorNoApiKey"), "error");
    return;
  }

  showValidationStatus(i18n.getMessage("settings_validating"), "processing");
  setButtonLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "VALIDATE_CONFIG",
      payload: { provider: provider.id, model: validModelId, key: apiKey },
    });

    setButtonLoading(false);

    if (response.success) {
      showValidationStatus(i18n.getMessage("settings_configValid"), "success");
    } else {
      showValidationStatus(
        i18n.getMessage("error_prefix") + response.error,
        "error",
      );
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
    if (svg) svg.classList.add("validate-spinner");
    // Change icon to refresh/spinner
    btn.querySelector("span").textContent =
      i18n.getMessage("settings_checking");
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    const svg = btn.querySelector("svg");
    if (svg) svg.classList.remove("validate-spinner");
    btn.querySelector("span").textContent =
      i18n.getMessage("settings_validate");
  }
}

/**
 * Show validation status
 */
function showValidationStatus(message, type) {
  const el = elements.validationStatus;
  if (!el) return;

  // Reset classes
  el.className = "validation-message visible";
  el.classList.add(type);

  // Icon based on type
  let icon = "";
  if (type === "success")
    icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  else if (type === "error")
    icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  else if (type === "processing")
    icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';

  el.innerHTML = `${icon}<span>${message}</span>`;

  // Auto hide after 5s if success
  if (type === "success") {
    setTimeout(() => {
      el.classList.remove("visible");
    }, 5000);
  }
}

async function loadSettings() {
  try {
    // 1. Load Sync Preferences
    const THEME_KEY = "omni_ai_theme";
    const prefs = await chrome.storage.sync.get([
      "primaryLanguage",
      "defaultLanguage",
      THEME_KEY,
    ]);

    if (elements.themeSelector) {
      elements.themeSelector.value = prefs[THEME_KEY] || "system";
      applyTheme(elements.themeSelector.value);
    }
    if (elements.primaryLanguage)
      elements.primaryLanguage.value = prefs.primaryLanguage || "vi";
    if (elements.defaultLanguage)
      elements.defaultLanguage.value = prefs.defaultLanguage || "en";

    // 2. Load Local AI Config
    const config = await chrome.storage.local.get([
      "geminiApiKey",
      "groqApiKey",
      "openaiApiKey",
      "ollamaEndpoint",
      "apiModel",
      "customModelName",
      "currentPreset",
    ]);

    if (config.geminiApiKey) elements.geminiApiKey.value = config.geminiApiKey;
    if (config.groqApiKey) elements.groqApiKey.value = config.groqApiKey;
    if (config.openaiApiKey) elements.openaiApiKey.value = config.openaiApiKey;
    if (config.customModelName)
      elements.customModelName.value = config.customModelName;

    elements.ollamaEndpoint.value =
      config.ollamaEndpoint || "http://localhost:11434";
    elements.apiModel.value = config.apiModel || "gemini-2.0-flash";
    const validPresets = [
      "professional",
      "casual",
      "friendly",
      "direct",
      "confident",
    ];
    if (config.currentPreset && validPresets.includes(config.currentPreset)) {
      elements.defaultPreset.value = config.currentPreset;
    } else {
      elements.defaultPreset.value = "professional";
    }

    updateModelVisibility();
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const THEME_KEY = "omni_ai_theme";
  try {
    // Preferences to Sync
    const preferences = {
      primaryLanguage: elements.primaryLanguage.value,
      defaultLanguage: elements.defaultLanguage.value,
      [THEME_KEY]: elements.themeSelector.value,
    };
    await chrome.storage.sync.set(preferences);

    // AI Config to Local
    const aiConfig = {
      geminiApiKey: elements.geminiApiKey.value.trim(),
      groqApiKey: elements.groqApiKey.value.trim(),
      openaiApiKey: elements.openaiApiKey.value.trim(),
      ollamaEndpoint: elements.ollamaEndpoint.value.trim(),
      apiModel: elements.apiModel.value,
      customModelName: elements.customModelName.value.trim(),
      currentPreset: elements.defaultPreset.value,
    };
    await chrome.storage.local.set(aiConfig);

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
  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color =
    type === "success" ? "var(--success)" : "var(--error)";
  elements.saveStatus.classList.add("visible");

  setTimeout(() => {
    elements.saveStatus.classList.remove("visible");
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
