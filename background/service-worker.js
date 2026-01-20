import { addToHistory } from "../lib/history.js";
import {
  quickAsk,
  improveText,
  translateText,
  explainText,
  summarizeText,
  generateReply,
  emojifyText,
  generateContent,
} from "../lib/ai-service.js";

/**
 * Omni AI - Service Worker
 * Background script handling API calls, context menus, and message passing
 */

// ============================================
// Constants
// ============================================
const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

// ============================================
// Installation & Setup
// ============================================

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    initializeSettings();
    createContextMenus();
  } else if (details.reason === "update") {
  }
});

/**
 * Handle keyboard commands
 */
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "quick_ask") {
    // Open popup not strictly possible via command unless action button,
    // but message sending to content script works
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_QUICK_ASK_OVERLAY" });
    return;
  }

  // Handle other commands via selected text
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "GET_SELECTION",
  });

  if (response?.selection) {
    let action;
    if (command === "quick_fix_grammar") action = "grammar";
    if (command === "quick_rephrase") action = "rephrase";
    if (command === "quick_summarize") action = "summarize";
    if (command === "quick_explain") action = "explain";
    if (command === "quick_translate") action = "translate_default";

    if (action) {
      processSelectedText(tab.id, response.selection, action);
    }
  }
});

/**
 * Initialize default settings
 */
async function initializeSettings() {
  const defaults = {
    apiKey: "",
    currentPreset: "email",
    customPrompts: [],
    // history managed by lib/history.js
    settings: {
      theme: "dark",
      autoClose: false,
      showNotifications: true,
    },
  };

  const existing = await chrome.storage.local.get(null);
  const merged = { ...defaults, ...existing };
  await chrome.storage.local.set(merged);
}

/**
 * Create context menus
 */
function createContextMenus() {
  chrome.contextMenus.create({
    id: "omni-ai-improve",
    title: "Improve with Omni AI",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-explain",
    title: "Explain with Omni AI",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-translate",
    title: "Translate with Omni AI",
    contexts: ["selection"],
  });
}

// ============================================
// Message Handling
// ============================================

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    // Authentication
    case "SIGN_IN":
      handleSignIn()
        .then((user) => sendResponse({ success: true, user }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    case "SIGN_OUT":
      handleSignOut()
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    case "GET_USER":
      getUser()
        .then((user) => sendResponse({ success: true, user }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    // Quick Ask
    case "QUICK_ASK":
      handleQuickAsk(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    case "WRITING_ACTION":
      handleWritingAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    case "QUICK_ACTION":
      handleQuickAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    case "GET_API_KEY":
      getApiKey()
        .then((key) => sendResponse({ success: true, apiKey: key }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
    case "VALIDATE_CONFIG":
      handleValidateConfig(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;

    default:
      sendResponse({ success: false, error: "Unknown message type" });
  }
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = info.selectionText;

  if (!selectedText) return;

  switch (info.menuItemId) {
    case "omni-ai-improve":
      processSelectedText(tab.id, selectedText, "improve");
      break;
    case "omni-ai-explain":
      processSelectedText(tab.id, selectedText, "explain");
      break;
    case "omni-ai-translate":
      processSelectedText(tab.id, selectedText, "translate");
      break;
  }
});

// ============================================
// Authentication Handlers
// ============================================

const USER_INFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * Handle sign in with Google
 */
async function handleSignIn() {
  try {
    const token = await getAuthToken(true);
    if (!token) {
      throw new Error("Failed to get auth token");
    }

    const userInfo = await fetchUserInfo(token);
    await saveUserInfo(userInfo);

    return userInfo;
  } catch (error) {
    console.error("[Omni AI] Sign in failed:", error);
    throw error;
  }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    const token = await getAuthToken(false);

    if (token) {
      // Revoke the token
      await revokeToken(token);
      // Remove the cached token
      await chrome.identity.removeCachedAuthToken({ token });
    }

    // Clear user info from storage
    await chrome.storage.sync.remove("user");
  } catch (error) {
    console.error("[Omni AI] Sign out failed:", error);
    throw error;
  }
}

/**
 * Get current user from storage
 */
async function getUser() {
  const result = await chrome.storage.sync.get("user");
  return result.user || null;
}

/**
 * Get auth token using Chrome Identity API
 */
async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (interactive) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(null);
        }
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Fetch user info from Google API
 */
async function fetchUserInfo(token) {
  const response = await fetch(USER_INFO_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  const data = await response.json();

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    given_name: data.given_name,
    picture: data.picture,
    verified_email: data.verified_email,
  };
}

/**
 * Save user info to storage
 */
async function saveUserInfo(userInfo) {
  await chrome.storage.sync.set({ user: userInfo });
}

/**
 * Revoke an auth token
 */
async function revokeToken(token) {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!response.ok) {
      console.warn("[Omni AI] Token revocation failed:", response.status);
    }
  } catch (error) {
    console.warn("[Omni AI] Token revocation error:", error);
  }
}

// ============================================
// Action Handlers
// ============================================

/**
 * Handle quick ask
 */
async function handleQuickAsk(payload) {
  const { query, preset } = payload;

  const response = await quickAsk(query, preset);

  // Send response to content script if in active tab
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_RESULT",
        payload: {
          action: "quick_ask",
          original: query,
          result: response,
        },
      });
    }
  } catch (e) {}

  // Return response
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await addToHistory({
      action: "quick_ask",
      inputText: query,
      outputText: response,
      preset,
      site: tab?.url || "popup",
    });
  } catch (e) {
    console.error("[Omni AI] Failed to save history:", e);
  }

  return { response };
}

/**
 * Handle writing action
 */
async function handleWritingAction(payload) {
  const { action, preset, text } = payload;

  // Get selected text from active tab if not provided
  let selectedText = text;
  if (!selectedText) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_SELECTION",
      });
      selectedText = response?.selection;
    }
  }

  if (!selectedText) {
    throw new Error("No text selected. Please select some text first.");
  }

  const result = await improveText(selectedText, action, preset);

  // Send result to content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_RESULT",
      payload: {
        action,
        original: selectedText,
        result,
      },
    });
  }

  // Save to history
  try {
    const [historyTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await addToHistory({
      action,
      inputText: selectedText,
      outputText: result,
      preset,
      site: historyTab?.url || "unknown",
    });
  } catch (e) {
    console.error("[Omni AI] Failed to save history:", e);
  }

  return { response: result };
}

/**
 * Handle quick action
 */
async function handleQuickAction(payload) {
  const { action, preset, text, options = {} } = payload;

  // Get selected text from active tab if not provided
  let selectedText = text;
  if (!selectedText) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_SELECTION",
      });
      selectedText = response?.selection;
    }
  }

  if (!selectedText && action !== "quick_ask") {
    throw new Error("No text selected. Please select some text first.");
  }

  let result;
  switch (action) {
    case "translate": {
      const { defaultLanguage } =
        await chrome.storage.local.get("defaultLanguage");
      result = await translateText(
        selectedText,
        options.targetLanguage || defaultLanguage || "en",
      );
      break;
    }
    case "translate_primary": {
      const { primaryLanguage } =
        await chrome.storage.local.get("primaryLanguage");
      result = await translateText(selectedText, primaryLanguage || "vi");
      break;
    }
    case "translate_default": {
      const { defaultLanguage } =
        await chrome.storage.local.get("defaultLanguage");
      result = await translateText(selectedText, defaultLanguage || "en");
      break;
    }
    case "summarize":
      result = await summarizeText(selectedText, options);
      break;
    case "explain":
      result = await explainText(selectedText);
      break;
    case "reply":
      result = await generateReply(selectedText, preset, options.tone);
      break;
    case "emojify":
      result = await emojifyText(selectedText);
      break;
    default:
      // Fallback to improveText (covers rephrase, etc if passed here) or error
      if (
        [
          "grammar",
          "rephrase",
          "tone",
          "concise",
          "expand",
          "clarity",
        ].includes(action)
      ) {
        result = await improveText(selectedText, action, preset);
      } else {
        // If unknown, try generic generic generate? Or error.
        throw new Error(`Unknown action: ${action}`);
      }
  }

  // Send result to content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_RESULT",
      payload: {
        action,
        original: selectedText,
        result,
      },
    });
  }

  // Save to history
  try {
    const [historyTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await addToHistory({
      action,
      inputText: selectedText,
      outputText: result,
      preset,
      site: historyTab?.url || "unknown",
    });
  } catch (e) {
    console.error("[Omni AI] Failed to save history:", e);
  }

  return { response: result };
}

/**
 * Handle configuration validation
 */
async function handleValidateConfig(payload) {
  const { model, key } = payload;

  if (!key) throw new Error("API Key is missing");

  // Test with a simple prompt
  const testPrompt = "Hello. Respond with 'OK'.";

  const result = await generateContent(testPrompt, {
    model: model,
    apiKey: key, // Explicit override
    maxTokens: 5,
  });

  return { valid: true, response: result };
}

/**
 * Process selected text from context menu
 */
async function processSelectedText(tabId, text, action) {
  try {
    let result;
    if (action === "improve") {
      result = await improveText(text, "clarity", "general");
    } else if (action === "explain") {
      result = await explainText(text);
    } else if (action === "translate") {
      result = await translateText(text, "en");
    } else {
      result = await improveText(text, action, "general");
    }

    chrome.tabs.sendMessage(tabId, {
      type: "SHOW_RESULT",
      payload: {
        action,
        original: text,
        result,
      },
    });
    // Save to history
    await addToHistory({
      action,
      inputText: text,
      outputText: result,
      preset: "context-menu",
      site: "context-menu",
    });
  } catch (error) {
    chrome.tabs.sendMessage(tabId, {
      type: "SHOW_RESULT",
      payload: {
        action,
        original: text,
        result: `Error: ${error.message}`,
        error: true,
      },
    });
  }
}

// ============================================
// Prompt Builders
// ============================================

// ============================================
// Utilities
// ============================================

/**
 * Get API key from storage
 */
async function getApiKey() {
  const result = await chrome.storage.local.get("apiKey");
  return result.apiKey || "";
}
