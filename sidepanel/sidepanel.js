/**
 * Omni AI - Side Panel Script (Page Tools)
 * One-click Summarize / Smart Translate / Explain against the active tab.
 */

import { i18n } from "../lib/i18n.js";
import { initTheme } from "../lib/theme-manager.js";
import { buildPageContextString } from "../lib/sidebar-chat.js";

const elements = {
  extVersion: /** @type {HTMLElement | null} */ (document.getElementById("extVersion")),
  settingsBtn: /** @type {HTMLElement | null} */ (document.getElementById("settingsBtn")),
  actionButtons: /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll("[data-action]")
  ),
  statusLine: /** @type {HTMLElement | null} */ (document.getElementById("statusLine")),
  resultArea: /** @type {HTMLElement | null} */ (document.getElementById("resultArea")),
  resultSource: /** @type {HTMLElement | null} */ (document.getElementById("resultSource")),
  resultText: /** @type {HTMLElement | null} */ (document.getElementById("resultText")),
  loadingSpinner: /** @type {HTMLElement | null} */ (document.getElementById("loadingSpinner")),
  tabChat: /** @type {HTMLElement | null} */ (document.getElementById("tabChat")),
  tabTools: /** @type {HTMLElement | null} */ (document.getElementById("tabTools")),
  chatView: /** @type {HTMLElement | null} */ (document.getElementById("chatView")),
  toolsView: /** @type {HTMLElement | null} */ (document.getElementById("toolsView")),
  chatMessages: /** @type {HTMLElement | null} */ (document.getElementById("chatMessages")),
  chatEmpty: /** @type {HTMLElement | null} */ (document.getElementById("chatEmpty")),
  chatInput: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("chatInput")),
  chatSend: /** @type {HTMLElement | null} */ (document.getElementById("chatSend")),
  chatStop: /** @type {HTMLElement | null} */ (document.getElementById("chatStop")),
  chatError: /** @type {HTMLElement | null} */ (document.getElementById("chatError")),
  includeContext: /** @type {HTMLInputElement | null} */ (
    document.getElementById("includeContext")
  ),
  pageContextPreview: /** @type {HTMLElement | null} */ (
    document.getElementById("pageContextPreview")
  ),
};

/** @type {{role:string, content:string}[]} */
const chatHistory = [];
let chatPort = null;
let currentPageContext = "";
let isStreaming = false;

async function init() {
  if (elements.extVersion) {
    elements.extVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  }
  // Wire up UI listeners SYNCHRONOUSLY — never gate interactivity (tab switching,
  // chat send) behind the async i18n/theme init below. On slow CI runners the
  // awaits can outlast Playwright's click, leaving tab listeners unattached and
  // the panel unresponsive (flaky e2e). Listeners attach immediately; i18n/theme
  // apply afterward and are isolated so a failure there can't break the UI.
  setupEventListeners();
  setupTabs();
  setupChat();

  try {
    await i18n.init();
    await initTheme();
    localizeDOM();
  } catch (err) {
    console.error("[Omni AI] sidepanel i18n/theme init failed:", err);
  }
}

/**
 * Replace __MSG_key__ placeholders in the DOM. Chrome only auto-localizes
 * manifest.json fields, not arbitrary page HTML -- same pattern as
 * settings.js / the old popup.js.
 */
function localizeDOM() {
  document.title = i18n.getMessage("extName");

  const elementsWithAttrs = document.querySelectorAll(
    '[title*="__MSG_"], [alt*="__MSG_"], [placeholder*="__MSG_"]',
  );
  elementsWithAttrs.forEach((el) => {
    ["title", "alt", "placeholder"].forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val && val.includes("__MSG_")) {
        el.setAttribute(
          attr,
          val.replace(/__MSG_(\w+)__/g, (match, key) => i18n.getMessage(key) || match),
        );
      }
    });
  });

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    // @ts-expect-error legacy 4th argument (expandEntityReferences) is ignored by Chromium
    false,
  );
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (text.includes("__MSG_")) {
      node.nodeValue = text.replace(
        /__MSG_(\w+)__/g,
        (match, key) => i18n.getMessage(key) || match,
      );
    }
  }
}

function setupEventListeners() {
  elements.settingsBtn?.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.actionButtons.forEach((btn) => {
    btn.addEventListener("click", () => runPageAction(btn.dataset.action));
  });
}

function setStatus(text, isError = false) {
  if (!elements.statusLine) return;
  if (!text) {
    elements.statusLine.classList.add("hidden");
    elements.statusLine.textContent = "";
    return;
  }
  elements.statusLine.textContent = text;
  elements.statusLine.classList.remove("hidden");
  elements.statusLine.classList.toggle("error", isError);
}

function setButtonsDisabled(disabled) {
  elements.actionButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
  if (elements.loadingSpinner) {
    elements.loadingSpinner.classList.toggle("hidden", !disabled);
  }
}

/**
 * @param {string} text
 * @param {string} pageTitle - which page this result describes. The panel
 *   is a single global panel that stays open across tab switches, so a
 *   result from a previously-viewed page could otherwise look like it's
 *   about whatever page the user has since scrolled to.
 */
function showResult(text, pageTitle) {
  if (!elements.resultArea || !elements.resultText) return;
  elements.resultText.textContent = text;
  if (elements.resultSource) {
    elements.resultSource.textContent = pageTitle
      ? `${i18n.getMessage("sidepanel_resultFrom")} ${pageTitle}`
      : "";
  }
  elements.resultArea.classList.remove("hidden");
}

/**
 * @returns {Promise<{text: string, title: string} | {error: string}>}
 */
async function getActivePageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { error: i18n.getMessage("sidepanel_cantReadPage") };
  }

  let response;
  try {
    // Target the top frame explicitly. The content script runs with
    // all_frames:true (and match_about_blank:true) in manifest.json, so a
    // sendMessage call with no frameId broadcasts to every frame on the
    // page and resolves with whichever frame answers first -- usually an
    // iframe, not the top-level page, which would silently return that
    // iframe's (often empty) content instead of the real one.
    response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" }, { frameId: 0 });
  } catch {
    return { error: i18n.getMessage("sidepanel_cantReadPage") };
  }

  if (!response?.success || !response?.content) {
    return { error: i18n.getMessage("sidepanel_noContent") };
  }

  return { text: response.content, title: response.title || tab.title || "" };
}

async function runPageAction(action) {
  if (!action) return;

  setButtonsDisabled(true);
  setStatus(i18n.getMessage("sidepanel_loading"));
  elements.resultArea?.classList.add("hidden");

  try {
    const page = await getActivePageContent();
    if ("error" in page) {
      setStatus(page.error, true);
      return;
    }

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "QUICK_ACTION",
        payload: { action, text: page.text },
      });
    } catch (err) {
      setStatus(i18n.getMessage("error_prefix") + (err?.message || "Unknown error"), true);
      return;
    }

    if (response?.success) {
      setStatus("");
      showResult(response.data.response, page.title);
    } else {
      setStatus(i18n.getMessage("error_prefix") + (response?.error || "Unknown error"), true);
    }
  } finally {
    setButtonsDisabled(false);
  }
}

// ============================================
// Tabs
// ============================================
function setupTabs() {
  const tabs = [elements.tabChat, elements.tabTools];
  tabs.forEach((tab) => {
    tab?.addEventListener("click", () => {
      const target = tab.dataset.view;
      [elements.tabChat, elements.tabTools].forEach((t) => {
        const active = t === tab;
        t?.classList.toggle("active", active);
        t?.setAttribute("aria-selected", String(active));
      });
      elements.chatView?.classList.toggle("hidden", target !== "chatView");
      elements.toolsView?.classList.toggle("hidden", target !== "toolsView");
      if (target === "chatView") refreshPageContext();
    });
  });
}

// ============================================
// Chat
// ============================================
async function refreshPageContext() {
  if (!elements.includeContext?.checked) {
    currentPageContext = "";
    if (elements.pageContextPreview) elements.pageContextPreview.textContent = "";
    return;
  }
  const page = await getActivePageContent();
  if ("error" in page) {
    currentPageContext = "";
    if (elements.pageContextPreview) {
      elements.pageContextPreview.textContent = i18n.getMessage("sidepanel_cantReadPage");
    }
    return;
  }
  currentPageContext = buildPageContextString(page);
  if (elements.pageContextPreview) {
    elements.pageContextPreview.textContent =
      currentPageContext || i18n.getMessage("sidepanel_cantReadPage");
  }
}

function addChatMessage(role, text) {
  if (elements.chatEmpty) elements.chatEmpty.classList.add("hidden");
  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${role}`;
  bubble.textContent = text;
  elements.chatMessages?.appendChild(bubble);
  elements.chatMessages?.scrollTo({ top: elements.chatMessages.scrollHeight });
  return bubble;
}

function setStreamingUI(on) {
  isStreaming = on;
  elements.chatSend?.classList.toggle("hidden", on);
  elements.chatStop?.classList.toggle("hidden", !on);
  elements.chatInput?.toggleAttribute("disabled", on);
}

function connectChatPort() {
  if (chatPort) return chatPort;
  chatPort = chrome.runtime.connect({ name: "omni-chat" });
  return chatPort;
}

function sendChatMessage() {
  if (isStreaming) return;
  const message = elements.chatInput?.value.trim();
  if (!message) return;

  addChatMessage("user", message);
  elements.chatInput.value = "";
  elements.chatError?.classList.add("hidden");

  const port = connectChatPort();
  const assistantBubble = addChatMessage("assistant", "");
  let acc = "";

  setStreamingUI(true);

  port.onMessage.addListener(function handler(msg) {
    if (!msg) return;
    if (msg.type === "chunk") {
      acc += msg.text;
      assistantBubble.textContent = acc;
      elements.chatMessages?.scrollTo({ top: elements.chatMessages.scrollHeight });
    } else if (msg.type === "done") {
      chatHistory.push({ role: "user", content: message });
      chatHistory.push({ role: "assistant", content: msg.text });
      port.onMessage.removeListener(handler);
      setStreamingUI(false);
    } else if (msg.type === "error") {
      if (elements.chatError) {
        elements.chatError.textContent = msg.error || i18n.getMessage("sidebar_chat_error");
        elements.chatError.classList.remove("hidden");
      }
      port.onMessage.removeListener(handler);
      setStreamingUI(false);
    }
  });

  port.postMessage({
    type: "chat",
    message,
    pageContext: currentPageContext,
    history: chatHistory.slice(),
  });
}

function stopChat() {
  if (chatPort) {
    chatPort.disconnect();
    chatPort = null;
  }
  setStreamingUI(false);
}

function setupChat() {
  elements.chatSend?.addEventListener("click", sendChatMessage);
  elements.chatStop?.addEventListener("click", stopChat);
  elements.chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  elements.includeContext?.addEventListener("change", refreshPageContext);
}

document.addEventListener("DOMContentLoaded", init);
