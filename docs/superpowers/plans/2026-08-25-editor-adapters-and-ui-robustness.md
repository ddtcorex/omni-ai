# Editor Adapters & UI Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved design in `docs/superpowers/specs/2026-08-25-editor-adapters-and-ui-robustness-design.md`: floating-button toggle, overflow + stylesheet-delivery hardening, and an editor adapter layer giving full-replace support across major chat tools.

**Architecture:** Zero-build vanilla preserved. Adapter definitions live in a NEW classic script `content/editor-adapters.js` (loaded by manifest BEFORE `content/content.js`, exposing `self.OMNI_EDITOR_ADAPTERS`) because MV3 content scripts cannot be ES modules — this keeps the registry unit-testable via plain `require()` under babel-jest. Stylesheet delivery moves from runtime fetch (CSP-fragile) to a declarative `<link>` inside the shadow root.

**Tech Stack:** Vanilla ES5-compatible script + ES module consumers · Jest + jsdom (existing) · chrome.storage.local · Shadow DOM · InputEvent/ClipboardEvent synthesis

**Spec:** `docs/superpowers/specs/2026-08-25-editor-adapters-and-ui-robustness-design.md`

**Soft dependency:** engineering-hygiene plan Phase A (green test baseline) is expected but not strictly required; if not executed, substitute `npm test` for `npm run verify` throughout.

## Global Constraints

- Zero-build: browser loads source raw; NO bundler/framework (AGENTS.md Directive 1)
- Content scripts are CLASSIC scripts — no `import`/`export`; cross-file sharing via load order + `self.*` namespaces only
- Storage contract: user prefs object `settings` stays in `storage.local`; theme/languages stay `sync`
- Every async `onMessage` reply returns `true` (already handled — do not regress)
- User-facing strings via `_locales/en/messages.json` first (`__MSG_key__` convention already used in settings.html)
- `applyReplace` may return `boolean` OR `Promise<boolean>`; failure falls through to next matching adapter, finally to today's Copy-card behavior
- Google Docs is degraded-mode by design (canvas rendering) — never attempt DOM surgery there

---

### Task 1: Floating button toggle (`settings.showFloatingButton`)

**Files:**
- Modify: `background/service-worker.js` (`initializeSettings`, ~line 99)
- Modify: `content/content.js` (gate in `presentQuickActionButton` ~line 832; new `setupPrefsListener`; wire into `init()` ~line 616)
- Modify: `settings.html`, `settings.js`, `_locales/en/messages.json`
- Test: `tests/background/service-worker.test.js`

**Interfaces:**
- Produces: `chrome.storage.local` key `settings.showFloatingButton` (bool, default `true`); content-side cached flag updated live via `storage.onChanged`

- [ ] **Step 1: Failing service-worker test**

Add inside `describe("Service Worker Integration")`:

```js
it("seeds settings.showFloatingButton=true on install", async () => {
  await import("../../background/service-worker");
  const onInstalledListener = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
  onInstalledListener({ reason: "install" });
  await new Promise((r) => setTimeout(r, 0));
  expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ showFloatingButton: true }),
    }),
  );
});
```

Run: `npx jest tests/background -t "showFloatingButton"` → FAIL (no such key seeded).

- [ ] **Step 2: Seed the default**

In `initializeSettings()` defaults, extend the settings object:

```js
    settings: {
      theme: "dark",
      autoClose: false,
      showNotifications: true,
      showFloatingButton: true,
    },
```

Run again → PASS.

- [ ] **Step 3: Content-side gate + live updates**

Top of `content/content.js` (near other module state, ~line 115):

```js
let floatingButtonEnabled = true;

function setupPrefsListener() {
  if (!isContextValid()) return;
  chrome.storage.local
    .get("settings")
    .then((data) => {
      floatingButtonEnabled = !data || !data.settings ||
        data.settings.showFloatingButton !== false;
    })
    .catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      const s = changes.settings.newValue || {};
      floatingButtonEnabled = s.showFloatingButton !== false;
      if (!floatingButtonEnabled) hideQuickActionButton();
    }
  });
}
```

Call `setupPrefsListener();` as first statement of `init()` (line ~617). First line of `presentQuickActionButton()` becomes:

```js
  if (!floatingButtonEnabled) return;
```

- [ ] **Step 4: Settings UI + i18n**

`_locales/en/messages.json`, add (keep alphabetical placement near other keys):

```json
  "settings_showFloatingButton": { "message": "Show floating Omni AI button" },
  "settings_showFloatingButton_hint": { "message": "Turn off to use keyboard shortcuts only (Alt+A / Alt+R / Alt+T still work)" },
```

`settings.html` — insert a row adjacent to the `defaultPreset` select's container (reuse the enclosing row classes of that sibling):

```html
<div class="setting-row">
  <label for="showFloatingButton">__MSG_settings_showFloatingButton__</label>
  <select id="showFloatingButton" class="setting-select">
    <option value="on">__MSG_settings_on__</option>
    <option value="off">__MSG_settings_off__</option>
  </select>
  <p class="setting-hint">__MSG_settings_showFloatingButton_hint__</p>
</div>
```

(Select mirrors the page's existing control vocabulary; add `"settings_on": {"message":"On"}, "settings_off":{"message":"Off"}` too.)

`settings.js`: register `showFloatingButton: document.getElementById("showFloatingButton")` in `elements`; in `loadSettings()` local-config block read merged settings:

```js
    const uiPrefs = await chrome.storage.local.get("settings");
    if (elements.showFloatingButton)
      elements.showFloatingButton.value =
        (!uiPrefs.settings || uiPrefs.settings.showFloatingButton !== false)
          ? "on" : "off";
```

In `saveSettings()` `aiConfig` assembly:

```js
    aiConfig.settings = {
      ...(aiConfig.settings || {}),
      showFloatingButton: elements.showFloatingButton.value !== "off",
    };
```

- [ ] **Step 5: Verify + commit**

Run: `npx jest tests/background` PASS. Manual smoke: toggle Off in Settings → button gone on reload AND live (onChanged); Alt+A still opens Quick Ask.

```bash
git add -A && git commit -m "feat(settings): add showFloatingButton master toggle with live update"
```

---

### Task 2: Overflow hardening (Fix B)

**Files:**
- Modify: `content/overlay.css` (`.omni-ai-content-area` block near line 395)
- Create: `tests/fixtures/long-tokens.html`

- [ ] **Step 1: CSS**

Inside `.omni-ai-content-area` (and the result-text rule around line 411 that sets `white-space: pre-wrap`):

```css
  overflow-wrap: anywhere;
  word-break: normal;
  min-width: 0;
```

Keep `white-space: pre-wrap` unchanged.

- [ ] **Step 2: Fixture**

`tests/fixtures/long-tokens.html`: paragraph with one 200-char URL string, one fenced-code-style `<pre>` line of 120 chars, loaded manually via Load-unpacked on any page (or served for future Playwright).

- [ ] **Step 3: Manual verify + commit**

Load unpacked → select text on fixture → run any action → confirm no horizontal scroll on the card. 

```bash
git add content/overlay.css tests/fixtures/long-tokens.html && git commit -m "fix(ui): wrap long tokens in result cards (overflow-wrap anywhere)"
```

---

### Task 3: Defense-in-depth inheritable resets

**Files:**
- Modify: `content/overlay.css` (extend the `:where(...)` defensive-reset block near line 76)

- [ ] **Step 1: Extend resets**

Append to the `:where(.omni-ai-overlay, .omni-ai-toast, .omni-ai-quick-btn)` rule:

```css
  font-size: var(--ai-font-md);
  color: var(--ai-text-primary);
  direction: ltr;
  unicode-bidi: isolate;
```

- [ ] **Step 2: Smoke + commit**

Manual: overlay on a page with hostile `body { font-size: 9px; color: red }` custom style renders identically.

```bash
git add content/overlay.css && git commit -m "fix(ui): reset inheritable properties inside shadow wrappers"
```

---

### Task 4: Declarative stylesheet delivery (Fix A)

**Files:**
- Modify: `content/content.js` (`ensureUiStyles` ~152-191, `ensureUiRootReady` callers)
- Create: `tests/fixtures/csp-blocked.html`

**Interfaces:** Consumes: `web_accessible_resources` already includes `content/overlay.css` (manifest ✓). Removes `omniUiCssText` / `omniUiStylePromise`.

- [ ] **Step 1: Replace pipeline**

New body of `ensureUiStyles`:

```js
function ensureUiStyles(root = ensureUiRoot()) {
  const LINK_ID = "omni-ai-shadow-css";
  let link = root.querySelector(`link#${LINK_ID}`);
  if (!link) {
    link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content/overlay.css");
    root.appendChild(link);
  }
  return Promise.resolve();
}
```

Delete declarations of `omniUiCssText` / `omniUiStylePromise` (lines ~117-118) and their remaining references. `applyUiHostStyles`, `ensureUiRoot`, `ensureUiRootReady` signatures unchanged (callers await the returned promise — still valid).

- [ ] **Step 2: CSP fixture**

`tests/fixtures/csp-blocked.html`: clone of long-tokens fixture plus
`<meta http-equiv="Content-Security-Policy" content="default-src 'none'">`.
Expected BEFORE fix: unstyled overlay; AFTER fix: styled (link subresource is exempt from page CSP).

- [ ] **Step 3: Manual verify + commit**

Run fixture page on old build (observe breakage) then new build (styled). `npm test` untouched-path sanity.

```bash
git add content/content.js tests/fixtures/csp-blocked.html && git commit -m "fix(ui): deliver overlay.css via declarative shadow link (CSP-proof)"
```

---

### Task 5: Extract adapter registry (`content/editor-adapters.js`)

**Files:**
- Create: `content/editor-adapters.js`
- Modify: `manifest.json` (content_scripts.js array), `content/content.js` (delete `strategies` + `getContext`, delegate)
- Test: `tests/content/editor-adapters.test.js`

**Interfaces:**
- Produces: `self.OMNI_EDITOR_ADAPTERS = { ADAPTERS, resolveAdapter(element, opts?), getEditableHost(el) }` — each adapter `{ id, isApplicable(el), getText(el), getRect(el), replaceText(el,newText,state) }` (Task 6 upgrades to beginReplace/applyReplace).
- Consumers: `content/content.js` replaces its local `getContext()` with a delegation shim; ALL seven call sites (669, 746, 862, 1357, 1522, 1528, 1834) keep working unchanged.

- [ ] **Step 1: Failing tests**

`tests/content/editor-adapters.test.js`:

```js
describe("editor adapter registry", () => {
  let Registry;
  beforeEach(() => {
    jest.resetModules();
    global.self = global.self || global;
    Registry = require("../../content/editor-adapters.js");
  });

  test("textarea routes to standard adapter", () => {
    const ta = document.createElement("textarea");
    expect(Registry.resolveAdapter(ta).id).toBe("standard");
  });

  test("contenteditable routes to richText adapter", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(Registry.resolveAdapter(div).id).toBe("richText");
  });

  test("plain paragraph falls back to static", () => {
    const p = document.createElement("p");
    expect(Registry.resolveAdapter(p).id).toBe("static");
  });

  test("registry order is richText -> standard -> static (overlap precedence)", () => {
    expect(Registry.ADAPTERS.map((a) => a.id)).toEqual(["richText", "standard", "static"]);
  });

  test("getEditableHost climbs light DOM to contenteditable ancestor", () => {
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    host.appendChild(inner);
    document.body.appendChild(host);
    expect(Registry.getEditableHost(inner)).toBe(host);
  });
});
```

Run: `npx jest tests/content` → FAIL (module missing).

- [ ] **Step 2: Implement registry (move strategy bodies verbatim)**

Create `content/editor-adapters.js`. Classic script, ES5-safe, attaching to `self`. Move `standard`, `richText`, `static` bodies EXACTLY as in `content/content.js:231-365`, plus a private copy of `getEditableHost` (verbatim from content.js:377-393 — content.js keeps ITS copy until Task 9 unifies; duplication noted here deliberately):

```js
(function (root) {
  "use strict";

  function getEditableHost(el) { /* verbatim copy from content/content.js:377 */ }

  const richText = { /* id:"richText", verbatim bodies from :281-341, calling getEditableHost above */ };
  const standard = { /* id:"standard", verbatim bodies from :233-278 */ };
  const staticStrategy = { /* id:"static", verbatim bodies from :344-364 */ };

  const ADAPTERS = [richText, standard, staticStrategy];

  function resolveAdapter(element /*, opts in Task 10 */) {
    for (const adapter of ADAPTERS) {
      if (adapter.isApplicable(element)) return adapter;
    }
    return staticStrategy;
  }

  root.OMNI_EDITOR_ADAPTERS = { ADAPTERS, resolveAdapter, getEditableHost };
})(typeof self !== "undefined" ? self : this);
```

(The comment-form above marks VERBATIM MOVE boundaries — the executing engineer pastes the real bodies; no behavioral change is permitted in this task.)

- [ ] **Step 3: Manifest two-file load**

```json
      "js": ["content/editor-adapters.js", "content/content.js"],
```

- [ ] **Step 4: Delegate from content.js**

Delete `strategies` (231-365) and `getContext` (367-374 — removes the dead `run_standard` branch). Insert:

```js
function getContext(element) {
  return self.OMNI_EDITOR_ADAPTERS.resolveAdapter(element);
}
```

- [ ] **Step 5: Verify + commit**

`npx jest tests/content` PASS; full `npm test` PASS; manual smoke (selection button + replace in a textarea + a contenteditable).

```bash
git add -A && git commit -m "refactor(content): extract editor adapter registry to classic script"
```

---

### Task 6: beginReplace/applyReplace contract + fall-through chain

**Files:**
- Modify: `content/editor-adapters.js`
- Modify: `content/content.js` (`replaceSelectedText` ~1820)
- Test: `tests/content/editor-adapters.test.js`

**Interfaces:**
- Produces: each adapter gains `beginReplace(el, selState) -> replaceState` and `applyReplace(el, replaceState, newText) -> boolean|Promise<boolean>`; registry gains `replaceViaAdapters(el, selState, newText) -> { ok, adapter?, attempts[] }`. Legacy `replaceText` REMAINS during migration (Tasks 7-8 consume the new contract).

- [ ] **Step 1: Failing tests**

```js
describe("replaceViaAdapters fall-through", () => {
  const Registry = () => global.self.OMNI_EDITOR_ADAPTERS;

  test("returns ok:false with attempts when every adapter declines", async () => {
    const R = Registry();
    R.ADAPTERS.forEach((a) => {
      a.beginReplace = () => null;
      a.applyReplace = () => false;
    });
    const ta = document.createElement("textarea");
    const res = await R.replaceViaAdapters(ta, {}, "x");
    expect(res.ok).toBe(false);
    expect(res.attempts.length).toBeGreaterThanOrEqual(2);
  });

  test("falls through declining adapter to a succeeding one", async () => {
    const R = Registry();
    const order = [];
    R.ADAPTERS.forEach((a, i) => {
      a.beginReplace = () => null;
      a.applyReplace = () => { order.push(a.id); return i === 1; };
    });
    const ta = document.createElement("textarea");
    const res = await R.replaceViaAdapters(ta, {}, "x");
    expect(res.ok).toBe(true);
    expect(res.adapter).toBe(R.ADAPTERS[1].id);
    expect(order).toEqual([R.ADAPTERS[0].id, R.ADAPTERS[1].id]);
  });
});
```

Run → FAIL (`replaceViaAdapters` undefined).

- [ ] **Step 2: Implement chain**

In `editor-adapters.js`:

```js
  function candidatesFor(element, opts) {
    const preferred = pickPreferred(element, opts); // Task 10; identity fn now
    const matching = ADAPTERS.filter((a) => a !== staticStrategy && a.isApplicable(element));
    return preferred ? [preferred, ...matching.filter((a) => a !== preferred)] : matching;
  }

  async function replaceViaAdapters(element, selState, newText, opts) {
    const attempts = [];
    for (const adapter of candidatesFor(element, opts)) {
      try {
        const state = adapter.beginReplace ? adapter.beginReplace(element, selState) : selState;
        const ok = await adapter.applyReplace(element, state, newText, selState);
        if (ok) return { ok: true, adapter: adapter.id, attempts };
        attempts.push(adapter.id + ":declined");
      } catch (e) {
        attempts.push(adapter.id + ":" + e.message);
      }
    }
    return { ok: false, attempts };
  }
```

Give `standard`/`richText` thin wrappers: `beginReplace(el,selState){return selState;}` and `applyReplace(el,state,text,selState){ this.replaceText(el,text,state||selState||{}); return true; }`. Export both in `OMNI_EDITOR_ADAPTERS`.

- [ ] **Step 3: Wire content.js**

`replaceSelectedText()` tail (from `if (context.id !== "static")`) becomes:

```js
  if (context.id === "static") return;
  self.OMNI_EDITOR_ADAPTERS
    .replaceViaAdapters(activeElement, state, newText)
    .then((res) => {
      self.__omniLastReplace = {
        adapter: res.adapter,
        at: Date.now(),
      };
      if (!res.ok) console.warn("[Omni AI] replace failed:", res.attempts.join("; "));
    });
```

- [ ] **Step 4: Verify + commit**

`npx jest tests/content` PASS; manual textarea + contenteditable replace still work.

```bash
git add -A && git commit -m "feat(adapters): beginReplace/applyReplace contract with failure fall-through"
```

---

### Task 7: `beforeinput` adapter (Lexical / ProseMirror / Draft family)

**Files:**
- Modify: `content/editor-adapters.js`
- Test: `tests/content/editor-adapters.test.js`

- [ ] **Step 1: Failing test**

```js
describe("beforeinput adapter", () => {
  test("dispatches cancelable beforeinput with insertText data", async () => {
    const R = global.self.OMNI_EDITOR_ADAPTERS;
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.appendChild(div);

    const seen = [];
    div.addEventListener("beforeinput", (e) => seen.push(e));

    const adapter = R.resolveAdapter(div); // richText wins ordering; fetch by id:
    const bi = R.ADAPTERS.find((a) => a.id === "beforeinput");
    const ok = await bi.applyReplace(div, null, "hello", {});

    expect(ok).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].inputType).toBe("insertText");
    expect(seen[0].data).toBe("hello");
  });
});
```

Run → FAIL (no `beforeinput` adapter).

- [ ] **Step 2: Implement**

Insert between `richText` and `standard` in `ADAPTERS`:

```js
  const beforeinput = {
    id: "beforeinput",
    isApplicable(el) { return !!(el && el.isContentEditable); },
    beginReplace(el) {
      const sel = root.getSelection ? root.getSelection() : window.getSelection();
      const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      return { focusEl: el, range };
    },
    applyReplace(el, state, newText) {
      const target = (state && state.focusEl) || el;
      target.focus();
      if (state && state.range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(state.range);
      }
      target.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true, cancelable: true,
        inputType: "insertText", data: newText,
      }));
      return true;
    },
  };
```

(`const root = typeof self !== "undefined" ? self : window;` at file top; `InputEvent` exists in jsdom ≥ 22 — if absent, construct `new Event("beforeinput", …)` and assign `inputType`/`data` properties; guard once at top: `const NativeInputEvent = root.InputEvent || root.Event;` and pass extra fields via Object.assign.)

Registry order becomes `["richText", "beforeinput", "standard", "static"]` — update Task 5's ordering assertion accordingly.

- [ ] **Step 3: Verify + commit**

`npx jest tests/content` PASS (update order test!). 

```bash
git add -A && git commit -m "feat(adapters): beforeinput insertion adapter for modern editors"
```

---

### Task 8: `clipboard-sim` adapter (Notion / X / Facebook / LinkedIn / Gemini / universal fallback)

**Files:**
- Modify: `content/editor-adapters.js`
- Test: `tests/content/editor-adapters.test.js`

- [ ] **Step 1: Failing test**

```js
describe("clipboard-sim adapter", () => {
  test("writes clipboard and dispatches paste carrying DataTransfer", async () => {
    const R = global.self.OMNI_EDITOR_ADAPTERS;
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.appendChild(div);
    div.focus();

    navigator.clipboard.writeText = jest.fn().mockResolvedValue(undefined);
    const pastes = [];
    div.addEventListener("paste", (e) => pastes.push(e));
    // jsdom may lack ClipboardEvent/DataTransfer — adapter shims via CustomEvent:
    div.addEventListener("paste", (e) => {
      e.preventDefault = e.preventDefault || (() => {});
    }, true);

    const cs = R.ADAPTERS.find((a) => a.id === "clipboard-sim");
    const ok = await cs.applyReplace(div, { focusEl: div, range: null }, "replaced!");

    expect(ok).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("replaced!");
    expect(pastes.length).toBe(1);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement**

Append to `ADAPTERS` before `staticStrategy`:

```js
  const clipboardSim = {
    id: "clipboard-sim",
    isApplicable(el) { return !!(el && (el.isContentEditable || el.tagName === "TEXTAREA")); },
    beginReplace(el) { return { focusEl: el }; },
    async applyReplace(el, state, newText) {
      const target = (state && state.focusEl) || el;
      target.focus();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(newText);
      } else { return false; }
      let evt;
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", newText);
        evt = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      } catch (e) {
        evt = new Event("paste", { bubbles: true, cancelable: true });
        evt.clipboardData = { getData: () => newText };
      }
      target.dispatchEvent(evt);
      return true;
    },
  };
```

Final order: `["richText", "beforeinput", "standard", "clipboard-sim", "staticStrategy-as-static"]`. Update the ordering test.

- [ ] **Step 3: Verify + commit**

`npx jest tests/content` PASS.

```bash
git add -A && git commit -m "feat(adapters): clipboard simulation adapter with DataTransfer shim"
```

---

### Task 9: Shadow-piercing editable detection

**Files:**
- Modify: `content/editor-adapters.js` (`getEditableHost`), delete duplicated copy in `content/content.js` (377-393) → alias
- Test: `tests/content/editor-adapters.test.js`

- [ ] **Step 1: Failing test**

```js
describe("shadow-piercing getEditableHost", () => {
  test("climbs through open shadow roots", () => {
    const R = global.self.OMNI_EDITOR_ADAPTERS;
    const outer = document.createElement("div");
    outer.setAttribute("contenteditable", "true");
    document.body.appendChild(outer);
    const shadow = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    inner.setAttribute("contenteditable", "true");
    shadow.appendChild(inner);
    const leaf = document.createElement("span");
    inner.appendChild(leaf);

    expect(R.getEditableHost(leaf)).toBe(inner);
    expect(R.resolveAdapter(leaf).id).toBe("richText");
  });
});
```

Run → FAIL (current copy walks `parentElement` only).

- [ ] **Step 2: Implement composed-tree walk**

```js
  function getEditableHost(el) {
    if (!el) return null;
    let node = el;
    while (node) {
      if (
        node.nodeType === 1 &&
        (node.isContentEditable ||
          node.getAttribute &&
          node.getAttribute("contenteditable") === "true")
      ) {
        return node;
      }
      const rootNode = node.getRootNode ? node.getRootNode() : null;
      if (rootNode && rootNode.host) { node = rootNode.host; continue; }
      node = node.parentElement;
      if (node && node.tagName === "BODY") return null;
    }
    return el;
  }
```

Delete the duplicate in `content/content.js`; alias: `const getEditableHost = (el) => self.OMNI_EDITOR_ADAPTERS.getEditableHost(el);` (keeps other content.js call sites alive). Closed shadow roots remain unreachable (documented limitation).

- [ ] **Step 3: Verify + commit**

All content tests PASS; smoke on any open-shadow widget (e.g. a page embedding a CE editor in shadow DOM).

```bash
git add -A && git commit -m "feat(adapters): pierce open shadow roots when locating editable hosts"
```

---

### Task 10: Site hints + Google Docs degraded labeling

**Files:**
- Modify: `content/editor-adapters.js` (`pickPreferred`, hinted `resolveAdapter`)
- Modify: `content/content.js` (paste-note decoration in `showResultOverlay` content-area build ~line 1595)
- Modify: `_locales/en/messages.json`
- Test: `tests/content/editor-adapters.test.js`

- [ ] **Step 1: Failing tests**

```js
describe("site hints", () => {
  const R = () => global.self.OMNI_EDITOR_ADAPTERS;
  const ce = () => { const d = document.createElement("div"); d.setAttribute("contenteditable","true"); return d; };

  test("chatgpt.com prefers beforeinput", () => {
    expect(R().resolveAdapter(ce(), { hostname: "chatgpt.com" }).id).toBe("beforeinput");
  });
  test("notion.so prefers clipboard-sim", () => {
    expect(R().resolveAdapter(ce(), { hostname: "www.notion.so" }).id).toBe("clipboard-sim");
  });
  test("docs.google.com pins clipboard-sim and flags degraded", () => {
    const res = R().resolveAdapter(ce(), { hostname: "docs.google.com" });
    expect(res.id).toBe("clipboard-sim");
    expect(R().isDegradedHostname("docs.google.com")).toBe(true);
  });
  test("unknown host keeps natural order (richText)", () => {
    expect(R().resolveAdapter(ce(), { hostname: "example.org" }).id).toBe("richText");
  });
});
```

- [ ] **Step 2: Implement hints**

```js
  const SITE_HINTS = [
    { re: /(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, prefer: "beforeinput" },
    { re: /(^|\.)claude\.ai$/, prefer: "beforeinput" },
    { re: /(^|\.)gemini\.google\.com$/, prefer: "clipboard-sim" },
    { re: /(^|\.)app\.slack\.com$|(^|\.)discord\.com$/, prefer: "beforeinput" },
    { re: /(^|\.)notion\.so$/, prefer: "clipboard-sim" },
    { re: /(^|\.)twitter\.com$|(^|\.)x\.com$|facebook\.com$|linkedin\.com$/, prefer: "clipboard-sim" },
    { re: /(^|\.)docs\.google\.com$/, prefer: "clipboard-sim", degraded: true },
  ];

  function hintFor(hostname) {
    return SITE_HINTS.find((h) => h.re.test(hostname || "")) || null;
  }
  function isDegradedHostname(hostname) {
    const h = hintFor(hostname); return !!(h && h.degraded);
  }
  function pickPreferred(element, opts) {
    const hint = hintFor(opts && opts.hostname !== undefined
      ? opts.hostname
      : (typeof location !== "undefined" ? location.hostname : ""));
    if (!hint) return null;
    return ADAPTERS.find((a) => a.id === hint.prefer) || null;
  }
```

`resolveAdapter(element, opts)`: compute natural match; if a hint prefers a DIFFERENT adapter that also `isApplicable`, return the hinted one; export `isDegradedHostname`. `candidatesFor` (Task 6) already consumes `pickPreferred`.

Degraded note in `content.js` — inside `showResultOverlay`, right after the content area is created (~1600):

```js
    try {
      const last = self.__omniLastReplace;
      if (
        last && Date.now() - last.at < 5000 &&
        self.OMNI_EDITOR_ADAPTERS.isDegradedHostname(location.hostname)
      ) {
        const note = document.createElement("div");
        note.className = "omni-ai-paste-note";
        note.textContent = i18n.getMessage("paste_mode_note") || "Inserted via clipboard paste mode.";
        content.appendChild(note);
      }
    } catch (e) { /* cosmetic only */ }
```

i18n key: `"paste_mode_note": { "message": "⚠ Paste mode: text inserted through the clipboard." }`; add `.omni-ai-paste-note { font-size: var(--ai-font-xs); opacity: .75; margin-top: 6px; }` to overlay.css.

- [ ] **Step 3: Verify + commit**

`npx jest tests/content` PASS.

```bash
git add -A && git commit -m "feat(adapters): hostname site hints with google-docs degraded paste note"
```

---

### Task 11: `all_frames` + lazy-mount audit + site matrix docs

**Files:**
- Modify: `manifest.json`, `content/content.js` (`init()` ~616), `CONTRIBUTING.md`

- [ ] **Step 1: Manifest**

```json
      "all_frames": true,
      "match_about_blank": true,
      "js": ["content/editor-adapters.js", "content/content.js"],
```

- [ ] **Step 2: Lazy-mount audit (concrete)**

Remove `ensureUiRootReady().catch(() => {});` from `init()` (line ~617) so empty hosts stop mounting in ad/restricted frames. Add `ensureUiRootReady()` await at the TOP of `showQuickAskOverlay` and `showResultOverlay` (both build UI unconditionally today). `presentQuickActionButton`/`createQuickBtn` already await `uiReady`.

- [ ] **Step 3: Site matrix into CONTRIBUTING.md**

```markdown
## Editor Support Matrix (manual QA per release)
| Site | Expected adapter | Replace | Notes |
|---|---|---|---|
| chatgpt.com | beforeinput | ✅ | |
| claude.ai | beforeinput | ✅ | |
| gemini.google.com | clipboard-sim | ✅ | paste note shown |
| app.slack.com / discord.com | beforeinput | ✅ | iframe frames |
| notion.so | clipboard-sim | ✅ | |
| x.com / facebook.com / linkedin.com | clipboard-sim | ✅ | |
| docs.google.com | clipboard-sim | ⚠️ degraded | selection-only; canvas DOM |
| TinyMCE demos | richText(execCommand) | ✅ | tinymce cloud demo page |
Failure on any row → file with console `[Omni AI] replace failed:` output.
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(manifest): enable all_frames editors with lazy UI mount; document support matrix"
```

---

### Task 12: Closeout

- [ ] Full `npm test` green; update `AGENTS.md`: File Map gains `content/editor-adapters.js` line ("classic-script adapter registry, loads before content.js"); Known Issues section pruned of anything fixed meanwhile.
- [ ] `CHANGELOG.md` gains `## [Unreleased]` with Added (toggle, adapters, all_frames) / Fixed (overflow, CSP stylesheet).
- [ ] Run the CONTRIBUTING matrix manually on the listed sites; record results in PR description.
- [ ] PR `feature/editor-adapters-ux` → `develop` (GitFlow-lite per hygiene plan Task 8).

---

## Self-Review Notes

- Naming: the spec's interface sketch says `match(el)`; this plan keeps `isApplicable(el)` — the existing codebase vocabulary from today's strategies. Same contract, one name.
- Ordering assertions from Task 5 are intentionally superseded in Tasks 7/8 — executors MUST update the Task-5 order test when ADAPTERS grows (each task states this).
- `replaceViaAdapters` awaits sequentially; `standard` never appears in candidate lists for CE nodes and vice versa (filter by applicability).
- jsdom gaps (`ClipboardEvent`/`DataTransfer`) are handled by the shim path and asserted through the shim in tests.
