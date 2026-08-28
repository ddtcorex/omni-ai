# Side Panel "Page Tools" Design

**Status:** Approved by user 2026-08-28. Ready for implementation planning.

## Goal

Replace the toolbar-icon surface entirely: retire the Quick Ask chat popup
(and the standalone-window hosting mechanism just built for it) in favor of
a `chrome.sidePanel`-based "Page Tools" panel that runs one-click AI actions
(Summarize / Smart Translate / Explain) against the whole content of the
active tab.

## Why (context from this session)

The popup went through two hosting mechanisms already this session:

1. `action.default_popup` (original) — Chrome force-closes it on any blur,
   which broke typing Vietnamese via ibus and made the Super+Space
   input-method switch close it mid-type.
2. `chrome.windows.create` standalone window (just shipped) — fixes the IME
   problem, but the user found managing a separate window inconvenient.

The user's own suggestion — `chrome.sidePanel` — sidesteps both problems at
once: a side panel is docked to the browser window (not a separate window
to manage, no "click away to dismiss" blur-close semantics), so it never
had the IME bug in the first place and doesn't need manual window-lifecycle
code either.

Rather than force the chat UI into a third hosting mechanism, the user
decided to drop the chat feature from this surface entirely — Quick Ask
chat still exists via the in-page overlay (Alt+A / context menu "Ask Omni
AI", `SHOW_QUICK_ASK_OVERLAY`, unaffected by anything in this design) — and
use the freed-up toolbar-icon surface for something that actually benefits
from being docked and persistent: page-level tools whose results stay
visible while the user keeps reading/scrolling the same page.

## Non-goals

- No chat/text-input UI in the side panel (that gap is intentionally filled
  by the existing Alt+A overlay, not duplicated here).
- No "Key Points" action or any new AI action — reuses `summarizeText`,
  `smartTranslate`, `explainText` exactly as they exist today.
- No per-tab side panels (`chrome.sidePanel.setOptions({ tabId, ... })`) —
  one global panel, driven by whichever tab is active when a button is
  clicked.
- No sign-in/auth UI anywhere — see "Removing Sign In" below.

## Architecture

### `manifest.json`

- Remove the `oauth2` block (client_id + scopes) and the `identity`
  permission — nothing will consume them once popup.js is deleted (verified
  via `grep -rl "SIGN_IN\|SIGN_OUT\|GET_USER\|chrome.identity\|oauth2"` —
  only `manifest.json`, `popup/popup.js`, `background/service-worker.js`
  reference any of this).
- Remove the `action` block's now-empty state from the standalone-window
  change (no `default_popup`, no click-driven code needed at all — see
  below). Keep `default_icon`/`default_title`.
- Add:
  ```json
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  }
  ```
  and add `"sidePanel"` to `permissions`.
- `commands._execute_action`'s description stays (still describes "click
  the toolbar icon"; Chrome still fires it, `chrome.sidePanel`'s declarative
  behavior below handles what happens next).

### `background/service-worker.js`

- Delete the entire "Quick Ask window management" block added this
  session: `quickAskWindowId`, `quickAskTargetTabId`, the
  `chrome.action.onClicked` listener, the `chrome.windows.onRemoved`
  listener, and the `GET_QUICK_ASK_TARGET_TAB` message case. None of it is
  needed — `chrome.sidePanel.setPanelBehavior` (below) is the entire
  click-handling story, declaratively, with no listener to maintain.
- Add, near the top-level listener registrations (alongside
  `chrome.runtime.onInstalled`):
  ```js
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  ```
  (Safe to call unconditionally at module load — it's idempotent and this
  matches Chrome's own documented sample pattern.)
- Delete `getUser`, `getAuthToken`, `fetchUserInfo`, `saveUserInfo` and the
  `SIGN_IN` / `SIGN_OUT` / `GET_USER` message cases — dead once popup.js
  (their only caller) is gone.
- `handleQuickAction(payload)` (existing, unchanged) already supports this
  design's data flow for free: when `payload.text` is provided explicitly,
  it skips the "read the current selection" branch entirely and goes
  straight to the switch on `payload.action`. `"summarize"`,
  `"smart_translate"`, and `"explain"` are all already-registered case
  labels. **No backend code changes needed to run page-level actions** —
  the side panel just needs to call it with the extracted page text.

### `sidepanel/` (new directory, replaces `popup/`)

Three files, mirroring `popup/`'s old structure but with a smaller surface:

- **`sidepanel.html`**: header (logo + `⚙️` Settings button, reusing
  `chrome.runtime.openOptionsPage()` exactly as `popup.js`'s `openSettings()`
  did), three action buttons (Summarize / Smart Translate / Explain), a
  result panel below (single result, replaced on each click — not a
  feed/history list), and a status line for loading/error states.
- **`sidepanel.css`**: no fixed-width assumptions this time — a side panel
  is inherently variable-width (user can drag Chrome's panel divider), so
  build it responsive from the start (`width: 100%`, flex layout) rather
  than repeating the `popup.css` mistake fixed twice already this session.
- **`sidepanel.js`**:
  - On each button click: call `chrome.tabs.query({ active: true, currentWindow: true })`
    directly — a side panel's script runs attached to the actual browsing
    window (unlike the standalone popup window), so this resolves correctly
    without needing the `GET_QUICK_ASK_TARGET_TAB` workaround built for the
    standalone window. Send `{ type: "GET_PAGE_CONTENT" }` to that tab
    (existing `content.js` handler, unchanged) to get the page text.
  - Send `{ type: "QUICK_ACTION", payload: { action: "<summarize|smart_translate|explain>", text } }`
    to the background (existing `handleQuickAction`, unchanged) and render
    `response.data` in the result area, or the error.
  - Show a loading state between click and response (reuse the visual
    pattern from the old `popup.js`'s typing indicator / status states,
    scaled down — no chat bubbles needed, just a spinner + disabled buttons).

### Removed

- `popup/popup.html`, `popup/popup.js`, `popup/popup.css` — deleted
  entirely (chat UI, draft-state persistence, page-context checkbox/fetch
  logic, sign-in UI, the empty-state bug fix, the responsive-window fix —
  all of it goes with the file).
- `e2e/smoke.spec.js`'s three popup-specific tests (`popup page loads...`,
  `popup empty-state placeholder disappears...`, `popup fills a resized
  Quick Ask window...`) — replaced by new tests targeting
  `sidepanel/sidepanel.html`.
- `tests/background/service-worker.test.js`'s Quick-Ask-window tests
  (`opens Quick Ask as a standalone window...`, `focuses the existing Quick
  Ask window...`, `allows opening a new Quick Ask window again...`,
  `remembers the tab that was active...`) and any `SIGN_IN`/`SIGN_OUT`/
  `GET_USER` tests — the code they test no longer exists.
- `AGENTS.md`'s Storage Map: drop `user` (OAuth profile) from the `sync`
  row (nothing writes it anymore).

### Not touched

- `lib/ai-service.js`, `lib/ai-providers.js`, `lib/providers/*` — zero
  changes; this design is pure surface/routing, reusing existing actions.
- `content/*` — zero changes; `GET_PAGE_CONTENT` and `GET_SELECTION`
  handlers are reused as-is.
- The Alt+A/R/T/F keyboard shortcuts and the in-page Quick Ask overlay —
  entirely separate code path (`SHOW_QUICK_ASK_OVERLAY`), unaffected.
- `settings.html`/`settings.js` — unaffected (no user/sign-in code there to
  begin with).
- `scripts/publish.sh`'s OAuth `client_id` swap step becomes a silent no-op
  once `manifest.json` has no `oauth2` block (its own `if 'oauth2' in data`
  guard already handles that) — cleanup optional, not required for
  correctness.

## Data Flow

```
User clicks toolbar icon
  -> chrome.sidePanel opens sidepanel.html (declarative, no listener)

User clicks "Summarize" (or Smart Translate / Explain) in the panel
  -> sidepanel.js: chrome.tabs.query({active, currentWindow}) -> tab
  -> chrome.tabs.sendMessage(tab.id, {type: "GET_PAGE_CONTENT"})
       -> content.js extractPageContent() -> {content, title, url}
  -> chrome.runtime.sendMessage({type: "QUICK_ACTION", payload: {action, text: content}})
       -> service-worker.js handleQuickAction() -> lib/ai-service.js (existing)
  -> sidepanel.js renders response.data or response.error
```

## Error Handling

- No content script on the active tab (e.g. `chrome://` pages, the Chrome
  Web Store, PDF viewer): `chrome.tabs.sendMessage` rejects; caught and
  shown as a clear status message ("Can't read this page" / equivalent
  i18n key) rather than a silent no-op — this session already hit one
  silent-failure bug from an unguarded `catch { return null }`
  (`fetchCurrentPageContent`'s page-context bug); this design surfaces the
  failure instead.
- Empty extracted content (e.g. a blank page): show a "Nothing to
  summarize on this page" message instead of sending an empty prompt.
- AI call failure (no API key configured, provider error): render
  `response.error` in the result area, matching the existing
  `error_prefix` i18n convention used elsewhere.

## i18n

New `_locales/en/messages.json` keys (English first, per `AGENTS.md`'s
same-commit rule; other locales may follow in the same task or a fast
follow, matching this repo's established practice):

- Button labels: `sidepanel_summarize`, `sidepanel_translate`,
  `sidepanel_explain`.
- Status/result strings: `sidepanel_loading`, `sidepanel_noContent`,
  `sidepanel_cantReadPage`, `sidepanel_resultTitle` (or reuse existing
  `error_prefix` for errors).
- Title: reuse existing `extName` for the `<title>`; no new key needed
  there.

## Testing

- `tests/background/service-worker.test.js`: remove the four Quick-Ask-
  window tests and any `SIGN_IN`/`SIGN_OUT`/`GET_USER` tests; no new
  background tests needed since `handleQuickAction` itself is unchanged
  (its existing "explicit text bypasses selection" tests already cover the
  code path this design relies on).
- New `e2e/sidepanel.spec.js` (replacing the removed popup specs):
  navigate directly to `chrome-extension://<id>/sidepanel/sidepanel.html`
  (same pattern the removed popup specs used), verify the three buttons
  render, and verify clicking one against a fixture page with known text
  produces a result (mocking or accepting the "no API key configured"
  error path, matching how the existing popup specs handled the same
  constraint).
- Manual (cannot be automated — same class of gap as items #13/#14 in
  `docs/FOLLOWUPS.md`): clicking the real toolbar icon actually opens the
  side panel; the panel persists across tab switches/reloads without
  closing.

## Known Constraint

`chrome.sidePanel` requires Chrome 114+ (shipped April 2024, over two
years before this design). `manifest.json` does not currently pin a
`minimum_chrome_version`, and this design does not add one either — a
user on a pre-114 Chrome would simply have no way to open the panel
(the toolbar icon click would silently do nothing, since
`setPanelBehavior` targets an API that doesn't exist yet). Given the
extension already assumes a modern MV3-capable Chrome and this is a
BYOK tool for technical users, this is accepted as-is; revisit only if a
real user report surfaces it.
