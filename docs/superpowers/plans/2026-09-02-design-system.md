# Omni AI Vanilla Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three UI surfaces (content-script overlay, side panel, settings page) onto one shared set of vanilla CSS design tokens and component classes, fix the theme-handling duplication in `content.js`, and fix the three positioning/action-switching interaction bugs traced to `content.js` during the design's evidence-gathering pass.

**Architecture:** Two new shared files (`lib/design-tokens.css`, `lib/design-system.css`) become the single source of truth for colors/spacing/radius/typography and for reusable component classes (`.ds-icon-btn`, `.ds-btn-primary`, `.ds-btn-secondary`, `.ds-spinner`, `.ds-card`), loaded via `<link>` in the two regular HTML documents (`settings.html`, `sidepanel/sidepanel.html`) and via the same fetch-into-shadow-root mechanism `content.js` already uses for `overlay.css`. Theme handling is unified by giving `lib/theme-manager.js`'s `applyTheme()`/`initTheme()` an optional `root` parameter and switching the overlay from CSS-cascade-breaking per-element `.omni-ai-light-mode` toggling to a single `:host-context(.omni-ai-light-mode)` rule that lets the shadow tree inherit theme tokens from one themed ancestor. A new classic-script module, `content/positioning.js` (same pattern as the existing `content/editor-adapters.js`), holds the pure, unit-testable positioning fixes (`clampToViewport`, selection-end anchoring) that `content.js` wires in. Each of the three surfaces is then retrofitted to the new shared classes/tokens, dropping its own locally-duplicated component CSS.

**Tech Stack:** Vanilla ES modules/CSS custom properties, no build step (per `AGENTS.md` Core Directive #1). Jest + jest-chrome + jsdom for unit tests (`npm test`). Playwright for e2e (`npx playwright test`).

**Spec:** `docs/superpowers/specs/2026-09-02-design-system-design.md`

## Global Constraints

- No React/Vue/Tailwind/bundler; plain ES modules + modern CSS; the browser loads source files directly (`AGENTS.md` Core Directive #1).
- All content-script UI stays inside the Shadow DOM root (`ensureUiRoot()` in `content/content.js`); never inject overlay elements into the host page's own DOM.
- Every user-visible string goes through `chrome.i18n.getMessage()`/`lib/i18n.js` — this plan introduces no new user-facing strings, so no new i18n keys are required, but any step that touches HTML/JS must not accidentally hardcode text.
- Any `onMessage` listener case that responds asynchronously MUST `return true` immediately — no case touched by this plan changes this contract, but Task 6 edits a `case` inside `content.js`'s message listener and must preserve the existing `return true` at the end of that listener (`content.js:570`).
- Token prefix is `--omni-*` everywhere (overlay, settings, side panel) — no surface keeps its old prefix (`--ai-*`) or its old unprefixed names once its retrofit task lands.
- `docs/design-system/MASTER.md` is committed to the repo, not gitignored.
- Run `npm run verify` (typecheck + lint + jest) after every task's implementation step, before committing.

---

## File Structure

**New files:**
- `lib/design-tokens.css` — canonical `--omni-*` custom properties (colors, spacing scale, radius scale, typography, transitions, shadows), dark-default with light-mode overrides for both plain-document contexts (`:root.omni-ai-light-mode`) and the Shadow-DOM overlay context (`:host-context(.omni-ai-light-mode)`).
- `lib/design-system.css` — shared component classes: `.ds-icon-btn`, `.ds-btn-primary`, `.ds-btn-secondary`, `.ds-spinner`, `.ds-card` (+ `.ds-card--accent` modifier for the left-accent-border variant, `.ds-card--success`/`.ds-card--error`/`.ds-card--processing` status modifiers).
- `content/positioning.js` — classic content-script module (same IIFE-on-`self` pattern as `content/editor-adapters.js`) exporting `self.OMNI_POSITIONING = { clampToViewport, getRectEndPoint }`.
- `docs/design-system/MASTER.md` — persisted design-system reference doc.
- `tests/design-tokens.test.js` — sanity test that `lib/design-tokens.css` defines the critical token set (Task 1); gains a "no legacy names remain" assertion once all three surfaces are retrofitted (Task 11).
- `tests/design-system.test.js` — sanity test that `lib/design-system.css` defines the expected component classes (Task 2).
- `tests/lib/theme-manager.test.js` — new (none exists today) — covers the `root` parameter behavior (Task 3).
- `tests/content/positioning.test.js` — unit tests for `clampToViewport`/`getRectEndPoint` (Task 5), mirroring `tests/content/editor-adapters.test.js`'s `require()` + `global.self = global` pattern.

**Modified files:**
- `lib/theme-manager.js` — `applyTheme(themePreference, root = document.documentElement)`, `initTheme(root = document.documentElement)` (Task 3).
- `manifest.json` — add `lib/design-tokens.css` + `lib/design-system.css` to `web_accessible_resources`; add `content/positioning.js` to `content_scripts[0].js` before `content/content.js` (Tasks 4, 5).
- `settings.html`, `sidepanel/sidepanel.html` — add `<link>` tags for the two new shared CSS files (Task 4).
- `content/content.js` — extend `ensureUiStyles()` to also fetch/inject the two shared CSS files; delete the four duplicated theme-resolution blocks and wire a single `initTheme(omniUiHost)` call instead (Task 4); wire `clampToViewport`/`getRectEndPoint` into the positioning code and unify `lastMenuContext` across the click and keyboard-shortcut trigger paths (Task 6); swap component class names/inline styles to the new shared classes as part of the overlay retrofit (Task 7).
- `content/overlay.css` — drop the local `--ai-*` token block and the light-mode override block in favor of `lib/design-tokens.css`; drop locally-duplicated component rules (`.omni-ai-icon-btn`, `.omni-ai-btn-primary`, `.omni-ai-btn-secondary`, `.omni-ai-spinner`, `.omni-ai-context-preview`) now provided by `lib/design-system.css` (Task 7).
- `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js` — same pattern for the side panel (Task 8).
- `settings.css`, `settings.js` — same pattern for settings (Task 9).
- `AGENTS.md` — File Map gains the two new `lib/*.css` files and `content/positioning.js`; manual smoke checklist gains items for viewport-edge positioning and the unified Back button (Task 11).

## Task Dependency / Parallelism Notes

Tasks 1-4 are true prerequisites for every surface retrofit (the shared files must exist and be wired in before any surface can be pointed at them) and must land first, in order (1 → 2 → 3 → 4; 1-3 could be parallelized across subagents since they touch disjoint files, but 4 depends on all three).

Tasks 5-6 (the `positioning.js` module and its wiring into `content.js`) are independent of the token/component work and could be done in parallel with Tasks 1-4, but both 6 and 7 modify `content.js`, so **6 must land before 7** (same-file conflict). Tasks 8 (side panel) and 9 (settings) touch entirely disjoint files from each other and from 6/7, so **8 and 9 may run in parallel with each other and with the 5→6→7 chain**, once Tasks 1-4 have landed. Task 10 (MASTER.md) only needs the token/class names decided (after Task 2) and can happen any time after. Task 11 (final verification) must be last.

---

### Task 1: `lib/design-tokens.css` — canonical design tokens

**Files:**
- Create: `lib/design-tokens.css`
- Create: `tests/design-tokens.test.js`

**Interfaces:**
- Produces: CSS custom properties under the `--omni-*` prefix, consumed by every later task. Full list below is authoritative — later tasks must use these exact names, no others.

Token list (values carried over unchanged from the current three surfaces' union, per the spec's Evidence section — dark is the default palette, matching all three surfaces' current default):

```css
/* lib/design-tokens.css */

/* ============================================
   Omni AI - Design Tokens
   Single source of truth for all three UI surfaces
   (content-script overlay, side panel, settings page).
   See docs/design-system/MASTER.md for usage guidance.
   ============================================ */

:root,
:host {
  --omni-font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Color - dark (default) */
  --omni-bg-primary: #0f0f14;
  --omni-bg-secondary: #1a1a24;
  --omni-bg-tertiary: #252532;
  --omni-bg-hover: #2d2d3d;
  --omni-bg-active: #383848;

  --omni-glass-bg: rgba(22, 22, 28, 0.75);
  --omni-glass-heavy: rgba(26, 26, 36, 0.9);

  --omni-border: rgba(255, 255, 255, 0.08);
  --omni-border-hover: rgba(255, 255, 255, 0.15);

  --omni-text-primary: #f8fafc;
  --omni-text-secondary: #94a3b8;
  --omni-text-tertiary: #64748b;
  --omni-text-muted: #64748b;

  --omni-accent: #8b5cf6;
  --omni-accent-cyan: #06b6d4;
  --omni-accent-gradient: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);

  --omni-success: #22c55e;
  --omni-warning: #f59e0b;
  --omni-error: #ef4444;

  --omni-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.2);
  --omni-shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);

  /* Radius scale */
  --omni-radius-sm: 6px;
  --omni-radius-md: 8px;
  --omni-radius-lg: 14px;
  --omni-radius-full: 9999px;

  /* Spacing scale */
  --omni-spacing-xs: 4px;
  --omni-spacing-sm: 8px;
  --omni-spacing-md: 12px;
  --omni-spacing-lg: 16px;
  --omni-spacing-xl: 24px;
  --omni-spacing-2xl: 32px;

  /* Typography scale */
  --omni-font-xs: 10px;
  --omni-font-sm: 12px;
  --omni-font-md: 13px;

  /* Transitions */
  --omni-transition-fast: 150ms ease;
  --omni-transition-normal: 250ms ease;
}

/* Light-mode overrides: plain-document surfaces (settings.html, sidepanel.html) */
:root.omni-ai-light-mode {
  --omni-bg-primary: #ffffff;
  --omni-bg-secondary: #f8fafc;
  --omni-bg-tertiary: #f1f5f9;
  --omni-bg-hover: #e2e8f0;
  --omni-bg-active: #cbd5e1;

  --omni-glass-bg: rgba(255, 255, 255, 0.75);
  --omni-glass-heavy: rgba(245, 247, 250, 0.9);

  --omni-border: rgba(0, 0, 0, 0.08);
  --omni-border-hover: rgba(0, 0, 0, 0.12);

  --omni-text-primary: #0f172a;
  --omni-text-secondary: #475569;
  --omni-text-tertiary: #94a3b8;
  --omni-text-muted: #94a3b8;

  --omni-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.08);
  --omni-shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
}

/* Light-mode overrides: the Shadow-DOM overlay surface. :host-context() matches
   when the shadow host (content.js's #omni-ai-shadow-host div, out in the host
   page's light DOM) or any of ITS ancestors carries .omni-ai-light-mode. Content
   scripts only ever add this class to the shadow host itself (see content.js's
   ensureUiRoot()/theme wiring), never to the host page's own <html>, so this
   rule is scoped correctly without touching arbitrary third-party page state.
   Values are identical to the :root.omni-ai-light-mode block above by design —
   duplicated here only because :host-context() and :root are separate selector
   contexts that CSS cannot merge into one rule. */
:host-context(.omni-ai-light-mode) {
  --omni-bg-primary: #ffffff;
  --omni-bg-secondary: #f8fafc;
  --omni-bg-tertiary: #f1f5f9;
  --omni-bg-hover: #e2e8f0;
  --omni-bg-active: #cbd5e1;

  --omni-glass-bg: rgba(255, 255, 255, 0.75);
  --omni-glass-heavy: rgba(245, 247, 250, 0.9);

  --omni-border: rgba(0, 0, 0, 0.08);
  --omni-border-hover: rgba(0, 0, 0, 0.12);

  --omni-text-primary: #0f172a;
  --omni-text-secondary: #475569;
  --omni-text-tertiary: #94a3b8;
  --omni-text-muted: #94a3b8;

  --omni-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.08);
  --omni-shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
```

- [ ] **Step 1: Write the failing test**

```js
// tests/design-tokens.test.js
const fs = require("fs");
const path = require("path");

describe("lib/design-tokens.css", () => {
  const css = fs.readFileSync(path.join(__dirname, "../lib/design-tokens.css"), "utf8");

  const CRITICAL_TOKENS = [
    "--omni-bg-primary",
    "--omni-text-primary",
    "--omni-accent",
    "--omni-accent-gradient",
    "--omni-success",
    "--omni-warning",
    "--omni-error",
    "--omni-radius-sm",
    "--omni-radius-md",
    "--omni-radius-lg",
    "--omni-spacing-xs",
    "--omni-spacing-md",
    "--omni-spacing-2xl",
    "--omni-font-family",
    "--omni-transition-fast",
  ];

  test.each(CRITICAL_TOKENS)("defines %s", (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  test("defines light-mode overrides for both plain-document and shadow-DOM contexts", () => {
    expect(css).toMatch(/:root\.omni-ai-light-mode\s*\{/);
    expect(css).toMatch(/:host-context\(\.omni-ai-light-mode\)\s*\{/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/design-tokens.test.js`
Expected: FAIL — `lib/design-tokens.css` does not exist yet (`ENOENT`).

- [ ] **Step 3: Create `lib/design-tokens.css`**

Use the full file content shown above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/design-tokens.test.js`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/design-tokens.css tests/design-tokens.test.js
git commit -m "feat: add shared --omni-* design tokens (lib/design-tokens.css)"
```

---

### Task 2: `lib/design-system.css` — shared component classes

**Files:**
- Create: `lib/design-system.css`
- Create: `tests/design-system.test.js`

**Interfaces:**
- Consumes: every `--omni-*` token from Task 1 (via `var(--omni-*)`).
- Produces: `.ds-icon-btn`, `.ds-btn-primary`, `.ds-btn-secondary`, `.ds-spinner`, `.ds-card`, `.ds-card--accent`, `.ds-card--success`, `.ds-card--error`, `.ds-card--processing` — consumed by Tasks 7, 8, 9.

```css
/* lib/design-system.css */

/* ============================================
   Omni AI - Shared Component Classes
   Consumes tokens from lib/design-tokens.css. Loaded after that file
   everywhere (content.js's ensureUiStyles(), settings.html, sidepanel.html).
   See docs/design-system/MASTER.md for usage guidance.
   ============================================ */

.ds-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--omni-radius-sm);
  color: var(--omni-text-secondary);
  cursor: pointer;
  transition: all var(--omni-transition-fast);
  padding: 0;
}

.ds-icon-btn:hover {
  background: var(--omni-bg-hover);
  color: var(--omni-text-primary);
}

.ds-icon-btn svg {
  width: 14px;
  height: 14px;
}

.ds-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--omni-accent-gradient);
  color: white;
  border: none;
  font-weight: 500;
  font-family: var(--omni-font-family);
  padding: 6px 14px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  font-size: var(--omni-font-sm);
  transition: transform 0.1s, filter 0.1s;
}

.ds-btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.ds-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  filter: none;
}

.ds-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--omni-bg-hover);
  color: var(--omni-text-primary);
  border: 1px solid var(--omni-border);
  font-family: var(--omni-font-family);
  padding: 6px 12px;
  border-radius: var(--omni-radius-sm);
  cursor: pointer;
  font-size: var(--omni-font-sm);
  transition: background var(--omni-transition-fast);
}

.ds-btn-secondary:hover {
  background: var(--omni-bg-active);
  border-color: var(--omni-text-secondary);
}

@keyframes ds-spin {
  to {
    transform: rotate(360deg);
  }
}

.ds-spinner {
  width: 28px;
  height: 28px;
  border: 2.5px solid rgba(139, 92, 246, 0.15);
  border-top-color: var(--omni-accent);
  border-radius: 50%;
  animation: ds-spin 0.7s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ds-spinner {
    animation-duration: 1.5s;
  }
}

.ds-card {
  background: var(--omni-bg-secondary);
  border: 1px solid var(--omni-border);
  border-radius: var(--omni-radius-md);
  padding: var(--omni-spacing-sm) var(--omni-spacing-md);
  font-family: var(--omni-font-family);
  color: var(--omni-text-primary);
}

.ds-card--accent {
  border-left: 3px solid var(--omni-accent);
}

.ds-card--success {
  border-color: var(--omni-success);
  color: var(--omni-success);
}

.ds-card--error {
  border-color: var(--omni-error);
  color: var(--omni-error);
}

.ds-card--processing {
  border-color: var(--omni-accent);
}
```

- [ ] **Step 1: Write the failing test**

```js
// tests/design-system.test.js
const fs = require("fs");
const path = require("path");

describe("lib/design-system.css", () => {
  const css = fs.readFileSync(path.join(__dirname, "../lib/design-system.css"), "utf8");

  const CLASSES = [
    ".ds-icon-btn",
    ".ds-btn-primary",
    ".ds-btn-secondary",
    ".ds-spinner",
    ".ds-card",
    ".ds-card--accent",
    ".ds-card--success",
    ".ds-card--error",
    ".ds-card--processing",
  ];

  test.each(CLASSES)("defines %s", (selector) => {
    const escaped = selector.replace(/[.-]/g, "\\$&");
    expect(css).toMatch(new RegExp(`${escaped}\\s*\\{|${escaped}[,:\\s]`));
  });

  test("respects prefers-reduced-motion for the spinner animation", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/design-system.test.js`
Expected: FAIL — `lib/design-system.css` does not exist yet.

- [ ] **Step 3: Create `lib/design-system.css`**

Use the full file content shown above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/design-system.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/design-system.css tests/design-system.test.js
git commit -m "feat: add shared component classes (lib/design-system.css)"
```

---

### Task 3: Unify theme handling — `applyTheme`/`initTheme` accept a `root` parameter

**Files:**
- Modify: `lib/theme-manager.js`
- Create: `tests/lib/theme-manager.test.js`

**Interfaces:**
- Produces: `applyTheme(themePreference, root = document.documentElement)`, `initTheme(root = document.documentElement)` — both backward compatible (existing zero-arg call sites in `settings.js:83`, `sidepanel/sidepanel.js:26`, and `applyTheme` calls at `settings.js:195,482` keep working unchanged). Consumed by Task 4 (`content.js` will call `initTheme(omniUiHost)`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/lib/theme-manager.test.js
import { THEMES, applyTheme, getThemePreference, setThemePreference } from "../../lib/theme-manager.js";

describe("theme-manager", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
  });

  test("applyTheme defaults to document.documentElement when no root is given", () => {
    applyTheme(THEMES.LIGHT);
    expect(document.documentElement.classList.contains("omni-ai-light-mode")).toBe(true);
  });

  test("applyTheme applies the class to a custom root instead of document.documentElement", () => {
    const customRoot = document.createElement("div");
    applyTheme(THEMES.LIGHT, customRoot);
    expect(customRoot.classList.contains("omni-ai-light-mode")).toBe(true);
    expect(document.documentElement.classList.contains("omni-ai-light-mode")).toBe(false);
  });

  test("applyTheme removes the class from the custom root for dark", () => {
    const customRoot = document.createElement("div");
    customRoot.classList.add("omni-ai-light-mode");
    applyTheme(THEMES.DARK, customRoot);
    expect(customRoot.classList.contains("omni-ai-light-mode")).toBe(false);
  });

  test("applyTheme resolves 'system' against matchMedia for a custom root", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn() });
    const customRoot = document.createElement("div");
    applyTheme(THEMES.SYSTEM, customRoot);
    expect(customRoot.classList.contains("omni-ai-light-mode")).toBe(false); // matches:true => dark
  });

  test("getThemePreference defaults to light", async () => {
    chrome.storage.sync.get.mockResolvedValue({});
    await expect(getThemePreference()).resolves.toBe(THEMES.LIGHT);
  });

  test("setThemePreference rejects an unknown theme value", async () => {
    await setThemePreference("neon");
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/lib/theme-manager.test.js`
Expected: FAIL on the "custom root" tests — `applyTheme` currently ignores any second argument and always targets `document.documentElement`.

- [ ] **Step 3: Implement the `root` parameter**

In `lib/theme-manager.js`, replace the `applyTheme` and `initTheme` functions:

```js
/**
 * Apply theme to a root element (defaults to the document root)
 * @param {string} themePreference
 * @param {HTMLElement} [root]
 */
export function applyTheme(themePreference, root = document.documentElement) {
  // Remove existing classes
  root.classList.remove("omni-ai-light-mode");

  let effectiveTheme = themePreference;

  if (themePreference === THEMES.SYSTEM) {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    effectiveTheme = isDark ? THEMES.DARK : THEMES.LIGHT;
  }

  if (effectiveTheme === THEMES.LIGHT) {
    root.classList.add("omni-ai-light-mode");
  }
}

/**
 * Initialize theme listener for a root element (defaults to the document root)
 * @param {HTMLElement} [root]
 */
export async function initTheme(root = document.documentElement) {
  // Initial apply
  const pref = await getThemePreference();
  applyTheme(pref, root);

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[THEME_KEY]) {
      applyTheme(/** @type {string} */ (changes[THEME_KEY].newValue), root);
    }
  });

  // Listen for system preference changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
    const currentPref = await getThemePreference();
    if (currentPref === THEMES.SYSTEM) {
      applyTheme(THEMES.SYSTEM, root);
    }
  });
}
```

(`getThemePreference`, `setThemePreference`, `THEME_KEY`, `THEMES` are unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lib/theme-manager.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full unit suite to confirm no regression**

Run: `npm test`
Expected: PASS — `settings.js`/`sidepanel.js`'s existing zero-arg `initTheme()`/`applyTheme()` calls are unaffected by the new default parameter.

- [ ] **Step 6: Commit**

```bash
git add lib/theme-manager.js tests/lib/theme-manager.test.js
git commit -m "feat: let applyTheme/initTheme target a custom root element"
```

---

### Task 4: Wire token/component loading; delete the 4 duplicated theme blocks in `content.js`

**Files:**
- Modify: `manifest.json`
- Modify: `settings.html`
- Modify: `sidepanel/sidepanel.html`
- Modify: `content/content.js`

**Interfaces:**
- Consumes: `lib/design-tokens.css` (Task 1), `lib/design-system.css` (Task 2), `initTheme(root)` (Task 3).
- Produces: every element inside the Shadow-DOM overlay and both plain-document surfaces can use `var(--omni-*)` and `.ds-*` classes starting with this task; `content.js` no longer contains any independent theme-resolution logic — `omniUiHost` (the shadow host div) carries `.omni-ai-light-mode` once, set by `initTheme(omniUiHost)`.

- [ ] **Step 1: Add the two new files to `web_accessible_resources`**

In `manifest.json`, extend the `resources` array (currently at lines 94-104):

```json
  "web_accessible_resources": [
    {
      "resources": [
        "assets/icons/*.png",
        "_locales/*/messages.json",
        "lib/i18n.js",
        "lib/design-tokens.css",
        "lib/design-system.css",
        "content/overlay.css"
      ],
      "matches": ["<all_urls>"]
    }
  ],
```

- [ ] **Step 2: Link the two files in `settings.html` and `sidepanel/sidepanel.html`**

In `settings.html`'s `<head>`, immediately before the existing `<link rel="stylesheet" href="settings.css">` (or equivalent), add:

```html
    <link rel="stylesheet" href="lib/design-tokens.css" />
    <link rel="stylesheet" href="lib/design-system.css" />
```

In `sidepanel/sidepanel.html`'s `<head>`, immediately before its existing `<link rel="stylesheet" href="sidepanel.css">`, add:

```html
    <link rel="stylesheet" href="../lib/design-tokens.css" />
    <link rel="stylesheet" href="../lib/design-system.css" />
```

(Exact relative path prefix depends on each file's existing stylesheet `href` convention already in the file — match whatever relative path style Task-4's implementer finds already in use for that file's own stylesheet link, since `settings.html` is at the repo root and `sidepanel/sidepanel.html` is one directory down.)

- [ ] **Step 3: Extend `content.js`'s `ensureUiStyles()` to fetch and inject both shared files**

Replace the single-file fetch in `ensureUiStyles()` (`content/content.js:149-188`) with a fetch of all three files, concatenated in dependency order (tokens, then components, then overlay-specific rules):

```js
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
```

- [ ] **Step 4: Wire a single `initTheme(omniUiHost)` call and delete the 4 duplicated theme blocks**

In `content/content.js`, add a new function near `ensureUiRoot()` (after its definition, `content.js:147`) and call it from `ensureUiRootReady()`:

```js
let omniUiThemeInitPromise = null;

function ensureUiTheme(host) {
  if (!omniUiThemeInitPromise) {
    omniUiThemeInitPromise = import(chrome.runtime.getURL("lib/theme-manager.js"))
      .then((mod) => mod.initTheme(host))
      .catch((error) => {
        console.warn("[Omni AI] Failed to initialize theme:", error);
      });
  }
  return omniUiThemeInitPromise;
}
```

Update `ensureUiRootReady()` (`content.js:190-193`) to also kick off theming:

```js
function ensureUiRootReady() {
  const root = ensureUiRoot();
  ensureUiTheme(omniUiHost);
  return ensureUiStyles(root).then(() => root);
}
```

Now delete the four independent theme-resolution blocks, since `.omni-ai-light-mode` on `omniUiHost` cascades its `--omni-*` overrides to every element inside the shadow tree via the `:host-context(.omni-ai-light-mode)` rule from Task 1 — no per-element class is needed any more:

1. In `createQuickBtn()` (`content.js:736-749`), delete the theme-check block entirely:

   ```js
   // DELETE these lines:
   const THEME_KEY = "omni_ai_theme";
   let themePreference = "system";
   if (isContextValid()) {
     const data = await chrome.storage.sync.get(THEME_KEY).catch(() => ({}));
     themePreference = data[THEME_KEY] || "system";
   }
   let effectiveTheme = themePreference;
   if (themePreference === "system") {
     effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
   }
   if (effectiveTheme === "light") {
     button.classList.add("omni-ai-light-mode");
   }
   ```

2. In `showQuickActionMenu()` (`content.js:836-845`), delete the `THEME_KEY`/`currentTheme` fetch block and remove `THEME_KEY` from the `chrome.storage.sync.get([...])` array a few lines below it — keep fetching `primaryLanguage`/`defaultLanguage` only:

   ```js
   // Before:
   const THEME_KEY = "omni_ai_theme";
   let currentTheme = "system";
   let primaryLanguage = "vi";
   let defaultLanguage = "en";

   if (isContextValid()) {
     try {
       const data = await chrome.storage.sync.get(["primaryLanguage", "defaultLanguage", THEME_KEY]);
       currentTheme = data[THEME_KEY] || "system";
       primaryLanguage = data.primaryLanguage || "vi";
       defaultLanguage = data.defaultLanguage || "en";
     } catch {
       console.warn("[Omni AI] Failed to fetch settings, using defaults");
     }
   }

   // After:
   let primaryLanguage = "vi";
   let defaultLanguage = "en";

   if (isContextValid()) {
     try {
       const data = await chrome.storage.sync.get(["primaryLanguage", "defaultLanguage"]);
       primaryLanguage = data.primaryLanguage || "vi";
       defaultLanguage = data.defaultLanguage || "en";
     } catch {
       console.warn("[Omni AI] Failed to fetch settings, using defaults");
     }
   }
   ```

   Update the `createOverlayElement(currentTheme)` call a few lines below (`content.js:876`) to `createOverlayElement()` (no argument — see sub-step 4 below).

3. In `showQuickAskOverlay()` (`content.js:1683-1690`), delete the same fetch block and update its `createOverlayElement(currentTheme)` call to `createOverlayElement()`:

   ```js
   // Before:
   if (!overlay) {
     const THEME_KEY = "omni_ai_theme";
     let currentTheme = "system";
     if (isContextValid()) {
       const data = await chrome.storage.sync.get(THEME_KEY).catch(() => ({}));
       currentTheme = data[THEME_KEY] || "system";
     }
     overlay = createOverlayElement(currentTheme);
     ensureUiRoot().appendChild(overlay);
   }

   // After:
   if (!overlay) {
     overlay = createOverlayElement();
     ensureUiRoot().appendChild(overlay);
   }
   ```

4. Simplify `createOverlayElement()` (`content.js:1300-1315` onward) to drop the theme parameter and class toggling entirely:

   ```js
   // Before:
   function createOverlayElement(themePreference = "system") {
     const el = document.createElement("div");
     el.className = "omni-ai-overlay";

     let effectiveTheme = themePreference;
     if (themePreference === "system") {
       effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
     }

     // Dark is default in CSS (lines 13-15)
     // Light is an override (line 55)
     if (effectiveTheme === "light") {
       el.classList.add("omni-ai-light-mode");
     } else {
       el.classList.remove("omni-ai-light-mode");
     }
     // ...rest of function unchanged...
   }

   // After:
   function createOverlayElement() {
     const el = document.createElement("div");
     el.className = "omni-ai-overlay";
     // Theme is inherited from the shadow host via :host-context(.omni-ai-light-mode)
     // in lib/design-tokens.css — no per-element class needed.
     // ...rest of function unchanged...
   }
   ```

5. In `showResultOverlay()` (`content.js:1486-1489`), delete the divergent, effectively-dead check (it tested the *host page's* `document.documentElement`, which never carries this class from content-script code):

   ```js
   // DELETE:
   // Check theme
   if (document.documentElement.classList.contains("omni-ai-light-mode")) {
     el.classList.add("omni-ai-light-mode");
   }
   ```

- [ ] **Step 5: Manually verify the fetch-and-inject change**

Run: `npm test` — the existing content-script tests (if any exercise `ensureUiStyles`) must still pass; this is primarily a browser-behavior change not easily unit-testable in jsdom (no real Shadow DOM `fetch` of extension resources), so also run:

Run: `npx playwright test e2e/overlay-css-isolation.spec.js`
Expected: PASS — confirms the shadow root still receives injected styles correctly with the expanded fetch list.

- [ ] **Step 6: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add manifest.json settings.html sidepanel/sidepanel.html content/content.js
git commit -m "feat: load shared design tokens/components; unify theme handling in content.js"
```

---

### Task 5: `content/positioning.js` — pure positioning helpers

**Files:**
- Create: `content/positioning.js`
- Create: `tests/content/positioning.test.js`
- Modify: `manifest.json`

**Interfaces:**
- Produces: `self.OMNI_POSITIONING = { clampToViewport(top, left, width, height, scrollX, scrollY), getRectEndPoint(rects) }` — consumed by Task 6.

```js
// content/positioning.js
/**
 * Omni AI positioning helpers.
 *
 * This is a classic script because Manifest V3 content scripts are not ES
 * modules. It is loaded before content/content.js and exposed on `self`,
 * mirroring content/editor-adapters.js's pattern.
 */
(function registerPositioning(root) {
  "use strict";

  /**
   * Clamp a proposed (top, left) document-relative position so the element
   * it positions stays fully inside the current viewport, flipping to the
   * opposite side of its own footprint when the naive position would
   * overflow. Coordinates and the returned position are document-relative
   * (i.e. already include scrollX/scrollY), matching how content.js already
   * computes top/left for the floating button and result overlay.
   *
   * @param {number} top
   * @param {number} left
   * @param {number} width
   * @param {number} height
   * @param {number} scrollX
   * @param {number} scrollY
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @returns {{top: number, left: number}}
   */
  function clampToViewport(
    top,
    left,
    width,
    height,
    scrollX,
    scrollY,
    viewportWidth,
    viewportHeight,
  ) {
    const viewportTop = top - scrollY;
    const viewportLeft = left - scrollX;

    let clampedViewportLeft = viewportLeft;
    if (viewportLeft + width > viewportWidth) {
      clampedViewportLeft = viewportWidth - width;
    }
    if (clampedViewportLeft < 0) {
      clampedViewportLeft = 0;
    }

    let clampedViewportTop = viewportTop;
    if (viewportTop + height > viewportHeight) {
      clampedViewportTop = viewportHeight - height;
    }
    if (clampedViewportTop < 0) {
      clampedViewportTop = 0;
    }

    return {
      top: clampedViewportTop + scrollY,
      left: clampedViewportLeft + scrollX,
    };
  }

  /**
   * Given the list of client rects a Range produces (Range.getClientRects()),
   * return the point nearest to where a multi-line selection visually ends —
   * the last rect's bottom-right corner — instead of the bounding box of the
   * whole selection. Falls back to a single rect's own bottom-right corner
   * when there's only one (the common single-line case).
   *
   * @param {DOMRectList | DOMRect[]} rects
   * @returns {{top: number, left: number} | null}
   */
  function getRectEndPoint(rects) {
    if (!rects || rects.length === 0) return null;
    const last = rects[rects.length - 1];
    return { top: last.bottom, left: last.right };
  }

  root.OMNI_POSITIONING = { clampToViewport, getRectEndPoint };
})(typeof self !== "undefined" ? self : this);
```

- [ ] **Step 1: Write the failing tests**

```js
// tests/content/positioning.test.js
describe("positioning helpers", () => {
  let positioning;

  beforeEach(() => {
    jest.resetModules();
    global.self = global;
    require("../../content/positioning.js");
    positioning = global.OMNI_POSITIONING;
  });

  describe("clampToViewport", () => {
    test("leaves a position that already fits untouched", () => {
      const result = positioning.clampToViewport(100, 100, 50, 30, 0, 0, 1024, 768);
      expect(result).toEqual({ top: 100, left: 100 });
    });

    test("flips left when the element would overflow the right edge", () => {
      const result = positioning.clampToViewport(100, 1000, 50, 30, 0, 0, 1024, 768);
      expect(result.left).toBe(1024 - 50);
    });

    test("flips up when the element would overflow the bottom edge", () => {
      const result = positioning.clampToViewport(750, 100, 50, 30, 0, 0, 1024, 768);
      expect(result.top).toBe(768 - 30);
    });

    test("clamps to 0 when the element is wider/taller than the viewport itself", () => {
      const result = positioning.clampToViewport(0, 0, 2000, 2000, 0, 0, 1024, 768);
      expect(result).toEqual({ top: 0, left: 0 });
    });

    test("accounts for scroll offset in the returned document-relative position", () => {
      const result = positioning.clampToViewport(100, 1000, 50, 30, 200, 300, 1024, 768);
      // viewportLeft = 1000 - 200 = 800; 800 + 50 = 850 < 1024, so no clamp needed here
      expect(result.left).toBe(1000);
      expect(result.top).toBe(100);
    });
  });

  describe("getRectEndPoint", () => {
    test("returns null for an empty rect list", () => {
      expect(positioning.getRectEndPoint([])).toBeNull();
    });

    test("returns the single rect's bottom-right corner for a one-line selection", () => {
      const rect = { top: 10, left: 20, bottom: 30, right: 120 };
      expect(positioning.getRectEndPoint([rect])).toEqual({ top: 30, left: 120 });
    });

    test("returns the LAST rect's corner (not the bounding box) for a multi-line selection", () => {
      const firstLine = { top: 10, left: 20, bottom: 30, right: 500 };
      const lastLine = { top: 40, left: 20, bottom: 60, right: 90 };
      expect(positioning.getRectEndPoint([firstLine, lastLine])).toEqual({ top: 60, left: 90 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/content/positioning.test.js`
Expected: FAIL — `content/positioning.js` does not exist yet.

- [ ] **Step 3: Create `content/positioning.js`**

Use the full file content shown above.

- [ ] **Step 4: Register the new content script in `manifest.json`**

In `manifest.json`'s `content_scripts[0].js` array (currently `manifest.json:33`), add the new file before `content/content.js` (matching the existing `editor-adapters.js` ordering convention — dependencies load first):

```json
      "js": ["content/editor-adapters.js", "content/positioning.js", "content/content.js"],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/content/positioning.test.js`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add content/positioning.js tests/content/positioning.test.js manifest.json
git commit -m "feat: add clampToViewport/getRectEndPoint positioning helpers"
```

---

### Task 6: Wire positioning fixes and unify `lastMenuContext` across trigger paths

**Files:**
- Modify: `content/content.js`

**Interfaces:**
- Consumes: `self.OMNI_POSITIONING.clampToViewport`, `self.OMNI_POSITIONING.getRectEndPoint` (Task 5).

- [ ] **Step 1: Only trust mouse position when the selection actually came from a mouse**

In `setupSelectionListener()` (`content.js:629-644`), the `keyup` handler currently calls `handleSelectionChange()` with no mouse position (correct already), and the `mouseup` handler always passes the click coordinates. The bug is one level up: `handleSelectionChange`'s inner logic (`content.js:620-622`) uses whatever `mousePos` it was given for *any* selection, but since `keyup` already correctly passes nothing, the actual fix needed is narrower than the spec's evidence section implied — trace confirms `keyup`-triggered selections never receive a mouse position today. Leave `setupSelectionListener()` unchanged; this sub-step is a no-op confirmed by re-reading the code, not a step to implement. (Documented here so a plan reviewer can see this was checked, not skipped.)

- [ ] **Step 2: Write a failing e2e test for viewport-edge clamping**

Add a new test to `e2e/quick-action-modal.spec.js` (the existing suite covering the click-triggered menu/result flow):

```js
test("floating button stays fully on-screen when selection is near the bottom-right edge", async () => {
  const FIXTURE = `<!doctype html><html><body style="margin:0">
    <div style="height:2000px"></div>
    <p id="edge-text" style="position:absolute; bottom:10px; right:10px; width:200px;">
      Text near the bottom right corner of the page for edge positioning.
    </p>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const text = page.locator("#edge-text");
    await text.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    const box = await text.boundingBox();
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5);
    await page.mouse.up();

    await page.waitForTimeout(100); // handleSelectionChange's internal setTimeout(10)

    const btnBox = await page.evaluate(() => {
      const host = document.getElementById("omni-ai-shadow-host");
      const btn = host.shadowRoot.querySelector(".omni-ai-quick-btn");
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { right: rect.right, bottom: rect.bottom };
    });

    expect(btnBox).not.toBeNull();
    expect(btnBox.right).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    expect(btnBox.bottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  } finally {
    await context.close();
    server.close();
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test e2e/quick-action-modal.spec.js -g "stays fully on-screen"`
Expected: FAIL — the button's `right`/`bottom` exceed the viewport bounds today (no clamping exists).

- [ ] **Step 4: Wire `clampToViewport` into `createQuickBtn()`**

In `content/content.js`, replace the unclamped position assignment in `createQuickBtn()` (`content.js:751-771`, already trimmed of the theme block by Task 4) with a clamped one:

```js
  // Position - Use mouse position if provided (for text selection)
  let top, left;
  if (mousePosition) {
    // Position near mouse cursor with small offset
    top = mousePosition.y + window.scrollY + 8;
    left = mousePosition.x + window.scrollX + 8;
  } else if (isInput && rect) {
    // Input elements: bottom-right corner (inside the input)
    top = rect.bottom + window.scrollY - 26;
    left = rect.right + window.scrollX - 26;
  } else if (rect) {
    // Fallback to selection rect
    top = rect.bottom + window.scrollY + 5;
    left = rect.right + window.scrollX;
  } else {
    // No valid position, don't show
    return;
  }

  const BUTTON_SIZE = 22; // matches .omni-ai-quick-btn's width/height in overlay.css
  const clamped = self.OMNI_POSITIONING.clampToViewport(
    top,
    left,
    BUTTON_SIZE,
    BUTTON_SIZE,
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
  );
  top = clamped.top;
  left = clamped.left;

  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
```

- [ ] **Step 5: Wire `clampToViewport` into `positionOverlay()` for the result card/menu**

Find `positionOverlay()` in `content/content.js` (referenced at `content.js:977,1540,1547,1609,1696` — the shared function that positions `overlay` against an anchor rect) and clamp its computed position the same way, using the overlay's actual rendered size (`overlay.offsetWidth`/`overlay.offsetHeight`) rather than a hardcoded constant, since the overlay's height varies with content:

```js
  // After computing `top`/`left` from the anchor rect, before assigning
  // overlay.style.top/left, add:
  const clamped = self.OMNI_POSITIONING.clampToViewport(
    top,
    left,
    overlay.offsetWidth,
    overlay.offsetHeight,
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
  );
  top = clamped.top;
  left = clamped.left;
```

(The implementer should read `positionOverlay()`'s current body first — it isn't reproduced in full here since it wasn't part of this plan's research reads — and apply the same clamp-before-assign pattern shown above at the point where it currently sets `overlay.style.top`/`overlay.style.left`, for every branch that computes a fresh position. The `lockedPosition`/`preservedPosition` branch, used to keep the overlay from jumping between re-renders, should be left unclamped since it's re-using an already-clamped prior position.)

- [ ] **Step 6: Anchor multi-line selections by their end point, not the bounding box**

Find `getSelectionRect()` in `content/content.js` (called at `content.js:825,1496,1544,1695`) and change it to prefer `getRectEndPoint()` over the Range's bounding-box rect when the selection spans multiple client rects:

```js
function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return lastRange ? lastRange.getBoundingClientRect() : null;

  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : lastRange;
  if (!range) return null;

  const rects = range.getClientRects();
  const endPoint = self.OMNI_POSITIONING.getRectEndPoint(rects);
  if (endPoint) {
    // Return a DOMRect-shaped object anchored at the selection's visual end,
    // not the bounding box of a possibly-multi-line selection.
    return {
      top: endPoint.top,
      left: endPoint.left,
      bottom: endPoint.top,
      right: endPoint.left,
      width: 0,
      height: 0,
    };
  }
  return range.getBoundingClientRect();
}
```

(The implementer should read `getSelectionRect()`'s actual current body first — the exact fallback chain (`lastRange`, `sel.rangeCount`) shown above approximates the pattern already visible at `content.js:604-610` in `setupSelectionListener()`, but must be reconciled with whatever `getSelectionRect()` currently does line-by-line, since it wasn't part of this plan's research reads.)

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `npx playwright test e2e/quick-action-modal.spec.js -g "stays fully on-screen"`
Expected: PASS.

- [ ] **Step 8: Write a failing e2e test for the unified Back button**

Add to `e2e/quick-action-modal.spec.js`:

```js
test("Back button returns to the action menu after a keyboard-shortcut-triggered result", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <p id="text">The quick brown fox jumps over the lazy dog for shortcut testing.</p>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    // Stub QUICK_ACTION so the shortcut flow reaches a result without a real API key.
    await page.addInitScript(() => {
      const real = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (...args) => {
        if (args[0]?.type === "QUICK_ACTION") {
          return Promise.resolve({ success: true, data: { response: "Rephrased result." } });
        }
        return real(...args);
      };
    });
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.locator("#text").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });

    // Simulate the background script's SHOW_RESULT (what Alt+R ultimately sends)
    // rather than driving a real OS-level keyboard shortcut, which Playwright
    // cannot reliably trigger for a browser-action command in a test profile.
    await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(
        tabs[0].id,
        {
          type: "SHOW_RESULT",
          payload: {
            action: "rephrase",
            result: "Rephrased result.",
            originalText: "The quick brown fox jumps over the lazy dog for shortcut testing.",
            isInput: false,
          },
        },
        { frameId: 0 },
      );
    });

    const host = page.locator("#omni-ai-shadow-host");
    await host.waitFor({ state: "attached" });

    const backBtn = page.locator("#omni-ai-shadow-host")
      .locator("visible=true"); // placeholder locator scope; see note below
    // Shadow-DOM elements need an explicit pierce; use page.evaluateHandle or
    // a shadow-aware locator per this repo's existing e2e helper conventions
    // (see e2e/quick-action-modal.spec.js's existing shadow-root query helper
    // for the established pattern — reuse it here rather than re-deriving one).
    await page.locator("#omni-ai-shadow-host").evaluate((host) => {
      host.shadowRoot.querySelector("#omniAiBack").click();
    });

    const menuVisible = await page.locator("#omni-ai-shadow-host").evaluate((host) => {
      return !!host.shadowRoot.querySelector(".omni-ai-menu-grid");
    });
    expect(menuVisible).toBe(true);
  } finally {
    await context.close();
    server.close();
  }
});
```

(The implementer should check `e2e/quick-action-modal.spec.js`'s existing tests for its established shadow-DOM query helper before finalizing this test's locator strategy — the placeholder `.locator("visible=true")` line above is scaffolding to delete once the real helper is found; the `host.shadowRoot.querySelector(...)` calls via `page.evaluate` are the reliable fallback either way.)

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx playwright test e2e/quick-action-modal.spec.js -g "Back button returns"`
Expected: FAIL — `lastMenuContext` is `null` for a shortcut-triggered result, so `#omniAiBack`'s click handler (`content.js:1556-1567`) calls `hideOverlay()` instead of `showQuickActionMenu()`, and `.omni-ai-menu-grid` never appears.

- [ ] **Step 10: Populate `lastMenuContext` in the `SHOW_RESULT` message handler**

In `content/content.js`'s message listener, update the `SHOW_RESULT` case (`content.js:529-530`) to set `lastMenuContext` before rendering, exactly mirroring what `showQuickActionMenu()` already does for the click path (`content.js:828-833`):

```js
      case "SHOW_RESULT":
        lastMenuContext = {
          text: message.payload.originalText || "",
          anchorRect: currentAnchorRect || getSelectionRect(),
          lockedPosition: null,
          isInput: message.payload.isInput,
        };
        showResultOverlay(message.payload, message.payload.isInput);
        break;
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx playwright test e2e/quick-action-modal.spec.js -g "Back button returns"`
Expected: PASS.

- [ ] **Step 12: Run the full verify + e2e suites**

Run: `npm run verify && npx playwright test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add content/content.js e2e/quick-action-modal.spec.js
git commit -m "fix: clamp overlay/button to viewport, anchor by selection end, unify Back button across trigger paths"
```

---

### Task 7: Overlay surface retrofit — `content/overlay.css` + `content/content.js` class names

**Files:**
- Modify: `content/overlay.css`
- Modify: `content/content.js`

**Interfaces:**
- Consumes: `--omni-*` tokens (Task 1), `.ds-*` classes (Task 2).

Class/token rename table for this surface:

| Old (overlay.css) | New |
| --- | --- |
| `--ai-*` custom properties (all of them, `overlay.css:32-70` and the light-mode block below it) | Delete entirely — replaced by `lib/design-tokens.css`'s `--omni-*` set, loaded first. |
| `var(--ai-X)` anywhere in `overlay.css`'s remaining rules | `var(--omni-X)` (mechanical rename — `--ai-font-family`→`--omni-font-family`, `--ai-bg-primary`→`--omni-bg-primary`, `--ai-accent`→`--omni-accent`, `--ai-accent-gradient`→`--omni-accent-gradient`, `--ai-radius-sm/md/lg/full`→`--omni-radius-sm/md/lg/full`, `--ai-text-primary/secondary/tertiary`→`--omni-text-primary/secondary/tertiary`, `--ai-border`/`--ai-border-hover`→`--omni-border`/`--omni-border-hover`, `--ai-shadow-sm/lg`→`--omni-shadow-sm/lg`, `--ai-font-xs/sm/md`→`--omni-font-xs/sm/md`, `--ai-glass-bg`/`--ai-glass-heavy`→`--omni-glass-bg`/`--omni-glass-heavy`, `--ai-success/warning/error`→`--omni-success/warning/error`). |
| `.omni-ai-icon-btn` rule block (`overlay.css:395-411` per this plan's research read) | Delete the rule block; keep the class name `omni-ai-icon-btn` **only if `content.js` markup still needs an overlay-specific selector for something CSS-only can't express** — otherwise delete the class from markup too and use `.ds-icon-btn` directly. Concretely: in `content.js`, every `class="omni-ai-icon-btn"` string becomes `class="ds-icon-btn"` (occurrences at `content.js:1521` `id="omniAiBack"` button and `content.js:1702`'s Quick-Ask back button — grep `omni-ai-icon-btn` in `content.js` to find all). |
| `.omni-ai-close-btn` rule block | Keep as-is (it's a genuinely different visual pattern — a plain close X, not the shared icon-button — the spec's component list only names icon-btn/primary/secondary/spinner/card; close-btn was not identified as duplicated across surfaces during the audit, so it stays overlay-local). |
| `.omni-ai-btn-primary` rule block (`overlay.css:453-471`) | Delete the rule block; `content.js` occurrences of `class="omni-ai-btn-primary"` (e.g. `content.js:1516`'s Replace button) become `class="ds-btn-primary"`. |
| `.omni-ai-btn-secondary` rule block | Delete the rule block; `content.js` occurrences (e.g. `content.js:1531`'s Copy button) become `class="ds-btn-secondary"`. |
| `.omni-ai-spinner` rule block (`overlay.css:540-548`) and its `@keyframes omniAiSpin` | Delete both; `content.js` occurrences of `class="omni-ai-spinner"` (e.g. `content.js:898,913,1581`) become `class="ds-spinner"`. |
| `.omni-ai-context-preview` rule block (`overlay.css:391-399`) | Delete the rule block; `content.js` occurrences of `class="omni-ai-context-preview"` (e.g. `content.js:1526,1712`) become `class="ds-card ds-card--accent"`. |

Everything else in `overlay.css` (the `:host`/isolation reset, `.omni-ai-overlay` container, `.omni-ai-quick-btn`, header/menu-grid/suggestion-card/tone-selector/footer layout rules) stays overlay-local — it's genuinely specific to this surface's layout, not a pattern duplicated elsewhere, and the spec's component list doesn't name it.

- [ ] **Step 1: Write a failing Playwright assertion for the token rename**

Add to `e2e/overlay-css-isolation.spec.js` (the existing suite that already asserts something about the injected shadow styles):

```js
test("overlay CSS uses the shared --omni- token prefix, not the old --ai- prefix", async () => {
  const { context } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto("about:blank");
    const cssText = await page.evaluate(async () => {
      const [ext] = await new Promise((resolve) =>
        chrome.management?.getAll?.(resolve) || resolve([{ id: null }]),
      );
      return null; // placeholder — see note below
    }).catch(() => null);
    // Simpler and more reliable: fetch the packed overlay.css directly via
    // its extension URL, which every test in this file already knows how to
    // resolve (reuse that helper instead of re-deriving one here).
  } finally {
    await context.close();
  }
});
```

This step's exact assertion mechanics depend on `e2e/overlay-css-isolation.spec.js`'s existing helper for reading the shadow root's injected `<style>` `textContent` (the file already tests shadow isolation, so it already has a working way to reach into `host.shadowRoot`) — the implementer should copy that file's existing pattern rather than the placeholder above, and assert `styleText.includes("--omni-accent")` is true and `styleText.includes("--ai-accent")` is false once Task 7 is complete. Write the real version of this test using that file's real helper before proceeding to Step 2.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/overlay-css-isolation.spec.js -g "shared --omni- token prefix"`
Expected: FAIL — `overlay.css` still defines/uses `--ai-*`.

- [ ] **Step 3: Apply the rename table to `content/overlay.css`**

Delete the `--ai-*` token block and its light-mode override block (now provided by `lib/design-tokens.css`, loaded before `overlay.css` per Task 4's `ensureUiStyles()` change). Rename every remaining `var(--ai-X)` to `var(--omni-X)` per the table above. Delete the five component rule blocks named in the table (icon-btn, primary/secondary buttons, spinner + its keyframes, context-preview).

- [ ] **Step 4: Apply the class-name renames to `content/content.js`**

Grep for each old class name and replace per the table above:

```bash
grep -n 'omni-ai-icon-btn\|omni-ai-btn-primary\|omni-ai-btn-secondary\|omni-ai-spinner\|omni-ai-context-preview' content/content.js
```

Replace each match's class string per the rename table (e.g. `class="omni-ai-icon-btn"` → `class="ds-icon-btn"`, `class="omni-ai-context-preview"` → `class="ds-card ds-card--accent"`). Keep `id`/data attributes and any inline `style="..."` on the same elements unchanged — only the class name(s) change.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test e2e/overlay-css-isolation.spec.js -g "shared --omni- token prefix"`
Expected: PASS.

- [ ] **Step 6: Run the full verify + e2e suites**

Run: `npm run verify && npx playwright test`
Expected: PASS — in particular, re-run `e2e/quick-action-modal.spec.js` and `e2e/smoke.spec.js` in full, since this task touches the same markup those suites already exercise.

- [ ] **Step 7: Commit**

```bash
git add content/overlay.css content/content.js e2e/overlay-css-isolation.spec.js
git commit -m "refactor: retrofit the overlay surface onto shared design tokens/components"
```

---

### Task 8: Side panel surface retrofit — `sidepanel.css` + `sidepanel.js`

**Files:**
- Modify: `sidepanel/sidepanel.css`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`

**Interfaces:**
- Consumes: `--omni-*` tokens (Task 1), `.ds-*` classes (Task 2). Independent of Task 7 (disjoint files) — may be implemented in parallel with Tasks 6/7 once Tasks 1-4 have landed.

Rename table:

| Old (sidepanel.css `:root`, `sidepanel.css:6-29`) | New |
| --- | --- |
| `--bg-primary`, `--bg-secondary`, `--bg-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent-purple`, `--error`, `--border-color`, `--spacing-xs/sm/md/lg`, `--radius-md`, `--transition-fast`, `--font-family` (the whole `:root { ... }` and `:root.omni-ai-light-mode { ... }` blocks) | Delete both blocks entirely — `lib/design-tokens.css`'s `--omni-*` set (linked before `sidepanel.css` per Task 4) replaces them. |
| `var(--accent-purple)` | `var(--omni-accent)` |
| `var(--error)` | `var(--omni-error)` |
| `var(--border-color)` | `var(--omni-border)` |
| every other `var(--X)` in the file | `var(--omni-X)` (mechanical: `bg-primary`→`omni-bg-primary`, `spacing-md`→`omni-spacing-md`, `radius-md`→`omni-radius-md`, etc. — same prefix-add pattern) |
| `.icon-btn` rule block (`sidepanel.css:106-123`) | Delete; `sidepanel.js`/`sidepanel.html` references to `class="icon-btn"` become `class="ds-icon-btn"`. |
| `.action-btn` rule block (`sidepanel.css:148-173`) | Delete; references become `class="ds-btn-primary"` (this surface currently has no secondary/flat action button, so all three action buttons — `summarizeBtn`/`translateBtn`/`explainBtn` — become primary-styled, matching the spec's stated goal of ending the "flat vs. gradient" visual disagreement between surfaces). |
| `.result-area` rule block (`sidepanel.css:193-198`) | Delete; references become `class="ds-card"`. |
| No spinner exists today | Add one: wherever `sidepanel.js` currently only disables the button while loading (per the spec's Evidence section, this surface "has no loading spinner at all" today), add a `<div class="ds-spinner"></div>` shown alongside/instead of the button's disabled state. The implementer should read `sidepanel.js`'s current loading-state code (`runPageAction()`) first and pick the minimal insertion point — this plan does not mandate exact markup since it wasn't part of this plan's research reads, only that a `.ds-spinner` element appears during the loading state. |

- [ ] **Step 1: Write a failing test**

```js
// Add to e2e/sidepanel.spec.js
test("uses the shared design tokens, not its own local --accent-purple copy", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    const accentValue = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--omni-accent").trim(),
    );
    expect(accentValue).toBe("#8b5cf6");

    const summarizeBtnClass = await page.locator("#summarizeBtn").getAttribute("class");
    expect(summarizeBtnClass).toContain("ds-btn-primary");
  } finally {
    await context.close();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/sidepanel.spec.js -g "shared design tokens"`
Expected: FAIL — `--omni-accent` isn't defined yet on this page (no `<link>` — wait, Task 4 already added the `<link>`, so this should partially pass for the token but fail on the `ds-btn-primary` class check, since Task 8 hasn't retrofitted the markup yet).

- [ ] **Step 3: Apply the rename table**

Update `sidepanel/sidepanel.css` (delete local token blocks, rename `var()` references, delete the three named component rule blocks), `sidepanel/sidepanel.html` (class attributes on the three action buttons, the icon button(s) in the header), and `sidepanel/sidepanel.js` (any class-name string literals it sets programmatically — re-check the earlier grep result: `sidepanel.js:13` references `.action-btn` via `document.querySelectorAll(".action-btn")`, which must become `document.querySelectorAll(".ds-btn-primary")`).

- [ ] **Step 4: Add the missing loading spinner**

Per the rename table's last row — insert a `.ds-spinner` element into the loading-state markup in `sidepanel.js`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test e2e/sidepanel.spec.js`
Expected: PASS (all tests in the file, including the pre-existing three).

- [ ] **Step 6: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add sidepanel/sidepanel.css sidepanel/sidepanel.js sidepanel/sidepanel.html e2e/sidepanel.spec.js
git commit -m "refactor: retrofit the side panel onto shared design tokens/components"
```

---

### Task 9: Settings surface retrofit — `settings.css` + `settings.js`

**Files:**
- Modify: `settings.css`
- Modify: `settings.js`
- Modify: `settings.html`

**Interfaces:**
- Consumes: `--omni-*` tokens (Task 1), `.ds-*` classes (Task 2). Independent of Tasks 7/8 (disjoint files) — may be implemented in parallel once Tasks 1-4 have landed.

Rename table (same pattern as Task 8, applied to `settings.css`'s larger token/rule set):

| Old (settings.css `:root`, `settings.css:5-47`) | New |
| --- | --- |
| Full `:root { ... }` and `:root.omni-ai-light-mode { ... }` token blocks | Delete both — replaced by `lib/design-tokens.css`. |
| `var(--accent-purple)`, `var(--accent-cyan)` | `var(--omni-accent)`, `var(--omni-accent-cyan)` |
| every other `var(--X)` | `var(--omni-X)` (mechanical prefix add, same as Task 8) |
| `.icon-btn` rule block (`settings.css:683-706`) | Delete; `settings.html`/`settings.js` references to `class="icon-btn"` become `class="ds-icon-btn"`. |
| `.save-btn` rule block (`settings.css:605-633`) | Delete; references become `class="ds-btn-primary"`. |
| `.validate-spinner` rule block + its keyframe (`settings.css:893-895,897-904`) | Delete; `settings.js:428,435`'s `svg.classList.add("validate-spinner")`/`svg.classList.remove("validate-spinner")` become `svg.classList.add("ds-spinner")`/`svg.classList.remove("ds-spinner")`. |
| `.validation-message` rule block (`settings.css:907-944`) | Delete the base rule; keep its success/error/processing *state* selectors but repoint them at the shared modifiers — `settings.js:448`'s `el.className = "validation-message visible"` becomes `el.className = "ds-card visible"`, and the state-specific classes it toggles alongside that (grep `settings.js` for how `.success`/`.error`/`.processing` or similar state classes are applied to this element) become `ds-card--success`/`ds-card--error`/`ds-card--processing` respectively — the implementer should locate the exact state-class-toggling code in `settings.js` first (not captured in this plan's research reads) since the rename table above only fixes the base class shown by the grep this plan already ran. |

- [ ] **Step 1: Write a failing test**

```js
// Add to tests/settings.test.js (existing file)
test("uses the shared ds-card class for the validation message, not the old validation-message-only class", () => {
  // Follow this test file's existing pattern for driving showValidationMessage()
  // or whichever settings.js function sets the element's className (grep
  // "validation-message" in tests/settings.test.js for the current test that
  // already exercises this code path, and extend its assertion rather than
  // writing a new DOM-setup block from scratch).
  const el = document.getElementById("validationMessage"); // or however the existing test obtains it
  expect(el.className).toContain("ds-card");
  expect(el.className).not.toContain("validation-message");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/settings.test.js -t "ds-card class for the validation message"`
Expected: FAIL.

- [ ] **Step 3: Apply the rename table**

Update `settings.css` (delete local token blocks, rename `var()` references, delete the four named component rule blocks), `settings.html` (class attributes on save button(s), icon buttons), and `settings.js` (the `validate-spinner`/`validation-message` class-toggling code at the lines identified above, plus any other `.icon-btn`/`.save-btn` class-string references found via `grep -n 'icon-btn\|save-btn\|validate-spinner\|validation-message' settings.js`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/settings.test.js`
Expected: PASS (full file).

- [ ] **Step 5: Run the full verify suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add settings.css settings.js settings.html tests/settings.test.js
git commit -m "refactor: retrofit the settings page onto shared design tokens/components"
```

---

### Task 10: `docs/design-system/MASTER.md`

**Files:**
- Create: `docs/design-system/MASTER.md`

**Interfaces:**
- Consumes: the final token/class names from Tasks 1-2 (write this task after Task 2 lands; content is stable regardless of Tasks 6-9's progress).

- [ ] **Step 1: Write the file**

```markdown
# MASTER — Omni AI Design System

Single source of truth for the tokens and shared component classes used
across all three UI surfaces: the content-script overlay (Shadow DOM), the
side panel (`sidepanel/`), and the settings page. Adapted from the
`maestro-design` skill's persist pattern, but plain CSS custom
properties/classes — no Tailwind, no build step (see `AGENTS.md` Core
Directive #1).

## Files

- `lib/design-tokens.css` — every `--omni-*` custom property.
- `lib/design-system.css` — shared component classes (`.ds-*`).

Both are loaded via `<link>` in `settings.html`/`sidepanel/sidepanel.html`,
and fetched-and-injected into the content-script Shadow DOM by
`content.js`'s `ensureUiStyles()`.

## Adding a new token

1. Check this doc and `lib/design-tokens.css` first — a close-enough token
   probably already exists (e.g. don't add `--omni-spacing-13px`; use the
   existing scale).
2. If genuinely new, add it to `lib/design-tokens.css`'s `:root, :host`
   block, and to both light-mode override blocks
   (`:root.omni-ai-light-mode`, `:host-context(.omni-ai-light-mode)`) if it
   has a different light-mode value.
3. Add it to the `CRITICAL_TOKENS` list in `tests/design-tokens.test.js` if
   it's load-bearing enough that its accidental deletion should fail CI.

## Adding a new shared component class

1. Check `lib/design-system.css` and the table below first.
2. Prefix new classes `.ds-*` to keep them visually distinct from
   surface-local classes (`.omni-ai-*` for the overlay, plain names for
   settings/side panel markup that's genuinely surface-specific).
3. Add it to `tests/design-system.test.js`.

## Token reference

| Token | Purpose |
| --- | --- |
| `--omni-bg-primary` / `--omni-bg-secondary` / `--omni-bg-tertiary` | Surface background layers, darkest to lightest (dark mode) / lightest to darkest (light mode). |
| `--omni-bg-hover` / `--omni-bg-active` | Interactive-state backgrounds. |
| `--omni-glass-bg` / `--omni-glass-heavy` | Translucent backdrop-filter backgrounds (overlay-heavy usage; settings/side panel use these sparingly). |
| `--omni-border` / `--omni-border-hover` | Default and hover border colors. |
| `--omni-text-primary` / `--omni-text-secondary` / `--omni-text-tertiary` / `--omni-text-muted` | Text hierarchy. `-tertiary` and `-muted` are intentionally distinct (tertiary skews slightly lighter in dark mode) — don't collapse them without checking both surfaces' current usage. |
| `--omni-accent` / `--omni-accent-cyan` / `--omni-accent-gradient` | Brand purple, secondary cyan, and the two-color gradient used on primary actions. |
| `--omni-success` / `--omni-warning` / `--omni-error` | Status colors. |
| `--omni-shadow-sm` / `--omni-shadow-lg` | Elevation. |
| `--omni-radius-sm` / `-md` / `-lg` / `-full` | Corner radius scale — `-md` is 8px (not settings.css's old 10px; the overlay's 8px value won during unification since it was more common across surfaces). |
| `--omni-spacing-xs` through `-2xl` | 4/8/12/16/24/32px scale. |
| `--omni-font-xs` / `-sm` / `-md` | Overlay's compact font sizes; settings/side panel mostly set their own larger body text directly rather than from this scale — this scale exists primarily for the overlay's dense UI. |
| `--omni-transition-fast` / `-normal` | 150ms / 250ms eased transitions. |

## Component reference

| Class | Purpose | Notes |
| --- | --- | --- |
| `.ds-icon-btn` | Small (24x24) icon-only button — back/close/settings-gear affordances. | Replaces the three previously-independent `.omni-ai-icon-btn` / `.icon-btn` (settings) / `.icon-btn` (side panel) implementations. |
| `.ds-btn-primary` | Primary/gradient action button. | Replaces `.omni-ai-btn-primary`, `.save-btn`, `.action-btn`. |
| `.ds-btn-secondary` | Secondary/flat action button. | Replaces `.omni-ai-btn-secondary`. |
| `.ds-spinner` | Loading spinner. | Replaces `.omni-ai-spinner`, `.validate-spinner`; also now used by the side panel, which previously had no spinner at all. |
| `.ds-card` | Base info/result/status card. | Replaces `.omni-ai-context-preview`, `.result-area`, `.validation-message`. |
| `.ds-card--accent` | Left-accent-border modifier. | Used where a card needs a colored left border (e.g. the Quick Ask context preview). |
| `.ds-card--success` / `--error` / `--processing` | Status-color modifiers. | Used by the settings page's validation message. |

## Accessibility & motion baseline

- Minimum 4.5:1 text contrast for every token color pair used for text on a
  background token.
- Every focusable element defined by a `.ds-*` class shows a visible
  `focus-visible` outline (browser default is acceptable; do not remove it
  with `outline: none` without providing an equivalent replacement).
- `.ds-spinner`'s animation respects `prefers-reduced-motion: reduce`
  (slows rather than removes, so loading state is still perceivable).
- Touch targets: `.ds-icon-btn` is 24x24px, meeting the WCAG web minimum;
  keep at least 8px gap between adjacent icon buttons in any new layout.

## Theme handling

`lib/theme-manager.js`'s `applyTheme(themePreference, root)` /
`initTheme(root)` accept an optional root element (default
`document.documentElement`, used as-is by `settings.js`/`sidepanel.js`).
`content.js` calls `initTheme(omniUiHost)` once per page load, targeting the
Shadow DOM host element (not the arbitrary host page's own `<html>`). The
overlay's light-mode token overrides are defined with
`:host-context(.omni-ai-light-mode)` in `lib/design-tokens.css`, which
matches when the shadow host carries that class and cascades the overrides
to every element inside the shadow tree — no per-element class toggling is
needed or should be reintroduced.
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/MASTER.md
git commit -m "docs: add design-system MASTER.md reference"
```

---

### Task 11: Final verification — token-consistency test, full suite, docs

**Files:**
- Modify: `tests/design-tokens.test.js`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the completed state of Tasks 1-9 (must run last).

- [ ] **Step 1: Add the no-legacy-names assertion**

Extend `tests/design-tokens.test.js` with a test that only makes sense once all three surfaces are retrofitted:

```js
describe("no legacy token names remain in any surface", () => {
  const overlayCss = fs.readFileSync(path.join(__dirname, "../content/overlay.css"), "utf8");
  const settingsCss = fs.readFileSync(path.join(__dirname, "../settings.css"), "utf8");
  const sidepanelCss = fs.readFileSync(path.join(__dirname, "../sidepanel/sidepanel.css"), "utf8");

  test.each([
    ["content/overlay.css", overlayCss],
    ["settings.css", settingsCss],
    ["sidepanel/sidepanel.css", sidepanelCss],
  ])("%s no longer defines its own --ai-*/unprefixed token :root block", (_name, css) => {
    expect(css).not.toMatch(/--ai-[a-z-]+\s*:/);
    expect(css).not.toMatch(/--accent-purple\s*:/);
    expect(css).not.toMatch(/--bg-primary\s*:/);
    expect(css).not.toMatch(/--radius-md\s*:/);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx jest tests/design-tokens.test.js`
Expected: PASS — if this fails, one of Tasks 7-9 left a legacy token definition behind; go fix that task's file before proceeding.

- [ ] **Step 3: Add manual-smoke-checklist items to `AGENTS.md`**

In `AGENTS.md`'s "Manual smoke checklist (load unpacked)" section, add two items:

```markdown
- [ ] Floating button and result card stay fully on-screen when a selection/focus is near each of the four viewport edges (regression check for the design-system plan's clampToViewport fix)
- [ ] "Back" button returns to the action menu after both a click-triggered AND a keyboard-shortcut-triggered (Alt+R/T/F) result
```

- [ ] **Step 4: Add the new files to `AGENTS.md`'s File Map**

In the `lib/` block of `AGENTS.md`'s File Map, add lines for `design-tokens.css` and `design-system.css`; in the `content/` block, add a line for `positioning.js` (mirroring the existing `editor-adapters.js` entry's style).

- [ ] **Step 5: Run the complete verification suite**

Run: `npm run verify && npx playwright test`
Expected: PASS — every unit test, lint, typecheck, and e2e spec green.

- [ ] **Step 6: Manually smoke-test in real Chrome** (per this repo's established pattern of flagging what automation can't cover — see `docs/FOLLOWUPS.md`)

Load the unpacked extension and walk the two new checklist items from Step 3, plus: toggle the theme selector in Settings and confirm the content-script overlay (open it on any page) picks up the change live; confirm the side panel's loading spinner appears during a Summarize/Translate/Explain call.

- [ ] **Step 7: Commit**

```bash
git add tests/design-tokens.test.js AGENTS.md
git commit -m "test: assert no legacy design tokens remain; update AGENTS.md checklist/file map"
```

- [ ] **Step 8: Add a FOLLOWUPS.md entry for the manual smoke test**

If Step 6 wasn't performed in a real browser as part of this task's execution (e.g. running inside a sandboxed agent environment without a real Chrome UI), add a new numbered row to `docs/FOLLOWUPS.md` (source: this plan, trigger: before/soon after the next Chrome Web Store upload) describing exactly what Step 6 asked for and why it couldn't be verified here — following the same pattern as the plan's own existing item #13.

---

## Self-Review Notes

(Recorded here per the writing-plans skill's self-review requirement — not part of the plan an implementer follows.)

- **Spec coverage:** Architecture §1 (tokens) → Task 1. §2 (theme) → Tasks 3-4. §3 (components) → Task 2. §4 (a11y/motion) → folded into Task 2's CSS + Task 10's MASTER.md documentation (no separate task; it's not a separable deliverable, it's a property of the CSS written in Task 2). §5 (interaction/positioning) → Tasks 5-6. §6 (persisted doc) → Task 10. Evidence section's specific file:line findings are each traceable to a task. Testing section's four bullet points → Tasks 1/2 (token/class presence tests), 3 (theme-manager tests), 6 (e2e viewport/back-button tests), 11 (token-consistency final assertion + manual smoke).
- **Placeholder scan:** Two steps (Task 6 Step 5, Task 6 Step 6, and Task 7 Step 1) explicitly tell the implementer to read an existing function/file first rather than giving exact line-for-line code, because those functions' current bodies were not part of this plan's research reads (`positionOverlay()`, `getSelectionRect()`'s exact current implementation beyond what's quoted, and `e2e/overlay-css-isolation.spec.js`'s existing shadow-root-reading helper). This is flagged inline in each case rather than silently glossed over, and each still gives the implementer a concrete transformation pattern to apply (clamp-before-assign; prefer-end-point-over-bounding-box; reuse-the-existing-helper) rather than a vague "handle it appropriately." This is a known, deliberate gap in this plan's own research depth, not a placeholder in the prohibited sense of unspecified intent.
- **Type/name consistency:** `self.OMNI_POSITIONING.clampToViewport(top, left, width, height, scrollX, scrollY, viewportWidth, viewportHeight)` and `getRectEndPoint(rects)` are defined identically in Task 5 and consumed identically in Task 6. `applyTheme(themePreference, root)` / `initTheme(root)` are defined in Task 3 and consumed with the same signature in Task 4. The `.ds-*` class names are defined once in Task 2 and referenced identically by name across Tasks 7/8/9's rename tables.
