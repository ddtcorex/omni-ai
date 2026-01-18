import { getStats, resetStats } from "../lib/history.js";

/**
 * Omni AI - Options Page Script
 * Handles settings UI and storage
 */

// DOM Elements
const elements = {
  apiKey: document.getElementById("apiKey"),
  apiModel: document.getElementById("apiModel"),
  geminiKeyGroup: document.getElementById("geminiKeyGroup"),
  groqApiKey: document.getElementById("groqApiKey"),
  groqKeyGroup: document.getElementById("groqKeyGroup"),
  antigravityInfoGroup: document.getElementById("antigravityInfoGroup"),
  antigravityToken: document.getElementById("antigravityToken"),
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

// State
let isApiKeyVisible = false;

/**
 * Initialize options page
 */
async function init() {
  localizeDOM();
  await loadSettings();
  await loadStats();
  setupEventListeners();
  updateModelVisibility(); // Initial check
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
    elements.apiModel,
    elements.defaultPreset,
    elements.defaultLanguage,
    elements.autoClose,
    elements.showNotifications,
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
  const model = elements.apiModel.value;

  // Hide all by default
  if (elements.geminiKeyGroup) elements.geminiKeyGroup.classList.add("hidden");
  if (elements.groqKeyGroup) elements.groqKeyGroup.classList.add("hidden");
  if (elements.antigravityInfoGroup)
    elements.antigravityInfoGroup.classList.add("hidden");

  // Show based on selection
  if (model.startsWith("groq-")) {
    if (elements.groqKeyGroup) elements.groqKeyGroup.classList.remove("hidden");
  } else if (model.startsWith("antigravity-")) {
    if (elements.antigravityInfoGroup)
      elements.antigravityInfoGroup.classList.remove("hidden");
  } else {
    // Default to Gemini (or explicit "gemini-")
    if (elements.geminiKeyGroup)
      elements.geminiKeyGroup.classList.remove("hidden");
  }
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      "apiKey",
      "apiKey",
      "groqApiKey",
      "antigravityToken",
      "apiModel",
      "currentPreset",
      "defaultLanguage",
      "settings",
    ]);

    // API Key
    if (result.apiKey) elements.apiKey.value = result.apiKey;

    // Groq API Key
    if (result.groqApiKey) elements.groqApiKey.value = result.groqApiKey;

    // Antigravity Token
    if (result.antigravityToken)
      elements.antigravityToken.value = result.antigravityToken;

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
      groqApiKey: elements.groqApiKey.value.trim(),
      antigravityToken: elements.antigravityToken.value.trim(),
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
