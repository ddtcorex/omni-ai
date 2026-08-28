/**
 * Omni AI - Side Panel Script (Page Tools)
 * One-click Summarize / Smart Translate / Explain against the active tab.
 */

import { i18n } from "../lib/i18n.js";
import { initTheme } from "../lib/theme-manager.js";

const elements = {
  extVersion: /** @type {HTMLElement | null} */ (document.getElementById("extVersion")),
  settingsBtn: /** @type {HTMLElement | null} */ (document.getElementById("settingsBtn")),
  actionButtons: /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll(".action-btn")
  ),
  statusLine: /** @type {HTMLElement | null} */ (document.getElementById("statusLine")),
  resultArea: /** @type {HTMLElement | null} */ (document.getElementById("resultArea")),
  resultText: /** @type {HTMLElement | null} */ (document.getElementById("resultText")),
};

async function init() {
  if (elements.extVersion) {
    elements.extVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  }
  await i18n.init();
  await initTheme();
  localizeDOM();
  setupEventListeners();
}

/**
 * Replace __MSG_key__ placeholders in the DOM. Chrome only auto-localizes
 * manifest.json fields, not arbitrary page HTML -- same pattern as
 * settings.js / the old popup.js.
 */
function localizeDOM() {
  document.title = i18n.getMessage("extName");

  const elementsWithTitle = document.querySelectorAll('[title*="__MSG_"]');
  elementsWithTitle.forEach((el) => {
    const val = el.getAttribute("title");
    if (val && val.includes("__MSG_")) {
      el.setAttribute("title", val.replace(/__MSG_(\w+)__/g, (match, key) => i18n.getMessage(key) || match));
    }
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
      node.nodeValue = text.replace(/__MSG_(\w+)__/g, (match, key) => i18n.getMessage(key) || match);
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
}

function showResult(text) {
  if (!elements.resultArea || !elements.resultText) return;
  elements.resultText.textContent = text;
  elements.resultArea.classList.remove("hidden");
}

/**
 * @returns {Promise<{text: string} | {error: string}>}
 */
async function getActivePageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { error: i18n.getMessage("sidepanel_cantReadPage") };
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" });
  } catch {
    return { error: i18n.getMessage("sidepanel_cantReadPage") };
  }

  if (!response?.success || !response?.content) {
    return { error: i18n.getMessage("sidepanel_noContent") };
  }

  return { text: response.content };
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

    const response = await chrome.runtime.sendMessage({
      type: "QUICK_ACTION",
      payload: { action, text: page.text },
    });

    if (response?.success) {
      setStatus("");
      showResult(response.data.response || response.data);
    } else {
      setStatus(i18n.getMessage("error_prefix") + (response?.error || "Unknown error"), true);
    }
  } finally {
    setButtonsDisabled(false);
  }
}

document.addEventListener("DOMContentLoaded", init);
