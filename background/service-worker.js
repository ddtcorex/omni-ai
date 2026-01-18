import { addToHistory } from "../lib/history.js";

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

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * Handle quick ask
 */
async function handleQuickAsk(payload) {
  const { query, preset } = payload;

  console.log("[Omni AI] Quick Ask:", query, "Preset:", preset);

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not configured. Please add your Gemini API key in Settings.",
    );
  }

  const prompt = `You are a helpful AI assistant. Context: ${preset}.

Question: ${query}

Answer:`;

  const response = await callGeminiAPI(prompt, apiKey);

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
  } catch (e) {
    console.log("[Omni AI] Could not send to content script:", e);
  }

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

  console.log("[Omni AI] Writing Action:", action, "Preset:", preset);

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not configured. Please add your Gemini API key in Settings.",
    );
  }

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

  const prompt = getWritingActionPrompt(action, selectedText, preset);
  const result = await callGeminiAPI(prompt, apiKey);

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

  console.log("[Omni AI] Quick Action:", action, "Preset:", preset);

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not configured. Please add your Gemini API key in Settings.",
    );
  }

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

  const prompt = getQuickActionPrompt(action, selectedText, preset, options);
  const result = await callGeminiAPI(prompt, apiKey);

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
 * Process selected text from context menu
 */
async function processSelectedText(tabId, text, action) {
  console.log(
    "[Omni AI] Processing selected text:",
    action,
    text.substring(0, 50) + "...",
  );

  const apiKey = await getApiKey();
  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, {
      type: "SHOW_RESULT",
      payload: {
        action,
        original: text,
        result:
          "Error: API key not configured. Please add your Gemini API key in Settings.",
        error: true,
      },
    });
    return;
  }

  try {
    const prompt = getContextMenuPrompt(action, text);
    const result = await callGeminiAPI(prompt, apiKey);

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

function getWritingActionPrompt(action, text, context) {
  const contextDescriptions = {
    email: "professional email communication",
    chat: "casual chat messaging",
    social: "social media posts",
    technical: "technical documentation",
    academic: "formal academic writing",
  };

  const contextDesc = contextDescriptions[context] || "general writing";

  const prompts = {
    grammar: `Fix all grammar, spelling, and punctuation errors in the following text. Preserve the original meaning and style. Context: ${contextDesc}. Only output the corrected text, nothing else.

Text:
${text}

Corrected text:`,

    clarity: `Improve the clarity and readability of the following text while maintaining the original meaning. Context: ${contextDesc}. Only output the improved text, nothing else.

Text:
${text}

Improved text:`,

    tone: `Rewrite the following text with a more professional tone while keeping the same meaning. Context: ${contextDesc}. Only output the rewritten text, nothing else.

Text:
${text}

Rewritten text:`,

    concise: `Make the following text more concise by removing unnecessary words and redundancy while preserving all key information. Context: ${contextDesc}. Only output the concise text, nothing else.

Text:
${text}

Concise text:`,

    expand: `Expand the following text by adding more detail, context, and depth while maintaining the original message. Context: ${contextDesc}. Only output the expanded text, nothing else.

Text:
${text}

Expanded text:`,

    rephrase: `Rephrase the following text using different words and sentence structures while keeping the same meaning. Context: ${contextDesc}. Only output the rephrased text, nothing else.

Text:
${text}

Rephrased text:`,
  };

  return prompts[action] || prompts.grammar;
}

function getQuickActionPrompt(action, text, context, options = {}) {
  const prompts = {
    translate: `Translate the following text to ${options.targetLanguage || "English"}. Only output the translation, nothing else.

Text:
${text}

Translation:`,

    summarize: `Summarize the following text in a concise manner. Focus on key points and main ideas. Only output the summary, nothing else.

Text:
${text}

Summary:`,

    reply: `Generate a professional reply to the following ${context} message. Only output the reply, nothing else.

Message:
${text}

Reply:`,

    emojify: `Add relevant and appropriate emojis throughout the following text to make it more expressive. Don't overdo it. Only output the emojified text, nothing else.

Text:
${text}

Emojified text:`,
  };

  return prompts[action] || prompts.translate;
}

function getContextMenuPrompt(action, text) {
  const prompts = {
    improve: `Improve the following text by fixing any grammar or spelling errors and enhancing clarity. Only output the improved text.

Text:
${text}

Improved text:`,

    explain: `Explain the following text in simple, easy-to-understand terms. Break down any complex concepts.

Text:
${text}

Explanation:`,

    translate: `Translate the following text to English. Only output the translation.

Text:
${text}

Translation:`,
  };

  return prompts[action] || prompts.improve;
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
async function callGeminiAPI(prompt, apiKey, options = {}) {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 8192,
    temperature = 0.7,
  } = options;

  if (!apiKey) {
    throw new Error("API key not configured");
  }

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
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
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Empty response from API");
  }

  return text;
}

console.log("[Omni AI] Service worker loaded");
