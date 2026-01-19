/**
 * Omni AI - Content Script
 * Injected into web pages to handle text selection and result overlay
 */

// ============================================
// State
let overlay = null;
let isOverlayVisible = false;
let lastSelection = null; // Store { element, start, end, range, isInput, text }
let currentTheme = 'system';

// ============================================
// Initialization
// ============================================

/**
 * Initialize content script
 */
function init() {
  setupMessageListener();
  setupSelectionListener();
  initTheme();
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

let quickActionBtn = null;

/**
 * Set up selection change listener
 */
function setupSelectionListener() {
  document.addEventListener("mouseup", (e) => {
    // 1. Handle existing overlay closing
    if (overlay && !overlay.contains(e.target)) {
      hideOverlay();
    }

    // 2. Handle text selection for Quick Actions
    setTimeout(() => {
      const text = getSelectedText();
      const selection = window.getSelection();

      if (text.length > 0 && !isOverlayVisible) {
        showQuickActionButton(selection);
      } else {
        hideQuickActionButton();
      }
    }, 10);
  });

  // Handle Ctrl+A (Select All)
  document.addEventListener("keydown", (e) => {
    // Ctrl+A or Cmd+A
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      setTimeout(() => {
        const text = getSelectedText();
        const selection = window.getSelection();
        const activeElement = document.activeElement;

        // Show button for input/textarea with Ctrl+A
        if (text.length > 0 && !isOverlayVisible) {
          if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
            showQuickActionButtonForInput(activeElement);
          } else {
            showQuickActionButton(selection);
          }
        }
      }, 10);
    } else {
      // Hide on other keydown to avoid annoyance while typing
      if (quickActionBtn) hideQuickActionButton();
    }
  });

  // Handle typing in input/textarea (debounced)
  let typingTimer;
  const typingDelay = 1000; // Show button 1 second after user stops typing

  document.addEventListener("input", (e) => {
    const target = e.target;
    
    // Only for input/textarea
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      clearTimeout(typingTimer);
      hideQuickActionButton();
      
      // Show button after user stops typing
      typingTimer = setTimeout(() => {
        const value = target.value.trim();
        if (value.length > 0 && !isOverlayVisible) {
          showQuickActionButtonForInput(target);
        }
      }, typingDelay);
    }
  });
}

/**
 * Show floating quick action button
 */
function showQuickActionButton(selection) {
  if (quickActionBtn) hideQuickActionButton();

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) return; // invisible selection

  quickActionBtn = document.createElement("button");
  quickActionBtn.className = "omni-ai-quick-btn";
  updateOverlayTheme(quickActionBtn);
  quickActionBtn.innerHTML = `
    <span class="omni-ai-icon-small">✨</span>
  `;
  quickActionBtn.title = "Omni AI Actions";

  // Calculate position (top-right of selection)
  const top = rect.top + window.scrollY - 30;
  const left = rect.right + window.scrollX + 5;

  quickActionBtn.style.top = `${top}px`;
  quickActionBtn.style.left = `${left}px`;

  // Prevent button from closing itself immediately or triggering document listeners
  // Also preventDefault on mousedown to avoid stealing focus from text input
  quickActionBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  quickActionBtn.addEventListener("mouseup", (e) => e.stopPropagation());

  quickActionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Capture position before removing button
    const rect = quickActionBtn.getBoundingClientRect();

    // Show the full action menu
    showQuickActionMenu(selection.toString(), rect);
  });

  document.body.appendChild(quickActionBtn);
}

/**
 * Show floating quick action button for input/textarea
 */
function showQuickActionButtonForInput(inputElement) {
  if (quickActionBtn) hideQuickActionButton();

  const rect = inputElement.getBoundingClientRect();

  quickActionBtn = document.createElement("button");
  quickActionBtn.className = "omni-ai-quick-btn";
  updateOverlayTheme(quickActionBtn);
  quickActionBtn.innerHTML = `
    <span class="omni-ai-icon-small">✨</span>
  `;
  quickActionBtn.title = "Omni AI Actions";

  // Position at top-right of input field
  const top = rect.top + window.scrollY - 30;
  const left = rect.right + window.scrollX + 5;

  quickActionBtn.style.top = `${top}px`;
  quickActionBtn.style.left = `${left}px`;

  // Prevent button from closing itself
  quickActionBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  quickActionBtn.addEventListener("mouseup", (e) => e.stopPropagation());

  quickActionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Get text from input (selection or full value)
    const text = getSelectedText() || inputElement.value.trim();
    const btnRect = quickActionBtn.getBoundingClientRect();

    // Show the full action menu
    showQuickActionMenu(text, btnRect);
  });

  document.body.appendChild(quickActionBtn);
}

/**
 * Hide floating quick action button
 */
function hideQuickActionButton() {
  if (quickActionBtn) {
    quickActionBtn.remove();
    quickActionBtn = null;
  }
}

/**
 * Show quick action menu
 */
async function showQuickActionMenu(text, anchorRect = null) {
  hideQuickActionButton();
  hideOverlay(); // Ensure previous overlay is removed

  // Fetch languages for button labels
  const { primaryLanguage = "vi", defaultLanguage = "en" } = await chrome.storage.local.get(["primaryLanguage", "defaultLanguage"]);
  
  const languageNames = {
    en: "English",
    vi: "Vietnamese",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese"
  };

  const primaryName = languageNames[primaryLanguage] || primaryLanguage;
  const translationName = languageNames[defaultLanguage] || defaultLanguage;

  // Show a mini overlay with actions
  overlay = createOverlayElement();
  overlay.innerHTML = `
    <div class="omni-ai-overlay-header">
       <div class="omni-ai-overlay-title">Omni AI Actions</div>
       <button class="omni-ai-close-btn" id="omniAiClose">×</button>
    </div>
    <div class="omni-ai-overlay-content omni-ai-menu-content">
       <div class="omni-ai-menu-group-title">Translation</div>
       <div class="omni-ai-menu-row">
         <button class="omni-ai-menu-item omni-ai-menu-item-half" data-action="translate_primary">To ${primaryName}</button>
         <button class="omni-ai-menu-item omni-ai-menu-item-half" data-action="translate_default">To ${translationName}</button>
       </div>
       <button class="omni-ai-menu-item" data-action="translate_default">🔄 Convert ${primaryName} → ${translationName}</button>
       
       <div class="omni-ai-menu-divider"></div>
       <div class="omni-ai-menu-group-title">Writing</div>
       <button class="omni-ai-menu-item" data-action="grammar">📝 Fix Grammar</button>
       <button class="omni-ai-menu-item" data-action="rephrase">🔄 Rephrase</button>
       <button class="omni-ai-menu-item" data-action="summarize">📋 Summarize</button>
       <button class="omni-ai-menu-item" data-action="tone">🎭 Change Tone</button>
       <div class="omni-ai-menu-divider"></div>
       <button class="omni-ai-menu-item" data-action="ask">💬 Ask AI...</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Position using the anchor rect if provided
  positionOverlay(anchorRect);

  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);

  const buttons = overlay.querySelectorAll(".omni-ai-menu-item");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;

      if (action === "ask") {
        showQuickAskOverlay();
      } else {
        // Show loading in same overlay - no flashing!
        showLoadingInOverlay(action);
        
        try {
          // Select correct background handler
          const isQuickAction = ["summarize", "translate_primary", "translate_default", "translate"].includes(action);
          const type = isQuickAction ? "QUICK_ACTION" : "WRITING_ACTION";

          const response = await sendMessageToBackground({
            type,
            payload: { action, preset: "general", text },
          });

          if (response.success) {
            showResultOverlay({
              action,
              original: text,
              result: response.data.response || response.data,
            });
          } else {
            showErrorInOverlay(response.error);
          }
        } catch (err) {
          showErrorInOverlay(err.message);
        }
      }
    });
  });

  isOverlayVisible = true;
}

// ============================================
// Text Selection
// ============================================

/**
 * Get currently selected text
 */
function getSelectedText() {
  const activeElement = document.activeElement;

  // Handle Input/Textarea
  if (
    activeElement &&
    (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
  ) {
    try {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      
      // Check if there's actually a selection
      if (start !== undefined && end !== undefined && start !== end) {
        const text = activeElement.value.substring(start, end);

        if (text) {
          lastSelection = {
            element: activeElement,
            start,
            end,
            isInput: true,
            text: text,
          };
          return text;
        }
      }
    } catch (e) {
      console.warn("[Omni AI] Failed to get selection from input:", e);
    }
  }

  // Handle contenteditable elements
  if (activeElement && activeElement.isContentEditable) {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    
    if (text && selection.rangeCount > 0) {
      lastSelection = {
        element: activeElement,
        range: selection.getRangeAt(0).cloneRange(),
        isInput: false,
        isContentEditable: true,
        text: text,
      };
      return text;
    }
  }

  // Handle standard document selection
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";

  if (text && selection.rangeCount > 0) {
    lastSelection = {
      element: activeElement,
      range: selection.getRangeAt(0).cloneRange(),
      isInput: false,
      text: text,
    };
  }

  return text;
}

/**
 * Replace selected text with new text
 */
function replaceSelectedText(newText) {
  // Use lastSelection if available, fallback to current
  const target = lastSelection;

  if (target && target.isInput && target.element) {
    const el = target.element;
    const value = el.value;
    const start = target.start;
    const end = target.end;

    el.value = value.substring(0, start) + newText + value.substring(end);
    el.setSelectionRange(start, start + newText.length);
    el.focus();

    // Trigger input events for frameworks
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (target && !target.isInput && target.range) {
    const range = target.range;
    range.deleteContents();
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);

    // Restore selection to the new text
    const selection = window.getSelection();
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNode(textNode);
    selection.addRange(newRange);
  } else {
    // Fallback for immediate selection (standard)
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
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

  // Update existing overlay if present, otherwise create new
  if (!overlay) {
    overlay = createOverlayElement();
    document.body.appendChild(overlay);
  }

  // Update overlay content
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

  positionOverlay();

  // Event listeners
  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);

  const copyBtn = overlay.querySelector("#omniAiCopy");
  const replaceBtn = overlay.querySelector("#omniAiReplace");

  // Prevent focus loss on mousedown
  [copyBtn, replaceBtn].forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  });

  copyBtn.addEventListener("click", () => copyToClipboard(result));

  replaceBtn.addEventListener("click", () => {
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
      <div id="omniAiLoading" class="omni-ai-loading omni-ai-hidden">Processing...</div>
      <div id="omniAiQuickResult" class="omni-ai-result omni-ai-hidden"></div>
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

    input.classList.add("omni-ai-hidden");
    askBtn.classList.add("omni-ai-hidden");
    loading.classList.remove("omni-ai-hidden");

    try {
      const response = await sendMessageToBackground({
        type: "QUICK_ASK",
        payload: { query, preset: "general" },
      });

      loading.classList.add("omni-ai-hidden");
      resultDiv.classList.remove("omni-ai-hidden");

      if (response.success) {
        resultDiv.textContent = response.data.response;
        // Switch footer to copy button
        askBtn.textContent = "Copy";
        askBtn.classList.remove("omni-ai-hidden");
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
      loading.classList.add("omni-ai-hidden");
      resultDiv.textContent = "Error: " + e.message;
      resultDiv.classList.remove("omni-ai-hidden");
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
 * Create overlay element
 */
function createOverlayElement() {
  const el = document.createElement("div");
  el.className = "omni-ai-overlay";
  el.id = "omniAiOverlay";
  updateOverlayTheme(el);
  return el;
}

/**
 * Position overlay near selection
 */
/**
 * Position overlay near selection or anchor
 */
function positionOverlay(anchorRect = null) {
  if (!overlay) return;

  let rect;

  if (anchorRect) {
    rect = anchorRect;
  } else {
    // Fallback to selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    }
  }

  if (!rect) {
    // Center on screen if no selection/anchor
    overlay.style.position = "fixed";
    overlay.style.top = "50%";
    overlay.style.left = "50%";
    overlay.style.transform = "translate(-50%, -50%)";
    return;
  }

  // Ensure we use absolute positioning relative to document
  overlay.style.position = "absolute";
  overlay.style.transform = "none";

  const toggleScroll = window.scrollY; // Document scroll

  let top = rect.bottom + toggleScroll + 10;
  let left = rect.left + window.scrollX;

  // Ensure overlay stays within viewport
  const overlayRect = overlay.getBoundingClientRect();
  const viewportWidth = window.innerWidth;

  // Check right edge
  if (left + overlayRect.width > viewportWidth) {
    left = viewportWidth - overlayRect.width - 20;
  }

  // Check bottom edge (if falls off screen, move above)
  const realTopRelativeToViewport = top - toggleScroll;
  if (realTopRelativeToViewport + overlayRect.height > window.innerHeight) {
    // Flip to above
    top = rect.top + toggleScroll - overlayRect.height - 10;
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
 * Show loading state in current overlay
 */
function showLoadingInOverlay(action) {
  if (!overlay) return;
  
  const content = overlay.querySelector('.omni-ai-overlay-content');
  if (content) {
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; padding: 20px; justify-content: center;">
        <div style="width: 20px; height: 20px; border: 2px solid rgba(139, 92, 246, 0.3); border-top-color: #8b5cf6; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="color: var(--ai-text-secondary); font-size: 13px;">Processing...</span>
      </div>
    `;
  }
}

/**
 * Show error in current overlay
 */
function showErrorInOverlay(errorMessage) {
  if (!overlay) return;
  
  const content = overlay.querySelector('.omni-ai-overlay-content');
  if (content) {
    content.innerHTML = `
      <div style="padding: 12px; color: #ef4444; font-size: 13px;">
        Error: ${escapeHtml(errorMessage)}
      </div>
    `;
  }
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
  updateOverlayTheme(toast);
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("omni-ai-toast-visible"), 10);
  setTimeout(() => {
    toast.classList.remove("omni-ai-toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Safe wrapper for sendMessage to handle invalid context
 */
async function sendMessageToBackground(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message.includes("Extension context invalidated")) {
      showToast("Omni AI updated. Please reload the page.");
      // Stop further execution which might depend on response
      throw new Error("Extension context invalidated");
    }
    throw error;
  }
}

/**
 * Initialize theme
 */
function initTheme() {
  // Initial load
  chrome.storage.sync.get("omni_ai_theme", (result) => {
    currentTheme = result.omni_ai_theme || "system";
    updateAllThemes();
  });

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.omni_ai_theme) {
      currentTheme = changes.omni_ai_theme.newValue;
      updateAllThemes();
    }
  });

  // Listen for system changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme === "system") {
      updateAllThemes();
    }
  });
}

/**
 * Update theme for all active elements
 */
function updateAllThemes() {
  if (overlay) updateOverlayTheme(overlay);
  if (quickActionBtn) updateOverlayTheme(quickActionBtn);
  // Toast is updated on creation, but if we wanted to update live toasts we'd need to track them.
  // Given their short life, it's probably fine to let existing ones fade out with old theme, 
  // but let's be thorough if there are any.
  document.querySelectorAll('.omni-ai-toast').forEach(updateOverlayTheme);
}

/**
 * Update overlay theme class
 */
function updateOverlayTheme(el) {
  let isLight = false;
  if (currentTheme === "light") {
    isLight = true;
  } else if (currentTheme === "system") {
    isLight = !window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  if (isLight) {
    el.classList.add("omni-ai-light-mode");
  } else {
    el.classList.remove("omni-ai-light-mode");
  }
}

// Initialize
init();
