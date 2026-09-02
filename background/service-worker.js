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
const activeEditorFrames = new Map();

function activeEditorFrameKey(tabId) {
  return `omni_ai_active_frame_${tabId}`;
}

async function getActiveEditorFrame(tabId) {
  if (activeEditorFrames.has(tabId)) return activeEditorFrames.get(tabId);

  const stored = await chrome.storage.session.get(activeEditorFrameKey(tabId));
  const frameId = stored[activeEditorFrameKey(tabId)];
  if (Number.isInteger(frameId)) activeEditorFrames.set(tabId, frameId);
  return frameId;
}

function rememberActiveEditorFrame(tabId, frameId) {
  activeEditorFrames.set(tabId, frameId);
  return chrome.storage.session.set({ [activeEditorFrameKey(tabId)]: frameId });
}

function clearActiveEditorFrame(tabId) {
  activeEditorFrames.delete(tabId);
  return chrome.storage.session.remove(activeEditorFrameKey(tabId));
}

async function sendToActiveEditor(tabId, message) {
  const frameId = await getActiveEditorFrame(tabId);
  if (Number.isInteger(frameId)) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch {
      await clearActiveEditorFrame(tabId);
    }
  }
  // No editor frame is known (or it just failed): target the top frame
  // explicitly. Omitting frameId here would broadcast to every frame on the
  // page (manifest.json sets all_frames:true), and chrome.tabs.sendMessage
  // resolves with whichever frame replies first — a race that can silently
  // return an unrelated iframe's empty selection instead of the real one.
  return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
}

// ============================================
// Installation & Setup
// ============================================

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    // Reloading an unpacked extension in chrome://extensions (routine
    // during development) fires "update", and Chrome clears the
    // extension's context menu items on that reload — they must be
    // recreated here too, not just on first install. initializeSettings()
    // is a safe no-op merge for existing keys, so re-running it on update
    // also seeds any new setting default (e.g. showFloatingButton) added
    // after a user's original install.
    initializeSettings();
    createContextMenus();
  }
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  }
  if (details.reason === "update") {
    // Google sign-in (and the "user" profile -- email/name/picture -- it
    // stored) was removed along with the old popup. Existing users who had
    // signed in still carry that profile in sync storage with no remaining
    // reader. This runs on every future update, not just once, but
    // removing an already-absent key is a cheap no-op, so that's fine.
    chrome.storage.sync.remove("user").catch(() => {});
  }
});

/**
 * Open the side panel directly on a toolbar-icon click, instead of Chrome's
 * default action-popup behavior. This is the entire click-handling story --
 * no onClicked listener needed, Chrome does it declaratively.
 *
 * Guarded: chrome.sidePanel is undefined on an unsupported/old Chrome. An
 * unguarded call here would throw synchronously during module evaluation
 * and abort the rest of this file, silently unregistering every listener
 * below it (commands, storage, runtime messages, context menus) -- not
 * just breaking the side panel.
 */
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  ?.catch((e) => console.warn("[Omni AI] setPanelBehavior failed:", e));

/**
 * Handle keyboard commands
 */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) {
    return;
  }

  if (command === "quick_ask") {
    sendToActiveEditor(tab.id, { type: "SHOW_QUICK_ASK_OVERLAY" }).catch(() => {});
    return;
  }

  // Handle other commands via selected text
  try {
    // Notify content script to show processing state (spin icon)
    void sendToActiveEditor(tab.id, { type: "PROCESSING_START" }).catch(() => {});

    const response = await sendToActiveEditor(tab.id, {
      type: "GET_SELECTION",
    }).catch(() => null);

    const selection = response?.selection;
    const isInput = response?.isInput || false;
    let action;
    if (command === "quick_fix_grammar") action = "grammar";
    if (command === "quick_rephrase") action = "rephrase";
    if (command === "quick_summarize") action = "summarize";
    if (command === "quick_explain") action = "explain";
    if (command === "quick_translate") action = "smart_translate";

    if (action) {
      if (!selection) {
        // Notify content script about missing selection for these actions
        void sendToActiveEditor(tab.id, {
          type: "SHOW_RESULT",
          payload: {
            action,
            result: chrome.i18n.getMessage("error_noSelection"),
            error: true,
          },
        }).catch(() => {});
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
    anthropicApiKey: "",
    currentPreset: "professional",
    customPrompts: [],
    customGatewayBaseUrl: "",
    customGatewayApiKey: "",
    customGatewayModelName: "",
    settings: {
      theme: "dark",
      autoClose: false,
      showNotifications: true,
      showFloatingButton: true,
    },
  };

  /** @type {Record<string, any>} */
  const existing = await chrome.storage.local.get(null);
  const merged = {
    ...defaults,
    ...existing,
    settings: { ...defaults.settings, ...(existing.settings || {}) },
  };
  await chrome.storage.local.set(merged);
}

/**
 * Create context menus
 */
function createContextMenus() {
  chrome.contextMenus.create({
    id: "omni-ai-translate",
    title: chrome.i18n.getMessage("contextMenu_translate"),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-rephrase",
    title: chrome.i18n.getMessage("contextMenu_rephrase"),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-emojify",
    title: chrome.i18n.getMessage("contextMenu_emojify"),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-summarize",
    title: chrome.i18n.getMessage("contextMenu_summarize"),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "omni-ai-ask",
    title: chrome.i18n.getMessage("contextMenu_ask"),
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
          chrome.tabs.sendMessage(tab.id, { type: "THEME_CHANGED" }).catch(() => {
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
    case "EDITOR_FOCUSED":
      if (sender.tab?.id !== undefined && Number.isInteger(sender.frameId)) {
        rememberActiveEditorFrame(sender.tab.id, sender.frameId)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
      }
      sendResponse({ success: false });
      break;

    case "EDITOR_BLURRED":
      if (sender.tab?.id !== undefined) {
        clearActiveEditorFrame(sender.tab.id)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
      } else {
        sendResponse({ success: false });
      }
      break;

    // Quick Ask
    case "QUICK_ASK":
      handleQuickAsk(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "WRITING_ACTION":
      handleWritingAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "QUICK_ACTION":
      handleQuickAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "GET_API_KEY":
      getApiKey()
        .then((key) => sendResponse({ success: true, apiKey: key }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "VALIDATE_CONFIG":
      handleValidateConfig(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
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
    case "omni-ai-translate":
      processSelectedText(tab.id, selectedText, "smart_translate");
      break;
    case "omni-ai-rephrase":
      processSelectedText(tab.id, selectedText, "rephrase");
      break;
    case "omni-ai-emojify":
      processSelectedText(tab.id, selectedText, "emoji");
      break;
    case "omni-ai-summarize":
      processSelectedText(tab.id, selectedText, "summarize");
      break;
    case "omni-ai-ask":
      sendToActiveEditor(tab.id, { type: "SHOW_QUICK_ASK_OVERLAY" }).catch(() => {});
      break;
  }
});

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
      /** @type {{ defaultLanguage?: string }} */
      const { defaultLanguage } = await chrome.storage.sync.get("defaultLanguage");
      result = await translateText(selectedText, options.targetLanguage || defaultLanguage || "en");
      break;
    }
    case "smart_translate": {
      /** @type {{ primaryLanguage?: string, defaultLanguage?: string }} */
      const { primaryLanguage, defaultLanguage } = await chrome.storage.sync.get([
        "primaryLanguage",
        "defaultLanguage",
      ]);
      result = await smartTranslate(selectedText, primaryLanguage || "vi", defaultLanguage || "en");
      break;
    }
    case "translate_primary": {
      /** @type {{ primaryLanguage?: string }} */
      const { primaryLanguage } = await chrome.storage.sync.get("primaryLanguage");
      result = await translateText(selectedText, primaryLanguage || "vi");
      break;
    }
    case "translate_default": {
      /** @type {{ defaultLanguage?: string }} */
      const { defaultLanguage } = await chrome.storage.sync.get("defaultLanguage");
      result = await translateText(selectedText, defaultLanguage || "en");
      break;
    }
    case "summarize":
      result = await summarizeText(selectedText, options);
      break;
    case "explain": {
      /** @type {{ primaryLanguage?: string }} */
      const { primaryLanguage } = await chrome.storage.sync.get("primaryLanguage");
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
      if (["grammar", "rephrase", "tone", "concise", "expand", "clarity"].includes(action)) {
        // Pass preset as tone via options, not context
        result = await improveText(selectedText, action, "chat", {
          tone: preset,
        });
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
  const { model, key, provider } = payload;

  // Custom Gateway may not require API Key
  if (!key && provider !== "customGateway") {
    throw new Error("API Key is missing");
  }

  // Test with a simple prompt
  const testPrompt = "Hello. Respond with 'OK'.";

  const generateOptions = {
    model: model,
    provider: payload.provider,
    apiKey: key,
    maxTokens: 5,
  };

  // Add Custom Gateway extras
  if (payload.provider === "customGateway") {
    generateOptions.baseUrl = payload.baseUrl;
  }

  const result = await generateContent(testPrompt, generateOptions);

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
        /** @type {{ primaryLanguage?: string }} */
        const { primaryLanguage } = await chrome.storage.sync.get("primaryLanguage");

        result = await translateText(text, primaryLanguage || "vi");
        break;
      }
      case "translate_default": {
        /** @type {{ defaultLanguage?: string }} */
        const { defaultLanguage } = await chrome.storage.sync.get("defaultLanguage");
        result = await translateText(text, defaultLanguage || "en");
        break;
      }
      case "smart_translate": {
        /** @type {{ primaryLanguage?: string, defaultLanguage?: string }} */
        const { primaryLanguage, defaultLanguage } = await chrome.storage.sync.get([
          "primaryLanguage",
          "defaultLanguage",
        ]);
        result = await smartTranslate(text, primaryLanguage || "vi", defaultLanguage || "en");
        break;
      }
      case "translate": {
        // Context menu legacy
        /** @type {{ defaultLanguage?: string }} */
        const { defaultLanguage } = await chrome.storage.sync.get("defaultLanguage");
        result = await translateText(text, defaultLanguage || "en");
        break;
      }
      case "explain": {
        /** @type {{ primaryLanguage?: string }} */
        const { primaryLanguage } = await chrome.storage.sync.get("primaryLanguage");
        result = await explainText(text, primaryLanguage || "vi");
        break;
      }
      case "summarize":
        result = await summarizeText(text);
        break;
      case "emoji":
      case "emojify":
        result = await emojifyText(text);
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

    await sendToActiveEditor(tabId, {
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
    await sendToActiveEditor(tabId, {
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
