/**
 * Omni AI - Content Script
 * Injected into web pages to handle text selection and result overlay
 */

// ============================================
// State
// ============================================
let overlay = null;
let isOverlayVisible = false;

// ============================================
// Initialization
// ============================================

/**
 * Initialize content script
 */
function init() {
  console.log("[Omni AI] Content script loaded");
  setupMessageListener();
  setupSelectionListener();
}

/**
 * Set up message listener for service worker communication
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case "GET_SELECTION":
        sendResponse({ selection: getSelectedText() });
        break;

      case "SHOW_RESULT":
        showResultOverlay(message.payload);
        sendResponse({ success: true });
        break;

      case "REPLACE_SELECTION":
        replaceSelectedText(message.payload.text);
        sendResponse({ success: true });
        break;

      case "SHOW_QUICK_ASK_OVERLAY":
        showQuickAskOverlay();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: "Unknown message type" });
    }
  });
}

/**
 * Set up selection change listener
 */
function setupSelectionListener() {
  document.addEventListener("mouseup", (e) => {
    // Hide overlay if clicking outside
    if (overlay && !overlay.contains(e.target)) {
      hideOverlay();
    }
  });
}

// ============================================
// Text Selection
// ============================================

/**
 * Get currently selected text
 */
function getSelectedText() {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : "";
}

/**
 * Replace selected text with new text
 */
function replaceSelectedText(newText) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const activeElement = document.activeElement;

  // Handle input/textarea elements
  if (
    activeElement &&
    (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
  ) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    const value = activeElement.value;
    activeElement.value =
      value.substring(0, start) + newText + value.substring(end);
    activeElement.setSelectionRange(start, start + newText.length);
  } else if (activeElement && activeElement.isContentEditable) {
    // Handle contenteditable elements
    range.deleteContents();
    range.insertNode(document.createTextNode(newText));
  }
}

// ============================================
// Overlay UI
// ============================================

/**
 * Show result overlay
 */
function showResultOverlay(payload) {
  const { action, original, result } = payload;

  hideOverlay();

  overlay = createOverlayElement();
  overlay.innerHTML = `
    <div class="omni-ai-overlay-header">
      <div class="omni-ai-overlay-title">
        <span class="omni-ai-icon">✨</span>
        <span>Omni AI - ${formatActionName(action)}</span>
      </div>
      <button class="omni-ai-close-btn" id="omniAiClose">×</button>
    </div>
    <div class="omni-ai-overlay-content">
      <div class="omni-ai-result">${escapeHtml(result)}</div>
    </div>
    <div class="omni-ai-overlay-footer">
      <button class="omni-ai-btn omni-ai-btn-secondary" id="omniAiCopy">Copy</button>
      <button class="omni-ai-btn omni-ai-btn-primary" id="omniAiReplace">Replace</button>
    </div>
  `;

  document.body.appendChild(overlay);
  positionOverlay();

  // Event listeners
  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);
  overlay
    .querySelector("#omniAiCopy")
    .addEventListener("click", () => copyToClipboard(result));
  overlay.querySelector("#omniAiReplace").addEventListener("click", () => {
    replaceSelectedText(result);
    hideOverlay();
  });

  isOverlayVisible = true;
}

/**
 * Show quick ask overlay
 */
function showQuickAskOverlay() {
  hideOverlay();

  overlay = createOverlayElement();
  overlay.innerHTML = `
    <div class="omni-ai-overlay-header">
      <div class="omni-ai-overlay-title">
        <span class="omni-ai-icon">💬</span>
        <span>Omni AI - Quick Ask</span>
      </div>
      <button class="omni-ai-close-btn" id="omniAiClose">×</button>
    </div>
    <div class="omni-ai-overlay-content">
      <textarea id="omniAiInput" class="omni-ai-input" placeholder="Ask anything... (Press Enter to send)" rows="3"></textarea>
      <div id="omniAiLoading" class="omni-ai-loading hidden">Processing...</div>
      <div id="omniAiQuickResult" class="omni-ai-result hidden"></div>
    </div>
    <div class="omni-ai-overlay-footer">
      <button class="omni-ai-btn omni-ai-btn-primary" id="omniAiAskBtn">Ask</button>
    </div>
  `;

  document.body.appendChild(overlay);
  positionOverlay();

  const input = overlay.querySelector("#omniAiInput");
  const askBtn = overlay.querySelector("#omniAiAskBtn");
  const loading = overlay.querySelector("#omniAiLoading");
  const resultDiv = overlay.querySelector("#omniAiQuickResult");
  const closeBtn = overlay.querySelector("#omniAiClose");

  input.focus();

  closeBtn.addEventListener("click", hideOverlay);

  const handleAsk = async () => {
    const query = input.value.trim();
    if (!query) return;

    input.classList.add("hidden");
    askBtn.classList.add("hidden");
    loading.classList.remove("hidden");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "QUICK_ASK",
        payload: { query, preset: "general" },
      });

      loading.classList.add("hidden");
      resultDiv.classList.remove("hidden");

      if (response.success) {
        resultDiv.textContent = response.data.response;
        // Switch footer to copy button
        askBtn.textContent = "Copy";
        askBtn.classList.remove("hidden");
        askBtn.id = "omniAiCopyResult";

        // Remove old listener, add new one
        const newFooterBtn = askBtn.cloneNode(true);
        askBtn.parentNode.replaceChild(newFooterBtn, askBtn);
        newFooterBtn.addEventListener("click", () =>
          copyToClipboard(response.data.response),
        );
      } else {
        resultDiv.textContent = "Error: " + (response.error || "Unknown error");
      }
    } catch (e) {
      loading.classList.add("hidden");
      resultDiv.textContent = "Error: " + e.message;
      resultDiv.classList.remove("hidden");
    }
  };

  askBtn.addEventListener("click", handleAsk);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  });

  isOverlayVisible = true;
}

/**
 * Show quick action menu
 */
function showQuickActionMenu(selection) {
  // TODO: Implement quick action floating menu
  console.log("[Omni AI] Quick action for:", selection.substring(0, 50));
}

/**
 * Create overlay element
 */
function createOverlayElement() {
  const el = document.createElement("div");
  el.className = "omni-ai-overlay";
  el.id = "omniAiOverlay";
  return el;
}

/**
 * Position overlay near selection
 */
function positionOverlay() {
  if (!overlay) return;

  const selection = window.getSelection();
  if (!selection.rangeCount) {
    // Center on screen if no selection
    overlay.style.top = "50%";
    overlay.style.left = "50%";
    overlay.style.transform = "translate(-50%, -50%)";
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  let top = rect.bottom + window.scrollY + 10;
  let left = rect.left + window.scrollX;

  // Ensure overlay stays within viewport
  const overlayRect = overlay.getBoundingClientRect();
  if (left + overlayRect.width > window.innerWidth) {
    left = window.innerWidth - overlayRect.width - 20;
  }
  if (top + overlayRect.height > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - overlayRect.height - 10;
  }

  overlay.style.top = `${top}px`;
  overlay.style.left = `${left}px`;
}

/**
 * Hide overlay
 */
function hideOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  isOverlayVisible = false;
}

// ============================================
// Utilities
// ============================================

/**
 * Format action name for display
 */
function formatActionName(action) {
  const names = {
    improve: "Improved",
    explain: "Explanation",
    translate: "Translation",
    grammar: "Grammar Fixed",
    clarity: "Clarity Improved",
    tone: "Tone Changed",
    concise: "Made Concise",
    expand: "Expanded",
    rephrase: "Rephrased",
    summarize: "Summary",
    reply: "Suggested Reply",
    emojify: "Emojified",
  };
  return names[action] || action;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  } catch (err) {
    console.error("[Omni AI] Copy failed:", err);
  }
}

/**
 * Show toast notification
 */
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "omni-ai-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("omni-ai-toast-visible"), 10);
  setTimeout(() => {
    toast.classList.remove("omni-ai-toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Initialize
init();
