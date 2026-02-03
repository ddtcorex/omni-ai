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
  smartTranslate,
} from "../lib/ai-service.js";

/**
 * Omni AI - Service Worker
 * Background script handling API calls, context menus, and message passing
 */

// ============================================
// Constants
// ============================================

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
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) {
    return;
  }

  if (command === "quick_ask") {
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_QUICK_ASK_OVERLAY" });
    return;
  }

  // Handle other commands via selected text
  try {
    // Notify content script to show processing state (spin icon)
    chrome.tabs
      .sendMessage(tab.id, { type: "PROCESSING_START" })
      .catch(() => {});

    const response = await chrome.tabs
      .sendMessage(tab.id, {
        type: "GET_SELECTION",
      })
      .catch(() => null);

    const selection = response?.selection;
    const isInput = response?.isInput || false;
    let action;
    if (command === "quick_fix_grammar") action = "grammar";
    if (command === "quick_rephrase") action = "rephrase";
    if (command === "quick_summarize") action = "summarize";
    if (command === "quick_explain") action = "explain";
    if (command === "quick_translate") action = "translate_primary";

    if (action) {
      if (!selection) {
        // Notify content script about missing selection for these actions
        chrome.tabs
          .sendMessage(tab.id, {
            type: "SHOW_RESULT",
            payload: {
              action,
              result: chrome.i18n.getMessage("error_noSelection"),
              error: true,
            },
          })
          .catch(() => {});
        return;
      }
      processSelectedText(tab.id, selection, action, isInput);
    }
  } catch (e) {
    console.error("[Omni AI] Command handler failed:", e);
  }
});

/**
 * Initialize default settings
 */
async function initializeSettings() {
  const defaults = {
    geminiApiKey: "",
    currentPreset: "professional",
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
    title: chrome.i18n.getMessage("contextMenu_improve"),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-explain",
    title: chrome.i18n.getMessage("contextMenu_explain"),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-translate",
    title: chrome.i18n.getMessage("contextMenu_translate"),
    contexts: ["selection"],
  });
}

/**
 * Handle storage changes
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.omni_ai_theme) {
    // Notify all tabs to update their theme
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, { type: "THEME_CHANGED" })
            .catch(() => {
              // Tab might be restricted or script not injected, ignore
            });
        }
      });
    });
  }
});

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
  const { query, preset, context } = payload;

  const response = await quickAsk(query, context || preset);

  // Save to history
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
    case "smart_translate": {
      const { primaryLanguage } =
        await chrome.storage.local.get("primaryLanguage");
      const { defaultLanguage } =
        await chrome.storage.local.get("defaultLanguage");
      result = await smartTranslate(
        selectedText,
        primaryLanguage || "vi",
        defaultLanguage || "en",
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
    case "explain": {
      const { primaryLanguage } =
        await chrome.storage.local.get("primaryLanguage");
      result = await explainText(selectedText, primaryLanguage || "vi");
      break;
    }
    case "reply":
      result = await generateReply(selectedText, preset, options.tone);
      break;
    case "emoji":
    case "emojify":
      result = await emojifyText(selectedText);
      break;
    default:
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
        throw new Error(`Unknown action: ${action}`);
      }
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
    provider: payload.provider, // Pass provider hint
    apiKey: key, // Explicit override
    maxTokens: 5,
  });

  return { valid: true, response: result };
}

/**
 * Process selected text from context menu
 */
async function processSelectedText(tabId, text, action, isInput = false) {
  try {
    let result;

    switch (action) {
      case "translate_primary": {
        const { primaryLanguage } =
          await chrome.storage.local.get("primaryLanguage");

        result = await translateText(text, primaryLanguage || "vi");
        break;
      }
      case "translate_default": {
        const { defaultLanguage } =
          await chrome.storage.local.get("defaultLanguage");
        result = await translateText(text, defaultLanguage || "en");
        break;
      }
      case "translate": // Context menu legacy
        result = await translateText(text, "en");
        break;
      case "explain":
        result = await explainText(text);
        break;
      case "summarize":
        result = await summarizeText(text);
        break;
      case "grammar":
      case "rephrase":
        result = await improveText(text, action, "general");
        break;
      case "improve":
        result = await improveText(text, "clarity", "general");
        break;
      default:
        // Fallback for custom actions or 'improve' variants
        result = await improveText(text, action, "general");
    }

    chrome.tabs.sendMessage(tabId, {
      type: "SHOW_RESULT",
      payload: {
        action,
        originalText: text,
        result,
        isInput,
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
  const result = await chrome.storage.local.get("geminiApiKey");
  return result.geminiApiKey || "";
}
