/**
 * Omni AI: Content Script
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
  // Bidirectional swap arrows -- distinguishes Smart Translate (auto-detects
  // direction) from the one-directional translate_primary/translate_default,
  // which would otherwise share the same globe icon and look identical.
  translateSmart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`,
  ask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`,
  emoji: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
  grammar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  btnSparkle: `<svg viewBox="0 0 24 24" fill="none" class="omni-ai-btn-icon-svg" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  retry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
};

// Untrusted text (AI output, page selections, provider error messages) only
// ever reaches markup through this (content/ui/render-helpers.js).
const escapeHtml = (text) => /** @type {any} */ (self).OMNI_RENDER.escapeHtml(text);

// ============================================
// Localization Manager
// ============================================
// Initialize with fallback while loading shared module
const isContextValid = () =>
  !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);

/** @type {{ getMessage: (key: string, substitutions?: string[]) => string }} */
let i18n = {
  getMessage: (key, substitutions) => {
    if (!isContextValid()) return key;
    return chrome.i18n.getMessage(key, substitutions) || key;
  },
};

// Initialize localization
async function initializeI18n() {
  try {
    let primaryLanguage = "en";
    if (isContextValid()) {
      try {
        const { getPrimaryLanguage } = await import(chrome.runtime.getURL("lib/storage.js"));
        primaryLanguage = (await getPrimaryLanguage()) || "en";
      } catch {
        primaryLanguage = "en";
      }
    }
    const userLang = primaryLanguage || "en";

    // Standard chrome.i18n is available, but the user wants custom override logic
    // We'll fetch the JSON files manually as fallback to simulate i18n module
    const enUrl = chrome.runtime.getURL("_locales/en/messages.json");
    // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
    const enRes = await fetch(enUrl);
    const enData = await enRes.json();

    let targetData = {};
    // primaryLanguage is a translation language, and only some of those ship a
    // _locales directory. toLocaleDir() maps the code to a directory (or en),
    // so the rest do not trigger a failing request on every page load.
    const { toLocaleDir } = await import(chrome.runtime.getURL("lib/languages.js"));
    const localeDir = toLocaleDir(String(userLang));
    if (localeDir !== "en") {
      try {
        const targetUrl = chrome.runtime.getURL(`_locales/${localeDir}/messages.json`);
        // eslint-disable-next-line no-restricted-syntax -- local extension resource (locale JSON via chrome.runtime.getURL), not an AI provider call.
        const targetRes = await fetch(targetUrl);
        targetData = await targetRes.json();
      } catch {
        console.warn("[Omni AI] Failed to load local messages:", localeDir);
      }
    }

    const combinedData = { ...enData, ...targetData };

    const { applySubstitutions } = await import(chrome.runtime.getURL("lib/i18n.js"));
    i18n = {
      getMessage: (key, substitutions) => {
        if (combinedData[key]) {
          return applySubstitutions(
            combinedData[key].message,
            combinedData[key].placeholders,
            substitutions,
          );
        }
        if (!isContextValid()) return key;
        return chrome.i18n.getMessage(key, substitutions) || key;
      },
    };
  } catch (e) {
    if (e.message?.includes("Extension context invalidated")) {
      console.warn("[Omni AI] Context invalidated during i18n init");
    } else {
      console.error("[Omni AI] Localization initialization failed:", e);
    }
  }
}

// Start loading immediately
initializeI18n();

// primaryLanguage is what initializeI18n() reads to pick this content
// script's own overlay locale (see the UI_LOCALE_CODES check inside it). A
// tab whose content script already loaded before the user changes Primary
// Language in Settings would otherwise show stale overlay text until the
// page is reloaded -- mirrors theme-manager.js's own storage.onChanged
// listener for the exact same live-update reason (omni_ai_theme).
if (isContextValid()) {
  import(chrome.runtime.getURL("lib/storage.js"))
    .then(({ onPrimaryLanguageChanged }) => onPrimaryLanguageChanged(initializeI18n))
    .catch(() => {});
}

// ============================================
// State
// ============================================
// Mirror of surface.card() for code that still reads the card element
// (positionOverlay, isEventInsideOmniUi). Only the surface creates the card.
let overlay = null;
let quickActionBtn = null;
let activeInputElement = null; // Track input element for replacement when focus is lost
const resultCache = new Map();

// Flash Actions: hovering the floating quick-action icon reveals a row of
// user-configured shortcuts (Settings > Flash Actions) that skip straight to
// a result, without opening the full quick-action menu.
const FLASH_ACTIONS_HOVER_DELAY = 500;
const FLASH_ACTIONS_HIDE_GRACE = 150;
const DEFAULT_FLASH_ACTIONS = ["smart_translate", "rephrase", "grammar"];
const FLASH_ACTION_LABEL_KEYS = {
  smart_translate: "overlay_smart_translation",
  translate_primary: "settings_flashAction_translatePrimary",
  translate_default: "settings_flashAction_translateDefault",
  grammar: "action_grammar",
  rephrase: "action_rephrase",
  reply: "action_reply",
  emoji: "action_emojify",
  tone: "action_tone",
  summarize: "action_summarize",
  explain: "action_explain",
};
// The row always renders in this fixed order, regardless of the order the
// selected actions happen to be stored in (settings.flashActions) -- an
// already-saved install can carry a stale order from before this list was
// last reordered, and chrome.storage.local isn't reset by a dev reload.
// Deliberately its own list, not Object.keys(FLASH_ACTION_LABEL_KEYS): that
// object's key order matches the Settings checkbox layout (an unrelated,
// earlier decision) and has grammar before rephrase -- DEFAULT_FLASH_ACTIONS
// above wants rephrase before grammar.
const FLASH_ACTION_CANONICAL_ORDER = [
  "smart_translate",
  "translate_primary",
  "translate_default",
  "rephrase",
  "grammar",
  "reply",
  "emoji",
  "tone",
  "summarize",
  "explain",
];
const FLASH_ACTION_ICONS = {
  smart_translate: ICONS.translateSmart,
  translate_primary: ICONS.translate,
  translate_default: ICONS.translate,
  grammar: ICONS.grammar,
  rephrase: ICONS.rephrase,
  reply: ICONS.reply,
  emoji: ICONS.emoji,
  tone: ICONS.tone,
  summarize: ICONS.summarize,
  explain: ICONS.explain,
};

// One flag per lib/languages.js registry code, for the quick-action menu's
// "Translate to <language>" buttons. A language spoken across many countries
// has no single correct flag; each pick below is just the most common
// convention (e.g. Arabic -> Saudi Arabia, Swahili -> Kenya). Unknown/future
// codes fall back to a generic globe/blank-flag at the call site.
const LANGUAGE_FLAGS = {
  am: "🇪🇹",
  ar: "🇸🇦",
  bn: "🇧🇩",
  zh: "🇨🇳",
  "zh-TW": "🇹🇼",
  cs: "🇨🇿",
  da: "🇩🇰",
  nl: "🇳🇱",
  en: "🇬🇧",
  tl: "🇵🇭",
  fi: "🇫🇮",
  fr: "🇫🇷",
  de: "🇩🇪",
  el: "🇬🇷",
  gu: "🇮🇳",
  ha: "🇳🇬",
  he: "🇮🇱",
  hi: "🇮🇳",
  hu: "🇭🇺",
  id: "🇮🇩",
  it: "🇮🇹",
  ja: "🇯🇵",
  jv: "🇮🇩",
  ko: "🇰🇷",
  ms: "🇲🇾",
  mr: "🇮🇳",
  no: "🇳🇴",
  fa: "🇮🇷",
  pl: "🇵🇱",
  pt: "🇵🇹",
  pa: "🇮🇳",
  ro: "🇷🇴",
  ru: "🇷🇺",
  es: "🇪🇸",
  sw: "🇰🇪",
  sv: "🇸🇪",
  ta: "🇮🇳",
  te: "🇮🇳",
  th: "🇹🇭",
  tr: "🇹🇷",
  uk: "🇺🇦",
  ur: "🇵🇰",
  vi: "🇻🇳",
};
// The toolbar pill holds the quick button and the flash-actions row; the row
// is empty and zero wide until the hover reveal fills it.
let quickToolbar = null;
let flashActionsRow = null;
// The text the toolbar acts on and its field (null on page text), so a card
// that closes can tell whether the toolbar still matches the selection.
let quickToolbarText = null;
let quickToolbarInput = null;
// Bumped by every reveal and collapse, so a late settings read or a finished
// collapse never acts on a newer reveal.
let flashRevealGen = 0;
let flashHoverTimer = null;
let flashHideTimer = null;

// Store state for navigation
let lastMenuContext = null;
let currentAnchorRect = null;
let lastRange = null;
let floatingButtonEnabled = true;

// Shadow UI root to isolate extension styles from host page CSS.
const OMNI_UI_HOST_ID = "omni-ai-shadow-host";
let omniUiHost = null;
let omniUiRoot = null;
let omniUiCssText = "";
let omniUiStylePromise = null;

function applyUiHostStyles(host) {
  host.style.setProperty("all", "initial", "important");
  host.style.setProperty("position", "static", "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("width", "0", "important");
  host.style.setProperty("height", "0", "important");
  host.style.setProperty("margin", "0", "important");
  host.style.setProperty("padding", "0", "important");
  host.style.setProperty("border", "0", "important");
  host.style.setProperty("line-height", "0", "important");
  host.style.setProperty("font-size", "0", "important");
}

// An iframe-mode rich text editor (TinyMCE classic, CKEditor 4, ...) makes
// this frame's own <body> contenteditable and saves body.innerHTML. A host
// mounted there is saved along with the content, and once the overlay has
// focus the host itself becomes the replace target, so the result lands at
// the end of the editor instead of over the selection. Mount on <html> then.
// Re-checked on every call: editors often turn the body editable only after
// this content script has already mounted the host.
function getUiMountPoint() {
  const body = document.body;
  return body && !body.isContentEditable ? body : document.documentElement;
}

function ensureUiRoot() {
  const mountPoint = getUiMountPoint();
  if (omniUiRoot && omniUiHost?.isConnected) {
    if (omniUiHost.parentNode !== mountPoint) mountPoint.appendChild(omniUiHost);
    return omniUiRoot;
  }

  let host = document.getElementById(OMNI_UI_HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = OMNI_UI_HOST_ID;
  }
  if (host.parentNode !== mountPoint) mountPoint.appendChild(host);

  applyUiHostStyles(host);
  omniUiHost = host;
  omniUiRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
  return omniUiRoot;
}

// Keyed on the host element itself (not just "has this ever run"): ensureUiRoot()
// deliberately re-creates the shadow host when the previous one is no longer
// connected to the DOM (e.g. a host page rewrites document.body, or an SPA
// route swap). Without this key, the memoized promise from the FIRST host
// would keep being returned and the new host would never get themed.
let omniUiThemeHost = null;
let omniUiThemeInitPromise = null;

function ensureUiTheme(host) {
  if (omniUiThemeHost !== host) {
    omniUiThemeHost = host;
    omniUiThemeInitPromise = import(chrome.runtime.getURL("lib/theme-manager.js"))
      .then((mod) => mod.initTheme(host))
      .catch((error) => {
        console.warn("[Omni AI] Failed to initialize theme:", error);
      });
  }
  return omniUiThemeInitPromise;
}

function ensureUiStyles(root = ensureUiRoot()) {
  let styleTag = root.querySelector("style[data-omni-ai-shadow-style='true']");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.setAttribute("data-omni-ai-shadow-style", "true");
    root.prepend(styleTag);
  }

  if (omniUiCssText) {
    styleTag.textContent = omniUiCssText;
    return Promise.resolve();
  }

  if (!omniUiStylePromise) {
    if (!isContextValid()) {
      omniUiStylePromise = Promise.resolve("");
    } else {
      const sheetPaths = ["lib/design-tokens.css", "lib/design-system.css", "content/overlay.css"];
      omniUiStylePromise = Promise.all(
        sheetPaths.map((p) =>
          // eslint-disable-next-line no-restricted-syntax -- local extension resource (design tokens/overlay CSS via chrome.runtime.getURL), not an AI provider call.
          fetch(chrome.runtime.getURL(p)).then((response) => {
            if (!response.ok) {
              throw new Error(`Failed to load ${p}: ${response.status}`);
            }
            return response.text();
          }),
        ),
      )
        .then((sheets) => {
          omniUiCssText = sheets.join("\n");
          return omniUiCssText;
        })
        .catch((error) => {
          console.warn("[Omni AI] Failed to load shadow CSS:", error);
          omniUiCssText = "";
          return "";
        });
    }
  }

  return omniUiStylePromise.then((cssText) => {
    styleTag.textContent = cssText || "";
  });
}

function ensureUiRootReady() {
  const root = ensureUiRoot();
  // Await both so the first paint never shows the default theme before the
  // async theme class lands (avoids a flash of the wrong theme).
  return Promise.all([ensureUiStyles(root), ensureUiTheme(omniUiHost)]).then(() => {
    // The --omni-motion-* tokens live on :host, so they only resolve once the
    // shadow styles are in. Read them once per host.
    const motion = /** @type {any} */ (self).OMNI_MOTION;
    if (omniMotionTokenHost !== omniUiHost && motion?.refreshTokens) {
      motion.refreshTokens(omniUiHost);
      omniMotionTokenHost = omniUiHost;
    }
    return root;
  });
}

let omniMotionTokenHost = null;

// ============================================
// Overlay Surface
// ============================================

// One morphing card for every overlay state (content/ui/surface.js). The
// show* functions below are thin wrappers that open it or move it to a state;
// the render*State functions own each state's markup and event wiring.
let surface = null;
// Position the next render keeps (top/left), or null to anchor to
// currentAnchorRect. Lets a state change keep the card where it already is.
let overlayLockedPosition = null;
// Back target for a Quick Ask card opened without a menu behind it.
let askBackContext = null;

function getSurface() {
  if (!surface) {
    surface = /** @type {any} */ (self).OMNI_SURFACE.create({
      mount: ensureUiRoot,
      renderers: {
        menu: renderMenuState,
        pageCard: renderPageCardState,
        ask: renderAskState,
        loading: renderLoadingState,
        result: renderResultState,
        error: renderErrorState,
      },
      place: (card) => {
        overlay = card;
        positionOverlay(currentAnchorRect, overlayLockedPosition);
      },
      backFallback: surfaceBackFallback,
      onClose: () => {
        overlay = null;
        lastMenuContext = null;
        askBackContext = null;
        overlayLockedPosition = null;
        resetQuickButtonIcon();
        syncToolbarToSelection();
      },
    });
  }
  return surface;
}

function isCardOpen() {
  return Boolean(surface && surface.isOpen());
}

// Back with nothing in the surface history: a card opened straight into a
// result (keyboard shortcut, context menu, flash action) or into Quick Ask.
function surfaceBackFallback() {
  if (lastMenuContext) {
    showQuickActionMenu(
      lastMenuContext.text,
      lastMenuContext.anchorRect,
      lastMenuContext.lockedPosition,
      lastMenuContext.isInput,
    );
  } else if (surface?.state() === "ask" && askBackContext?.originalText) {
    showQuickActionMenu(
      askBackContext.originalText,
      null,
      askBackContext.lockedRect,
      askBackContext.isInput,
    );
  } else {
    hideOverlay();
  }
}

// Where the open card sits now, so the next state renders in place instead
// of jumping back to the anchor.
function currentCardPosition() {
  if (!overlay || !isCardOpen() || overlay.style.display === "none") return null;
  const computed = window.getComputedStyle(overlay);
  const top = parseInt(computed.top, 10);
  const left = parseInt(computed.left, 10);
  if (isNaN(top) || isNaN(left)) return null;
  if (overlay.dataset.placement === "above") {
    const bottom = parseFloat(computed.bottom);
    if (!isNaN(bottom)) return { top, left, bottom, placement: "above" };
  }
  return { top, left };
}

function isEventInsideOmniUi(event) {
  if (!event) return false;

  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const target = event.target;

  if (overlay && (path.includes(overlay) || (target && overlay.contains(target)))) {
    return true;
  }

  if (quickToolbar && (path.includes(quickToolbar) || (target && quickToolbar.contains(target)))) {
    return true;
  }

  if (omniUiHost && path.includes(omniUiHost)) {
    return true;
  }

  return false;
}

// ============================================
// Input Strategies
// ============================================

// Fallback used only if content/editor-adapters.js somehow failed to load
// before this script (manifest.json orders it first; see
// tests/content/editor-adapters.test.js for that guarantee). Replacement
// is never attempted through this fallback (see the `id === "static"`
// guard in replaceSelectedText), so it only needs getText/getRect.
const staticStrategy = {
  id: "static",
  isApplicable: () => true,
  getText: () => {
    const selection = window.getSelection();
    return {
      text: selection.toString().trim(),
      isSelection: selection.toString().length > 0,
    };
  },
  getRect: () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      return selection.getRangeAt(0).getBoundingClientRect();
    }
    return null;
  },
};

function getContext(element) {
  return (
    /** @type {any} */ (self).OMNI_EDITOR_ADAPTERS?.resolveAdapter(element, {
      hostname: location.hostname,
    }) || staticStrategy
  );
}

// ============================================
// Initialization
// ============================================

function init() {
  ensureUiRootReady().catch(() => {});
  setupFloatingButtonPreference();
  setupMessageListener();
  setupSelectionListener();
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

      case "PROCESSING_START": {
        // A keyboard command is running in the worker: open the card in its
        // loading state, named after the action when the worker sent one
        // (an older worker sends none: generic "Working..." header).
        const action = typeof message.action === "string" ? message.action : undefined;
        const text = getSelectedText();
        const isInput = isTextInput(document.activeElement);
        if (isInput) activeInputElement = document.activeElement;
        if (text) currentAnchorRect = currentAnchorRect || getSelectionRect();
        void showLoadingInOverlay({
          ...(action ? { action } : {}),
          originalText: text,
          isInput,
          source: "worker",
        });
        sendResponse({ success: true });
        break;
      }

      case "SHOW_RESULT": {
        const payload = message.payload || {};
        if (payload.originalText) {
          lastMenuContext = {
            text: payload.originalText,
            anchorRect: currentAnchorRect || getSelectionRect(),
            lockedPosition: null,
            isInput: payload.isInput,
          };
        }
        const raw = String(payload.result ?? "");
        // The worker flags failures with `error: true`; an older worker only
        // prefixed the text with "Error: ".
        const failed =
          payload.error === true || (payload.error === undefined && raw.startsWith("Error: "));
        if (failed) {
          void showErrorInOverlay(raw.replace(/^Error: /, ""), {
            action: payload.action,
            originalText: payload.originalText,
            isInput: payload.isInput,
            source: "worker",
          });
        } else {
          // Marked so retry knows this result came from the worker's own run
          // (keyboard command, context menu), not from a content-path request.
          showResultOverlay({ ...payload, source: "worker" }, payload.isInput);
        }
        sendResponse({ success: true });
        break;
      }

      case "REPLACE_SELECTION":
        replaceSelectedText(message.payload.text);
        sendResponse({ success: true });
        break;

      case "SHOW_QUICK_ASK_OVERLAY": {
        const rect = cardAnchorRect();
        const selection = getSelectedText();
        const isInput = isTextInput(document.activeElement);
        if (isInput) activeInputElement = document.activeElement;
        showQuickAskOverlay(rect, selection, isInput);
        sendResponse({ success: true });
        break;
      }

      case "SHOW_QUICK_ACTION_MENU": {
        // Same menu the floating icon's click opens, triggered directly from
        // the quick_menu shortcut. Requires a selection: showQuickActionMenu()
        // unconditionally calls text.trim() to auto-trigger Smart Translate
        // for non-input selections, which throws on an undefined/empty text.
        const menuText = getSelectedText();
        if (menuText) {
          const isInput = isTextInput(document.activeElement);
          if (isInput) activeInputElement = document.activeElement;
          showQuickActionMenu(menuText, cardAnchorRect(), null, isInput);
        }
        sendResponse({ success: true });
        break;
      }

      case "THEME_CHANGED":
        // ensureUiTheme's internal chrome.storage.onChanged listener (set up once
        // the shadow host exists) already re-applies theme on change; this call is
        // a harmless no-op once initialized, and a safety net if it hasn't run yet.
        ensureUiTheme(omniUiHost);
        sendResponse({ success: true });
        break;

      case "GET_PAGE_CONTENT": {
        const content = extractPageContent();
        sendResponse({
          success: true,
          content: content.text,
          title: content.title,
          url: content.url,
        });
        break;
      }

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
  const handleSelectionChange = (mousePos = null) => {
    setTimeout(() => {
      // If overlay is already open, don't show specific button logic or hide it?
      // Usually checking !isCardOpen() is correct (a closing card is not open).
      if (isCardOpen()) return;

      const activeElement = document.activeElement;
      const context = getContext(activeElement);
      const result = context.getText(activeElement);

      // Determine if we should show button
      // Show if:
      // 1. Text is selected (Standard, Rich, Static)
      // 2. OR Input has content (Full text mode), Standard/Rich only

      const hasSelection = result.isSelection;
      const hasContent = result.text.length > 0;

      const shouldShow = hasSelection || (context.id !== "static" && hasContent);

      if (shouldShow) {
        presentToolbarFor(activeElement, context, result, mousePos);
      } else {
        hideQuickActionButton();
      }
    }, 10);
  };

  document.addEventListener("mouseup", (e) => {
    if (overlay && !isEventInsideOmniUi(e)) {
      hideOverlay();
    }
    handleSelectionChange({ x: e.clientX, y: e.clientY });
  });

  document.addEventListener("keyup", (e) => {
    // Handle Ctrl+A (Select All) and Shift+Arrows (Selection)
    if (
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") ||
      (e.shiftKey && e.key.startsWith("Arrow"))
    ) {
      // Keys typed inside the card (the Ask box) are not a page selection.
      if (isEventInsideOmniUi(e)) return;
      // A new selection closes the open card, as a mouse selection does:
      // the card and its toolbar belong to the text they were opened on.
      if (isCardOpen() && quickToolbar && getSelectedText() !== quickToolbarText) {
        hideOverlay();
      }
      handleSelectionChange();
    }
  });

  // Handle paste events
  document.addEventListener("paste", () => {
    // Rely on generic detection shortly after paste

    // Slight delay to allow paste to complete
    setTimeout(() => {
      handleSelectionChange();
    }, 100);
  });

  document.addEventListener("focusin", () => {
    const activeElement = document.activeElement;
    reportEditorFocus(activeElement, getContext(activeElement));
  });
}

// Show the toolbar for this element's text: remember the range the replace
// will need and anchor at the mouse for a selection made with it.
function presentToolbarFor(activeElement, context, result, mousePos = null) {
  reportEditorFocus(activeElement, context);

  // Capture Last Range if applicable (Selection based)
  if (context.id === "richText" || context.id === "static") {
    const sel = window.getSelection();
    lastRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  } else {
    // Standard inputs don't use window.getSelection() ranges effectively in the same way for this tracking,
    // so clear it to prevent stale ranges from blocking fullText detection.
    lastRange = null;
  }

  const rect = context.getRect(activeElement);
  const inputEl = context.id !== "static" ? activeElement : null;

  // Use mouse position for any text selection (all contexts)
  const useMousePos = mousePos && result.isSelection;
  presentQuickActionButton(rect, inputEl, result.text, useMousePos ? mousePos : null);
}

// The toolbar belongs to the selection (spec "Floating toolbar"): it stays
// while the card is open, and once the card closes it follows the selection
// again. A toolbar that still matches the text stays where it is; any other
// is dropped, and only a real selection brings a new one back (never the
// full-text mode, which needs a click in the field), so a toolbar can never
// act on text that is no longer selected.
function syncToolbarToSelection() {
  if (isCardOpen()) return;
  let element = document.activeElement;
  // Focus left on the card's buttons: read the field the toolbar was for.
  if (
    (!element || element === document.body || element === omniUiHost) &&
    quickToolbarInput?.isConnected
  ) {
    element = quickToolbarInput;
  }
  const context = getContext(element);
  const result = context.getText(element);
  if (quickToolbar && result.text && result.text === quickToolbarText) return;
  hideQuickActionButton();
  if (result.isSelection && result.text) presentToolbarFor(element, context, result);
}

function reportEditorFocus(element, context = getContext(element)) {
  if (!isContextValid()) return;

  const type = context.id === "static" ? "EDITOR_BLURRED" : "EDITOR_FOCUSED";
  chrome.runtime.sendMessage({ type }).catch(() => {});
}

function setupFloatingButtonPreference() {
  if (!isContextValid()) return;

  import(chrome.runtime.getURL("lib/storage.js"))
    .then(({ getSettingsBag }) => getSettingsBag())
    .then((settings) => {
      floatingButtonEnabled = settings?.showFloatingButton !== false;
      if (!floatingButtonEnabled) hideQuickActionButton();
    })
    .catch(() => {});

  // eslint-disable-next-line no-restricted-syntax -- observes changes to the "settings" bag lib/storage.js owns; a generic onChanged listener doesn't fit a per-key typed accessor.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    floatingButtonEnabled =
      /** @type {any} */ (changes.settings.newValue).showFloatingButton !== false;
    if (!floatingButtonEnabled) hideQuickActionButton();
  });
}

// ============================================
// Quick Action Button
// ============================================

function presentQuickActionButton(
  rect,
  inputElement = null,
  initialText = null,
  mousePosition = null,
) {
  if (!isContextValid()) return;
  if (!floatingButtonEnabled) return;
  if (quickActionBtn) hideQuickActionButton();

  // If using mouse position, we don't need rect validation
  if (!mousePosition) {
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0))
      return;
  }

  // Determine valid positioning flag
  const isInput = !!inputElement;
  // If we are in rich text, we want caret-like positioning (false), unless we fell back to element rect?
  // The resolved adapter's getRect() handles the rect.
  // usageInputPositioning argument in createQuickBtn determines offset.
  // Standard -> True. RichText -> False (usually). Static -> False.

  let useInputPositioning = false;
  if (isInput) {
    const context = getContext(inputElement);
    // Standard inputs use "Input Positioning" (corner)
    // RichText standardly uses caret (False), but if we fallback to element rect we might want corner?
    // The richText adapter's getRect() tries the caret position first.
    if (context.id === "standard") useInputPositioning = true;
  }

  createQuickBtn(rect, useInputPositioning, mousePosition);
  quickToolbarText = initialText;
  quickToolbarInput = inputElement;
  setupQuickBtnEvents(initialText, inputElement);
}

// Toolbar pill: 24px tall with the 20px quick button inside (spec "Floating
// toolbar"); at rest it is a 24px circle around the button.
const TOOLBAR_SIZE = 24;
// Border plus padding between the pill's edge and the quick button.
const TOOLBAR_INSET = 2;

async function createQuickBtn(rect, isInput, mousePosition = null) {
  const toolbar = document.createElement("div");
  toolbar.className = "omni-ai-toolbar";
  const button = document.createElement("button");
  button.className = "omni-ai-quick-btn";
  button.innerHTML = ICONS.btnSparkle;
  const row = document.createElement("div");
  row.className = "omni-ai-flash-actions";
  toolbar.append(button, row);
  quickToolbar = toolbar;
  quickActionBtn = button;
  flashActionsRow = row;

  const uiReady = ensureUiRootReady();

  // Position: use mouse position if provided (for text selection)
  let top, left;
  if (mousePosition) {
    // Position near mouse cursor with small offset
    top = mousePosition.y + window.scrollY + 8;
    left = mousePosition.x + window.scrollX + 8;
  } else if (isInput && rect) {
    // Input elements: bottom-right corner (inside the input)
    top = rect.bottom + window.scrollY - TOOLBAR_SIZE - 4;
    left = rect.right + window.scrollX - TOOLBAR_SIZE - 4;
  } else if (rect) {
    // Fallback to selection rect
    top = rect.bottom + window.scrollY + 5;
    left = rect.right + window.scrollX;
  } else {
    // No valid position, don't show
    return;
  }

  if (typeof self !== "undefined" && /** @type {any} */ (self).OMNI_POSITIONING) {
    const clamped = /** @type {any} */ (self).OMNI_POSITIONING.clampToViewport(
      top,
      left,
      TOOLBAR_SIZE,
      TOOLBAR_SIZE,
      window.scrollX,
      window.scrollY,
      window.innerWidth,
      window.innerHeight,
    );
    top = clamped.top;
    left = clamped.left;
  }

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
  toolbar.dataset.restLeft = String(left);

  await uiReady;
  if (quickToolbar !== toolbar) return;
  ensureUiRoot().appendChild(toolbar);
  /** @type {any} */ (self).OMNI_MOTION?.enter(toolbar, { from: 0.85 });
}

function resolveQuickBtnText(text, inputElement) {
  return (
    text ||
    (inputElement
      ? getSelectedText() ||
        (inputElement.value ? inputElement.value.trim() : inputElement.innerText.trim())
      : "")
  );
}

function setupQuickBtnEvents(text = null, inputElement = null) {
  // Guard the whole pill (button and flash row): without both, a mouseup
  // bubbles to document's selection-change listener (handleSelectionChange()),
  // which recreates the toolbar at the click's mouse position -- looking like
  // it "jumped".
  quickToolbar.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  quickToolbar.addEventListener("mouseup", (e) => e.stopPropagation());

  quickActionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isInput = !!inputElement;
    if (isInput) activeInputElement = inputElement;
    const currentText = resolveQuickBtnText(text, inputElement);
    showQuickActionMenu(currentText, cardAnchorRect(), null, isInput);
  });

  quickActionBtn.addEventListener("mouseenter", () => {
    clearTimeout(flashHideTimer);
    clearTimeout(flashHoverTimer);
    flashHoverTimer = setTimeout(() => {
      showFlashActions(resolveQuickBtnText(text, inputElement), inputElement);
    }, FLASH_ACTIONS_HOVER_DELAY);
  });

  quickToolbar.addEventListener("mouseenter", () => clearTimeout(flashHideTimer));
  quickToolbar.addEventListener("mouseleave", scheduleHideFlashActions);
}

// Top edge of the selected text (the whole selection, not just its last
// line), viewport-relative, or null when it cannot be measured (editors
// expose no range rects).
function selectionTop() {
  const sel = window.getSelection();
  const ranges = [];
  if (sel && sel.rangeCount > 0) ranges.push(sel.getRangeAt(0));
  if (lastRange) ranges.push(lastRange);
  for (const range of ranges) {
    try {
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return rect.top;
    } catch {}
  }
  return null;
}

// Where a card with no explicit anchor opens: under the floating toolbar when
// it is visible, otherwise at the selection (context menu, keyboard
// commands). The anchor's top also covers the selection, so a card that opens
// above never slides over the selected text.
function cardAnchorRect() {
  let base = null;
  if (quickToolbar && quickToolbar.isConnected) {
    // The pill's height, the quick button's horizontal edges: the button
    // never moves, while the pill's left edge does when actions reveal left.
    const pill = quickToolbar.getBoundingClientRect();
    const btn = quickActionBtn.getBoundingClientRect();
    if (pill.width > 0 || pill.height > 0) {
      const left = btn.left - TOOLBAR_INSET;
      base = {
        top: pill.top,
        bottom: pill.bottom,
        left,
        right: left + TOOLBAR_SIZE,
        width: TOOLBAR_SIZE,
      };
    }
  }
  if (!base) base = getSelectionRect();
  if (!base) return null;
  const selTop = selectionTop() ?? getSelectionRect()?.top ?? null;
  // Only a selection top that is on screen with room for the card's gap and
  // margin counts: a field or selection scrolled mostly out of view would
  // leave no room above and push the card over the toolbar.
  const usable = selTop !== null && selTop >= CARD_GAP + 10;
  const top = usable ? Math.min(base.top, selTop) : base.top;
  return {
    top,
    left: base.left,
    bottom: base.bottom,
    right: base.right,
    width: base.width,
    height: base.bottom - top,
  };
}

// The toolbar now stays while a card is open, so a spinner a flash action or
// the worker put inside it must not outlive the work it announced.
function resetQuickButtonIcon() {
  if (!quickActionBtn) return;
  quickActionBtn.innerHTML = ICONS.btnSparkle;
  quickActionBtn.style.cursor = "";
}

function hideQuickActionButton() {
  clearTimeout(flashHoverTimer);
  clearTimeout(flashHideTimer);
  flashRevealGen += 1;
  if (quickToolbar) quickToolbar.remove();
  quickToolbar = null;
  quickActionBtn = null;
  flashActionsRow = null;
  quickToolbarText = null;
  quickToolbarInput = null;
}

function scheduleHideFlashActions() {
  clearTimeout(flashHoverTimer);
  clearTimeout(flashHideTimer);
  flashHideTimer = setTimeout(hideFlashActions, FLASH_ACTIONS_HIDE_GRACE);
}

// Collapse the flash row back into the pill, then empty it. A reveal to the
// left moved the pill's left edge; it goes back once the row is closed.
function hideFlashActions() {
  clearTimeout(flashHideTimer);
  const toolbar = quickToolbar;
  const row = flashActionsRow;
  // Bumped first, so a reveal still waiting on its settings read is dropped
  // when the pointer has already left.
  const gen = ++flashRevealGen;
  if (!toolbar || !row || !toolbar.classList.contains("is-revealed")) return;
  const motion = /** @type {any} */ (self).OMNI_MOTION;
  const left = toolbar.classList.contains("reveal-left");
  const reduced = motion.prefersReducedMotion();
  toolbar.classList.remove("is-revealed");
  const finish = () => {
    if (gen !== flashRevealGen) return;
    row.replaceChildren();
    toolbar.classList.remove("reveal-left");
    toolbar.style.left = `${toolbar.dataset.restLeft}px`;
    motion.releasePin(toolbar);
  };
  const anim = motion.collapseWidth(row, left ? { pin: toolbar } : undefined);
  // Reduced motion sets the width to 0 at once; the left edge must follow
  // in the same frame or the button jumps.
  if (reduced && left) toolbar.style.left = `${toolbar.dataset.restLeft}px`;
  Promise.resolve(anim.finished).then(finish, () => {});
}

/**
 * Fill the toolbar's flash row with the user's selection from Settings >
 * Flash Actions and widen the pill to show it, on the side that fits (the
 * quick button never moves). No-ops if there's no text (mirrors
 * PROCESSING_START's guard) or the toolbar disappeared while the hover
 * delay/settings read was in flight.
 */
async function showFlashActions(text, inputElement) {
  if (!text || !quickToolbar || quickToolbar.classList.contains("is-revealed")) return;
  const toolbar = quickToolbar;
  const row = flashActionsRow;
  const gen = ++flashRevealGen;

  let selectedActions = DEFAULT_FLASH_ACTIONS;
  if (isContextValid()) {
    try {
      const { getSettingsBag } = await import(chrome.runtime.getURL("lib/storage.js"));
      const settings = await getSettingsBag();
      selectedActions = settings?.flashActions || DEFAULT_FLASH_ACTIONS;
    } catch {
      selectedActions = DEFAULT_FLASH_ACTIONS;
    }
  }
  await ensureUiRootReady();
  if (gen !== flashRevealGen || quickToolbar !== toolbar || !toolbar.isConnected) return;
  if (!selectedActions.length) return;

  selectedActions = selectedActions
    .slice()
    .sort(
      (a, b) => FLASH_ACTION_CANONICAL_ORDER.indexOf(a) - FLASH_ACTION_CANONICAL_ORDER.indexOf(b),
    );

  row.innerHTML = selectedActions
    .map(
      (action) => `
      <button class="omni-ai-flash-btn" data-flash-action="${escapeHtml(action)}" title="${escapeHtml(i18n.getMessage(FLASH_ACTION_LABEL_KEYS[action] || action))}">
        ${FLASH_ACTION_ICONS[action] || ICONS.magic}
      </button>`,
    )
    .join("");
  row.querySelectorAll("[data-flash-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerFlashAction(/** @type {HTMLElement} */ (btn).dataset.flashAction, text, inputElement);
    });
  });

  const motion = /** @type {any} */ (self).OMNI_MOTION;
  const positioning = /** @type {any} */ (self).OMNI_POSITIONING;
  const restLeft = Number(toolbar.dataset.restLeft);
  row.style.width = "";
  const rowWidth = row.scrollWidth;
  const btnRect = quickActionBtn.getBoundingClientRect();
  const side = positioning.revealSide(btnRect.right, rowWidth, window.innerWidth);
  // The quick button never moves: a row that does not fit to its right
  // reveals to its left, the pill's left edge moves out by the row width and
  // a pin translate keeps the button in place while the width grows.
  const toLeft = side === "left";
  toolbar.classList.toggle("reveal-left", toLeft);
  toolbar.classList.add("is-revealed");
  toolbar.style.left = `${toLeft ? restLeft - rowWidth : restLeft}px`;
  motion.revealWidth(row, toLeft ? { pin: toolbar } : undefined);
  motion.stagger(row.querySelectorAll(".omni-ai-flash-btn"));
}

function triggerFlashAction(action, text, inputElement) {
  const isInput = !!inputElement;
  // Mirrors the menu-click handler in setupQuickBtnEvents(): clicking inside
  // the shadow root (the flash row) can leave document.activeElement no
  // longer pointing at the original field, so replaceSelectedText()'s
  // fallback needs this tracked explicitly -- otherwise Replace silently
  // targets the wrong element (or nothing) for input/textarea fields.
  if (isInput) activeInputElement = inputElement;
  // Back from this result goes where the quick button would have gone: the
  // menu in editors, the translation-first card on page text.
  if (!lastMenuContext) {
    lastMenuContext = { text, anchorRect: cardAnchorRect(), lockedPosition: null, isInput };
  }
  hideFlashActions();
  if (quickActionBtn) {
    quickActionBtn.innerHTML = `<div class="ds-spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;box-shadow:none;margin:0;"></div>`;
    quickActionBtn.style.cursor = "wait";
  }
  handleAction(action, text, isInput);
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
  // Save current anchor for re-positioning later
  const menuAnchorRect = anchorRect || cardAnchorRect();
  currentAnchorRect = menuAnchorRect;

  // Fetch settings
  let primaryLanguage = "vi";
  let defaultLanguage = "en";

  if (isContextValid()) {
    try {
      const { getSyncPreferences } = await import(chrome.runtime.getURL("lib/storage.js"));
      const data = await getSyncPreferences();
      primaryLanguage = data.primaryLanguage || "vi";
      defaultLanguage = data.defaultLanguage || "en";
    } catch {
      console.warn("[Omni AI] Failed to fetch settings, using defaults");
    }
  }

  const pFlag = LANGUAGE_FLAGS[primaryLanguage] || "🌐";
  const dFlag = LANGUAGE_FLAGS[defaultLanguage] || "🏳️";

  // Language names come from the shared registry (a locale's translated name
  // when there is one, otherwise the language's own name): 43 translation
  // languages would otherwise need 43 x locale name strings. Guarded: unlike
  // the getSyncPreferences import above, nothing calls showQuickActionMenu()
  // with a .catch(), so an unhandled rejection here (e.g. the extension
  // reloading mid-click) would silently drop the whole menu instead of just
  // this label.
  /** @type {(code: string, getMessage?: (key: string) => string) => string} */
  let resolveLabel = (code) => String(code).toUpperCase();
  try {
    ({ resolveLanguageLabel: resolveLabel } = await import(
      chrome.runtime.getURL("lib/languages.js")
    ));
  } catch {
    console.warn("[Omni AI] Failed to load the language registry, using raw codes");
  }
  const pCode = resolveLabel(primaryLanguage, (key) => i18n.getMessage(key));
  const dCode = resolveLabel(defaultLanguage, (key) => i18n.getMessage(key));

  await ensureUiRootReady();

  // Save context for Back button. Set after the awaits above so a close that
  // finishes meanwhile (its onClose clears this) cannot wipe it.
  currentAnchorRect = menuAnchorRect;
  lastMenuContext = {
    text,
    anchorRect: menuAnchorRect,
    lockedPosition,
    isInput,
  };
  overlayLockedPosition = lockedPosition;

  // Editors get the plain menu, page text gets the page card with
  // the Smart Translation card. The surface morphs an open card in place.
  getSurface().open(isInput ? "menu" : "pageCard", {
    text,
    isInput,
    primaryLanguage,
    defaultLanguage,
    pFlag,
    dFlag,
    pCode,
    dCode,
  });
}

// Labels for the card header (loading and result): the action's own name.
const ACTION_LABEL_KEYS = { ...FLASH_ACTION_LABEL_KEYS, quick_ask: "quick_ask_title" };
// "Show changes" is offered only for same-language rewrites of the selection.
const DIFF_ACTIONS = ["rephrase", "grammar", "tone", "emoji"];
const TONES = ["professional", "casual", "friendly", "direct", "confident"];

function actionTitle(action) {
  const key = ACTION_LABEL_KEYS[action];
  return key ? i18n.getMessage(key) : i18n.getMessage("overlay_result");
}

// Header shared by the loading, result, error and ask states: back, a small
// gradient mark, the title, close.
function cardHeader(title, { back = true } = {}) {
  return `
    <div class="omni-ai-overlay-header">
      ${back ? `<button class="omni-ai-icon-btn" id="omniAiBack" title="${escapeHtml(i18n.getMessage("btn_back"))}">${ICONS.back}</button>` : ""}
      <span class="omni-ai-title-mark"></span>
      <span class="omni-ai-title">${escapeHtml(title)}</span>
      <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
    </div>`;
}

function bindCardHeader(inner, surf) {
  inner.querySelector("#omniAiClose")?.addEventListener("click", () => hideOverlay());
  inner.querySelector("#omniAiBack")?.addEventListener("click", () => {
    resetQuickButtonIcon();
    surf.back();
  });
}

// Three shimmer lines; .omni-ai-loading stays as the loading hook.
const SKELETON = `
  <div class="omni-ai-loading omni-ai-skeleton" aria-busy="true">
    <div class="omni-ai-skeleton-line"></div>
    <div class="omni-ai-skeleton-line"></div>
    <div class="omni-ai-skeleton-line"></div>
  </div>`;

function askBoxMarkup(placeholder) {
  return `
    <div class="omni-ai-input-wrapper">
       <div class="omni-ai-ask">
         <textarea class="omni-ai-input" rows="1" placeholder="${escapeHtml(placeholder)}" id="omniAiInlineInput"></textarea>
         <button class="omni-ai-send-btn" id="omniAiInputBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
         </button>
       </div>
    </div>`;
}

// Enter or the send button submits the trimmed question.
function bindAskBox(root, onAsk) {
  const input = /** @type {HTMLTextAreaElement} */ (root.querySelector("#omniAiInlineInput"));
  const send = () => {
    const query = input.value.trim();
    if (query) onAsk(query);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  root.querySelector("#omniAiInputBtn")?.addEventListener("click", send);
  return input;
}

// Pills with icon and label on one line that wrap naturally (spec "Action
// menu"); the page card's reading actions and the tone row reuse them.
function pillMarkup(action, icon, label, primary = false) {
  return `
       <button class="omni-ai-menu-item${primary ? " is-primary" : ""}" data-action="${action}">
         <span class="omni-ai-menu-icon">${icon}</span><span class="omni-ai-menu-label">${escapeHtml(label)}</span>
       </button>`;
}

function translatePills(data) {
  const { pFlag, dFlag, pCode, dCode } = data;
  return [
    pillMarkup("translate_primary", escapeHtml(pFlag), i18n.getMessage("ui_to", [pCode])),
    pillMarkup("translate_default", escapeHtml(dFlag), i18n.getMessage("ui_to", [dCode])),
  ];
}

function buildMenuMarkup(data) {
  const header = `
    <div class="omni-ai-overlay-header">
       <div class="omni-ai-brand">
         ${ICONS.brand}
         <span>${i18n.getMessage("extName")}</span>
       </div>
       <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
    </div>
  `;

  // The four rewrite actions first and emphasized, then the rest.
  const menu = `
    <div class="omni-ai-menu-grid">${[
      pillMarkup("rephrase", ICONS.rephrase, i18n.getMessage("action_rephrase"), true),
      pillMarkup("grammar", ICONS.grammar, i18n.getMessage("action_grammar"), true),
      pillMarkup("tone", ICONS.tone, i18n.getMessage("action_tone"), true),
      pillMarkup("summarize", ICONS.summarize, i18n.getMessage("action_summarize"), true),
      pillMarkup("explain", ICONS.explain, i18n.getMessage("action_explain")),
      pillMarkup("reply", ICONS.reply, i18n.getMessage("action_reply")),
      pillMarkup("emoji", ICONS.emoji, i18n.getMessage("action_emojify")),
      ...translatePills(data),
    ].join("")}
    </div>
  `;

  return header + menu + askBoxMarkup(i18n.getMessage("popup_quickAsk"));
}

// Re-position after async content might have loaded
function scheduleMenuReposition(surf) {
  const token = surf.beginRequest();
  setTimeout(() => {
    if (overlay && surf.isCurrent(token)) positionOverlay(currentAnchorRect, overlayLockedPosition);
  }, 100);
}

function renderMenuState(inner, data, surf) {
  const { text, isInput } = data;
  // Editors get the plain menu: no background AI call runs until the user
  // picks an action.
  inner.innerHTML = buildMenuMarkup(data);
  bindMenuEvents(inner, text, isInput);
  /** @type {any} */ (self).OMNI_MOTION?.stagger(inner.querySelectorAll(".omni-ai-menu-item"));
  scheduleMenuReposition(surf);
}

// Page text that is not editable (spec "Page text that is not editable"): a
// translation section on top that translates on its own, in a slot reserved
// by a skeleton so the reading actions below never move when it lands.
function renderPageCardState(inner, data, surf) {
  const { text, isInput } = data;
  inner.innerHTML = `
    <div class="omni-ai-translate" id="omniAiTranslateCard">
      <div class="omni-ai-translate-head">
        <span class="omni-ai-suggestion-label">${escapeHtml(i18n.getMessage("overlay_smart_translation"))}</span>
        <span class="omni-ai-spacer"></span>
        <button class="omni-ai-icon-btn" id="omniAiCopyTrans" title="${escapeHtml(i18n.getMessage("overlay_copy"))}" disabled>${ICONS.copy}</button>
        <button class="omni-ai-close-btn" id="omniAiClose">${ICONS.close}</button>
      </div>
      <div class="omni-ai-translate-body">${SKELETON}</div>
    </div>
    <div class="omni-ai-menu-grid">${[
      pillMarkup("summarize", ICONS.summarize, i18n.getMessage("action_summarize"), true),
      pillMarkup("explain", ICONS.explain, i18n.getMessage("action_explain"), true),
      ...translatePills(data),
      pillMarkup("reply", ICONS.reply, i18n.getMessage("action_reply")),
    ].join("")}
    </div>
    ${askBoxMarkup(i18n.getMessage("overlay_ask_about_text"))}`;
  bindMenuEvents(inner, text, isInput);
  /** @type {any} */ (self).OMNI_MOTION?.stagger(inner.querySelectorAll(".omni-ai-menu-item"));
  startPageTranslation(inner, data, surf, false);
  scheduleMenuReposition(surf);
}

// The automatic Smart Translate of the page card. `bypassCache` is the
// slot's own Try again after a failure.
function startPageTranslation(inner, data, surf, bypassCache) {
  const { text, primaryLanguage, defaultLanguage } = data;
  const smartAction = "smart_translate";
  // Includes primaryLanguage/defaultLanguage: smartTranslate()'s result
  // depends on both (it toggles direction between them), so a stale cache
  // entry from before a language-setting change would otherwise keep
  // returning the old (now-wrong) translation for the same text.
  const cacheKey = `${smartAction}|${text.trim()}|chat|${primaryLanguage}|${defaultLanguage}`;
  const token = surf.beginRequest();
  const body = /** @type {HTMLElement} */ (inner.querySelector(".omni-ai-translate-body"));
  const copyBtn = /** @type {HTMLButtonElement} */ (inner.querySelector("#omniAiCopyTrans"));

  const showTranslation = (translated) => {
    const content = document.createElement("div");
    content.className = "omni-ai-suggestion-content";
    content.textContent = translated;
    body.replaceChildren(content);
    copyBtn.disabled = false;
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      if (await copyTextToClipboard(translated)) flashCopied(copyBtn, ICONS.check, ICONS.copy);
    };
  };

  const showFailure = () => {
    body.innerHTML = `
      <div class="omni-ai-error" role="alert">
        ${ICONS.warn}
        <span class="omni-ai-error-text">${escapeHtml(i18n.getMessage("overlay_translation_failed"))}</span>
        <button class="omni-ai-btn" id="omniAiRetryTrans">${ICONS.retry}<span>${escapeHtml(i18n.getMessage("overlay_try_again"))}</span></button>
      </div>`;
    body.querySelector("#omniAiRetryTrans").addEventListener("click", (e) => {
      e.stopPropagation();
      swapSlot(body, () => {
        body.innerHTML = SKELETON;
      });
      startPageTranslation(inner, data, surf, true);
    });
  };

  // From the cache the text is there on the first frame, no skeleton.
  if (!bypassCache && resultCache.has(cacheKey)) {
    showTranslation(resultCache.get(cacheKey));
    return;
  }

  const land = (render) => {
    if (!surf.isCurrent(token) || !body.isConnected) return;
    swapSlot(body, render);
  };
  sendMessageToBackground({
    type: "QUICK_ACTION",
    payload: { action: smartAction, text, preset: "chat" },
  })
    .then((response) => {
      if (response?.success) {
        resultCache.set(cacheKey, response.data.response);
        land(() => showTranslation(response.data.response));
      } else {
        land(showFailure);
      }
    })
    .catch(() => land(showFailure));
}

// Swap a slot's content with a short blur swap. When the card's height
// changes, it follows on the spring once, from the old height to the new.
function swapSlot(el, render) {
  const motion = /** @type {any} */ (self).OMNI_MOTION;
  return motion.swap(el, () => {
    const card = overlay;
    const before = card ? card.offsetHeight : 0;
    render();
    if (card && card.isConnected) {
      animateCardHeight(card, before, card.offsetHeight);
      positionOverlay(currentAnchorRect, currentCardPosition());
    }
  });
}

// Height follow for an in-place change (not a state change, which the
// surface morphs). Played directly, not through OMNI_MOTION's per-element
// slot, so it never cancels the card's enter or exit animation.
function animateCardHeight(card, from, to) {
  const motion = /** @type {any} */ (self).OMNI_MOTION;
  if (from === to || !from || motion.prefersReducedMotion()) return;
  const supportsSpring =
    typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)");
  card.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: motion.TOKENS.morphMs,
    easing: supportsSpring ? motion.TOKENS.spring : motion.TOKENS.easeOut,
  });
}

// Copy feedback: a short blur swap to a check, then back.
const copyResetTimers = new WeakMap();
function flashCopied(btn, copiedHtml, restoreHtml) {
  const motion = /** @type {any} */ (self).OMNI_MOTION;
  clearTimeout(copyResetTimers.get(btn));
  motion.swap(btn, () => {
    btn.innerHTML = copiedHtml;
    btn.classList.add("is-copied");
  });
  copyResetTimers.set(
    btn,
    setTimeout(() => {
      if (!btn.isConnected) return;
      motion.swap(btn, () => {
        btn.innerHTML = restoreHtml;
        btn.classList.remove("is-copied");
      });
    }, 1400),
  );
}

function bindMenuEvents(root, text, isInput) {
  root.querySelector("#omniAiClose").addEventListener("click", () => hideOverlay());
  root.querySelectorAll(".omni-ai-menu-item[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action, text, isInput));
  });
  bindAskBox(root, (query) => handleAskAction(query, text, isInput));
  bindRovingFocus(root);
}

// Roving focus over the action pills (`[data-action]`, not the tone pills):
// one tab stop, arrows move by DOM order, Home/End jump. Enter and Space
// activate through the native button click.
function bindRovingFocus(root) {
  const pills = Array.from(root.querySelectorAll(".omni-ai-menu-item[data-action]"));
  if (pills.length === 0) return;
  const setStop = (active) => pills.forEach((p) => (p.tabIndex = p === active ? 0 : -1));
  setStop(pills[0]);
  pills.forEach((pill) => pill.addEventListener("focus", () => setStop(pill)));
  root.addEventListener("keydown", (event) => {
    const index = pills.indexOf(/** @type {any} */ (event.target));
    if (index === -1) return;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % pills.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + pills.length) % pills.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = pills.length - 1;
    if (next === -1) return;
    event.preventDefault();
    pills[next].focus({ preventScroll: true });
  });
}

// The tone saved in Settings when it is one of the five, else professional.
async function defaultTone() {
  try {
    const { getCurrentPreset } = await import(chrome.runtime.getURL("lib/storage.js"));
    const currentPreset = String((await getCurrentPreset()) || "").toLowerCase();
    return TONES.includes(currentPreset) ? currentPreset : "professional";
  } catch {
    return "professional";
  }
}

/**
 * Run an action on the content-script path and show its loading, result or
 * error in the card.
 * @param {string} action
 * @param {string} text
 * @param {boolean} isInput
 * @param {{bypassCache?: boolean, replace?: boolean, tone?: string}} [opts]
 *   bypassCache: skip the cache read and overwrite the entry (retry);
 *   replace: the loading state replaces the current one for Back (retry,
 *   tone re-run); tone: the tone to run instead of the saved one.
 */
async function handleAction(
  action,
  text,
  isInput,
  { bypassCache = false, replace = false, tone } = {},
) {
  let preset = "chat";
  let options = {};
  if (action === "tone") {
    preset = tone && TONES.includes(tone) ? tone : await defaultTone();
    options = { tone: preset };
  }
  const retryData = { action, originalText: text, isInput, preset };

  await showLoadingInOverlay(retryData, { replace });
  // Taken after the loading transition started: any later state change
  // (Back, close, another action, a tone re-run) makes this response stale,
  // and it is dropped.
  const surf = getSurface();
  const token = surf.beginRequest();

  // translate_primary/translate_default/smart_translate results depend on
  // the user's Primary/Translation Language settings too, not just the text
  // -- fold those into the cache key so a language change doesn't keep
  // returning a stale translation cached under the old settings.
  let langCacheSuffix = "";
  if (["translate_primary", "translate_default", "smart_translate"].includes(action)) {
    const { getSyncPreferences } = await import(chrome.runtime.getURL("lib/storage.js"));
    const { primaryLanguage, defaultLanguage } = await getSyncPreferences();
    langCacheSuffix = `|${primaryLanguage}|${defaultLanguage}`;
  }

  // Rephrase is never cached, so it always gets fresh results.
  const cacheable = action !== "rephrase";
  const cacheKey = `${action}|${text.trim()}|${preset}${langCacheSuffix}`;
  if (!bypassCache && cacheable && resultCache.has(cacheKey)) {
    if (!surf.isCurrent(token)) {
      resetQuickButtonIcon();
      return;
    }
    showResultOverlay({ ...retryData, result: resultCache.get(cacheKey) }, isInput);
    return;
  }

  sendMessageToBackground({
    type: "QUICK_ACTION",
    payload: { action, text, preset, options },
  })
    .then((response) => {
      if (response.success) {
        if (cacheable) resultCache.set(cacheKey, response.data.response);
        if (!surf.isCurrent(token)) return;
        showResultOverlay({ ...retryData, result: response.data.response }, isInput);
      } else if (surf.isCurrent(token)) {
        showErrorInOverlay(response.error, retryData);
      }
    })
    .catch((err) => {
      if (surf.isCurrent(token)) showErrorInOverlay(err.message, retryData);
    })
    .finally(() => {
      // A dropped (stale) response must not leave a spinner on the toolbar.
      if (!surf.isCurrent(token)) resetQuickButtonIcon();
    });
}

/**
 * @param {string} query
 * @param {string | null} originalText
 * @param {boolean} isInput
 * @param {{replace?: boolean}} [opts]
 */
async function handleAskAction(query, originalText, isInput, { replace = false } = {}) {
  const retryData = { action: "quick_ask", query, originalText, isInput, preset: "chat" };
  await showLoadingInOverlay(retryData, { replace });
  const surf = getSurface();
  const token = surf.beginRequest();

  const prompt = originalText ? `Context: "${originalText}"\n\nQuestion: ${query}` : query;

  try {
    const response = await sendMessageToBackground({
      type: "QUICK_ASK",
      payload: { query: prompt },
    });

    if (!surf.isCurrent(token)) return;
    if (response.success) {
      showResultOverlay({ ...retryData, result: response.data.response }, isInput);
    } else {
      showErrorInOverlay(response.error, retryData);
    }
  } catch (err) {
    if (surf.isCurrent(token)) showErrorInOverlay(err.message, retryData);
  }
}

// Run the same thing again: retry on a result, Try again on an error. The
// new loading state replaces the current one, so Back skips it.
function rerun(data) {
  if (data.source === "worker") {
    return rerunViaWorker(data);
  }
  if (data.action === "quick_ask") {
    return handleAskAction(data.query, data.originalText, data.isInput, { replace: true });
  }
  return handleAction(data.action, data.originalText, data.isInput, {
    bypassCache: true,
    replace: true,
    tone: data.action === "tone" ? data.preset : undefined,
  });
}

// Worker results re-run through the worker so retry never switches prompts.
async function rerunViaWorker(data) {
  await showLoadingInOverlay(
    {
      action: data.action,
      originalText: data.originalText,
      isInput: data.isInput,
      source: "worker",
    },
    { replace: true },
  );
  const failMsg = i18n.getMessage("overlay_error");
  try {
    const reply = await chrome.runtime.sendMessage({
      type: "RERUN_ACTION",
      action: data.action,
      text: data.originalText,
      isInput: Boolean(data.isInput),
    });
    // The worker refused the request: no result will ever arrive.
    if (!reply?.success) void showErrorInOverlay(failMsg, data);
  } catch (error) {
    void showErrorInOverlay(String(error?.message || failMsg), data);
  }
}

// A worker result can only re-run when it carries the text to run on (the
// no-selection error has none).
function canRerun(data) {
  if (!data?.action) return false;
  return data.source !== "worker" || Boolean(data.originalText);
}

// ============================================
// Positioning Logic (Left Anchored)
// ============================================

/**
 * Get rect for current selection, supporting both normal text and inputs
 */
function getSelectionRect() {
  if (typeof self !== "undefined" && /** @type {any} */ (self).OMNI_POSITIONING) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        const endPoint = /** @type {any} */ (self).OMNI_POSITIONING.getRectEndPoint(rects);
        if (endPoint) {
          return {
            top: endPoint.top,
            left: endPoint.left,
            bottom: endPoint.top,
            right: endPoint.left,
            width: 0,
            height: 0,
          };
        }
        const bounding = range.getBoundingClientRect();
        if (bounding && (bounding.width || bounding.height)) return bounding;
      } catch {}
    }
    if (lastRange) {
      try {
        const rects = lastRange.getClientRects();
        const endPoint = /** @type {any} */ (self).OMNI_POSITIONING.getRectEndPoint(rects);
        if (endPoint) {
          return {
            top: endPoint.top,
            left: endPoint.left,
            bottom: endPoint.top,
            right: endPoint.left,
            width: 0,
            height: 0,
          };
        }
        return lastRange.getBoundingClientRect();
      } catch {}
    }
  }
  const activeElement = document.activeElement;
  const context = getContext(activeElement);
  return context.getRect(activeElement);
}

// Gap between the anchor (toolbar or selection) and the card.
const CARD_GAP = 8;

// Viewport-relative edges of the card's containing block. The shadow host is
// position: static, so the containing block is the nearest positioned or
// transformed ancestor (often <body>), or the initial containing block.
// Reading it with a probe keeps top/bottom correct whichever one it is
// (positioned or transformed body, quirks mode, scrolled page).
function containingBlockEdges() {
  const parent = overlay && overlay.parentNode;
  if (parent) {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;top:0;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;";
    parent.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    return { top: rect.top, left: rect.left, bottom: rect.bottom };
  }
  return {
    top: -window.scrollY,
    left: -window.scrollX,
    bottom: document.documentElement.clientHeight - window.scrollY,
  };
}

// Place the card. Opens just under the anchor, left-aligned with it; when
// there is no room below it opens above, and then the bottom edge is the
// pinned one (CSS `bottom`) so height changes grow upward and the card never
// slides over the selection. `anchorRect.top` should already include the
// selection (see cardAnchorRect). `lockedPosition` keeps an open card where
// it already sits, in the card's own CSS coordinates: {top, left} for a below
// card, {top, left, bottom, placement: "above"} for an above card.
function positionOverlay(anchorRect = null, lockedPosition = null) {
  if (!overlay) return;

  // Ensure visibility to calculate height
  overlay.style.display = "flex";
  overlay.style.visibility = "hidden";
  overlay.style.maxHeight = "";
  overlay.style.position = "";

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const cb = containingBlockEdges();

  const applyAbove = (leftCss, bottomCss) => {
    // Viewport y of the card's bottom edge is cb.bottom - bottomCss.
    const room = cb.bottom - bottomCss - 10;
    overlay.style.maxHeight = `${Math.max(120, Math.min(viewportHeight - 20, room))}px`;
    overlay.style.top = "auto";
    overlay.style.bottom = `${Math.round(bottomCss)}px`;
    overlay.style.left = `${Math.round(leftCss)}px`;
    overlay.style.transformOrigin = "bottom left";
    overlay.dataset.placement = "above";
  };

  const applyBelow = (topCss, leftCss) => {
    overlay.style.bottom = "auto";
    overlay.style.top = `${Math.round(topCss)}px`;
    overlay.style.left = `${Math.round(leftCss)}px`;
    overlay.style.transformOrigin = "top left";
    overlay.dataset.placement = "below";
  };

  if (lockedPosition) {
    if (lockedPosition.placement === "above" && typeof lockedPosition.bottom === "number") {
      applyAbove(lockedPosition.left, lockedPosition.bottom);
    } else {
      const overlayHeight = overlay.offsetHeight || 400;
      let top = lockedPosition.top + cb.top; // viewport y
      const available = viewportHeight - 10 - top;

      if (overlayHeight > available && available >= 200) {
        // Keep the top edge still and scroll inside the card.
        overlay.style.maxHeight = `${available}px`;
      } else {
        overlay.style.maxHeight = `${viewportHeight - 20}px`;
        // Not enough room even to scroll: shift up.
        if (top + overlayHeight > viewportHeight - 10) {
          top = Math.max(10, viewportHeight - 10 - overlayHeight);
        }
      }
      if (top < 10) top = 10;
      applyBelow(top - cb.top, lockedPosition.left);
    }
    overlay.style.visibility = "visible";
    overlay.style.transform = "none";
    return;
  }

  if (anchorRect) {
    const placed = /** @type {any} */ (self).OMNI_POSITIONING.placeCard(
      { top: anchorRect.top, left: anchorRect.left, bottom: anchorRect.bottom },
      { width: overlay.offsetWidth || 320, height: overlay.offsetHeight || 400 },
      { width: viewportWidth, height: viewportHeight, scrollX, scrollY },
      CARD_GAP,
    );
    overlay.style.maxHeight = `${placed.maxHeight}px`;
    const leftCss = placed.left - scrollX - cb.left;
    if (placed.placement === "above") {
      applyAbove(leftCss, cb.bottom - (anchorRect.top - CARD_GAP));
    } else {
      applyBelow(placed.top - scrollY - cb.top, leftCss);
    }
    overlay.style.transform = "none";
  } else {
    // True Center
    overlay.style.top = "50%";
    overlay.style.bottom = "auto";
    overlay.style.left = "50%";
    overlay.style.transform = "translate(-50%, -50%)";
    overlay.style.position = "fixed";
    delete overlay.dataset.placement;
  }

  overlay.style.visibility = "visible";
}

// ============================================
// Helpers
// ============================================

// Closes the card through the surface: it leaves the DOM once its exit
// animation finishes (onClose then clears the overlay mirror).
function hideOverlay() {
  if (!surface || !surface.card()) return Promise.resolve();
  // Clear context on full close right away: a card reopened during the exit
  // animation reuses the element and never reaches onClose.
  lastMenuContext = null;
  askBackContext = null;
  return surface.close();
}

function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) {
      reject(new Error("Extension context invalidated."));
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Copy text to the clipboard, tolerating hosts that block the async
 * Clipboard API via a `Permissions-Policy: clipboard-write=()` header (e.g.
 * vnexpress.net). navigator.clipboard.writeText() runs against the page's
 * own document, so it inherits that policy the same way page scripts would
 * and rejects with NotAllowedError; the legacy execCommand("copy") path is
 * not gated by Permissions-Policy, so it still works there.
 *
 * document.featurePolicy.allowsFeature() reliably reports that block ahead
 * of time (confirmed against a real Permissions-Policy: clipboard-write=()
 * response), so check it first and skip straight to the fallback: calling
 * the async API anyway would still fail and additionally logs a Permissions
 * Policy violation to the DevTools Issues panel that a try/catch cannot
 * suppress. Chrome (this extension's only target) has shipped
 * document.featurePolicy for years, but guard with `?? true` in case that
 * ever changes, so we still attempt the modern API rather than assume block.
 */
async function copyTextToClipboard(text) {
  const featurePolicy = /** @type {any} */ (document).featurePolicy;
  const policyAllows = featurePolicy?.allowsFeature?.("clipboard-write") ?? true;
  if (policyAllows && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn("[Omni AI] navigator.clipboard.writeText blocked, falling back:", error);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  ensureUiRoot().appendChild(textarea);
  textarea.focus();
  textarea.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (error) {
    console.warn("[Omni AI] Fallback clipboard copy failed:", error);
  }
  textarea.remove();
  return success;
}

// ============================================
// Legacy Helper Refactors (Delegates to Strategies)
// ============================================

function isTextInput(el) {
  const context = getContext(el);
  return context.id === "standard" || context.id === "richText";
}

function getSelectedText() {
  const activeElement = document.activeElement;
  const context = getContext(activeElement);
  const result = context.getText(activeElement);
  return result.text;
}

function extractPageContent() {
  try {
    const bodyClone = /** @type {HTMLElement} */ (document.body.cloneNode(true));
    const noiseSelectors = [
      "script",
      "style",
      "nav",
      "footer",
      "header",
      "aside",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="complementary"]',
      ".advertisement",
      ".ads",
      ".sidebar",
      ".comments",
      "#comments",
      ".social-share",
      ".cookie-banner",
      ".newsletter-signup",
    ];

    noiseSelectors.forEach((selector) => {
      bodyClone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    let extractedText = bodyClone.innerText || "";
    extractedText = extractedText
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    const MAX_CONTENT_LENGTH = 4000;
    if (extractedText.length > MAX_CONTENT_LENGTH) {
      extractedText = extractedText.substring(0, MAX_CONTENT_LENGTH) + "...";
    }

    return {
      text: extractedText,
      title: document.title || "",
      url: window.location.href || "",
    };
  } catch (error) {
    console.error("[Omni AI] Failed to extract page content:", error);
    return {
      text: "",
      title: document.title || "",
      url: window.location.href || "",
    };
  }
}

// Move the card to its loading state, or open it there (a quick action from
// the toolbar opens the card straight into loading). Resolves once the
// transition has started, so a request token taken right after is current.
async function showLoadingInOverlay(data, { replace = false } = {}) {
  const surf = getSurface();
  if (isCardOpen()) {
    // Loading swaps the content where the card already sits.
    overlayLockedPosition = currentCardPosition();
    surf.to("loading", data, { replace });
    return;
  }
  await ensureUiRootReady();
  overlayLockedPosition = null;
  currentAnchorRect = cardAnchorRect() || currentAnchorRect;
  surf.open("loading", data);
}

function tonesMarkup(active) {
  return `<div class="omni-ai-tones">${TONES.map(
    (tone) =>
      `<button class="omni-ai-menu-item omni-ai-tone-pill${tone === active ? " is-active" : ""}" data-tone="${tone}">${escapeHtml(i18n.getMessage("tone_" + tone))}</button>`,
  ).join("")}</div>`;
}

// Picking another tone re-runs in place: the loading state replaces the
// current result (Back still goes to the menu) and takes a fresh token, so
// the slower of two quick picks never wins.
function bindTones(inner, data) {
  inner.querySelectorAll(".omni-ai-tone-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const tone = /** @type {HTMLElement} */ (pill).dataset.tone;
      if (pill.classList.contains("is-active")) return;
      handleAction("tone", data.originalText, data.isInput, { tone, replace: true });
    });
  });
}

function queryMarkup(query) {
  return query ? `<div class="omni-ai-result-query">${escapeHtml(query)}</div>` : "";
}

function renderLoadingState(inner, data, surf) {
  const { action, query, preset } = data || {};
  const title = action
    ? i18n.getMessage("overlay_loading_action", [actionTitle(action)])
    : i18n.getMessage("status_working");
  inner.innerHTML = `
    ${cardHeader(title)}
    ${action === "tone" ? tonesMarkup(preset) : ""}
    ${action === "quick_ask" ? queryMarkup(query) : ""}
    <div class="omni-ai-content-area">${SKELETON}</div>`;
  bindCardHeader(inner, surf);
  if (action === "tone") bindTones(inner, data);
}

async function showResultOverlay(payload, isInput = false) {
  resetQuickButtonIcon();
  const surf = getSurface();
  const data = { ...payload, isInput };

  if (isCardOpen()) {
    // Capture current position to prevent jumping
    overlayLockedPosition = currentCardPosition();
    if (!currentAnchorRect) currentAnchorRect = cardAnchorRect();
    return surf.to("result", data);
  }

  await ensureUiRootReady();
  // No card yet (keyboard shortcut, context menu): position near the
  // selection.
  overlayLockedPosition = null;
  currentAnchorRect = cardAnchorRect() || currentAnchorRect;
  return surf.open("result", data);
}

function renderResultState(inner, data, surf) {
  const { action, originalText, preset, query, isInput } = data;
  const result = String(data.result ?? "");
  const canDiff = DIFF_ACTIONS.includes(action) && Boolean(originalText);

  inner.innerHTML = `
    ${cardHeader(actionTitle(action))}
    ${action === "tone" ? tonesMarkup(preset || "professional") : ""}
    ${action === "quick_ask" ? queryMarkup(query) : ""}
    <div class="omni-ai-content-area"><div class="omni-ai-result-text"></div></div>
    <div class="omni-ai-footer-actions">
      ${canRerun(data) ? `<button class="omni-ai-icon-btn" id="omniAiRetry" title="${escapeHtml(i18n.getMessage("overlay_try_again"))}">${ICONS.retry}</button>` : ""}
      ${
        canDiff
          ? `<button class="omni-ai-toggle" id="omniAiShowChanges" role="switch" aria-checked="false"><span class="omni-ai-switch"></span><span>${escapeHtml(i18n.getMessage("overlay_show_changes"))}</span></button>`
          : ""
      }
      <span class="omni-ai-spacer"></span>
      <button class="omni-ai-btn" id="omniAiCopy">${escapeHtml(i18n.getMessage("overlay_copy"))}</button>
      ${isInput ? `<button class="omni-ai-btn is-primary" id="omniAiReplace">${escapeHtml(i18n.getMessage("overlay_replace"))}</button>` : ""}
    </div>`;

  // The clean new text, as text: AI output never becomes markup.
  const textEl = /** @type {HTMLElement} */ (inner.querySelector(".omni-ai-result-text"));
  textEl.textContent = result;

  bindCardHeader(inner, surf);
  if (action === "tone") bindTones(inner, data);

  inner.querySelector("#omniAiRetry")?.addEventListener("click", () => rerun(data));

  const toggle = inner.querySelector("#omniAiShowChanges");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", String(on));
      toggle.classList.toggle("is-on", on);
      swapSlot(textEl, () => {
        if (on) {
          // Both sides are escaped by diffHtml.
          textEl.innerHTML = /** @type {any} */ (self).OMNI_RENDER.diffHtml(originalText, result);
        } else {
          textEl.textContent = result;
        }
      });
    });
  }

  const copyBtn = inner.querySelector("#omniAiCopy");
  const copyLabel = escapeHtml(i18n.getMessage("overlay_copy"));
  copyBtn.addEventListener("click", async () => {
    if (!(await copyTextToClipboard(result))) return;
    flashCopied(
      copyBtn,
      `${ICONS.check}<span>${escapeHtml(i18n.getMessage("msg_copied"))}</span>`,
      copyLabel,
    );
  });

  const replaceBtn = inner.querySelector("#omniAiReplace");
  if (replaceBtn) {
    replaceBtn.addEventListener("click", async () => {
      // The replaced text is gone, and the toolbar with it: a leftover one
      // would still hold the old selection.
      if (await replaceSelectedText(result)) {
        hideQuickActionButton();
        hideOverlay();
      }
    });
  }
}

async function replaceSelectedText(newText, specificElement = null) {
  let activeElement = specificElement || document.activeElement;

  // Fallback to stored input element interaction
  if (
    activeInputElement &&
    (!activeElement || activeElement === document.body || getContext(activeElement).id === "static")
  ) {
    activeElement = activeInputElement;
  }

  // A stale/detached reference -- e.g. the page re-rendered this field (a
  // live comment counter, a framework re-render, ...) while a flash action's
  // mandatory hover delay + AI round-trip was in flight -- would otherwise
  // "successfully" write into a node no longer on screen: the overlay closes
  // reporting success, but the visible field never changes. Try to recover a
  // live element sharing the same id (stable across most re-renders) before
  // giving up; the recovered node won't have the original selection, so this
  // falls back to whole-field replacement rather than a partial one.
  if (activeElement && !activeElement.isConnected) {
    const recovered = activeElement.id ? document.getElementById(activeElement.id) : null;
    if (recovered?.isConnected) {
      console.warn(
        "[Omni AI] Replace: original target was detached (page re-rendered this field);",
        "recovered a live element with the same id, replacing its full value instead.",
      );
      activeElement = recovered;
    } else {
      console.warn(
        "[Omni AI] Replace: target element is no longer attached to the page",
        "(the page likely re-rendered this field while waiting for a result),",
        "and no element with the same id was found to recover.",
        activeElement,
      );
      return false;
    }
  }

  const context = getContext(activeElement);

  // Prepare state for replacement
  // Re-evaluate text state to see if it's a full text scenario (no selection)
  const currentTextState = context.getText(activeElement);

  const state = {
    // If range is collapsed, it's just a cursor, so we shouldn't use it for text replacement constraint
    // unless we strictly want insertion. But for "Fix/Replace", we want full text replacement if no selection.
    lastRange: lastRange && !lastRange.collapsed ? lastRange : null,
    fullText: (!lastRange || lastRange.collapsed) && currentTextState.fullText,
  };

  if (context.id === "static") {
    // Diagnostic: this branch silently no-ops (Replace click just does
    // nothing, overlay stays open) whenever the resolved target isn't an
    // editable field -- e.g. activeInputElement is stale/wrong, or the page
    // itself moved focus elsewhere before Replace was clicked.
    console.warn(
      "[Omni AI] Replace: resolved target isn't editable, doing nothing.",
      "activeElement:",
      activeElement,
      "activeInputElement:",
      activeInputElement,
    );
    return false;
  }

  const replacement = await /** @type {any} */ (self).OMNI_EDITOR_ADAPTERS.replaceViaAdapters(
    activeElement,
    state,
    newText,
  );
  if (!replacement.ok) {
    console.warn("[Omni AI] replace failed:", replacement.attempts.join("; "));
  }
  return replacement.ok;
}

async function showQuickAskOverlay(lockedRect = null, originalText = null, isInput = false) {
  await ensureUiRootReady();

  // Save current anchor for re-positioning
  currentAnchorRect = lockedRect || cardAnchorRect() || currentAnchorRect;
  overlayLockedPosition = null;
  askBackContext = { originalText, lockedRect, isInput };
  getSurface().open("ask", { originalText, isInput });
}

// The Ask state (spec "Result surface"): only the Ask box, focused, with a
// one-line faded context of the selection when there is one.
function renderAskState(inner, data, surf) {
  const { originalText, isInput } = data;
  const placeholder =
    originalText && !isInput
      ? i18n.getMessage("overlay_ask_about_text")
      : i18n.getMessage("popup_quickAsk");
  const context = originalText
    ? `<div class="omni-ai-ask-context">${escapeHtml(String(originalText).replace(/\s+/g, " ").trim())}</div>`
    : "";
  inner.innerHTML = `
    ${cardHeader(i18n.getMessage("quick_ask_title"))}
    ${context}
    ${askBoxMarkup(placeholder)}`;
  bindCardHeader(inner, surf);
  const input = bindAskBox(inner, (query) => handleAskAction(query, originalText, isInput));
  input.focus({ preventScroll: true });
}

async function showErrorInOverlay(msg, retryData = {}) {
  // A quick action's request can fail before any card is open: the surface
  // opens one, or the error would render nowhere and leave the floating
  // icon's spinner frozen.
  resetQuickButtonIcon();
  const surf = getSurface();
  const data = { ...retryData, msg };
  if (isCardOpen()) {
    overlayLockedPosition = currentCardPosition();
    return surf.to("error", data);
  }
  await ensureUiRootReady();
  overlayLockedPosition = null;
  currentAnchorRect = cardAnchorRect() || currentAnchorRect;
  return surf.open("error", data);
}

function renderErrorState(inner, data, surf) {
  const title = data.action ? actionTitle(data.action) : i18n.getMessage("overlay_error");
  inner.innerHTML = `
    ${cardHeader(title)}
    <div class="omni-ai-content-area">
      <div class="omni-ai-error" role="alert">
        ${ICONS.warn}
        <span class="omni-ai-error-text">${escapeHtml(data.msg || i18n.getMessage("overlay_error"))}</span>
      </div>
    </div>
    ${
      canRerun(data)
        ? `<div class="omni-ai-footer-actions">
            <span class="omni-ai-spacer"></span>
            <button class="omni-ai-btn" id="omniAiRetry">${ICONS.retry}<span>${escapeHtml(i18n.getMessage("overlay_try_again"))}</span></button>
          </div>`
        : ""
    }`;
  bindCardHeader(inner, surf);
  inner.querySelector("#omniAiRetry")?.addEventListener("click", () => rerun(data));
}

// Run
init();
