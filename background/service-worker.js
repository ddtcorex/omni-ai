/**
 * Omni AI - Service Worker
 * Background script handling API calls, context menus, and message passing
 */

// ============================================
// Constants
// ============================================
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

// ============================================
// Installation & Setup
// ============================================

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Omni AI] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    initializeSettings();
    createContextMenus();
  } else if (details.reason === 'update') {
    console.log('[Omni AI] Updated from version:', details.previousVersion);
  }
});

/**
 * Initialize default settings
 */
async function initializeSettings() {
  const defaults = {
    apiKey: '',
    currentPreset: 'email',
    customPrompts: [],
    history: [],
    settings: {
      theme: 'dark',
      autoClose: false,
      showNotifications: true,
    },
  };

  const existing = await chrome.storage.local.get(null);
  const merged = { ...defaults, ...existing };
  await chrome.storage.local.set(merged);
  
  console.log('[Omni AI] Settings initialized');
}

/**
 * Create context menus
 */
function createContextMenus() {
  chrome.contextMenus.create({
    id: 'omni-ai-improve',
    title: 'Improve with Omni AI',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'omni-ai-explain',
    title: 'Explain with Omni AI',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'omni-ai-translate',
    title: 'Translate with Omni AI',
    contexts: ['selection'],
  });

  console.log('[Omni AI] Context menus created');
}

// ============================================
// Message Handling
// ============================================

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Omni AI] Received message:', message.type);

  switch (message.type) {
    case 'QUICK_ASK':
      handleQuickAsk(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'WRITING_ACTION':
      handleWritingAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'QUICK_ACTION':
      handleQuickAction(message.payload)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_API_KEY':
      getApiKey()
        .then((key) => sendResponse({ success: true, apiKey: key }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = info.selectionText;
  
  if (!selectedText) return;

  switch (info.menuItemId) {
    case 'omni-ai-improve':
      processSelectedText(tab.id, selectedText, 'improve');
      break;
    case 'omni-ai-explain':
      processSelectedText(tab.id, selectedText, 'explain');
      break;
    case 'omni-ai-translate':
      processSelectedText(tab.id, selectedText, 'translate');
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
  const { query, preset } = payload;
  
  // TODO: Implement Gemini API call
  console.log('[Omni AI] Quick Ask:', query, 'Preset:', preset);
  
  // Placeholder response
  return { response: 'API integration coming soon!' };
}

/**
 * Handle writing action
 */
async function handleWritingAction(payload) {
  const { action, preset } = payload;
  
  // Get selected text from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // TODO: Get selection from content script and process
  console.log('[Omni AI] Writing Action:', action, 'Preset:', preset);
  
  return { response: 'Writing action processed!' };
}

/**
 * Handle quick action
 */
async function handleQuickAction(payload) {
  const { action, preset } = payload;
  
  console.log('[Omni AI] Quick Action:', action, 'Preset:', preset);
  
  return { response: 'Quick action processed!' };
}

/**
 * Process selected text from context menu
 */
async function processSelectedText(tabId, text, action) {
  console.log('[Omni AI] Processing selected text:', action, text.substring(0, 50) + '...');
  
  // TODO: Send to Gemini API and return result to content script
  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_RESULT',
    payload: {
      action,
      original: text,
      result: 'Processed result will appear here!',
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
  const result = await chrome.storage.local.get('apiKey');
  return result.apiKey || '';
}

/**
 * Call Gemini API
 */
async function callGeminiAPI(prompt, apiKey) {
  if (!apiKey) {
    throw new Error('API key not configured');
  }

  const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

console.log('[Omni AI] Service worker loaded');
