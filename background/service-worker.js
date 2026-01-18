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
  console.log("[Omni AI] Extension installed:", details.reason);

  if (details.reason === "install") {
    initializeSettings();
    createContextMenus();
  } else if (details.reason === "update") {
    console.log("[Omni AI] Updated from version:", details.previousVersion);
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
    history: [],
    settings: {
      theme: "dark",
      autoClose: false,
      showNotifications: true,
    },
  };

  const existing = await chrome.storage.local.get(null);
  const merged = { ...defaults, ...existing };
  await chrome.storage.local.set(merged);

  console.log("[Omni AI] Settings initialized");
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

  console.log("[Omni AI] Context menus created");
}

// ============================================
// Message Handling
// ============================================

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Omni AI] Received message:", message.type);

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

    console.log("[Omni AI] Sign in successful:", userInfo.email);
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

    console.log("[Omni AI] Sign out successful");
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

  // TODO: Implement Gemini API call
  console.log("[Omni AI] Quick Ask:", query, "Preset:", preset);

  // Placeholder response
  return { response: "API integration coming soon!" };
}

/**
 * Handle writing action
 */
async function handleWritingAction(payload) {
  const { action, preset } = payload;

  // Get selected text from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // TODO: Get selection from content script and process
  console.log("[Omni AI] Writing Action:", action, "Preset:", preset);

  return { response: "Writing action processed!" };
}

/**
 * Handle quick action
 */
async function handleQuickAction(payload) {
  const { action, preset } = payload;

  console.log("[Omni AI] Quick Action:", action, "Preset:", preset);

  return { response: "Quick action processed!" };
}

/**
 * Process selected text from context menu
 */
async function processSelectedText(tabId, text, action) {
  console.log(
    "[Omni AI] Processing selected text:",
    action,
    text.substring(0, 50) + "...",
  );

  // TODO: Send to Gemini API and return result to content script
  chrome.tabs.sendMessage(tabId, {
    type: "SHOW_RESULT",
    payload: {
      action,
      original: text,
      result: "Processed result will appear here!",
    },
  });
}

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

/**
 * Call Gemini API
 */
async function callGeminiAPI(prompt, apiKey) {
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

console.log("[Omni AI] Service worker loaded");
