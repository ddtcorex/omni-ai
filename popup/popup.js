/**
 * Omni AI - Popup Script
 * Handles UI interactions, authentication, and communicates with the service worker
 */

import { initTheme } from "../lib/theme-manager.js";
import { i18n } from "../lib/i18n.js";

// DOM Elements
const elements = {
  // Quick Ask
  quickAskInput: document.getElementById("quickAskInput"),
  askBtn: document.getElementById("askBtn"),
  settingsBtn: document.getElementById("settingsBtn"),

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
};

// State

let isProcessing = false;
let currentUser = null;

/**
 * Initialize popup
 */
async function init() {
  await i18n.init();
  await initTheme(); // Initialize theme
  localizeDOM();
  setupEventListeners();
  await loadAuthState();
  focusInput();
}

/**
 * Localize the DOM
 */
function localizeDOM() {
  // Localize specific attributes
  document.title = i18n.getMessage("popup_title");
  if (elements.quickAskInput) {
    elements.quickAskInput.placeholder = i18n.getMessage("popup_quickAsk");
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
        return i18n.getMessage(key) || match;
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
          return i18n.getMessage(key) || match;
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
    updateStatus(i18n.getMessage("status_processing"), "processing");

    const response = await chrome.runtime.sendMessage({ type: "SIGN_IN" });

    if (response.success) {
      setSignedInState(response.user);
      updateStatus(i18n.getMessage("status_ready"), "success");
    } else {
      updateStatus(i18n.getMessage("status_error"), "error");
      console.error("Sign in failed:", response.error);
    }
  } catch (error) {
    console.error("Sign in error:", error);
    updateStatus(i18n.getMessage("status_error"), "error");
  }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    closeUserDropdown();
    updateStatus(i18n.getMessage("status_processing"), "processing");

    const response = await chrome.runtime.sendMessage({ type: "SIGN_OUT" });

    if (response.success) {
      setSignedOutState();
      updateStatus(i18n.getMessage("status_ready"), "success");
    } else {
      updateStatus(i18n.getMessage("status_error"), "error");
      console.error("Sign out failed:", response.error);
    }
  } catch (error) {
    console.error("Sign out error:", error);
    updateStatus(i18n.getMessage("status_error"), "error");
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
      payload: { query },
    });

    if (response.success) {
      updateStatus(i18n.getMessage("status_ready"), "success");

      // Update result section with actual response
      showResultSection(response.data.response || response.data, false);
    } else {
      updateStatus(i18n.getMessage("status_error"), "error");
      showResultSection(
        i18n.getMessage("error_prefix") + (response.error || "Unknown error"),
        false,
      );
      console.error("Quick Ask failed:", response.error);
    }
  } catch (error) {
    console.error("Quick Ask error:", error);
    updateStatus(i18n.getMessage("status_error"), "error");
    showResultSection(i18n.getMessage("error_prefix") + error.message, false);
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

  const btn = elements.askBtn;
  if (processing) {
    if (!btn.dataset.original) {
      btn.dataset.original = btn.innerHTML;
    }
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
    `;
  } else {
    if (btn.dataset.original) {
      btn.innerHTML = btn.dataset.original;
      delete btn.dataset.original;
    }
  }
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
 * Focus input on popup open
 */
function focusInput() {
  setTimeout(() => elements.quickAskInput.focus(), 100);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
// ============================================
// Result Section Functions
// ============================================

/**
 * Show result section
 */
function showResultSection(resultText, isLoading = false) {
  const resultContent = elements.resultContent;

  if (!elements.quickAskResult || !resultContent) return;

  // Show section
  elements.quickAskResult.classList.remove("hidden");
  elements.quickAskResult.classList.add("visible");

  if (isLoading) {
    resultContent.classList.add("loading");
    resultContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid var(--accent-purple); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>${i18n.getMessage("status_processing")}</span>
      </div>
    `;
  } else {
    resultContent.classList.remove("loading");
    resultContent.textContent = resultText;
  }
}
