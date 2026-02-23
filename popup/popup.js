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
  includePageContext: document.getElementById("includePageContext"),
  includePageContextLabel: document.querySelector(
    ".context-toggle .checkbox-label",
  ),

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

  // Chat
  chatContainer: document.getElementById("chatContainer"),
  emptyState: document.getElementById("emptyState"),
  newChatBtn: document.getElementById("newChatBtn"),
};

// State

let isProcessing = false;
let currentUser = null;
let chatHistory = [];
let conversationPageContext = null;
let isPageContextLocked = false;

const STORAGE_KEYS = {
  chatHistory: "popupChatHistory",
  pageContextSession: "popupPageContextSession",
  draftState: "popupDraftState",
};

let draftSaveTimer = null;

/**
 * Initialize popup
 */
async function init() {
  await i18n.init();
  await initTheme(); // Initialize theme
  localizeDOM();
  setupEventListeners();
  await loadAuthState();
  await loadChatHistory();
  await loadDraftState();
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
  if (elements.newChatBtn) {
    elements.newChatBtn.title = i18n.getMessage("btn_new_chat");
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
  elements.quickAskInput.addEventListener("input", scheduleSaveDraftState);
  elements.includePageContext?.addEventListener("change", scheduleSaveDraftState);

  // Settings
  elements.settingsBtn.addEventListener("click", openSettings);
  if (elements.newChatBtn) {
    elements.newChatBtn.addEventListener("click", handleNewChat);
  }

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

  // Extension action popup closes when it loses focus (e.g. Win+Space IME switch).
  // Persist draft state to reduce disruption.
  window.addEventListener("beforeunload", saveDraftState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveDraftState();
    }
  });
}

// ... Authentication functions (unchanged) ...
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
  elements.signInBtn.classList.add("hidden");
  elements.userInfo.classList.remove("hidden");
  elements.userAvatar.src = user.picture || getDefaultAvatar(user.name);
  elements.userAvatar.alt = user.name;
  elements.dropdownAvatar.src = user.picture || getDefaultAvatar(user.name);
  elements.userName.textContent = user.name;
  elements.userEmail.textContent = user.email;
}

/**
 * Set UI to signed out state
 */
function setSignedOutState() {
  currentUser = null;
  elements.signInBtn.classList.remove("hidden");
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" fill="#8b5cf6"/>
    <text x="50%" y="50%" dy=".35em" fill="white" font-family="sans-serif" font-size="18" font-weight="600" text-anchor="middle">${initial}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getPageContextNoticeMessage() {
  return (
    i18n.getMessage("popup_page_context_included") ||
    "Page content has been included and will be used as context for this conversation."
  );
}

function applyPageContextCheckboxState() {
  const checkbox = elements.includePageContext;
  if (!checkbox) return;

  const label = elements.includePageContextLabel;
  if (isPageContextLocked) {
    checkbox.checked = true;
    checkbox.disabled = true;
    if (label) {
      label.classList.add("is-locked");
      label.title =
        i18n.getMessage("include_page_context_locked_hint") ||
        "Page context is locked for this conversation. Start a new chat to change it.";
    }
  } else {
    checkbox.disabled = false;
    if (label) {
      label.classList.remove("is-locked");
      label.removeAttribute("title");
    }
  }
}

async function fetchCurrentPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTENT",
    });

    if (!response?.success || !response?.content) {
      return null;
    }

    return {
      text: response.content,
      title: response.title || "",
      url: response.url || "",
    };
  } catch (e) {
    console.warn("[Omni AI] Failed to get page content:", e);
    return null;
  }
}

async function loadDraftState() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.draftState);
    const draft = data[STORAGE_KEYS.draftState];
    if (!draft || typeof draft !== "object") return;

    if (elements.quickAskInput && typeof draft.query === "string") {
      elements.quickAskInput.value = draft.query;
    }

    if (
      elements.includePageContext &&
      !isPageContextLocked &&
      typeof draft.includePageContext === "boolean"
    ) {
      elements.includePageContext.checked = draft.includePageContext;
    }

    applyPageContextCheckboxState();
  } catch (e) {
    console.error("Failed to load draft state:", e);
  }
}

function scheduleSaveDraftState() {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
  }
  draftSaveTimer = setTimeout(() => {
    saveDraftState();
    draftSaveTimer = null;
  }, 120);
}

async function saveDraftState() {
  try {
    const includeChecked =
      isPageContextLocked || !!elements.includePageContext?.checked;
    await chrome.storage.local.set({
      [STORAGE_KEYS.draftState]: {
        query: elements.quickAskInput?.value || "",
        includePageContext: includeChecked,
      },
    });
  } catch (e) {
    console.error("Failed to save draft state:", e);
  }
}

// ============================================
// Chat Logic
// ============================================

/**
 * Load chat history
 */
async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.chatHistory,
      STORAGE_KEYS.pageContextSession,
    ]);

    chatHistory = Array.isArray(data[STORAGE_KEYS.chatHistory])
      ? data[STORAGE_KEYS.chatHistory]
      : [];

    const storedContextSession = data[STORAGE_KEYS.pageContextSession];
    if (
      storedContextSession?.locked &&
      storedContextSession?.pageContent?.text
    ) {
      isPageContextLocked = true;
      conversationPageContext = storedContextSession.pageContent;
    } else {
      isPageContextLocked = false;
      conversationPageContext = null;
    }

    // Backward compatibility: recover context from legacy hidden system message.
    if (!conversationPageContext) {
      const legacyContextMessage = [...chatHistory].reverse().find((msg) => {
        return (
          msg?.role === "system" &&
          msg?.hidden &&
          typeof msg?.content === "string" &&
          msg.content.startsWith('Page context from "')
        );
      });

      if (legacyContextMessage) {
        const legacyMatch = legacyContextMessage.content.match(
          /^Page context from "(.*)":\n([\s\S]*)$/,
        );

        if (legacyMatch?.[2]) {
          conversationPageContext = {
            text: legacyMatch[2],
            title: legacyContextMessage.pageTitle || legacyMatch[1] || "",
            url: legacyContextMessage.pageUrl || "",
          };
          isPageContextLocked = true;
        }
      }
    }

    // Keep old hidden context entries out of visible chat.
    chatHistory = chatHistory.filter((msg) => !msg?.hidden);

    applyPageContextCheckboxState();
    renderChatHistory();

    if (isPageContextLocked) {
      await saveChatHistory();
    }
  } catch (e) {
    console.error("Failed to load history:", e);
    chatHistory = [];
    conversationPageContext = null;
    isPageContextLocked = false;
    applyPageContextCheckboxState();
  }
}

/**
 * Save chat history
 */
async function saveChatHistory() {
  try {
    const contextSession =
      isPageContextLocked && conversationPageContext?.text
        ? {
            locked: true,
            pageContent: conversationPageContext,
          }
        : null;

    await chrome.storage.local.set({
      [STORAGE_KEYS.chatHistory]: chatHistory,
      [STORAGE_KEYS.pageContextSession]: contextSession,
    });
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

/**
 * Render chat history
 */
function renderChatHistory() {
  if (!elements.chatContainer) return;
  
  // Clear container but keep empty state
  elements.chatContainer.innerHTML = '';

  const visibleMessages = chatHistory.filter((msg) => !msg?.hidden);

  if (visibleMessages.length === 0) {
    if (elements.emptyState) {
        elements.chatContainer.appendChild(elements.emptyState);
        elements.emptyState.style.display = 'flex';
    }
  } else {
    visibleMessages.forEach(msg => appendBubble(msg.role, msg.content, false));
    scrollToBottom();
  }
}

/**
 * Append a bubble
 */
function appendBubble(role, content, animated = true) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = formatContent(content);
  
  if (animated) {
    bubble.style.opacity = '0';
    bubble.style.transform = 'translateY(10px)';
    bubble.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        bubble.style.opacity = '1';
        bubble.style.transform = 'translateY(0)';
    }, 10);
  }

  elements.chatContainer.appendChild(bubble);
  scrollToBottom();
}

/**
 * Append typing indicator
 */
function showTypingIndicator() {
  const typing = document.createElement("div");
  typing.className = "chat-typing";
  typing.id = "typingIndicator";
  typing.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  elements.chatContainer.appendChild(typing);
  scrollToBottom();
}

/**
 * Remove typing indicator
 */
function removeTypingIndicator() {
  const typing = document.getElementById("typingIndicator");
  if (typing) typing.remove();
}

/**
 * Scroll to bottom
 */
function scrollToBottom() {
  setTimeout(() => {
      elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
  }, 50);
}

/**
 * Handle new chat
 */
async function handleNewChat() {
  chatHistory = [];
  conversationPageContext = null;
  isPageContextLocked = false;

  if (elements.quickAskInput) {
    elements.quickAskInput.value = "";
    elements.quickAskInput.style.height = "auto";
  }

  if (elements.includePageContext) {
    elements.includePageContext.checked = false;
  }
  applyPageContextCheckboxState();

  await saveChatHistory();
  await saveDraftState();
  renderChatHistory();
  focusInput();
}

/**
 * Handle Quick Ask submission
 */
async function handleQuickAsk() {
  const query = elements.quickAskInput.value.trim();
  if (!query || isProcessing) return;

  setProcessing(true);

  const shouldIncludeContext =
    isPageContextLocked || elements.includePageContext?.checked || false;
  let justIncludedPageContext = false;

  if (shouldIncludeContext && !conversationPageContext) {
    const fetchedPageContent = await fetchCurrentPageContent();
    if (fetchedPageContent?.text) {
      conversationPageContext = fetchedPageContent;
      isPageContextLocked = true;
      justIncludedPageContext = true;
      applyPageContextCheckboxState();
    }
  }

  chatHistory.push({ role: "user", content: query });
  appendBubble("user", query);

  if (justIncludedPageContext) {
    const contextNotice = getPageContextNoticeMessage();
    chatHistory.push({
      role: "system",
      content: contextNotice,
      kind: "page_context_notice",
    });
    appendBubble("system", contextNotice);
  }

  await saveChatHistory();

  elements.quickAskInput.value = "";
  elements.quickAskInput.style.height = 'auto';
  await saveDraftState();

  showTypingIndicator();

  const contextParts = [];

  if (conversationPageContext?.text) {
    const pageTitle =
      conversationPageContext.title ||
      i18n.getMessage("popup_context") ||
      "Current Page";
    contextParts.push(
      `Current page content from "${pageTitle}":\n${conversationPageContext.text}`,
    );
  }

  const contextMsgs = chatHistory
    .filter((m) => m.role === "user" || m.role === "ai")
    .slice(0, -1)
    .slice(-10);
  contextMsgs.forEach(m => {
    contextParts.push(`${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`);
  });
  
  const contextString = contextParts.join('\n\n');

  try {
    const response = await chrome.runtime.sendMessage({
      type: "QUICK_ASK",
      payload: { 
        query,
        context: contextString
      },
    });

    removeTypingIndicator();

    if (response.success) {
      updateStatus(i18n.getMessage("status_ready"), "success");
      const answer = response.data.response || response.data;
      
      chatHistory.push({ role: "ai", content: answer });
      appendBubble("ai", answer);
      await saveChatHistory();

    } else {
      updateStatus(i18n.getMessage("status_error"), "error");
      const errorMsg = response.error || "Unknown error";
      appendBubble("error", i18n.getMessage("error_prefix") + errorMsg);
    }
  } catch (error) {
    removeTypingIndicator();
    console.error("Quick Ask error:", error);
    updateStatus(i18n.getMessage("status_error"), "error");
    appendBubble("error", i18n.getMessage("error_prefix") + error.message);
  } finally {
    setProcessing(false);
    focusInput();
  }
}

/**
 * Format content (basic markdown support)
 */
function formatContent(text) {
    if (!text) return "";
    // Basic escapes
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Newlines to br
    html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    
    return html;
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
  // document.body.classList.toggle("loading", processing); // Don't block whole UI
  
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
    elements.quickAskInput.disabled = true;
  } else {
    if (btn.dataset.original) {
      btn.innerHTML = btn.dataset.original;
      delete btn.dataset.original;
    }
    elements.quickAskInput.disabled = false;
  }
}

/**
 * Update status indicator
 */
function updateStatus(text, state = "ready") {
  const statusDot = elements.status.querySelector(".status-dot");
  if (elements.status.lastChild) {
      elements.status.lastChild.textContent = text;
  }

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
