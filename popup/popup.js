/**
 * Omni AI - Popup Script
 * Handles UI interactions and communicates with the service worker
 */

// DOM Elements
const elements = {
  quickAskInput: document.getElementById("quickAskInput"),
  askBtn: document.getElementById("askBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  presetChips: document.querySelectorAll(".preset-chip"),
  actionBtns: document.querySelectorAll(".action-btn"),
  quickActionBtns: document.querySelectorAll(".quick-action-btn"),
  status: document.getElementById("status"),
};

// State
let currentPreset = "email";
let isProcessing = false;

/**
 * Initialize popup
 */
function init() {
  setupEventListeners();
  loadSavedPreset();
  focusInput();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Quick Ask
  elements.askBtn.addEventListener("click", handleQuickAsk);
  elements.quickAskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuickAsk();
    }
  });

  // Settings
  elements.settingsBtn.addEventListener("click", openSettings);

  // Preset chips
  elements.presetChips.forEach((chip) => {
    chip.addEventListener("click", () => handlePresetChange(chip));
  });

  // Action buttons
  elements.actionBtns.forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action));
  });

  // Quick action buttons
  elements.quickActionBtns.forEach((btn) => {
    btn.addEventListener("click", () => handleQuickAction(btn.dataset.action));
  });
}

/**
 * Handle Quick Ask submission
 */
async function handleQuickAsk() {
  const query = elements.quickAskInput.value.trim();
  if (!query || isProcessing) return;

  setProcessing(true);
  updateStatus("Processing...", "processing");

  try {
    // Send message to service worker
    const response = await chrome.runtime.sendMessage({
      type: "QUICK_ASK",
      payload: { query, preset: currentPreset },
    });

    if (response.success) {
      updateStatus("Ready", "success");
      elements.quickAskInput.value = "";
    } else {
      updateStatus("Error", "error");
      console.error("Quick Ask failed:", response.error);
    }
  } catch (error) {
    console.error("Quick Ask error:", error);
    updateStatus("Error", "error");
  } finally {
    setProcessing(false);
  }
}

/**
 * Handle preset change
 */
function handlePresetChange(chip) {
  elements.presetChips.forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  currentPreset = chip.dataset.preset;
  savePreset(currentPreset);
}

/**
 * Handle writing action
 */
async function handleAction(action) {
  if (isProcessing) return;

  setProcessing(true);
  updateStatus("Processing...", "processing");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "WRITING_ACTION",
      payload: { action, preset: currentPreset },
    });

    if (response.success) {
      updateStatus("Ready", "success");
    } else {
      updateStatus("Error", "error");
      console.error("Action failed:", response.error);
    }
  } catch (error) {
    console.error("Action error:", error);
    updateStatus("Error", "error");
  } finally {
    setProcessing(false);
  }
}

/**
 * Handle quick action
 */
async function handleQuickAction(action) {
  if (isProcessing) return;

  setProcessing(true);
  updateStatus("Processing...", "processing");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "QUICK_ACTION",
      payload: { action, preset: currentPreset },
    });

    if (response.success) {
      updateStatus("Ready", "success");
    } else {
      updateStatus("Error", "error");
      console.error("Quick action failed:", response.error);
    }
  } catch (error) {
    console.error("Quick action error:", error);
    updateStatus("Error", "error");
  } finally {
    setProcessing(false);
  }
}

/**
 * Open settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Set processing state
 */
function setProcessing(processing) {
  isProcessing = processing;
  document.body.classList.toggle("loading", processing);
}

/**
 * Update status indicator
 */
function updateStatus(text, state = "ready") {
  const statusDot = elements.status.querySelector(".status-dot");
  elements.status.lastChild.textContent = text;

  statusDot.style.background =
    {
      ready: "var(--success)",
      processing: "var(--warning)",
      error: "var(--error)",
      success: "var(--success)",
    }[state] || "var(--success)";
}

/**
 * Save preset to storage
 */
function savePreset(preset) {
  chrome.storage.local.set({ currentPreset: preset });
}

/**
 * Load saved preset from storage
 */
async function loadSavedPreset() {
  try {
    const result = await chrome.storage.local.get("currentPreset");
    if (result.currentPreset) {
      currentPreset = result.currentPreset;
      elements.presetChips.forEach((chip) => {
        chip.classList.toggle("active", chip.dataset.preset === currentPreset);
      });
    }
  } catch (error) {
    console.error("Failed to load preset:", error);
  }
}

/**
 * Focus input on popup open
 */
function focusInput() {
  setTimeout(() => elements.quickAskInput.focus(), 100);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
