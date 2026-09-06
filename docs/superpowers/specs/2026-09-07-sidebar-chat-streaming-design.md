# Sidebar Chat with Page + Streaming Responses — Design

**Date:** 2026-09-07
**Status:** Approved design (pending implementation plan)
**Scope:** Two P0 Sidebar features for Omni AI v2.3.0:
1. **Chat with Page** — a chat tab in the Side Panel that always carries the
   active tab's page content as context.
2. **Streaming responses** — token-by-token rendering, delivered *only* inside
   the Sidebar Chat for v1 (existing overlay + Page Tools keep one-shot
   responses).

This is a new subsystem on top of the existing `sidepanel/` Page Tools. It
follows the Omni AI architecture rules: all AI traffic goes through
`lib/ai-service.js` → `lib/providers/*`; UI never calls `fetch` against an AI
API; all user-visible strings go through i18n.

---

## 1. Goals & Non-Goals

### Goals
- Add a `Chat` tab to the Side Panel next to the existing `Tools` tab.
- User can ask free-form questions; the AI answers grounded in the active page.
- Responses stream token-by-token with visible progress and a Stop control.
- Reuse the existing `GET_PAGE_CONTENT` message (top frame only) for page text.
- Keep effort bounded: single-prompt-with-history approach, no provider
  message-array refactor in v1.

### Non-Goals (v1)
- No free-form chat *without* page context (mode is always Chat-with-Page).
- No intelligent chunking/RAG (embedding, similarity retrieval) — v1 sends the
  full (truncated) page text as context.
- No streaming for overlay cards or Page Tools (summarize/translate/explain).
- No persisted chat history across sessions (in-memory per panel session only).
- No voice input / TTS / screenshot context / web-search grounding.

---

## 2. Architecture Overview

```
Sidebar (sidepanel.js)
  ├─ tab switch: Tools | Chat
  ├─ on tab activate / chat open:
  │     GET_PAGE_CONTENT (frameId:0) → truncate(~8k chars) → cache by tabId
  └─ Chat:
        chrome.runtime.connect({name:"omni-chat"})   ── long-lived port
          → port.postMessage({type:"CHAT_STREAM", prompt})
          ← port.postMessage({type:"chunk", text})   × N
          ← port.postMessage({type:"done", full})
          ← port.postMessage({type:"error", message})
                │
Service Worker (background/service-worker.js)
  └─ onConnect("omni-chat")
        → build prompt from payload (already built by sidebar)
        → lib/providers generateContentStream(prompt, config, onChunk, signal)
                │
lib/providers/*  generateContentStream  (SSE parse per provider)
```

### Why a long-lived Port (not `sendMessage`)
- `chrome.runtime.sendMessage` is one-shot; true streaming needs a persistent
  channel. A Port gives us: bidirectional messages, an `onDisconnect` event we
  can use to abort the in-flight request (Stop button), and no polling.
- UI still never fetches the AI API directly — the Port talks only to the
  Service Worker, which uses `lib/providers/*`. This satisfies the AGENTS.md
  Provider Pattern and the `eslint.config.js` `no-restricted-syntax` rule.

---

## 3. Provider Streaming (`lib/providers/*`)

### 3.1 Contract
Every provider module MUST additionally export (or the index dispatcher wraps):

```js
/**
 * @param {string} prompt
 * @param {object} config  { apiKey, model, maxTokens, temperature, topP, baseUrl? }
 * @param {(text:string)=>void} onChunk  called per token/delta
 * @param {AbortSignal} signal  abort → stop streaming + close connection
 * @returns {Promise<string>}  the full assembled response
 */
async function generateContentStream(prompt, config, onChunk, signal) { ... }
```

### 3.2 Per-provider implementation
- **Gemini** (`gemini.js`): call `streamGenerateContent?alt=sse`; parse SSE
  `data:` JSON, extract `candidates[0].content.parts[].text`, call `onChunk`.
- **OpenAI / Groq / Anthropic / Custom-gateway** (`openai.js`, `groq.js`,
  `anthropic.js`, `custom-gateway.js`): POST with `stream:true`; read the
  response body as a stream, split on newlines, parse `data:` lines. Custom
  gateway MUST also read `reasoning_content` deltas (DeepSeek-style) if present
  and surface them as `onChunk` (or a separate `onReasoning` if cheap — for v1
  append reasoning to the same stream text with a marker, TBD in plan).
- Each parser must check `signal.aborted` between chunks and throw/return early.

### 3.3 Fallback
If a provider cannot stream (not implemented / network), fall back to the
existing `generateContent(prompt, config)` and call `onChunk(fullText)` once,
then resolve. The dispatcher in `lib/providers/index.js` handles this so the
Sidebar code path is uniform.

### 3.4 Dispatcher (`lib/providers/index.js`)
- Add `generateContentStream(prompt, config, onChunk, signal)`.
- Resolve provider via existing `getProvider(modelId)` / `getProviderByModel()`,
  call that module's `generateContentStream`, else wrap `generateContent`.

---

## 4. Service Worker (`background/service-worker.js`)

```js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "omni-chat") return;
  let controller = new AbortController();
  port.onMessage.addListener(async (msg) => {
    if (msg.type === "CHAT_STREAM") {
      try {
        const full = await generateContentStream(
          msg.prompt,
          msg.config,                 // apiKey/model/etc. read from storage in sidebar
          (text) => port.postMessage({ type: "chunk", text }),
          controller.signal,
        );
        port.postMessage({ type: "done", full });
      } catch (err) {
        if (!controller.signal.aborted) {
          port.postMessage({ type: "error", message: String(err?.message || err) });
        }
      }
    }
  });
  port.onDisconnect.addListener(() => controller.abort());
});
```

Notes:
- The `config` (apiKey, model) is assembled in the Sidebar from `lib/storage.js`
  (local keys) — same as how Page Tools already work via `QUICK_ACTION`. The SW
  does NOT re-read storage per chunk.
- `onDisconnect` (user clicks Stop, or panel closes) aborts the in-flight
  request cleanly.
- This listener is fire-and-forget; it does NOT need `return true` (that rule
  applies to `onMessage` async responders, not Port handlers).

---

## 5. Page Context (`sidepanel/sidepanel.js`)

- Maintain a module-level `Map<tabId, {text, title, fetchedAt}>` cache.
- When the Chat tab is opened OR `chrome.tabs.onActivated` fires, fetch context:
  - `chrome.tabs.sendMessage(tab.id, {type:"GET_PAGE_CONTENT"}, {frameId:0})`
    — reuses the existing content-script handler (top frame only, prevents the
    iframe-broadcast bug noted in current `sidepanel.js`).
  - On success: truncate text to **~8000 characters** (safe token budget; exact
    constant `PAGE_CONTEXT_MAX_CHARS` in `lib/ai-service.js`).
  - Show a small indicator: `📄 Context: <page title>`; if unavailable, show a
    non-blocking warning and still allow chatting (AI just has no page context).
- Re-fetch when the active tab changes; do not re-fetch on every keystroke.

---

## 6. Prompt Building (`lib/ai-service.js`)

Add `buildChatPrompt({ pageContext, history, question })`:

```
SYSTEM: You are Omni AI, a helpful assistant answering questions about the
web page the user is viewing. Use the page content as context. If the page
does not contain the answer, say so. Answer in the user's language when
detectable, otherwise English.

PAGE CONTENT:
<pageContext truncated>

CONVERSATION:
[User]: <history[0].text>
[Assistant]: <history[0].response>
...
[User]: <question>
```

- `history` is the flat in-memory conversation for the current chat.
- This single-string approach avoids refactoring every provider to a
  messages array in v1. A follow-up (P2) can switch to native messages arrays.

---

## 7. Sidebar UI

### 7.1 Tab bar (`sidepanel/sidepanel.html`)
Add above `<main>`:
```html
<nav class="sidepanel-tabs">
  <button class="tab-btn active" data-tab="tools">__MSG_sidepanel_tab_tools__</button>
  <button class="tab-btn" data-tab="chat">__MSG_sidepanel_tab_chat__</button>
</nav>
```
Two `<section>` panels: `#toolsPanel` (existing Page Tools) and `#chatPanel`
(new). Toggle `.hidden` on click. Persist active tab in `chrome.storage.session`
so it survives panel reloads.

### 7.2 Chat panel
```html
<section id="chatPanel" class="chat-panel hidden">
  <div id="chatContext" class="chat-context"></div>
  <div id="chatMessages" class="chat-messages"></div>
  <div id="chatInputRow" class="chat-input-row">
    <textarea id="chatInput" rows="2"
      placeholder="__MSG_sidepanel_chat_placeholder__"></textarea>
    <button id="chatSend" class="ds-btn-primary">__MSG_sidepanel_chat_send__</button>
    <button id="chatStop" class="ds-btn-ghost hidden">__MSG_sidepanel_chat_stop__</button>
  </div>
  <button id="chatNew" class="ds-btn-ghost chat-new">__MSG_sidepanel_chat_new__</button>
</section>
```

Message rendering:
- User bubble: right-aligned, `.chat-bubble.user`.
- Assistant bubble: left-aligned, `.chat-bubble.assistant`, contains a `Copy`
  icon button (`.ds-icon-btn`) that copies the final text.
- While streaming, append `chunk.text` to the current assistant bubble's text
  node (no full re-render per token).
- Empty state: `sidepanel_chat_empty` hint when no messages.

### 7.3 Styles (`sidepanel/sidepanel.css`)
- Use existing `--omni-*` tokens and `.ds-*` classes from
  `lib/design-tokens.css` / `lib/design-system.css` (already linked in the
  page). No hardcoded colors.
- Add `.sidepanel-tabs`, `.tab-btn`, `.chat-panel`, `.chat-messages`,
  `.chat-bubble`, `.chat-context`, `.chat-input-row` rules.
- Keep the Side Panel a normal page (no Shadow DOM — unlike content-script UI).

---

## 8. Sidebar Chat Logic (`sidepanel/sidepanel.js`)

State (module-level):
- `chatPort` — current `chrome.runtime.connect` port or `null`.
- `chatHistory` — `Array<{role:'user'|'assistant', text:string}>`.
- `isStreaming` — boolean.
- `pageCache` — `Map<tabId, {text,title}>` (see §5).

Functions:
- `switchTab(name)` — toggle sections + active button + persist to session.
- `ensurePageContext()` — fetch/refresh `pageCache` for active tab.
- `sendChatMessage()`:
  1. Read `chatInput.value`; if empty or `isStreaming`, ignore.
  2. Append user bubble; push to `chatHistory`.
  3. Build `prompt = buildChatPrompt({pageContext, history:chatHistory, question})`.
  4. Open `chatPort = chrome.runtime.connect({name:"omni-chat"})`.
  5. `chatPort.onMessage`: `chunk` → append to assistant bubble + push partial to
     history placeholder; `done` → finalize history entry, enable input;
     `error` → show error bubble + status.
  6. `chatPort.postMessage({type:"CHAT_STREAM", prompt, config})`.
  7. Set `isStreaming=true`, show Stop, disable Send/Input.
- `stopChat()` — `chatPort.disconnect()` (triggers SW `onDisconnect` → abort);
  finalize current assistant text; reset `isStreaming`.
- `newChat()` — clear `chatHistory`, clear messages DOM, keep page context.
- `copyChat(text)` — `navigator.clipboard.writeText`.
- `chrome.tabs.onActivated.addListener` → refresh page context if Chat tab open.

Keyboard: `Enter` sends (Shift+Enter newline) — consistent with common chat UIs.

---

## 9. i18n

Add to `_locales/en/messages.json` (and equivalent keys in the other 9 locales
in the same commit; translations may follow later but keys MUST exist):

| Key | en default |
|-----|-----------|
| `sidepanel_tab_tools` | "Tools" |
| `sidepanel_tab_chat` | "Chat" |
| `sidepanel_chat_placeholder` | "Ask about this page…" |
| `sidepanel_chat_send` | "Send" |
| `sidepanel_chat_stop` | "Stop" |
| `sidepanel_chat_new` | "New chat" |
| `sidepanel_chat_context` | "Context: %s" |
| `sidepanel_chat_empty` | "Ask a question about the page you're viewing." |
| `sidepanel_chat_error` | "Chat failed: %s" |

No hardcoded user-visible strings in source (AGENTS.md i18n mandate).

---

## 10. Files Touched

| File | Change |
|------|--------|
| `lib/providers/gemini.js` | + `generateContentStream` (SSE) |
| `lib/providers/openai.js` | + `generateContentStream` (SSE) |
| `lib/providers/groq.js` | + `generateContentStream` (SSE) |
| `lib/providers/anthropic.js` | + `generateContentStream` (SSE) |
| `lib/providers/custom-gateway.js` | + `generateContentStream` (SSE incl. reasoning_content) |
| `lib/providers/index.js` | + `generateContentStream` dispatcher + fallback |
| `background/service-worker.js` | + `onConnect("omni-chat")` port handler |
| `lib/ai-service.js` | + `buildChatPrompt()`, `PAGE_CONTEXT_MAX_CHARS` |
| `sidepanel/sidepanel.html` | + tab nav + chat panel markup |
| `sidepanel/sidepanel.css` | + chat/tab styles (tokens only) |
| `sidepanel/sidepanel.js` | + tab switch, page context, chat/stream, port logic |
| `_locales/*/messages.json` | + 9 keys (en + 9 others) |

---

## 11. Testing & Verification

### Unit (Jest, jsdom)
- `tests/lib/providers/gemini.stream.test.js` — mock `fetch` Response stream,
  assert `onChunk` called per delta, `signal.abort()` stops parsing, full text
  assembled.
- Same for `openai`, `custom-gateway` (assert `reasoning_content` handled).
- `tests/lib/ai-service.test.js` — `buildChatPrompt` substrings (page context
  marker, conversation history formatting). Update in same commit.
- `tests/sidepanel/sidepanel.test.js` (new) — tab switch toggles panels;
  `sendChatMessage` opens port, appends chunks, finalizes on `done`; Stop
  disconnects port.

### E2E (Playwright)
- `e2e/smoke.spec.js` extension: open Side Panel, switch to Chat tab, assert
  chat panel visible + Tools hidden. (Do not assert real streaming — mock/network
  dependent; streaming correctness covered by unit tests.)

### Gates
- `npm run verify` (typecheck + lint + jest) MUST be green.
- `npx playwright test` green for the new spec.
- Manual smoke (load unpacked): Chat tab streams a response from a real page;
  Stop aborts mid-stream; New chat clears; Copy works; Tools tab still works.

---

## 12. Risks & Trade-offs

- **Token cost grows linearly** with chat length (each turn resends full history
  + page). Accepted for v1; P2 can move to native messages arrays / context
  trimming.
- **Page truncation** at 8000 chars may cut long articles. Mitigated by
  indicating truncation in context label; full RAG is a future upgrade.
- **Custom-gateway reasoning_content** rendering needs a decision in the plan
  (append with marker vs. separate UI). Flagged, not blocking.
- **Port lifetime:** if the Side Panel is closed mid-stream, `onDisconnect`
  aborts — no leak. Reopening starts a fresh chat (in-memory only, by design).

---

## 13. Follow-ups (out of scope, noted for roadmap)
- P1: Tabbed/resize UI polish; Result actions (copy/export/regen) for Page Tools.
- P2: Persisted chat history; intelligent chunking/RAG; native messages-array
  providers; free-form chat without context.
- P3: Screenshot Q&A; voice/TTS; web-search grounding.
