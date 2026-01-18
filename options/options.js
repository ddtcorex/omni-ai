import { getStats, resetStats } from "../lib/history.js";

/**
 * Omni AI - Options Page Script
 * Handles settings UI and storage
 */

// DOM Elements
const elements = {
  apiKey: document.getElementById("apiKey"),
  apiModel: document.getElementById("apiModel"),
  toggleApiKey: document.getElementById("toggleApiKey"),
  defaultPreset: document.getElementById("defaultPreset"),
  defaultLanguage: document.getElementById("defaultLanguage"),
  autoClose: document.getElementById("autoClose"),
  showNotifications: document.getElementById("showNotifications"),
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

// ...

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      "apiKey",
      "apiModel",
      "currentPreset",
      "defaultLanguage",
      "settings",
    ]);

    // API Key
    if (result.apiKey) {
      elements.apiKey.value = result.apiKey;
    }

    // API Model
    if (result.apiModel) {
      elements.apiModel.value = result.apiModel;
    } else {
      elements.apiModel.value = "gemini-1.5-flash"; // Default
    }

    // Default Preset
    if (result.currentPreset) {
      elements.defaultPreset.value = result.currentPreset;
    }

    // Default Language
    if (result.defaultLanguage) {
      elements.defaultLanguage.value = result.defaultLanguage;
    }

    // Settings
    if (result.settings) {
      elements.autoClose.checked = result.settings.autoClose || false;
      elements.showNotifications.checked =
        result.settings.showNotifications !== false;
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
      apiModel: elements.apiModel.value,
      currentPreset: elements.defaultPreset.value,
      defaultLanguage: elements.defaultLanguage.value,
      settings: {
        autoClose: elements.autoClose.checked,
        showNotifications: elements.showNotifications.checked,
      },
    };

    await chrome.storage.local.set(settings);

    showSaveStatus(chrome.i18n.getMessage("settings_saved"), "success");
    console.log("[Omni AI] Settings saved:", settings);
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
