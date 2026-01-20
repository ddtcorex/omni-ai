import { getStats, resetStats } from "./lib/history.js";
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
  apiKey: document.getElementById("apiKey"), // Google Key
  apiModel: document.getElementById("apiModel"),
  googleKeyGroup: document.getElementById("googleKeyGroup"), // Renamed from geminiKeyGroup to match provider
  groqApiKey: document.getElementById("groqApiKey"),
  groqKeyGroup: document.getElementById("groqKeyGroup"),
  openaiApiKey: document.getElementById("openaiApiKey"),
  openaiKeyGroup: document.getElementById("openaiKeyGroup"),
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
let isApiKeyVisible = false;

/**
 * Initialize options page
 */
async function init() {
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
  document.title = chrome.i18n.getMessage("settings_title") + " - Omni AI";
  if (elements.apiKey) {
    elements.apiKey.placeholder = "Enter your Gemini API key..."; // Or localize
  }

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
        return chrome.i18n.getMessage(key) || match;
      });
    }
  }

  // Localize attributes
  const elementsWithAttributes = document.querySelectorAll('[title*="__MSG_"]');
  elementsWithAttributes.forEach((el) => {
    const title = el.getAttribute("title");
    if (title && title.includes("__MSG_")) {
      el.setAttribute(
        "title",
        title.replace(/__MSG_(\w+)__/g, (match, key) => {
          return chrome.i18n.getMessage(key) || match;
        }),
      );
    }
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
    if (confirm("Are you sure you want to clear all usage history?")) {
      await resetStats();
      await loadStats();
    }
  });

  // Auto-save on change (optional)
  const inputs = [
    elements.apiKey,
    elements.groqApiKey,
    elements.openaiApiKey,
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
  isApiKeyVisible = !isApiKeyVisible;
  elements.apiKey.type = isApiKeyVisible ? "text" : "password";

  // Update icon
  const svg = elements.toggleApiKey.querySelector("svg");
  if (isApiKeyVisible) {
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
function updateModelVisibility() {
  const modelId = elements.apiModel.value;
  const provider = getProviderByModel(modelId);

  // Hide all groups first
  const groups = document.querySelectorAll(".setting-item[data-provider]");
  groups.forEach((el) => el.classList.add("hidden"));

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

  // Get the Key
  let apiKey = "";
  if (provider.id === "google") {
    apiKey = elements.apiKey.value.trim();
  } else if (provider.id === "groq") {
    apiKey = elements.groqApiKey.value.trim();
  } else if (provider.id === "openai") {
    apiKey = elements.openaiApiKey.value.trim();
  }

  if (!apiKey) {
    showValidationStatus("Please enter an API Key first.", "error");
    return;
  }

  showValidationStatus("Validating...", "processing");
  setButtonLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "VALIDATE_CONFIG",
      payload: { provider: provider.id, model: modelId, key: apiKey },
    });

    setButtonLoading(false);

    if (response.success) {
      showValidationStatus(
        "Configuration valid! ready to generate.",
        "success",
      );
    } else {
      showValidationStatus(`Error: ${response.error}`, "error");
    }
  } catch (err) {
    setButtonLoading(false);
    showValidationStatus(`Connection check failed: ${err.message}`, "error");
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
    btn.querySelector("span").textContent = "Checking...";
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    const svg = btn.querySelector("svg");
    if (svg) svg.classList.remove("validate-spinner");
    btn.querySelector("span").textContent = "Validate Configuration";
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
    const result = await chrome.storage.local.get([
      "apiKey",
      "groqApiKey",
      "openaiApiKey",
      "apiModel",
      "currentPreset",
      "defaultLanguage",
      "settings",
    ]);

    // Load Theme Preference (from Sync)
    const theme = await getThemePreference();
    if (elements.themeSelector) {
      elements.themeSelector.value = theme;
    }

    // API Key
    if (result.apiKey) elements.apiKey.value = result.apiKey;

    // Groq API Key
    if (result.groqApiKey) elements.groqApiKey.value = result.groqApiKey;

    // OpenAI API Key
    if (result.openaiApiKey) elements.openaiApiKey.value = result.openaiApiKey;

    // API Model
    if (result.apiModel) {
      elements.apiModel.value = result.apiModel;
    } else {
      elements.apiModel.value = "gemini-1.5-flash"; // Default
    }

    // Trigger visibility update
    updateModelVisibility();

    // Default Preset
    if (result.currentPreset)
      elements.defaultPreset.value = result.currentPreset;

    // Primary Language
    if (result.primaryLanguage) {
      elements.primaryLanguage.value = result.primaryLanguage;
    } else {
      elements.primaryLanguage.value = "en"; // Default to English
    }

    // Default Language
    if (result.defaultLanguage) {
      elements.defaultLanguage.value = result.defaultLanguage;
    }

    // Settings
    if (result.settings) {
      // Future settings
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

// ...

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    const settings = {
      apiKey: elements.apiKey.value.trim(),
      groqApiKey: elements.groqApiKey.value.trim(),
      openaiApiKey: elements.openaiApiKey.value.trim(),
      apiModel: elements.apiModel.value,
      currentPreset: elements.defaultPreset.value,
      primaryLanguage: elements.primaryLanguage.value,
      defaultLanguage: elements.defaultLanguage.value,
      settings: {
        // Future settings
      },
    };

    // Save Theme (Sync)
    if (elements.themeSelector) {
      await setThemePreference(elements.themeSelector.value);
    }

    await chrome.storage.local.set(settings);

    showSaveStatus(chrome.i18n.getMessage("settings_saved"), "success");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showSaveStatus("Failed to save", "error");
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
