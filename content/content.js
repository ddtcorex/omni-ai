/**
 * Omni AI - Content Script
 * Injected into web pages to handle text selection and result overlay
 */

// ============================================
// Icons (Feather Icons / Custom)
// ============================================
const ICONS = {
  brand: `<img src="${chrome.runtime.getURL("assets/icons/icon-48.png")}" class="omni-ai-logo-img" alt="Omni AI" />`,
  close: `<svg viewBox="0 0 24 24" fill="none" class="omni-ai-icon-svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  magic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon></svg>`,
  rephrase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
  summarize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
  explain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  tone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>`,
  translate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  ask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`,
  emoji: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
  grammar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  btnSparkle: `<svg viewBox="0 0 24 24" fill="none" class="omni-ai-btn-icon-svg" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`,
};

// ============================================
// Localization Manager
// ============================================
// Initialize with fallback while loading shared module
let i18n = {
  getMessage: (key) => chrome.i18n.getMessage(key),
};

// Initialize localization
async function initializeI18n() {
  try {
    const { primaryLanguage } = await new Promise((resolve) => {
      chrome.storage.sync.get("primaryLanguage", resolve);
    });
    const userLang = primaryLanguage || "en";

    // Standard chrome.i18n is available, but the user wants custom override logic
    // We'll fetch the JSON files manually as fallback to simulate i18n module
    const enUrl = chrome.runtime.getURL("_locales/en/messages.json");
    const enRes = await fetch(enUrl);
    const enData = await enRes.json();

    let targetData = {};
    if (userLang !== "en") {
      try {
        const targetUrl = chrome.runtime.getURL(
          `_locales/${userLang}/messages.json`,
        );
        const targetRes = await fetch(targetUrl);
        targetData = await targetRes.json();
      } catch (e) {
        console.warn("[Omni AI] Failed to load local messages:", userLang);
      }
    }

    const combinedData = { ...enData, ...targetData };

    i18n = {
      getMessage: (key) => {
        if (combinedData[key]) return combinedData[key].message;
        return chrome.i18n.getMessage(key) || key;
      },
    };
  } catch (e) {
    console.error("[Omni AI] Localization initialization failed:", e);
    // Fallback stays as chrome.i18n
  }
}

// Start loading immediately
initializeI18n();

// ============================================
// State
// ============================================
let overlay = null;
let isOverlayVisible = false;
let lastSelection = null;
let quickActionBtn = null;
let activeInputElement = null; // Track input element for replacement when focus is lost

// Store state for navigation
let lastMenuContext = null;

// ============================================
// Initialization
// ============================================

// ============================================
// Diff Logic
// ============================================

function computeDiff(original, corrected) {
  if (!original || !corrected) return corrected || "";

  const words1 = original.trim().split(/\s+/);
  const words2 = corrected.trim().split(/\s+/);

  // If text is totally different, return new text highlighted
  if (
    Math.abs(words1.length - words2.length) >
    Math.max(words1.length, words2.length) * 0.8
  ) {
    return `<span class="omni-ai-diff-ins">${corrected}</span>`;
  }

  let html = "";
  let i = 0,
    j = 0;

  while (i < words1.length || j < words2.length) {
    if (i < words1.length && j < words2.length && words1[i] === words2[j]) {
      html += words1[i] + " ";
      i++;
      j++;
    } else {
      // Look ahead to find synchronization point
      let bestMatchK1 = -1,
        bestMatchK2 = -1;

      // Search for words1[i] in words2 (deletion check)
      // Search for words2[j] in words1 (insertion check)

      // Simple heuristic: check next 3 words
      let foundMatch = false;

      // Check for insertion (can we find words1[i] later in words2?)
      for (let k2 = j + 1; k2 < Math.min(j + 5, words2.length); k2++) {
        if (i < words1.length && words1[i] === words2[k2]) {
          // Found words1[i] at words2[k2].
          // It means words2[j...k2-1] are insertions.
          while (j < k2) {
            html += `<span class="omni-ai-diff-ins">${words2[j]}</span> `;
            j++;
          }
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // Check for deletion (can we find words2[j] later in words1?)
        for (let k1 = i + 1; k1 < Math.min(i + 5, words1.length); k1++) {
          if (j < words2.length && words1[k1] === words2[j]) {
            // Found words2[j] at words1[k1].
            // It means words1[i...k1-1] are deletions.
            while (i < k1) {
              html += `<span class="omni-ai-diff-del">${words1[i]}</span> `;
              i++;
            }
            foundMatch = true;
            break;
          }
        }
      }

      if (!foundMatch) {
        // Treat as replacement (delete current, insert current)
        if (i < words1.length) {
          html += `<span class="omni-ai-diff-del">${words1[i]}</span> `;
          i++;
        }
        if (j < words2.length) {
          html += `<span class="omni-ai-diff-ins">${words2[j]}</span> `;
          j++;
        }
      }
    }
  }
  return html.trim();
}

function updateSmartFixCard(card, originalText, correctedText, isInput) {
  if (!card) return;

  if (originalText.trim() === correctedText.trim()) {
    card.innerHTML = `
        <div class="omni-ai-suggestion-icon" style="background:rgba(34,197,94,0.1);color:var(--ai-success)">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="omni-ai-suggestion-info">
            <div class="omni-ai-suggestion-label" style="color:var(--ai-success)">${i18n.getMessage("overlay_no_issues")}</div>
            <div class="omni-ai-suggestion-content">Text looks great!</div>
        </div>
    `;
    return;
  }

  const diffHtml = computeDiff(originalText, correctedText);

  card.innerHTML = `
     <div style="flex:1;">
        <div class="omni-ai-suggestion-label">${i18n.getMessage("overlay_suggested_fix")}</div>
        <div class="omni-ai-suggestion-content" style="margin-top:4px; line-height:1.4;">${diffHtml}</div>
        <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="omni-ai-btn-primary" id="omniAiAcceptFix" style="font-size:10px; padding:4px 8px;">${i18n.getMessage("overlay_accept")}</button>
            <button class="omni-ai-btn-secondary" id="omniAiDismissFix" style="font-size:10px; padding:4px 8px;">${i18n.getMessage("overlay_dismiss")}</button>
        </div>
     </div>
  `;

  const acceptBtn = card.querySelector("#omniAiAcceptFix");
  const dismissBtn = card.querySelector("#omniAiDismissFix");

  acceptBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    replaceSelectedText(correctedText);
    hideOverlay();
  });

  dismissBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    card.innerHTML = `
        <div class="omni-ai-suggestion-icon">
           ${ICONS.magic}
        </div>
        <div class="omni-ai-suggestion-info">
            <div class="omni-ai-suggestion-label">Fix Grammar</div>
            <div class="omni-ai-suggestion-content">Corrects spelling and grammar</div>
        </div>
    `;
    card.addEventListener(
      "click",
      () => handleAction("grammar", originalText, isInput),
      { once: true },
    );
  });
}

function init() {
  setupMessageListener();
  setupSelectionListener();
  initTheme();
}

/**
 * Initialize Theme logic
 */
async function initTheme() {
  const THEME_KEY = "omni_ai_theme";
  const { [THEME_KEY]: themePreference = "system" } =
    await chrome.storage.sync.get(THEME_KEY);

  let effectiveTheme = themePreference;
  if (themePreference === "system") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  const isLight = effectiveTheme === "light";
  document.documentElement.classList.toggle("omni-ai-light-mode", isLight);
}

/**
 * Set up message listener for service worker communication
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case "GET_SELECTION": {
        const isInput = isTextInput(document.activeElement);
        if (isInput) activeInputElement = document.activeElement;
        sendResponse({
          selection: getSelectedText(),
          isInput: isInput,
        });
        break;
      }

      case "SHOW_RESULT":
        showResultOverlay(message.payload, message.payload.isInput);
        sendResponse({ success: true });
        break;

      case "REPLACE_SELECTION":
        replaceSelectedText(message.payload.text);
        sendResponse({ success: true });
        break;

      case "SHOW_QUICK_ASK_OVERLAY": {
        hideQuickActionButton();
        const rect = getSelectionRect();
        const selection = getSelectedText();
        const isInput = isTextInput(document.activeElement);
        if (isInput) activeInputElement = document.activeElement;
        showQuickAskOverlay("", rect, selection, null, isInput);
        sendResponse({ success: true });
        break;
      }

      case "THEME_CHANGED":
        initTheme();
        sendResponse({ success: true });
        break;

      case "PING":
        sendResponse({ success: true, active: true });
        break;

      default:
        console.warn("[Omni AI] Unknown message type:", message.type);
        sendResponse({ success: false, error: "Unknown message type" });
    }
    return true; // Keep channel open for async if needed
  });
}

/**
 * Set up selection change listener
 */
function setupSelectionListener() {
  const handleSelectionChange = () => {
    setTimeout(() => {
      const text = getSelectedText();
      const activeElement = document.activeElement;
      const isInput = isTextInput(activeElement);

      if (text.length > 0 && !isOverlayVisible) {
        if (isInput) {
          showQuickActionButtonForInput(activeElement);
        } else if (window.getSelection().rangeCount > 0) {
          showQuickActionButton(window.getSelection());
        }
      } else {
        const isInInputWithContent =
          isInput && activeElement.value.trim().length > 0;
        if (!isInInputWithContent) {
          hideQuickActionButton();
        } else {
          showQuickActionButtonForInput(activeElement);
        }
      }
    }, 10);
  };

  document.addEventListener("mouseup", (e) => {
    if (overlay && !overlay.contains(e.target)) {
      hideOverlay();
    }
    handleSelectionChange();
  });

  document.addEventListener("keyup", (e) => {
    // Handle Ctrl+A (Select All) and Shift+Arrows (Selection)
    if (
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") ||
      (e.shiftKey && e.key.startsWith("Arrow"))
    ) {
      handleSelectionChange();
    }
  });

  // Handle paste events
  document.addEventListener("paste", (e) => {
    const target = e.target;
    if (isTextInput(target)) {
      setTimeout(() => {
        if (target.value.trim().length > 0 && !isOverlayVisible) {
          showQuickActionButtonForInput(target);
        }
      }, 100);
    }
  });
}

// ============================================
// Quick Action Button
// ============================================

function showQuickActionButton(selection) {
  if (quickActionBtn) hideQuickActionButton();

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) return;

  createQuickBtn(rect, false);
  setupQuickBtnEvents(selection.toString(), false);
}

function showQuickActionButtonForInput(inputElement) {
  if (quickActionBtn) hideQuickActionButton();

  const rect = inputElement.getBoundingClientRect();
  createQuickBtn(rect, true);
  setupQuickBtnEvents(null, inputElement); // Pass element to grab text later
}

async function createQuickBtn(rect, isInput) {
  quickActionBtn = document.createElement("button");
  quickActionBtn.className = "omni-ai-quick-btn";

  // Theme check
  const THEME_KEY = "omni_ai_theme";
  const { [THEME_KEY]: themePreference = "system" } =
    await chrome.storage.sync.get(THEME_KEY);
  let effectiveTheme = themePreference;
  if (themePreference === "system") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  if (effectiveTheme === "light") {
    quickActionBtn.classList.add("omni-ai-light-mode");
  }

  quickActionBtn.innerHTML = ICONS.btnSparkle;

  // Position
  const top = isInput
    ? rect.bottom + window.scrollY - 30
    : rect.bottom + window.scrollY + 5;
  const left = isInput
    ? rect.right + window.scrollX - 30
    : rect.right + window.scrollX;

  quickActionBtn.style.top = `${top}px`;
  quickActionBtn.style.left = `${left}px`;
  document.body.appendChild(quickActionBtn);
}

function setupQuickBtnEvents(text = null, inputElement = null) {
  quickActionBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  quickActionBtn.addEventListener("mouseup", (e) => e.stopPropagation());

  quickActionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isInput = !!inputElement;
    if (isInput) activeInputElement = inputElement;
    const currentText =
      text ||
      (inputElement ? getSelectedText() || inputElement.value.trim() : "");
    const btnRect = quickActionBtn.getBoundingClientRect();

    showQuickActionMenu(currentText, btnRect, null, isInput);
  });
}

function hideQuickActionButton() {
  if (quickActionBtn) {
    quickActionBtn.remove();
    quickActionBtn = null;
  }
}

// ============================================
// Main Overlay Logic
// ============================================

async function showQuickActionMenu(
  text,
  anchorRect = null,
  lockedPosition = null,
  isInput = false,
) {
  hideQuickActionButton();
  hideOverlay();

  // Save context for Back button
  lastMenuContext = { text, anchorRect, lockedPosition, isInput };

  // Fetch settings
  const THEME_KEY = "omni_ai_theme";
  const {
    [THEME_KEY]: currentTheme = "system",
    primaryLanguage = "vi",
    defaultLanguage = "en",
  } = await chrome.storage.sync.get([
    "primaryLanguage",
    "defaultLanguage",
    THEME_KEY,
  ]);

  const languageFlags = {
    en: "🇬🇧",
    vi: "🇻🇳",
    es: "🇪🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    it: "🇮🇹",
    pt: "🇵🇹",
    ja: "🇯🇵",
    ko: "🇰🇷",
    zh: "🇨🇳",
  };

  const pFlag = languageFlags[primaryLanguage] || "🌐";
  const dFlag = languageFlags[defaultLanguage] || "🏳️";
  const pCode = primaryLanguage.toUpperCase();
  const dCode = defaultLanguage.toUpperCase();

  // Create Overlay
  overlay = createOverlayElement(currentTheme);

  // Header
  const header = `
    <div class="omni-ai-overlay-header">
       <div class="omni-ai-brand">
         ${ICONS.brand}
         <span>${i18n.getMessage("extName")}</span>
       </div>
       <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
    </div>
  `;

  // Quick Fix Section (With Loading State)
  // - If Input: Show "Thinking..." -> Smart Fix
  // - If Text: Show "Translating..." -> Translation Result
  let quickFix = "";
  if (isInput) {
    quickFix = `
    <div class="omni-ai-quick-fix-section">
      <div class="omni-ai-suggestion-card" id="omniAiMagicFix">
        <div class="omni-ai-suggestion-icon">
           <div class="omni-ai-spinner" style="width:14px;height:14px;border-width:2px;"></div>
        </div>
        <div class="omni-ai-suggestion-info">
            <div class="omni-ai-suggestion-label" style="opacity:0.7">${i18n.getMessage("status_thinking")}</div>
            <div class="omni-ai-suggestion-content" style="opacity:0.5">${i18n.getMessage("status_processing")}</div>
        </div>
      </div>
    </div>
  `;
  } else {
    // Non-input: Translation Card
    quickFix = `
    <div class="omni-ai-quick-fix-section">
      <div class="omni-ai-suggestion-card" id="omniAiTranslateCard">
        <div class="omni-ai-suggestion-icon">
           <div class="omni-ai-spinner" style="width:14px;height:14px;border-width:2px;"></div>
        </div>
        <div class="omni-ai-suggestion-info">
            <div class="omni-ai-suggestion-label" style="opacity:0.7">${i18n.getMessage("overlay_translated_to")} ${pCode}...</div>
            <div class="omni-ai-suggestion-content" style="opacity:0.5">${i18n.getMessage("status_processing")}</div>
        </div>
      </div>
    </div>
  `;
  }

  // Menu Grid
  const menu = `
    <div class="omni-ai-menu-grid">
       <button class="omni-ai-menu-item" data-action="translate_primary">
         <span class="omni-ai-menu-icon">${pFlag}</span> ${i18n.getMessage("ui_to")} ${pCode}
       </button>
       <button class="omni-ai-menu-item" data-action="translate_default">
         <span class="omni-ai-menu-icon">${dFlag}</span> ${i18n.getMessage("ui_to")} ${dCode}
       </button>

       <button class="omni-ai-menu-item" data-action="grammar">
         <span class="omni-ai-menu-icon">${ICONS.grammar}</span> ${i18n.getMessage("action_grammar")}
       </button>
       <button class="omni-ai-menu-item" data-action="rephrase">
         <span class="omni-ai-menu-icon">${ICONS.rephrase}</span> ${i18n.getMessage("action_rephrase")}
       </button>

       <button class="omni-ai-menu-item" data-action="reply">
         <span class="omni-ai-menu-icon">${ICONS.reply}</span> ${i18n.getMessage("action_reply")}
       </button>
       <button class="omni-ai-menu-item" data-action="emoji">
         <span class="omni-ai-menu-icon">${ICONS.emoji}</span> ${i18n.getMessage("action_emojify")}
       </button>

       <button class="omni-ai-menu-item" data-action="tone">
         <span class="omni-ai-menu-icon">${ICONS.tone}</span> ${i18n.getMessage("action_tone")}
       </button>
       <button class="omni-ai-menu-item" data-action="summarize">
         <span class="omni-ai-menu-icon">${ICONS.summarize}</span> ${i18n.getMessage("action_summarize")}
       </button>
       
       <button class="omni-ai-menu-item omni-ai-menu-full" data-action="explain">
         <span class="omni-ai-menu-icon" style="margin-right: 6px;">${ICONS.explain}</span> ${i18n.getMessage("action_explain")}
       </button>
    </div>
  `;

  // Input
  const inputSection = `
    <div class="omni-ai-input-wrapper" style="padding: 0 12px 12px;">
       <div style="position:relative; width:100%;">
         <textarea class="omni-ai-input" placeholder="${i18n.getMessage("popup_quickAsk")}" id="omniAiInlineInput" style="padding-right: 42px; display: block; margin: 0;"></textarea>
         <button id="omniAiInputBtn" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); border:none; background:var(--ai-accent-gradient); color:white; cursor:pointer; width:28px; height:28px; border-radius:var(--ai-radius-sm); display:flex; align-items:center; justify-content:center; transition:all 0.2s; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px; transform: translateX(1px);"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
         </button>
       </div>
    </div>
  `;

  overlay.innerHTML = header + quickFix + menu + inputSection;
  document.body.appendChild(overlay);

  // Position Logic
  positionOverlay(anchorRect, lockedPosition);

  // Bind Events
  bindMenuEvents(text, isInput);

  // TRIGGER AUTOMATIC ACTION
  if (isInput) {
    // Existing Smart Fix Logic
    sendMessageToBackground({
      type: "QUICK_ACTION",
      payload: { action: "grammar", text, preset: "chat" },
    })
      .then((response) => {
        const card = document.getElementById("omniAiMagicFix");
        if (response.success && card) {
          updateSmartFixCard(card, text, response.data.response, isInput);
        } else if (card) {
          // Show error or revert
          card.innerHTML = `
              <div class="omni-ai-suggestion-icon" style="color:var(--ai-error);background:rgba(239,68,68,0.1)">!</div>
              <div class="omni-ai-suggestion-info">
                  <div class="omni-ai-suggestion-label" style="color:var(--ai-error)">${i18n.getMessage("overlay_error")}</div>
                  <div class="omni-ai-suggestion-content">${i18n.getMessage("overlay_analysis_failed")}</div>
              </div>
           `;
        }
      })
      .catch(() => {}); // silent fail
  } else {
    // Non-Input: Trigger Translation
    sendMessageToBackground({
      type: "QUICK_ACTION",
      payload: { action: "translate_primary", text, preset: "chat" },
    })
      .then((response) => {
        const card = document.getElementById("omniAiTranslateCard");
        if (!card) return;

        if (response.success) {
          card.innerHTML = `
              <div class="omni-ai-suggestion-info">
                  <div class="omni-ai-suggestion-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${i18n.getMessage("overlay_translated_to")} ${pCode}:</span>
                    <button class="omni-ai-icon-btn" id="omniAiCopyTrans" title="${i18n.getMessage("overlay_copy")}" style="width:20px;height:20px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>
                  <div class="omni-ai-suggestion-content" style="margin-top:4px; line-height:1.4; color:var(--ai-text-primary); font-weight:500;">
                     ${response.data.response}
                  </div>
              </div>
          `;

          // Bind Copy
          const copyBtn = card.querySelector("#omniAiCopyTrans");
          if (copyBtn) {
            copyBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(response.data.response);
              // Visual feedback
              copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ai-success)" stroke-width="2" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
              setTimeout(() => {
                copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
              }, 1500);
            });
          }

          // Clicking the card opens full view
          card.style.cursor = "pointer";
          card.addEventListener("click", (e) => {
            // Only if not clicking copy btn
            if (!e.target.closest("#omniAiCopyTrans")) {
              showResultOverlay(
                {
                  action: "translate_primary",
                  result: response.data.response,
                  originalText: text,
                  preset: "chat",
                },
                isInput,
              );
            }
          });
        } else {
          // Error State
          card.innerHTML = `
              <div class="omni-ai-suggestion-icon" style="color:var(--ai-error);background:rgba(239,68,68,0.1)">!</div>
              <div class="omni-ai-suggestion-info">
                  <div class="omni-ai-suggestion-label" style="color:var(--ai-error)">${i18n.getMessage("overlay_error")}</div>
                  <div class="omni-ai-suggestion-content">${i18n.getMessage("overlay_translation_failed")}</div>
              </div>
           `;
        }
      })
      .catch(() => {});
  }

  isOverlayVisible = true;
}

function bindMenuEvents(text, isInput) {
  // Close
  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);

  // Menu Items
  overlay.querySelectorAll(".omni-ai-menu-item").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleAction(btn.dataset.action, text, isInput),
    );
  });

  // Inline Input
  const input = overlay.querySelector("#omniAiInlineInput");
  const inputBtn = overlay.querySelector("#omniAiInputBtn");

  const triggerAsk = () => {
    const query = input.value.trim();
    if (query.length > 0) {
      handleAskAction(query, text, isInput);
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      triggerAsk();
    }
  });

  if (inputBtn) {
    inputBtn.addEventListener("click", triggerAsk);
  }
}

async function handleAction(action, text, isInput) {
  showLoadingInOverlay();

  let preset = "chat";
  if (action === "tone") {
    const { currentPreset } = await chrome.storage.local.get("currentPreset");
    const validTones = [
      "professional",
      "casual",
      "friendly",
      "direct",
      "confident",
    ];
    if (currentPreset && validTones.includes(currentPreset.toLowerCase())) {
      preset = currentPreset;
    } else {
      preset = "professional";
    }
  }

  sendMessageToBackground({
    type: "QUICK_ACTION",
    payload: { action, text, preset },
  })
    .then((response) => {
      if (response.success) {
        showResultOverlay(
          {
            action,
            result: response.data.response,
            originalText: text,
            preset,
          },
          isInput,
        );
      } else {
        showErrorInOverlay(response.error);
      }
    })
    .catch((err) => showErrorInOverlay(err.message));
}

async function handleAskAction(query, originalText, isInput) {
  showLoadingInOverlay();

  const prompt = originalText
    ? `Context: "${originalText}"\n\nQuestion: ${query}`
    : query;

  try {
    const response = await sendMessageToBackground({
      type: "QUICK_ASK",
      payload: { query: prompt },
    });

    if (response.success) {
      showResultOverlay(
        {
          action: "quick_ask",
          result: response.data.response,
          originalText: originalText,
          preset: "chat",
          query: query,
        },
        isInput, // Use the passed isInput value
      );
    } else {
      showErrorInOverlay(response.error);
    }
  } catch (err) {
    showErrorInOverlay(err.message);
  }
}

// ============================================
// Positioning Logic (Left Anchored)
// ============================================

/**
 * Get rect for current selection, supporting both normal text and inputs
 */
function getSelectionRect() {
  const activeElement = document.activeElement;
  if (isTextInput(activeElement)) {
    const rect = activeElement.getBoundingClientRect();
    // For inputs, we return the rect but we'll try to refine if we can later
    return rect;
  }

  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    return selection.getRangeAt(0).getBoundingClientRect();
  }

  return null;
}

function positionOverlay(anchorRect = null, lockedPosition = null) {
  if (!overlay) return;

  // Ensure visibility to calculate height
  overlay.style.display = "flex";
  overlay.style.visibility = "hidden";

  if (lockedPosition) {
    overlay.style.top = `${lockedPosition.top}px`;
    overlay.style.left = `${lockedPosition.left}px`;
    overlay.style.visibility = "visible";
    overlay.style.transform = "none";
    return;
  }

  if (anchorRect) {
    const overlayWidth = 320;
    const gap = 12;

    // Preference: RIGHT-aligned with anchor (grows left)
    // This puts the overlay to the left of the 'sparkle icon' position
    let left = anchorRect.right - overlayWidth;
    let top = anchorRect.bottom + gap;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const overlayHeight = overlay.offsetHeight || 400;

    // 1. Horizontal Boundary Check
    // If aligning right edge causes it to go off-screen to the left:
    if (left < 10) {
      // Align left edge with anchor instead
      left = anchorRect.left;
    }

    // If still off-screen to the right after that:
    if (left + overlayWidth > viewportWidth - 10) {
      left = viewportWidth - overlayWidth - 10;
    }

    // Always ensure it's at least 10px from the left edge
    if (left < 10) left = 10;

    // 2. Vertical Boundary Check (Prefer Below, Flip Above if needed)
    if (top + overlayHeight > viewportHeight + window.scrollY - 10) {
      // Flip up
      top = anchorRect.top + window.scrollY - overlayHeight - gap;
    } else {
      top += window.scrollY;
    }

    // Adjust left for scroll
    left += window.scrollX;

    // Clamp vertical final
    const minTop = window.scrollY + 10;
    const maxTop = viewportHeight + window.scrollY - overlayHeight - 10;
    if (top < minTop) top = minTop;
    if (top > maxTop) top = maxTop;

    overlay.style.top = `${Math.round(top)}px`;
    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.transformOrigin = "top right";
    overlay.style.transform = "none";
  } else {
    // True Center
    overlay.style.top = "50%";
    overlay.style.left = "50%";
    overlay.style.transform = "translate(-50%, -50%)";
    overlay.style.position = "fixed";
  }

  overlay.style.visibility = "visible";
}

// ============================================
// Helpers
// ============================================

function createOverlayElement(themePreference = "system") {
  const el = document.createElement("div");
  el.className = "omni-ai-overlay";

  let effectiveTheme = themePreference;
  if (themePreference === "system") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  // Dark is default in CSS (lines 13-15)
  // Light is an override (line 55)
  if (effectiveTheme === "light") {
    el.classList.add("omni-ai-light-mode");
  } else {
    el.classList.remove("omni-ai-light-mode");
  }

  return el;
}

function hideOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    isOverlayVisible = false;
    lastMenuContext = null; // Clear context on full close
  }
}

function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function getSelectedText() {
  const activeElement = document.activeElement;
  if (isTextInput(activeElement)) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    const selection = activeElement.value.substring(start, end);

    // If focus is in input but no text selected, return the whole content
    if (!selection && activeElement.value.trim().length > 0) {
      return activeElement.value.trim();
    }
    return selection;
  }
  return window.getSelection().toString().trim();
}

function isTextInput(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    // Only allow text-based inputs where text manipulation makes sense
    const allowedTypes = ["text", "email", "number", "search", "tel", "url"];
    return allowedTypes.includes(type);
  }
  return false;
}

function showLoadingInOverlay() {
  // Try to find the content area to replace, or the grid if first time
  let content = overlay.querySelector(".omni-ai-content-area");
  const menuGrid = overlay.querySelector(".omni-ai-menu-grid");

  // If we are coming from the menu, we want to replace the menu-grid
  // with the content-area style for loading
  if (!content && menuGrid) {
    // Create new content area replacing grid
    content = document.createElement("div");
    content.className = "omni-ai-content-area";
    menuGrid.replaceWith(content);
  } else if (!content) {
    // Fallback if structure is weird (shouldn't happen)
    content = document.createElement("div");
    content.className = "omni-ai-content-area";
    overlay.appendChild(content);
  }

  // Hide other sections that shouldn't be visible during loading
  const inputSection = overlay.querySelector(".omni-ai-input-wrapper");
  const quickFix = overlay.querySelector(".omni-ai-quick-fix-section");
  const footer = overlay.querySelector(".omni-ai-footer-actions");

  if (inputSection) inputSection.style.display = "none";
  if (quickFix) quickFix.style.display = "none";
  if (footer) footer.style.display = "none";

  // Inject Loading HTML
  content.innerHTML = `
    <div class="omni-ai-loading">
      <div class="omni-ai-spinner"></div>
      <div class="omni-ai-shimmer-text">${i18n.getMessage("status_processing")}</div>
    </div>`;
  content.style.display = "block";
}

function renderToneSelector(activeTone) {
  const tones = ["Professional", "Casual", "Friendly", "Direct", "Confident"];
  const chips = tones
    .map((tone) => {
      const isActive = tone.toLowerCase() === activeTone.toLowerCase();
      const style = isActive
        ? "background:rgba(139,92,246,0.15); color:var(--ai-accent); border:1px solid rgba(139,92,246,0.3);"
        : "background:transparent; color:var(--ai-text-secondary); border:1px solid var(--ai-border);";
      const label = i18n.getMessage("tone_" + tone.toLowerCase()) || tone;
      return `<button class="omni-ai-tone-chip" data-tone="${tone.toLowerCase()}" style="padding:3px 10px; border-radius:100px; font-size:11px; cursor:pointer; font-weight:500; white-space:nowrap; transition:all 0.2s; ${style}">${label}</button>`;
    })
    .join("");

  return `<div class="omni-ai-tone-selector" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed var(--ai-border);">${chips}</div>`;
}

function showResultOverlay(payload, isInput = false) {
  const { result, action, originalText, preset, query } = payload;
  hideQuickActionButton();

  if (!overlay) {
    const el = document.createElement("div");
    el.className = "omni-ai-overlay";
    // Check theme
    if (document.documentElement.classList.contains("omni-ai-light-mode")) {
      el.classList.add("omni-ai-light-mode");
    }
    overlay = el;
    document.body.appendChild(overlay);

    // Try to position near selection
    const rect = getSelectionRect();
    positionOverlay(rect);
  }

  // Actions that benefit from diff view
  const diffActions = ["grammar", "rephrase", "tone", "clarity", "improve"];
  let contentHtml = result;

  const safeAction = (action || "").toLowerCase().trim();

  if (diffActions.includes(safeAction) && originalText) {
    contentHtml = computeDiff(originalText, result);
  }

  // Header with Back Button logic
  const backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

  // Footer buttons logic
  const replaceBtnHtml = isInput
    ? `<button class="omni-ai-btn-primary" id="omniAiReplace">${i18n.getMessage("overlay_replace")}</button>`
    : ``;

  overlay.innerHTML = `
    <div class="omni-ai-overlay-header">
        <button class="omni-ai-icon-btn" id="omniAiBack" title="${i18n.getMessage("btn_back")}">${backIcon}</button>
        <span style="font-weight:600;font-size:14px;margin-left:5px;flex:1;">${i18n.getMessage("overlay_result")}</span>
        <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
    </div>
    <div class="omni-ai-content-area">
        ${action === "quick_ask" && query ? `<div class="omni-ai-context-preview" style="margin-top:0;"><div class="omni-ai-context-label">${i18n.getMessage("quick_ask_title")}</div><div class="omni-ai-context-content" style="-webkit-line-clamp: 3;">${query}</div></div>` : ""}
        ${safeAction === "tone" ? renderToneSelector(preset || "professional") : ""}
        <div class="omni-ai-result-text">${contentHtml}</div>
    </div>
    <div class="omni-ai-footer-actions">
        <button class="omni-ai-btn-secondary" id="omniAiCopy">${i18n.getMessage("overlay_copy")}</button>
        ${replaceBtnHtml}
    </div>
  `;

  // Close
  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);

  // Back Navigation
  overlay.querySelector("#omniAiBack").addEventListener("click", () => {
    if (lastMenuContext) {
      showQuickActionMenu(
        lastMenuContext.text,
        lastMenuContext.anchorRect,
        lastMenuContext.lockedPosition,
        lastMenuContext.isInput,
      );
    } else {
      hideOverlay();
    }
  });

  // Tone Chip Click
  if (safeAction === "tone") {
    const toneSelector = overlay.querySelector(".omni-ai-tone-selector");
    if (toneSelector) {
      toneSelector.addEventListener("click", async (e) => {
        if (e.target.classList.contains("omni-ai-tone-chip")) {
          const newTone = e.target.dataset.tone;
          if (newTone === (preset || "professional").toLowerCase()) return;

          // UI Update
          const resultTextEl = overlay.querySelector(".omni-ai-result-text");
          resultTextEl.style.opacity = "0.5";
          resultTextEl.innerHTML =
            '<div class="omni-ai-spinner" style="margin:20px auto;"></div>';

          // Optimistic Chip Update
          overlay.querySelectorAll(".omni-ai-tone-chip").forEach((chip) => {
            const isActive = chip.dataset.tone === newTone;
            chip.style.background = isActive
              ? "rgba(139,92,246,0.15)"
              : "transparent";
            chip.style.color = isActive
              ? "var(--ai-accent)"
              : "var(--ai-text-secondary)";
            chip.style.borderColor = isActive
              ? "rgba(139,92,246,0.3)"
              : "var(--ai-border)";
          });

          // Fetch
          try {
            const response = await sendMessageToBackground({
              type: "QUICK_ACTION",
              payload: { action: "tone", text: originalText, preset: newTone },
            });

            if (response.success && overlay) {
              showResultOverlay(
                {
                  action: "tone",
                  result: response.data.response,
                  originalText,
                  preset: newTone,
                },
                isInput,
              );
            }
          } catch (err) {
            resultTextEl.innerText = "Error: " + err.message;
            resultTextEl.style.opacity = "1";
          }
        }
      });
    }
  }

  // Copy
  const copyBtn = overlay.querySelector("#omniAiCopy");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(result);
    copyBtn.textContent = i18n.getMessage("msg_copied");
    setTimeout(
      () => (copyBtn.textContent = i18n.getMessage("overlay_copy")),
      1500,
    );
  });

  // Replace (if exists)
  const replaceBtn = overlay.querySelector("#omniAiReplace");
  if (replaceBtn) {
    replaceBtn.addEventListener("click", () => {
      replaceSelectedText(result); // Replace with CLEAN result, not diff HTML
      hideOverlay();
    });
  }
}

function replaceSelectedText(newText) {
  let activeElement = document.activeElement;

  // Fallback to stored input element if focus was lost (e.g. to overlay buttons)
  if (
    !isTextInput(activeElement) &&
    activeInputElement &&
    document.body.contains(activeInputElement)
  ) {
    activeElement = activeInputElement;
  }

  if (isTextInput(activeElement)) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;

    // If no text selected (cursor placement only), replace the whole input value
    if (start === end) {
      activeElement.value = newText;
    } else {
      // Replace specific selection
      const val = activeElement.value;
      activeElement.value =
        val.substring(0, start) + newText + val.substring(end);
    }

    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // ContentEditable / Selection
    document.execCommand("insertText", false, newText);
  }
}

async function showQuickAskOverlay(
  initialValue = "",
  lockedRect = null,
  originalText = null,
  autoQuery = null,
  isInput = false,
) {
  if (!overlay) {
    const THEME_KEY = "omni_ai_theme";
    const { [THEME_KEY]: currentTheme = "system" } =
      await chrome.storage.sync.get(THEME_KEY);
    overlay = createOverlayElement(currentTheme);
    document.body.appendChild(overlay);
    positionOverlay(lockedRect);
  }

  const backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

  const header = `
  <div class="omni-ai-overlay-header">
     <button class="omni-ai-icon-btn" id="omniAiBack" title="${i18n.getMessage("btn_back")}">${backIcon}</button>
     <div class="omni-ai-brand">${i18n.getMessage("quick_ask_title")}</div>
     <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
  </div>`;

  let contextBlock = "";
  if (originalText) {
    const truncated =
      originalText.length > 120
        ? originalText.substring(0, 117) + "..."
        : originalText;
    contextBlock = `
    <div class="omni-ai-context-preview">
      <div class="omni-ai-context-label">${i18n.getMessage("popup_context")}</div>
      <div class="omni-ai-context-content">${truncated}</div>
    </div>`;
  }

  const content = `
  <div class="omni-ai-content-area">
      ${contextBlock}
      <div class="omni-ai-input-wrapper" style="padding:0;">
        <div style="position:relative; width:100%;">
          <textarea class="omni-ai-input" id="omniAiQuickInput" placeholder="${i18n.getMessage("popup_quickAsk")}" style="min-height:100px; margin-bottom: 0; padding-right: 42px; display: block;"></textarea>
          <button id="omniAiInputBtn" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); border:none; background:var(--ai-accent-gradient); color:white; cursor:pointer; width:30px; height:30px; border-radius:var(--ai-radius-sm); display:flex; align-items:center; justify-content:center; transition:all 0.2s; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; transform: translateX(1px);"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
      
      <div id="omniAiLoading" class="omni-ai-loading" style="display:none; padding: 20px 0;">
         <div class="omni-ai-spinner"></div>
         <div class="omni-ai-shimmer-text">${i18n.getMessage("status_thinking")}</div>
      </div>
      
      <div id="omniAiQuickResult" style="display:none;">
        <div class="omni-ai-result-text"></div>
      </div>
  </div>
  <div class="omni-ai-footer-actions">
      <button class="omni-ai-btn-secondary" id="omniAiQuickCopy" style="display:none;">${i18n.getMessage("overlay_copy")}</button>
  </div>
  `;

  overlay.innerHTML = header + content;

  // Events
  overlay.querySelector("#omniAiClose").addEventListener("click", hideOverlay);
  overlay.querySelector("#omniAiBack").addEventListener("click", () => {
    if (lastMenuContext) {
      showQuickActionMenu(
        lastMenuContext.text,
        lastMenuContext.anchorRect,
        lastMenuContext.lockedPosition,
        lastMenuContext.isInput,
      );
    } else if (originalText) {
      showQuickActionMenu(originalText, null, lockedRect, false);
    } else {
      hideOverlay();
    }
  });
  const input = overlay.querySelector("#omniAiQuickInput");
  const inputBtn = overlay.querySelector("#omniAiInputBtn");
  const copyBtn = overlay.querySelector("#omniAiQuickCopy");
  const loading = overlay.querySelector("#omniAiLoading");
  const resultDiv = overlay.querySelector("#omniAiQuickResult");
  const resultText = resultDiv.querySelector(".omni-ai-result-text");

  if (!autoQuery) input.focus();

  // Copy Logic
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(resultText.innerText);
    copyBtn.textContent = i18n.getMessage("msg_copied");
    setTimeout(
      () => (copyBtn.textContent = i18n.getMessage("overlay_copy")),
      1500,
    );
  });

  const handleAsk = async () => {
    const query = input.value.trim();
    if (!query) return;

    // UI Loading
    const inputWrapper = overlay.querySelector(".omni-ai-input-wrapper");
    if (inputWrapper) inputWrapper.style.display = "none";

    copyBtn.style.display = "none";
    loading.style.display = "flex";

    try {
      handleAskAction(query, originalText, isInput);
    } catch (e) {
      loading.style.display = "none";
      resultDiv.style.display = "block";
      resultText.innerText = "Error: " + e.message;
    }
  };

  if (inputBtn) {
    inputBtn.addEventListener("click", handleAsk);
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  });

  if (autoQuery) {
    handleAsk();
  }
}

function showErrorInOverlay(msg) {
  if (overlay) {
    overlay.innerHTML = `
        <div class="omni-ai-overlay-header">
            <div class="omni-ai-brand" style="color:var(--ai-error);">${i18n.getMessage("overlay_error")}</div>
            <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
        </div>
        <div class="omni-ai-content-area" style="color:var(--ai-text-secondary);">
            ${msg}
        </div>`;
    overlay
      .querySelector("#omniAiClose")
      .addEventListener("click", hideOverlay);
  }
}

// Run
init();
