/**
 * Omni AI - Popup Script
 * Handles UI interactions, authentication, and communicates with the service worker
 */

import { initTheme } from "../lib/theme-manager.js";

// DOM Elements
const elements = {
  // Quick Ask
  quickAskInput: document.getElementById("quickAskInput"),
  askBtn: document.getElementById("askBtn"),
  settingsBtn: document.getElementById("settingsBtn"),

  // Presets & Actions
  presetChips: document.querySelectorAll(".preset-chip"),
  actionBtns: document.querySelectorAll(".action-btn"),
  quickActionBtns: document.querySelectorAll(".quick-action-btn"),

  // Status
  status: document.getElementById("status"),

  // Auth
  userSection: document.getElementById("userSection"),
  signInBtn: document.getElementById("signInBtn"),
  userInfo: document.getElementById("userInfo"),
  userAvatar: document.getElementById("userAvatar"),
  userMenuBtn: document.getElementById("userMenuBtn"),
  userDropdown: document.getElementById("userDropdown"),
  dropdownAvatar: document.getElementById("dropdownAvatar"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  signOutBtn: document.getElementById("signOutBtn"),

  // Result Section
  quickAskResult: document.getElementById("quickAskResult"),
  resultContent: document.getElementById("resultContent"),
  resultBackBtn: document.getElementById("resultBackBtn"),
  copyResultBtn: document.getElementById("copyResultBtn"),
  newQuestionBtn: document.getElementById("newQuestionBtn"),
};

// State
let currentPreset = "chat";
let isProcessing = false;
let currentUser = null;

/**
 * Initialize popup
 */
async function init() {
  await initTheme(); // Initialize theme
  localizeDOM();
  setupEventListeners();
  await loadSavedPreset();
  await loadAuthState();
  await updateLanguageLabels();
  focusInput();
}

/**
 * Localize the DOM
 */
function localizeDOM() {
  // Localize specific attributes
  document.title = chrome.i18n.getMessage("popup_title");
  if (elements.quickAskInput) {
    elements.quickAskInput.placeholder =
      chrome.i18n.getMessage("popup_quickAsk");
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

  // Localize attributes (if any, e.g. title)
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

  // Auth events
  elements.signInBtn.addEventListener("click", handleSignIn);
  elements.userMenuBtn.addEventListener("click", toggleUserDropdown);
  elements.signOutBtn.addEventListener("click", handleSignOut);

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!elements.userSection.contains(e.target)) {
      closeUserDropdown();
    }
  });

  // Result section listeners
  elements.resultBackBtn.addEventListener("click", hideResultSection);
  elements.copyResultBtn.addEventListener("click", copyResult);
  elements.newQuestionBtn.addEventListener("click", () => {
    hideResultSection();
    focusInput();
  });
}

// ============================================
// Authentication
// ============================================

/**
 * Load authentication state
 */
async function loadAuthState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_USER" });
    if (response.success && response.user) {
      setSignedInState(response.user);
    } else {
      setSignedOutState();
    }
  } catch (error) {
    console.error("Failed to load auth state:", error);
    setSignedOutState();
  }
}

/**
 * Handle sign in
 */
async function handleSignIn() {
  try {
    updateStatus(chrome.i18n.getMessage("status_processing"), "processing");

    const response = await chrome.runtime.sendMessage({ type: "SIGN_IN" });

    if (response.success) {
      setSignedInState(response.user);
      updateStatus(chrome.i18n.getMessage("status_ready"), "success");
    } else {
      updateStatus(chrome.i18n.getMessage("status_error"), "error");
      console.error("Sign in failed:", response.error);
    }
  } catch (error) {
    console.error("Sign in error:", error);
    updateStatus(chrome.i18n.getMessage("status_error"), "error");
  }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    closeUserDropdown();
    updateStatus(chrome.i18n.getMessage("status_processing"), "processing");

    const response = await chrome.runtime.sendMessage({ type: "SIGN_OUT" });

    if (response.success) {
      setSignedOutState();
      updateStatus(chrome.i18n.getMessage("status_ready"), "success");
    } else {
      updateStatus(chrome.i18n.getMessage("status_error"), "error");
      console.error("Sign out failed:", response.error);
    }
  } catch (error) {
    console.error("Sign out error:", error);
    updateStatus(chrome.i18n.getMessage("status_error"), "error");
  }
}

/**
 * Set UI to signed in state
 */
function setSignedInState(user) {
  currentUser = user;

  // Hide sign in button
  elements.signInBtn.classList.add("hidden");

  // Show user info
  elements.userInfo.classList.remove("hidden");
  elements.userAvatar.src = user.picture || getDefaultAvatar(user.name);
  elements.userAvatar.alt = user.name;

  // Update dropdown
  elements.dropdownAvatar.src = user.picture || getDefaultAvatar(user.name);
  elements.userName.textContent = user.name;
  elements.userEmail.textContent = user.email;
}

/**
 * Set UI to signed out state
 */
function setSignedOutState() {
  currentUser = null;

  // Show sign in button
  elements.signInBtn.classList.remove("hidden");

  // Hide user info
  elements.userInfo.classList.add("hidden");
  closeUserDropdown();
}

/**
 * Toggle user dropdown visibility
 */
function toggleUserDropdown(e) {
  e.stopPropagation();
  elements.userDropdown.classList.toggle("visible");
  elements.userDropdown.classList.toggle("hidden");
}

/**
 * Close user dropdown
 */
function closeUserDropdown() {
  elements.userDropdown.classList.remove("visible");
  elements.userDropdown.classList.add("hidden");
}

/**
 * Get default avatar for user without picture
 */
function getDefaultAvatar(name) {
  const initial = (name || "?").charAt(0).toUpperCase();
  // Return a data URI for a simple avatar
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" fill="#8b5cf6"/>
    <text x="50%" y="50%" dy=".35em" fill="white" font-family="sans-serif" font-size="18" font-weight="600" text-anchor="middle">${initial}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ============================================
// Quick Ask & Actions
// ============================================

/**
 * Handle Quick Ask submission
 */
async function handleQuickAsk() {
  const query = elements.quickAskInput.value.trim();
  if (!query || isProcessing) return;

  setProcessing(true);

  // Immediately show result section with loading state
  showResultSection(null, true);

  // Clear input
  elements.quickAskInput.value = "";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "QUICK_ASK",
      payload: { query, preset: currentPreset },
    });

    if (response.success) {
      updateStatus(chrome.i18n.getMessage("status_ready"), "success");

      // Update result section with actual response
      showResultSection(response.data.response || response.data, false);
    } else {
      updateStatus(chrome.i18n.getMessage("status_error"), "error");
      showResultSection("Error: " + (response.error || "Unknown error"), false);
      console.error("Quick Ask failed:", response.error);
    }
  } catch (error) {
    console.error("Quick Ask error:", error);
    updateStatus(chrome.i18n.getMessage("status_error"), "error");
    showResultSection("Error: " + error.message, false);
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
  updateStatus(chrome.i18n.getMessage("status_processing"), "processing");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "WRITING_ACTION",
      payload: { action, preset: currentPreset },
    });

    if (response.success) {
      updateStatus(chrome.i18n.getMessage("status_ready"), "success");
    } else {
      updateStatus(chrome.i18n.getMessage("status_error"), "error");
      console.error("Action failed:", response.error);
    }
  } catch (error) {
    console.error("Action error:", error);
    updateStatus(chrome.i18n.getMessage("status_error"), "error");
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
  updateStatus(chrome.i18n.getMessage("status_processing"), "processing");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "QUICK_ACTION",
      payload: { action, preset: currentPreset },
    });

    if (response.success) {
      updateStatus(chrome.i18n.getMessage("status_ready"), "success");
    } else {
      updateStatus(chrome.i18n.getMessage("status_error"), "error");
      console.error("Quick action failed:", response.error);
    }
  } catch (error) {
    console.error("Quick action error:", error);
    updateStatus(chrome.i18n.getMessage("status_error"), "error");
  } finally {
    setProcessing(false);
  }
}

// ============================================
// Utilities
// ============================================

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

/**
 * Update translation language labels
 */
async function updateLanguageLabels() {
  const { primaryLanguage = "vi", defaultLanguage = "en" } =
    await chrome.storage.local.get(["primaryLanguage", "defaultLanguage"]);

  const languageNames = {
    en: "English",
    vi: "Vietnamese",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
  };

  const primaryName = languageNames[primaryLanguage] || primaryLanguage;
  const translationName = languageNames[defaultLanguage] || defaultLanguage;

  const primaryIcon = primaryLanguage === "vi" ? "🇻🇳" : "🌐";
  const translationIcon = "🌎";

  const labelPrimary = document.getElementById("labelTranslatePrimary");
  const labelDefault = document.getElementById("labelTranslateDefault");

  if (labelPrimary)
    labelPrimary.textContent = `${primaryIcon} To ${primaryName}`;
  if (labelDefault)
    labelDefault.textContent = `${translationIcon} To ${translationName}`;
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
// ============================================
// Result Section Functions
// ============================================

/**
 * Show result section with smooth transition
 */
function showResultSection(resultText, isLoading = false) {
  // If already visible, just update content
  if (elements.quickAskResult.classList.contains("visible")) {
    if (isLoading) {
      elements.resultContent.classList.add("loading");
      elements.resultContent.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 16px; height: 16px; border: 2px solid var(--accent-purple); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span>Processing your request...</span>
        </div>
      `;
    } else {
      elements.resultContent.classList.remove("loading");
      elements.resultContent.textContent = resultText;
    }
    return;
  }

  // Set the result content
  if (isLoading) {
    elements.resultContent.classList.add("loading");
    elements.resultContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid var(--accent-purple); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>Processing your request...</span>
      </div>
    `;
  } else {
    elements.resultContent.classList.remove("loading");
    elements.resultContent.textContent = resultText;
  }

  // Show result section immediately (no fade-out of other sections)
  elements.quickAskResult.classList.remove("hidden");

  // Trigger slide-in animation
  setTimeout(() => {
    elements.quickAskResult.classList.add("visible");
  }, 10);
}

/**
 * Hide result section and restore main view
 */
function hideResultSection() {
  // Fade out result
  elements.quickAskResult.classList.remove("visible");

  setTimeout(() => {
    elements.quickAskResult.classList.add("hidden");

    // Show other sections
    const sectionsToShow = [
      document.querySelector(".quick-ask"),
      document.querySelector(".presets"),
      document.querySelector(".actions"),
      document.querySelector(".quick-actions"),
    ];

    sectionsToShow.forEach((section) => {
      if (section) {
        section.classList.remove("hidden");
        section.classList.remove("fading");
      }
    });
  }, 250);
}

/**
 * Copy result to clipboard
 */
async function copyResult() {
  try {
    await navigator.clipboard.writeText(elements.resultContent.textContent);

    // Visual feedback
    const originalText =
      elements.copyResultBtn.querySelector("span").textContent;
    elements.copyResultBtn.querySelector("span").textContent = "Copied!";

    setTimeout(() => {
      elements.copyResultBtn.querySelector("span").textContent = originalText;
    }, 2000);
  } catch (error) {
    console.error("Failed to copy:", error);
  }
}
