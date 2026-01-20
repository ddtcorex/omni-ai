/**
 * Omni AI - Content Script
 * Injected into web pages to handle text selection and result overlay
 */

// ============================================
// State
let overlay = null;
let isOverlayVisible = false;
let lastSelection = null; // Store { element, start, end, range, isInput, text }
let currentTheme = "system";

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
        showQuickAskOverlay(getSelectedText());
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
        // Only hide if not in an input with content
        const activeElement = document.activeElement;
        const isInInputWithContent =
          (activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA") &&
          activeElement.value.trim().length > 0;

        if (!isInInputWithContent) {
          hideQuickActionButton();
        } else {
          showQuickActionButtonForInput(activeElement);
        }
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
          if (
            activeElement &&
            (activeElement.tagName === "INPUT" ||
              activeElement.tagName === "TEXTAREA")
          ) {
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
  const typingDelay = 500; // Show faster

  const checkInputAndShow = (target) => {
    const value = target.value.trim();
    if (value.length > 0 && !isOverlayVisible) {
      showQuickActionButtonForInput(target);
    }
  };

  document.addEventListener("input", (e) => {
    const target = e.target;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      clearTimeout(typingTimer);
      hideQuickActionButton();

      typingTimer = setTimeout(() => {
        checkInputAndShow(target);
      }, typingDelay);
    }
  });

  document.addEventListener("focusin", (e) => {
    const target = e.target;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      checkInputAndShow(target);
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
  // If we have space, put it outside-right. If not, put it inside-right top.
  let top = rect.top + window.scrollY - 8; // Slightly above the top line
  let left = rect.right + window.scrollX - 25; // Inside the right edge by default to be safe

  // If there is enough room on the right, put it outside
  if (rect.right + 40 < window.innerWidth) {
    left = rect.right + window.scrollX + 8;
  }

  // Ensure it doesn't go off the top of the page
  if (top < window.scrollY + 10) {
    top = rect.top + window.scrollY + 5;
  }

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
async function showQuickActionMenu(
  text,
  anchorRect = null,
  lockedPosition = null,
) {
  hideQuickActionButton();
  hideOverlay(); // Ensure previous overlay is removed

  // Fetch languages for button labels
  const { primaryLanguage = "vi", defaultLanguage = "en" } =
    await chrome.storage.local.get(["primaryLanguage", "defaultLanguage"]);

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
    zh: "Chinese",
  };

  const primaryName = languageNames[primaryLanguage] || primaryLanguage;
  const translationName = languageNames[defaultLanguage] || defaultLanguage;

  const primaryIcon = primaryLanguage === "vi" ? "🇻🇳" : "🌐";
  const translationIcon = "🌎";

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
         <button class="omni-ai-menu-item omni-ai-menu-item-half" data-action="translate_primary">${primaryIcon} To ${primaryName}</button>
         <button class="omni-ai-menu-item omni-ai-menu-item-half" data-action="translate_default">${translationIcon} To ${translationName}</button>
       </div>
       <div class="omni-ai-menu-divider"></div>
       <div class="omni-ai-menu-group-title">Writing</div>
       <button class="omni-ai-menu-item" data-action="grammar">📝 Fix Grammar</button>
       <button class="omni-ai-menu-item" data-action="rephrase">🔄 Rephrase</button>
       <button class="omni-ai-menu-item" data-action="summarize">📋 Summarize</button>
       <button class="omni-ai-menu-item" data-action="explain">🔍 Explain</button>
       <button class="omni-ai-menu-item" data-action="tone">🎭 Change Tone</button>
       <div class="omni-ai-menu-divider"></div>
       <button class="omni-ai-menu-item" data-action="ask">💬 Ask AI...</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Position using the anchor rect or locked position
  positionOverlay(anchorRect, lockedPosition);

  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);

  const buttons = overlay.querySelectorAll(".omni-ai-menu-item");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;

      if (action === "ask") {
        const lockedRect = overlay.getBoundingClientRect();
        showQuickAskOverlay(text, lockedRect, text);
      } else {
        // Capture absolute position before any changes
        const lockedRect = overlay.getBoundingClientRect();

        // Show loading in same overlay - no flashing!
        showLoadingInOverlay(action);

        try {
          // Select correct background handler
          const isQuickAction = [
            "summarize",
            "explain",
            "translate_primary",
            "translate_default",
            "translate",
          ].includes(action);
          const type = isQuickAction ? "QUICK_ACTION" : "WRITING_ACTION";

          // Get saved preset from storage (default to "chat")
          const { currentPreset = "chat" } =
            await chrome.storage.local.get("currentPreset");

          const response = await sendMessageToBackground({
            type,
            payload: { action, preset: currentPreset, text },
          });

          if (response.success) {
            showResultOverlay(
              {
                action,
                original: text,
                result: response.data.response || response.data,
              },
              lockedRect,
            );
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
function showResultOverlay(payload, lockedRect = null) {
  const { action, original, result } = payload;

  // Update existing overlay if present, otherwise create new
  if (!overlay) {
    overlay = createOverlayElement();
    document.body.appendChild(overlay);
  }

  // Update overlay content
  overlay.innerHTML = `
    <div class="omni-ai-overlay-header">
      <div class="omni-ai-row" style="display: flex; align-items: center;">
        <button class="omni-ai-icon-btn" id="omniAiBack" title="Back" style="background: none; border: none; cursor: pointer; font-size: 16px; margin-right: 8px; padding: 0 4px; color: inherit; display: flex; align-items: center;">
          <span style="font-size: 18px; line-height: 1;">‹</span>
        </button>
        <div class="omni-ai-overlay-title">
          <span class="omni-ai-icon">✨</span>
          <span>Omni AI - ${formatActionName(action)}</span>
        </div>
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

  positionOverlay(null, lockedRect);

  // Event listeners
  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);

  // Back button listener
  overlay.querySelector("#omniAiBack").addEventListener("click", () => {
    // Capture current position before going back
    const currentLockedRect = overlay.getBoundingClientRect();
    // Re-open menu with original text and locked position
    showQuickActionMenu(original, null, currentLockedRect);
  });

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
/**
 * Show quick ask overlay
 */
function showQuickAskOverlay(
  initialValue = "",
  lockedRect = null,
  originalText = null,
) {
  // Reuse existing overlay to prevent flickering/jumping
  // This preserves the current position strategy (top vs bottom anchor) naturally
  if (!overlay) {
    overlay = createOverlayElement();
    document.body.appendChild(overlay);
    // Only calculate position if it's a fresh overlay
    positionOverlay(null, lockedRect);
  }

  const contextHtml = initialValue
    ? `<div class="omni-ai-context-badge">
         <span>✨ Context:</span>
         <span class="omni-ai-context-text">${initialValue}</span>
       </div>`
    : "";

  overlay.innerHTML = `
    <div class="omni-ai-overlay-header">
      <div class="omni-ai-row" style="display: flex; align-items: center;">
        <button class="omni-ai-icon-btn" id="omniAiBack" title="Back" style="background: none; border: none; cursor: pointer; font-size: 16px; margin-right: 8px; padding: 0 4px; color: inherit; display: flex; align-items: center;">
          <span style="font-size: 18px; line-height: 1;">‹</span>
        </button>
        <div class="omni-ai-overlay-title">
          <span class="omni-ai-icon">💬</span>
          <span>Quick Ask</span>
        </div>
      </div>
      <button class="omni-ai-close-btn" id="omniAiClose">×</button>
    </div>
    <div class="omni-ai-overlay-content">
      ${contextHtml}
      <textarea id="omniAiInput" class="omni-ai-input" placeholder="What would you like to know or do with this?..."></textarea>
      <div id="omniAiLoading" class="omni-ai-loading omni-ai-hidden">
        <div class="omni-ai-spinner"></div>
        Processing...
      </div>
      <div id="omniAiQuickResult" class="omni-ai-result omni-ai-hidden"></div>
    </div>
    <div class="omni-ai-overlay-footer">
      <button class="omni-ai-btn omni-ai-btn-primary" id="omniAiAskBtn" style="height: 38px; font-size: 13px;">Send Request</button>
    </div>
  `;

  const backBtn = overlay.querySelector("#omniAiBack");
  if (originalText !== null) {
    backBtn.addEventListener("click", () => {
      const currentLockedRect = overlay.getBoundingClientRect();
      showQuickActionMenu(originalText, null, currentLockedRect);
    });
  } else {
    // If no original text (e.g. direct invoke?), hide back button
    backBtn.style.display = "none";
  }

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

    // Capture the text we're asking about (if any)
    const contextText = initialValue;
    const fullQuery = contextText
      ? `Context: ${contextText}\n\nQuestion: ${query}`
      : query;

    input.classList.add("omni-ai-hidden");
    const badge = overlay.querySelector(".omni-ai-context-badge");
    if (badge) badge.classList.add("omni-ai-hidden");

    askBtn.classList.add("omni-ai-hidden");
    loading.classList.remove("omni-ai-hidden");

    try {
      const response = await sendMessageToBackground({
        type: "QUICK_ASK",
        payload: { query: fullQuery, preset: "general" },
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
/**
 * Position overlay near selection or anchor
 */
// Store the handler reference so we can remove it later
let scrollHandler = null;

/**
 * Handle window scroll events
 */
function handleWindowScroll(e) {
  // Ignore scroll events originating from within the overlay
  if (overlay && overlay.contains(e.target)) {
    return;
  }
  hideOverlay();
}

/**
 * Position overlay near selection or anchor
 */
function positionOverlay(anchorRect = null, lockedPosition = null) {
  if (!overlay) return;

  // Add scroll listener to close overlay on scroll to prevent detachment
  if (!overlay.dataset.scrollListenerAttached) {
    scrollHandler = handleWindowScroll;
    window.addEventListener("scroll", scrollHandler, {
      capture: true,
      passive: true,
    });
    overlay.dataset.scrollListenerAttached = "true";
  }

  // Handle locked position (Smart Anchoring)
  if (lockedPosition) {
    const isBottomAnchored =
      overlay.style.bottom && overlay.style.bottom !== "auto";

    overlay.style.position = "fixed";
    overlay.style.transform = "none";

    if (isBottomAnchored) {
      // Keep bottom anchor - expand upwards
      const bottomVal = parseFloat(overlay.style.bottom) || 0;
      const availableHeight = window.innerHeight - bottomVal - 20; // 20px top margin
      overlay.style.maxHeight = `${Math.min(availableHeight, window.innerHeight * 0.9)}px`;
    } else {
      // Top anchor - expand downwards
      overlay.style.top = `${lockedPosition.top}px`;
      overlay.style.left = `${lockedPosition.left}px`;
      overlay.style.bottom = "auto";

      const availableHeight = window.innerHeight - lockedPosition.top - 20; // 20px bottom margin
      overlay.style.maxHeight = `${Math.min(availableHeight, window.innerHeight * 0.9)}px`;
    }
    return;
  }

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
    overlay.style.bottom = "auto";
    overlay.style.transform = "translate(-50%, -50%)";
    overlay.style.maxHeight = "90vh";
    return;
  }

  // Use Fixed Positioning for reliability
  overlay.style.position = "fixed";
  overlay.style.transform = "none";

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  // Get natural dimensions (clone to measure or just use current if visible)
  const overlayRect = overlay.getBoundingClientRect();

  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  // Decide vertical placement
  // Prefer below if it fits or has substantially more space
  const useBelow = spaceBelow >= overlayRect.height || spaceBelow >= spaceAbove;

  if (useBelow) {
    overlay.style.top = `${rect.bottom + 10}px`;
    overlay.style.bottom = "auto";
    // Adjust max-height to fit in available space below
    const availableHeight = spaceBelow - 20; // 20px padding
    overlay.style.maxHeight = `${Math.min(availableHeight, viewportHeight * 0.9)}px`;
  } else {
    overlay.style.bottom = `${viewportHeight - rect.top + 10}px`;
    overlay.style.top = "auto";
    // Adjust max-height to fit in available space above
    const availableHeight = spaceAbove - 20;
    overlay.style.maxHeight = `${Math.min(availableHeight, viewportHeight * 0.9)}px`;
  }

  // Horizontal Positioning
  let left = rect.left;

  // Check right edge
  if (left + overlayRect.width > viewportWidth) {
    left = viewportWidth - overlayRect.width - 20;
  }

  // Check left edge
  if (left < 20) {
    left = 20;
  }

  overlay.style.left = `${left}px`;
}

/**
 * Hide overlay
 */
function hideOverlay() {
  if (overlay) {
    // Remove scroll listener
    if (overlay.dataset.scrollListenerAttached && scrollHandler) {
      window.removeEventListener("scroll", scrollHandler, {
        capture: true,
        passive: true,
      });
      overlay.dataset.scrollListenerAttached = "";
      scrollHandler = null;
    }
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
    translate_primary: "Primary Language",
    translate_default: "Translation Language",
    grammar: "Grammar Fixed",
    clarity: "Clarity Improved",
    tone: "Tone Changed",
    concise: "Made Concise",
    expand: "Expanded",
    rephrase: "Rephrased",
    summarize: "Summary",
    reply: "Suggested Reply",
    emojify: "Emojified",
    quick_ask: "Quick Ask",
  };
  return names[action] || action;
}

/**
 * Show loading state in current overlay
 */
function showLoadingInOverlay(action) {
  if (!overlay) return;

  const content = overlay.querySelector(".omni-ai-overlay-content");
  if (content) {
    content.innerHTML = `
      <div class="omni-ai-loading">
        <div class="omni-ai-spinner"></div>
        <span>Processing...</span>
      </div>
    `;
  }
}

/**
 * Show error in current overlay
 */
function showErrorInOverlay(errorMessage) {
  if (!overlay) return;

  const content = overlay.querySelector(".omni-ai-overlay-content");
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
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
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
  document.querySelectorAll(".omni-ai-toast").forEach(updateOverlayTheme);
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
