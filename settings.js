import { getStats, resetStats } from "./lib/history.js";
import { initTheme, getThemePreference, setThemePreference, applyTheme } from "./lib/theme-manager.js";
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
  toggleApiKey: document.getElementById("toggleApiKey"),
  validateBtn: document.getElementById("validateBtn"),
  validationStatus: document.getElementById("validationStatus"),
  // Theme
  themeSelector: document.getElementById("themeSelector"),
  // Preferences
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
  select.innerHTML = ''; // Clear existing

  Object.values(AI_PROVIDERS).forEach(provider => {
    const group = document.createElement('optgroup');
    group.label = provider.name;
    
    provider.models.forEach(model => {
      const option = document.createElement('option');
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
  const modelId = elements.apiModel.value;
  const provider = getProviderByModel(modelId);

  // Hide all groups first
  const groups = document.querySelectorAll('.setting-item[data-provider]');
  groups.forEach(el => el.classList.add('hidden'));

  if (provider) {
    // Show matching group based on data-provider attribute
    const activeGroup = document.querySelector(`.setting-item[data-provider="${provider.id}"]`);
    if (activeGroup) {
      activeGroup.classList.remove('hidden');
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
  let apiKey = '';
  if (provider.id === 'google') {
    apiKey = elements.apiKey.value.trim();
  } else if (provider.id === 'groq') {
    apiKey = elements.groqApiKey.value.trim();
  }

  if (!apiKey) {
    showValidationStatus('Please enter an API Key first.', 'error');
    return;
  }

  showValidationStatus('Validating...', 'processing');

  try {
    const response = await chrome.runtime.sendMessage({
      type: "VALIDATE_CONFIG",
      payload: { provider: provider.id, model: modelId, key: apiKey }
    });

    if (response.success) {
      showValidationStatus('Configuration is valid! ✅', 'success');
    } else {
      showValidationStatus(`Error: ${response.error}`, 'error');
    }
  } catch (err) {
    showValidationStatus(`Connection check failed: ${err.message}`, 'error');
  }
}

/**
 * Show validation status
 */
function showValidationStatus(message, type) {
  const el = elements.validationStatus;
  if (!el) return;
  el.textContent = message;
  
  if (type === 'processing') {
    el.style.color = 'var(--text-secondary)';
  } else if (type === 'success') {
    el.style.color = 'var(--success)';
  } else {
    el.style.color = 'var(--error)';
  }
  
  el.classList.add('visible');
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      "apiKey",
      "groqApiKey",
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
      apiModel: elements.apiModel.value,
      currentPreset: elements.defaultPreset.value,
      defaultLanguage: elements.defaultLanguage.value,
      settings: {
        autoClose: elements.autoClose.checked,
        showNotifications: elements.showNotifications.checked,
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
