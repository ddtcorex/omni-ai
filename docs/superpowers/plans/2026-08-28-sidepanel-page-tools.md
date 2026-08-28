# Side Panel "Page Tools" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toolbar-icon popup (Quick Ask chat, the standalone-window hosting mechanism, and Google sign-in) with a `chrome.sidePanel`-based "Page Tools" panel that runs one-click Summarize / Smart Translate / Explain against the active tab's content, reusing the existing `QUICK_ACTION` backend unchanged.

**Architecture:** `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` replaces all the manual `chrome.action.onClicked`/`chrome.windows.*` code from the standalone-window attempt — Chrome opens the panel declaratively, no listener to maintain. The new `sidepanel/` directory (`sidepanel.html/js/css`) sends `{type: "GET_PAGE_CONTENT"}` to the active tab's content script (unchanged) and `{type: "QUICK_ACTION", payload: {action, text}}` to the background (unchanged `handleQuickAction`, which already supports explicit `text`). `popup/` and the OAuth sign-in code are deleted outright — nothing else in the codebase consumes either.

**Tech Stack:** Manifest V3, `chrome.sidePanel` (Chrome 114+), vanilla ES modules, Jest + jsdom + jest-chrome, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-sidepanel-page-tools-design.md`

## Global Constraints

- No framework, bundler, remote code, or MV2 API.
- Every user-visible string needs an `_locales/en/messages.json` key in the same commit (AGENTS.md hard rule); other locales may follow later, matching this repo's established practice.
- No new AI actions, no chat/text-input UI in the side panel — reuse `summarizeText`/`smartTranslate`/`explainText` exactly as they exist today via the existing `QUICK_ACTION` message type.
- `chrome.sidePanel` requires Chrome 114+; accepted as-is per the spec's "Known Constraint" section, no `minimum_chrome_version` pin.
- The Alt+A/R/T/F keyboard shortcuts and the in-page Quick Ask overlay (`SHOW_QUICK_ASK_OVERLAY`, `QUICK_ASK` message type, `handleQuickAsk()`) are untouched — content.js's overlay is a separate surface from the popup being removed.

---

### Task 1: Service worker cleanup — remove OAuth and the standalone-window code, register the side panel

**Files:**
- Modify: `manifest.json` (`permissions`, delete `oauth2` block)
- Modify: `background/service-worker.js` (delete Quick-Ask-window block + OAuth handlers/cases, add `chrome.sidePanel.setPanelBehavior`)
- Modify: `tests/background/service-worker.test.js` (mock shape, remove 4 obsolete tests, add 1 new test)

**Interfaces:**
- Produces: nothing new consumed by later tasks — `handleQuickAction`/`handleQuickAsk` (unchanged) are what Task 2's `sidepanel.js` calls into, by message type only (`QUICK_ACTION`, `GET_PAGE_CONTENT` to content.js), not by importing anything from this file directly.

- [ ] **Step 1: Update the Chrome mock and remove the 4 tests for the code this task deletes.**

In `tests/background/service-worker.test.js`, inside the `chromeMock` object (the `beforeEach` block), replace:

```js
      identity: { getAuthToken: jest.fn() },
      commands: { onCommand: { addListener: jest.fn() } },
      action: { onClicked: { addListener: jest.fn() } },
      windows: {
        create: jest.fn().mockResolvedValue({ id: 111 }),
        update: jest.fn().mockResolvedValue({}),
        onRemoved: { addListener: jest.fn() },
      },
    };
```

with:

```js
      commands: { onCommand: { addListener: jest.fn() } },
      sidePanel: { setPanelBehavior: jest.fn().mockResolvedValue(undefined) },
    };
```

Then delete these 4 `it(...)` blocks entirely (they test the `chrome.action.onClicked`/`chrome.windows` code this task removes):

- `"opens Quick Ask as a standalone window when the toolbar icon is clicked"`
- `"focuses the existing Quick Ask window instead of opening a second one"`
- `"allows opening a new Quick Ask window again after the previous one was closed"`
- `"remembers the tab that was active when the icon was clicked, for Quick Ask to read page content from"`

- [ ] **Step 2: Run the suite to confirm it's still green after the removal.**

Run: `npx jest tests/background/service-worker.test.js`
Expected: PASS (removing tests/mocks for dead code doesn't break anything still using them — nothing else in the file references `identity`, `action`, or `windows`).

- [ ] **Step 3: Write the new failing test.**

Add to `tests/background/service-worker.test.js`, near `"registers listeners on load"`:

```js
  it("configures the toolbar icon to open the side panel directly, not a popup window", async () => {
    await import("../../background/service-worker");

    expect(chromeMock.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });
```

- [ ] **Step 4: Run it and confirm it fails.**

Run: `npx jest tests/background/service-worker.test.js -t "configures the toolbar icon"`
Expected: FAIL — `chromeMock.sidePanel` is `undefined` (the mock only gained `sidePanel` in Step 1; `service-worker.js` itself doesn't call it yet).

- [ ] **Step 5: Remove the Quick-Ask-window block and OAuth code from `background/service-worker.js`, add the side-panel registration.**

Delete this entire block (currently right after the `chrome.runtime.onInstalled.addListener(...)` call):

```js
/**
 * Quick Ask window management
 *
 * The toolbar icon used to be action.default_popup, but Chrome force-closes
 * that popup type on any blur -- including when an OS-level IME (ibus, the
 * Super+Space input-method switcher) steals focus, which made typing
 * Vietnamese in Quick Ask impossible. Opening it as a real window instead
 * (via chrome.action.onClicked, only fired when no default_popup is set)
 * behaves like any other browser window and isn't affected.
 */
let quickAskWindowId = null;
// The tab active when the icon was clicked. Quick Ask now runs in its own
// top-level window, so its own chrome.tabs.query({currentWindow: true})
// would resolve to ITS window, not the page the user was reading -- unlike
// the old action.default_popup, which Chrome special-cased to mean the
// underlying browsing window. Capturing it here (onClicked receives it
// directly) and handing it over via GET_QUICK_ASK_TARGET_TAB is the only
// reliable way for popup.js to find the right tab.
let quickAskTargetTabId = null;

chrome.action.onClicked.addListener(async (tab) => {
  quickAskTargetTabId = tab?.id ?? null;

  if (quickAskWindowId !== null) {
    await chrome.windows.update(quickAskWindowId, { focused: true });
    return;
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("popup/popup.html"),
    type: "popup",
    width: 380,
    height: 640,
    focused: true,
  });
  quickAskWindowId = win.id;
});

chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === quickAskWindowId) {
    quickAskWindowId = null;
  }
});
```

Replace it with:

```js
/**
 * Open the side panel directly on a toolbar-icon click, instead of Chrome's
 * default action-popup behavior. This is the entire click-handling story --
 * no onClicked listener needed, Chrome does it declaratively.
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

Delete the `case "GET_QUICK_ASK_TARGET_TAB":` block from the `chrome.runtime.onMessage.addListener` switch:

```js
    case "GET_QUICK_ASK_TARGET_TAB":
      sendResponse({ success: true, tabId: quickAskTargetTabId });
      return true;

```

(Delete just this case; leave the `case "GET_API_KEY":` right after it in place.)

Delete the `case "SIGN_IN":`, `case "SIGN_OUT":`, and `case "GET_USER":` blocks from the same switch:

```js
    // Authentication
    case "SIGN_IN":
      handleSignIn()
        .then((user) => sendResponse({ success: true, user }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "SIGN_OUT":
      handleSignOut()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "GET_USER":
      getUser()
        .then((user) => sendResponse({ success: true, user }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

```

Delete the entire `// Authentication Handlers` section (the `USER_INFO_URL` constant and the `handleSignIn`, `handleSignOut`, `getUser`, `getAuthToken`, `fetchUserInfo`, `saveUserInfo`, `revokeToken` functions — everything between the `// ============================================\n// Authentication Handlers\n// ============================================` comment and the `// ============================================\n// Action Handlers\n// ============================================` comment that follows it).

- [ ] **Step 6: Update `manifest.json`.**

Change `permissions`:

```json
  "permissions": ["storage", "activeTab", "contextMenus", "identity"],
```

to:

```json
  "permissions": ["storage", "activeTab", "contextMenus", "sidePanel"],
```

Delete the entire `oauth2` block:

```json
  "oauth2": {
    "client_id": "923297272333-ho5udq7phe9mplbdd43s4m8c58aa0k9b.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  },

```

(Task 2 adds the `side_panel.default_path` key once `sidepanel/sidepanel.html` actually exists — don't add it yet, or `npx web-ext lint` will warn about a manifest path that doesn't resolve.)

- [ ] **Step 7: Run the focused test, then the full suite.**

Run: `npx jest tests/background/service-worker.test.js -t "configures the toolbar icon"`
Expected: PASS.

Run: `npm test`
Expected: All suites pass. (`grep -rn "handleSignIn\|handleSignOut\|getAuthToken\|fetchUserInfo\|saveUserInfo\|revokeToken\|quickAskWindowId\|quickAskTargetTabId" background/service-worker.js` should return nothing — sanity-check no dangling references before moving on.)

- [ ] **Step 8: Commit.**

```bash
git add manifest.json background/service-worker.js tests/background/service-worker.test.js
git commit -m "refactor: replace the Quick Ask popup window with chrome.sidePanel, drop OAuth"
```

---

### Task 2: Create the `sidepanel/` Page Tools UI

**Files:**
- Create: `sidepanel/sidepanel.html`
- Create: `sidepanel/sidepanel.css`
- Create: `sidepanel/sidepanel.js`
- Modify: `manifest.json` (add `side_panel.default_path`)
- Modify: `_locales/en/messages.json` (new keys)
- Test: `e2e/sidepanel.spec.js` (new)

**Interfaces:**
- Consumes: `GET_PAGE_CONTENT` (existing, `content/content.js`, unchanged — returns `{success, content, title, url}`), `QUICK_ACTION` (existing, `background/service-worker.js`'s `handleQuickAction`, unchanged — accepts `{action, text}` and returns `{success, data: {response}}` or `{success: false, error}`).
- Produces: nothing consumed by later tasks in this plan — Task 3 only deletes `popup/` and doesn't touch these files further.

- [ ] **Step 1: Add the new English message keys.**

Add to `_locales/en/messages.json` (position doesn't matter — JSON key order isn't significant; placing them near `popup_title` keeps related UI copy together):

```json
  "sidepanel_title": {
    "message": "Page Tools",
    "description": "Side panel section heading"
  },
  "sidepanel_summarize": {
    "message": "Summarize",
    "description": "Side panel action button: summarize the current page"
  },
  "sidepanel_translate": {
    "message": "Smart Translate",
    "description": "Side panel action button: translate the current page"
  },
  "sidepanel_explain": {
    "message": "Explain",
    "description": "Side panel action button: explain the current page"
  },
  "sidepanel_loading": {
    "message": "Working on it…",
    "description": "Side panel status while an action is running"
  },
  "sidepanel_resultLabel": {
    "message": "Result",
    "description": "Side panel label above the AI result text"
  },
  "sidepanel_cantReadPage": {
    "message": "Can't read this page",
    "description": "Side panel error when the content script isn't reachable on the active tab"
  },
  "sidepanel_noContent": {
    "message": "Nothing to work with on this page",
    "description": "Side panel error when the page has no extractable text"
  },
```

- [ ] **Step 2: Create `sidepanel/sidepanel.html`.**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Omni AI</title>
    <link rel="stylesheet" href="sidepanel.css" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="icon" type="image/svg+xml" href="../assets/icons/logo.svg" />
  </head>
  <body>
    <div class="sidepanel-container">
      <header class="header">
        <div class="logo">
          <img src="../assets/icons/logo.svg" alt="Omni AI" class="logo-icon" />
          <span class="logo-text">__MSG_popup_title__</span>
        </div>
        <button id="settingsBtn" class="icon-btn" title="__MSG_settings_title__">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            ></path>
          </svg>
        </button>
      </header>

      <main class="page-tools">
        <h2 class="page-tools-title">__MSG_sidepanel_title__</h2>

        <div class="action-buttons">
          <button id="summarizeBtn" class="action-btn" data-action="summarize">
            <span class="action-icon">📄</span>
            <span class="action-label">__MSG_sidepanel_summarize__</span>
          </button>
          <button id="translateBtn" class="action-btn" data-action="smart_translate">
            <span class="action-icon">🌐</span>
            <span class="action-label">__MSG_sidepanel_translate__</span>
          </button>
          <button id="explainBtn" class="action-btn" data-action="explain">
            <span class="action-icon">💡</span>
            <span class="action-label">__MSG_sidepanel_explain__</span>
          </button>
        </div>

        <div id="statusLine" class="status-line hidden"></div>

        <div id="resultArea" class="result-area hidden">
          <div class="result-label">__MSG_sidepanel_resultLabel__</div>
          <div id="resultText" class="result-text"></div>
        </div>
      </main>

      <footer class="footer">
        <span class="version" id="extVersion"></span>
      </footer>
    </div>

    <script src="sidepanel.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `sidepanel/sidepanel.css`.**

```css
/* ============================================
   Omni AI - Side Panel Styles (Page Tools)
   ============================================ */

:root {
  --bg-primary: #0f0f14;
  --bg-secondary: #1a1a24;
  --bg-tertiary: #252532;
  --bg-hover: #2d2d3d;

  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --accent-purple: #8b5cf6;
  --accent-cyan: #06b6d4;

  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;

  --border-color: rgba(255, 255, 255, 0.08);

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;

  --radius-md: 8px;

  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);

  --font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:root.omni-ai-light-mode {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-hover: #e2e8f0;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;

  --border-color: rgba(0, 0, 0, 0.08);
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
}

body {
  font-family: var(--font-family);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* A side panel's width is controlled by the user dragging Chrome's own
   panel divider, not by this page -- fill whatever it's given instead of
   assuming a fixed size (that mistake was made twice already for the old
   popup, see AGENTS.md / CHANGELOG.md history). */
.sidepanel-container {
  width: 100%;
  height: 100%;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  width: 24px;
  height: 24px;
}

.logo-text {
  font-weight: 600;
  font-size: 14px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.page-tools {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.page-tools-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--accent-purple);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-icon {
  font-size: 16px;
}

.status-line {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-line.error {
  color: var(--error);
}

.status-line.hidden,
.result-area.hidden {
  display: none;
}

.result-area {
  border: 1px solid rgba(139, 92, 246, 0.2);
  background: rgba(139, 92, 246, 0.1);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.result-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-xs);
}

.result-text {
  font-size: 13px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.version {
  font-size: 11px;
  color: var(--text-muted);
}
```

- [ ] **Step 4: Create `sidepanel/sidepanel.js`.**

```js
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
```

- [ ] **Step 5: Add the `side_panel` manifest entry.**

In `manifest.json`, add after the `options_ui` block:

```json
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },

```

- [ ] **Step 6: Write the e2e test.**

Create `e2e/sidepanel.spec.js`:

```js
const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

test("side panel loads and renders the three Page Tools buttons", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    await expect(page).toHaveTitle("Omni AI");
    await expect(page.locator("#summarizeBtn")).toBeVisible();
    await expect(page.locator("#translateBtn")).toBeVisible();
    await expect(page.locator("#explainBtn")).toBeVisible();
    await expect(page.locator("#resultArea")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("clicking Summarize reads the active tab's content and shows a result or a clear error", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <p>The quick brown fox jumps over the lazy dog, repeatedly, for testing purposes.</p>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    const pageTab = await context.newPage();
    await pageTab.goto(`http://127.0.0.1:${port}/`);
    await pageTab.bringToFront();

    const extId = new URL(sw.url()).host;
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
    await panel.click("#summarizeBtn");

    // No API key is configured in this harness, so the real assertion is
    // that the panel reaches a terminal state (result or error) instead of
    // hanging on "Working on it..." forever -- same constraint the removed
    // popup e2e specs worked under.
    await expect(panel.locator("#statusLine.error, #resultArea:not(.hidden)")).toBeVisible();
  } finally {
    await context.close();
    server.close();
  }
});
```

- [ ] **Step 7: Run it and confirm both pass.**

Run: `npx playwright test e2e/sidepanel.spec.js`
Expected: PASS (2/2). If the second test times out on the status/result selector, check `#statusLine`'s `error` class is actually being toggled — `chrome.tabs.query({active, currentWindow})` inside a side-panel-hosted page resolves to the real browsing window per the spec's Data Flow section, so `pageTab` should be found correctly without the `GET_QUICK_ASK_TARGET_TAB` workaround the old popup needed.

- [ ] **Step 8: Run the full verification suite.**

Run: `npm run verify`
Expected: typecheck + lint + all Jest suites pass (no Jest changes in this task, so this just guards against an unrelated regression).

Run: `npx playwright test`
Expected: all e2e specs pass, including the 2 new ones (the 3 popup-specific specs deleted in Task 3 still exist right now and should still pass too — `popup/` isn't deleted until Task 3).

- [ ] **Step 9: Commit.**

```bash
git add sidepanel/ manifest.json _locales/en/messages.json e2e/sidepanel.spec.js
git commit -m "feat: add side panel Page Tools (Summarize / Smart Translate / Explain)"
```

---

### Task 3: Delete `popup/` and its dead references

**Files:**
- Delete: `popup/popup.html`, `popup/popup.js`, `popup/popup.css`
- Modify: `e2e/smoke.spec.js` (remove 3 popup specs)
- Modify: `_locales/*/messages.json` (all 10 locales — remove 8 dead keys)
- Modify: `AGENTS.md` (File Map, Storage Map)

**Interfaces:**
- None — this task only removes code; nothing added here is consumed elsewhere.

- [ ] **Step 1: Delete the popup directory.**

```bash
git rm -r popup/
```

- [ ] **Step 2: Remove the 3 popup-specific tests from `e2e/smoke.spec.js`.**

Delete these 3 `test(...)` blocks in full:

- `"popup page loads and renders its chat shell"`
- `"popup empty-state placeholder disappears once a real message is sent"`
- `"popup fills a resized Quick Ask window instead of leaving dead space"`

Leave `"selecting text mounts the Omni AI shadow UI"` and `"settings page loads and renders provider configuration"` untouched.

- [ ] **Step 3: Run the e2e suite to confirm nothing references the deleted directory anymore.**

Run: `npx playwright test`
Expected: PASS — no spec should still `goto` a `popup/popup.html` URL. (`grep -rn "popup/popup.html\|popup\.html" e2e/` should return nothing.)

- [ ] **Step 4: Remove the 8 dead i18n keys from all 10 locale files.**

These keys were used exclusively by the now-deleted `popup/popup.html`/`popup.js` (verified via `grep -rln` across the repo before writing this plan — no other file references any of them):

```
auth_accountMenu
auth_signIn
auth_signOut
btn_ask_ai
btn_new_chat
include_page_context
include_page_context_locked_hint
popup_page_context_included
```

For each of `_locales/{en,vi,es,fr,de,it,pt,ja,ko,zh}/messages.json`, delete the JSON object entry for each of the 8 keys above (skip a file/key combination if that particular locale never had it — non-English locales don't always carry every key). Verify afterward with:

```bash
grep -rln "auth_accountMenu\|auth_signIn\|auth_signOut\|btn_ask_ai\|btn_new_chat\|include_page_context\|popup_page_context_included" _locales/
```

Expected: no output (every reference removed).

- [ ] **Step 5: Update `AGENTS.md`'s File Map and Storage Map.**

Change:

```
|-- popup/                   # Quick Ask chat popup (auth UI, page-context toggle) --
|                             #   opened as a standalone chrome.windows.create window
|                             #   (background/service-worker.js chrome.action.onClicked),
|                             #   NOT action.default_popup: that popup type force-closes
|                             #   on any blur, which broke IME composition (ibus) and
|                             #   made the Super+Space input-method switch close it mid-type.
```

to:

```
|-- sidepanel/                # Page Tools (Summarize / Smart Translate / Explain the
|                             #   active tab) -- opened via chrome.sidePanel, registered
|                             #   with chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})
|                             #   in background/service-worker.js. Replaced the old Quick
|                             #   Ask chat popup (both the action.default_popup and the
|                             #   later standalone-window versions): a side panel is
|                             #   docked to the browser window and doesn't force-close on
|                             #   blur, so it never had the ibus/Super+Space IME bug those
|                             #   two popup mechanisms did.
```

In the Storage Map table's `sync` row, remove `` `user` (OAuth profile) `` from the key list — it becomes:

```
| `sync`    | `primaryLanguage`, `defaultLanguage`, `omni_ai_theme`                                                                                                                                    |
```

- [ ] **Step 6: Run full verification.**

Run: `npm run verify && npx playwright test`
Expected: all green.

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "chore: remove the retired popup UI and its dead i18n keys"
```

---

### Task 4: Docs — README, CHANGELOG, CWS listing

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/CHROME_WEBSTORE_LISTING.txt`
- Modify: `docs/FOLLOWUPS.md`

**Interfaces:**
- None.

- [ ] **Step 1: Update `README.md`'s feature list.**

Replace:

```
- **Ask AI** - Direct chat contextually based on your selection.
- **Persistent Chat** - Popup chat retains history for multi-turn conversations.
- **Context Awareness** - AI remembers context from previous messages in the popup.
- **Page Context** - Smarter answers with awareness of the current page title and URL.
```

with:

```
- **Ask AI** - Direct chat contextually based on your selection (Alt+A opens an in-page overlay).
- **Page Tools** - Click the toolbar icon to open a side panel with one-click Summarize / Smart Translate / Explain for the whole page you're on.
```

- [ ] **Step 2: Delete the "Google Sign-In (Optional)" section entirely.**

Remove this whole section (between the "Custom Model Configuration" section and the "⌨️ Keyboard Shortcuts" section):

```
### 3. Google Sign-In (Optional)

To use the personalization features (syncing settings across devices), you need to configure OAuth.

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Credentials**.
4. Create **OAuth client ID** > **Chrome extension**.
5. Detailed steps can be found in the [Chrome Identity API docs](https://developer.chrome.com/docs/extensions/reference/identity/).
6. Copy the `client_id` and paste it into `manifest.json`:

   ```json
   "oauth2": {
     "client_id": "YOUR_NEW_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```

7. (Recommended) Copy the `key` from the Developer Dashboard to `manifest.json` to keep the extension ID stable.

---
```

(Keep the `---` divider that comes right before "⌨️ Keyboard Shortcuts" — only the section content above it goes.)

- [ ] **Step 3: Update the Project Structure diagram.**

Replace:

```
├── popup/                  # Extension Popup
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
```

with:

```
├── sidepanel/               # Page Tools side panel (Summarize/Translate/Explain)
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── sidepanel.css
```

- [ ] **Step 4: Update the permission justification line.**

Replace:

```
   - **Justification**: Explain `activeTab`, `storage`, `identity`, `contextMenus` usage clearly.
```

with:

```
   - **Justification**: Explain `activeTab`, `storage`, `sidePanel`, `contextMenus` usage clearly.
```

- [ ] **Step 5: Add a CHANGELOG entry.**

Under `## [Unreleased]` in `CHANGELOG.md` (create the section if the last release already closed it out), add:

```markdown
### Changed
- The toolbar icon now opens a "Page Tools" side panel (Summarize / Smart Translate / Explain the current page) instead of the Quick Ask chat popup. Quick Ask chat itself is unchanged and still reachable via Alt+A or the right-click "Ask Omni AI" menu.

### Removed
- Google sign-in. It only ever displayed a name/avatar and gated no feature (BYOK is the only model) — removed along with the popup that showed it.
```

- [ ] **Step 6: Update `docs/CHROME_WEBSTORE_LISTING.txt`.**

Replace:

```
Chat & Quick Ask
• Quick Ask (Alt+A) — a floating overlay to ask about the text you've highlighted without losing your place.
• Popup Chat — a side panel (click the toolbar icon) that keeps your recent conversation for longer research or brainstorming sessions.
```

with:

```
Chat & Page Tools
• Quick Ask (Alt+A) — a floating overlay to ask about the text you've highlighted without losing your place.
• Page Tools — click the toolbar icon to open a side panel with one-click Summarize, Smart Translate, and Explain for the entire page you're reading.
```

- [ ] **Step 7: Replace the two obsolete manual-test FOLLOWUPS items with one covering the side panel.**

In `docs/FOLLOWUPS.md`, delete row `13` (`Quick Ask standalone-window switch never clicked in real Chrome`) and row `14` (`Include this page's content as context`) — both describe manual verification for the standalone-window mechanism this plan removes entirely, so they're moot rather than fixed.

Add a new row in their place (reusing number `13`; there is no row `14` after this):

```
| 13  | user report, manual test | **Side panel toolbar-icon click never verified in real Chrome.** `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})` is unit-tested (Jest, mocked `chrome.sidePanel`) and the panel's own page is e2e-tested by direct URL navigation, but Playwright can't drive a real toolbar-icon click, so opening the panel by actually clicking the icon, and its behavior across tab switches, was never confirmed in a real loaded Chrome. | `background/service-worker.js` (`chrome.sidePanel.setPanelBehavior`), `sidepanel/sidepanel.js` | Before/soon after next Chrome Web Store upload of this version |
```

- [ ] **Step 8: Commit.**

```bash
git add README.md CHANGELOG.md docs/CHROME_WEBSTORE_LISTING.txt docs/FOLLOWUPS.md
git commit -m "docs: update README/CHANGELOG/CWS listing for the side panel Page Tools switch"
```

---

### Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full verification suite.**

Run: `npm run verify`
Expected: typecheck + lint + all Jest suites pass.

- [ ] **Step 2: Run the e2e suite.**

Run: `npx playwright test`
Expected: all specs pass, including the new `e2e/sidepanel.spec.js` and excluding the deleted popup specs (should no longer appear in the test list at all).

- [ ] **Step 3: Run `web-ext lint`.**

Run: `npm run lint:webext`
Expected: no new errors/warnings introduced by this plan (compare against the pre-existing `BACKGROUND_SERVICE_WORKER_NOFALLBACK` baseline noted in this repo's history — that one is unrelated and pre-existing).

- [ ] **Step 4: Build the store zip.**

Run: `bash scripts/publish.sh`
Expected: `dist/omni-ai-v2.2.0.zip` (or whatever the current `manifest.json` version is) builds cleanly; the dev `manifest.json` (with its pinned `"key"`) is restored afterward. Since `manifest.json` no longer has an `oauth2` block, `publish.sh`'s `if 'oauth2' in data` guard makes its client_id-swap step a silent no-op — this is expected, not a bug.

- [ ] **Step 5: Manual smoke check (cannot be exercised by automated tests).**

Load the unpacked extension in real Chrome (reload it at `chrome://extensions` first — `manifest.json` changed) and confirm: (1) clicking the toolbar icon opens the side panel, not a popup or a new window; (2) all 3 buttons (Summarize / Smart Translate / Explain) work against a real page with a real API key configured; (3) the panel stays open while switching tabs and scrolling the page; (4) the gear icon opens Settings. Record the outcome (and any deviation) before treating this plan as shipped — same class of manual gap as `docs/FOLLOWUPS.md`'s other entries.

- [ ] **Step 6: Final commit if Steps 1-4 required any fixes.**

If everything already passed with no changes needed, there's nothing to commit here — Task 4's commit is the last one. If a fix was needed, commit it with a message describing what verification step caught it.
