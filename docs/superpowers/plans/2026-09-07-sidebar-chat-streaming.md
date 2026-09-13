# Sidebar Chat with Page + Streaming Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Chat" tab to the Omni AI Side Panel that streams token-by-token answers grounded in the active page's content, using a long-lived Port to the Service Worker (which calls `lib/providers/*` — UI never fetches AI APIs directly).

**Architecture:** A `chrome.runtime.connect({name:"omni-chat"})` Port carries the prompt from the Sidebar to the Service Worker; the SW resolves config from storage and calls a new `generateContentStream()` on the matching provider module, posting `chunk`/`done`/`error` messages back as tokens arrive. The Sidebar appends chunks to an assistant bubble. v1 uses a single-prompt-with-history approach (no provider messages-array refactor).

**Tech Stack:** Vanilla ES modules, Chrome MV3, `chrome.runtime.connect` Port, SSE streaming per provider, Jest + jest-chrome (jsdom) for unit tests, Playwright for e2e smoke. Design tokens from `lib/design-tokens.css` / `lib/design-system.css`.

**Spec:** `docs/superpowers/specs/2026-09-07-sidebar-chat-streaming-design.md`

## Global Constraints

- All AI traffic MUST go through `lib/ai-service.js` → `lib/providers/*`; UI must never call `fetch` against an AI API. (AGENTS.md Provider Pattern; enforced by `eslint.config.js` `no-restricted-syntax`.)
- Every user-visible string MUST use `chrome.i18n.getMessage()` via `lib/i18n.js` with its key added to `_locales/en/messages.json` in the same commit; other locales may follow later but the key MUST exist. (AGENTS.md i18n mandate.)
- Sidebar/page UI uses `--omni-*` tokens and `.ds-*` classes — never hardcoded colors. (`sidepanel/` is a real page, NOT a Shadow DOM root.)
- `chrome.storage.sync` = user-following prefs (languages, theme); `chrome.storage.local` = secrets/machine config. Do not mix.
- `npm run verify` (typecheck + lint + jest) and `npx playwright test` MUST be green before completion.
- Follow the existing provider export shape: each `lib/providers/*.js` exports `generateContent(prompt, config)`; we ADD `generateContentStream(prompt, config, onChunk, signal)`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `lib/providers/openai.js` | + `generateContentStream` (SSE, `stream:true`) |
| `lib/providers/groq.js` | + `generateContentStream` (reuses OpenAI-compatible SSE) |
| `lib/providers/anthropic.js` | + `generateContentStream` (SSE, Anthropic format) |
| `lib/providers/gemini.js` | + `generateContentStream` (SSE `alt=sse`) |
| `lib/providers/custom-gateway.js` | + `generateContentStream` (SSE + `reasoning_content`) |
| `lib/providers/index.js` | + `generateContentStream` dispatcher with fallback wrapper |
| `lib/ai-service.js` | + `buildChatPrompt()`, `PAGE_CONTEXT_MAX_CHARS` const |
| `background/service-worker.js` | + `onConnect("omni-chat")` port handler (resolves config from storage) |
| `sidepanel/sidepanel.html` | + tab nav (Tools/Chat) + chat panel markup |
| `sidepanel/sidepanel.css` | + tab + chat styles (tokens only) |
| `sidepanel/sidepanel.js` | + tab switch, page context cache, chat/stream/port logic |
| `_locales/en/messages.json` | + 9 chat keys |
| `_locales/{vi,ja,...}/messages.json` | + same 9 keys (values may echo en) |
| `tests/lib/providers/openai.stream.test.js` | SSE parse + abort tests |
| `tests/lib/providers/gemini.stream.test.js` | SSE parse tests |
| `tests/lib/providers/custom-gateway.stream.test.js` | `reasoning_content` tests |
| `tests/lib/ai-service.test.js` | `buildChatPrompt` substring tests |
| `tests/sidepanel/sidepanel.test.js` | tab switch + chat append/stop (jsdom) |
| `e2e/smoke.spec.js` | extend: Side Panel Chat tab visible |

---

## Task 1: OpenAI provider streaming (SSE) + Groq reuse

**Files:**
- Modify: `lib/providers/openai.js`
- Create: `tests/lib/providers/openai.stream.test.js`

**Interfaces:**
- Produces: `generateContentStream(prompt, config, onChunk, signal)` → `Promise<string>` (full text). `config = { apiKey, model, temperature?, maxTokens?, baseUrl? }`.
- Consumes: `getApiModelName` from `../ai-providers.js` (already imported in openai.js).

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/providers/openai.stream.test.js
import { generateContentStream } from "../../../lib/providers/openai.js";

function sseChunk(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function mockFetchStream(chunks, { signal } = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    body: stream,
  });
  return signal;
}

test("streams deltas and returns full text", async () => {
  mockFetchStream([sseChunk("Hello"), sseChunk(" world")]);
  const chunks = [];
  const full = await generateContentStream("hi", { apiKey: "k", model: "gpt-4o-mini" }, (t) => chunks.push(t), new AbortController().signal);
  expect(chunks).toEqual(["Hello", " world"]);
  expect(full).toBe("Hello world");
});

test("abort stops reading", async () => {
  const controller = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sseChunk("partial")));
      // never close; we abort instead
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  const p = generateContentStream("hi", { apiKey: "k", model: "gpt-4o-mini" }, (t) => chunks.push(t), controller.signal);
  controller.abort();
  await expect(p).rejects.toBeDefined();
  expect(chunks).toEqual(["partial"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/lib/providers/openai.stream.test.js`
Expected: FAIL — `generateContentStream` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/providers/openai.js`:

```js
const OPENAI_STREAM_URL = "https://api.openai.com/v1/chat/completions";

export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096, baseUrl } = config;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const openaiModel = getApiModelName(model) || "gpt-4o-mini";
  const body = {
    model: openaiModel,
    stream: true,
    temperature,
    max_completion_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch(baseUrl || OPENAI_STREAM_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        /* ignore malformed keepalive lines */
      }
    }
  }
  return full;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lib/providers/openai.stream.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Reuse for Groq**

Modify `lib/providers/groq.js`: Groq's API is OpenAI-compatible. Add:
```js
export { generateContentStream } from "./openai.js";
```
(import at top: `import { generateContentStream } from "./openai.js";` then `export { generateContentStream };` — or re-export inline). Confirm `groq.js` already imports `getApiModelName` similarly; the re-export keeps one SSE implementation.

- [ ] **Step 6: Commit**

```bash
git add lib/providers/openai.js lib/providers/groq.js tests/lib/providers/openai.stream.test.js
git commit -m "feat(providers): OpenAI/Groq streaming via SSE"
```

---

## Task 2: Gemini provider streaming

**Files:**
- Modify: `lib/providers/gemini.js`
- Create: `tests/lib/providers/gemini.stream.test.js`

**Interfaces:**
- Produces: `generateContentStream(prompt, config, onChunk, signal)` → `Promise<string>`.
- Consumes: existing `getApiModelName` / model resolution pattern in gemini.js.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/providers/gemini.stream.test.js
import { generateContentStream } from "../../../lib/providers/gemini.js";

test("parses Gemini SSE text parts", async () => {
  const enc = new TextEncoder();
  const sse =
    'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n' +
    'data: {"candidates":[{"content":{"parts":[{"text":" Gemini"}]}}]}\n\n';
  const stream = new ReadableStream({
    start(c) { c.enqueue(enc.encode(sse)); c.close(); },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  const full = await generateContentStream("hi", { apiKey: "k", model: "gemini-1.5-flash" }, (t) => chunks.push(t), new AbortController().signal);
  expect(full).toBe("Hello Gemini");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/lib/providers/gemini.stream.test.js`
Expected: FAIL — export missing.

- [ ] **Step 3: Implement**

Gemini streaming uses `streamGenerateContent?alt=sse`. Append to `gemini.js`:

```js
export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096 } = config;
  if (!apiKey) throw new Error("Gemini API key not configured");
  const geminiModel = getApiModelName(model) || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(data);
        const parts = json.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) { full += part.text; onChunk(part.text); }
        }
      } catch { /* ignore */ }
    }
  }
  return full;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lib/providers/gemini.stream.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/gemini.js tests/lib/providers/gemini.stream.test.js
git commit -m "feat(providers): Gemini streaming via SSE"
```

---

## Task 3: Custom Gateway streaming (with reasoning_content)

**Files:**
- Modify: `lib/providers/custom-gateway.js`
- Create: `tests/lib/providers/custom-gateway.stream.test.js`

**Interfaces:**
- Produces: `generateContentStream(prompt, config, onChunk, signal)` → `Promise<string>`. For DeepSeek-style gateways, `reasoning_content` deltas are surfaced as `onChunk` text prefixed with a marker `🧠 ` so the Sidebar renders them inline (per spec §12, the exact rendering is a v1 simplification; marker chosen here).

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/providers/custom-gateway.stream.test.js
import { generateContentStream } from "../../../lib/providers/custom-gateway.js";

function sse(obj) { return `data: ${JSON.stringify(obj)}\n\n`; }

test("streams content and reasoning_content", async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sse({ choices: [{ delta: { reasoning_content: "thinking" } }] })));
      c.enqueue(enc.encode(sse({ choices: [{ delta: { content: "answer" } }] })));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  await generateContentStream("hi", { apiKey: "k", model: "deepseek-chat", baseUrl: "https://gw/v1/chat/completions" }, (t) => chunks.push(t), new AbortController().signal);
  expect(chunks.some((c) => c.includes("thinking"))).toBe(true);
  expect(chunks.some((c) => c.includes("answer"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/lib/providers/custom-gateway.stream.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Custom Gateway is OpenAI-compatible. Append:

```js
export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096, baseUrl } = config;
  if (!baseUrl) throw new Error("Custom Gateway base URL not configured");
  const url = baseUrl.endsWith("/") ? baseUrl + "chat/completions" : baseUrl + "/chat/completions";
  const body = {
    model,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Custom Gateway error: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          const t = `🧠 ${delta.reasoning_content}`;
          full += t; onChunk(t);
        }
        if (delta?.content) { full += delta.content; onChunk(delta.content); }
      } catch { /* ignore */ }
    }
  }
  return full;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lib/providers/custom-gateway.stream.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/custom-gateway.js tests/lib/providers/custom-gateway.stream.test.js
git commit -m "feat(providers): Custom Gateway streaming with reasoning_content"
```

---

## Task 4: Anthropic provider streaming

**Files:**
- Modify: `lib/providers/anthropic.js`
- Create: `tests/lib/providers/anthropic.stream.test.js`

**Interfaces:**
- Produces: `generateContentStream(prompt, config, onChunk, signal)` → `Promise<string>`. Anthropic SSE uses `event: content_block_delta` with `data: {"delta":{"text":"..."}}` and ends with `event: message_stop`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/providers/anthropic.stream.test.js
import { generateContentStream } from "../../../lib/providers/anthropic.js";

test("parses Anthropic text deltas", async () => {
  const enc = new TextEncoder();
  const sse =
    'event: content_block_delta\ndata: {"delta":{"text":"Hi"}}\n\n' +
    'event: content_block_delta\ndata: {"delta":{"text":" there"}}\n\n' +
    'event: message_stop\ndata: {}\n\n';
  const stream = new ReadableStream({ start(c){ c.enqueue(enc.encode(sse)); c.close(); } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  const full = await generateContentStream("hi", { apiKey: "k", model: "claude-3-5-sonnet-latest" }, (t)=>chunks.push(t), new AbortController().signal);
  expect(full).toBe("Hi there");
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (missing export).

- [ ] **Step 3: Implement** (Anthropic `v1/messages`, `stream:true`):

```js
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096 } = config;
  if (!apiKey) throw new Error("Anthropic API key not configured");
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  };
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(data);
        if (json.type === "content_block_delta" && json.delta?.text) {
          full += json.delta.text; onChunk(json.delta.text);
        }
      } catch { /* ignore */ }
    }
  }
  return full;
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/anthropic.js tests/lib/providers/anthropic.stream.test.js
git commit -m "feat(providers): Anthropic streaming via SSE"
```

---

## Task 5: Provider dispatcher `generateContentStream` + fallback

**Files:**
- Modify: `lib/providers/index.js`
- Create: `tests/lib/providers/index.stream.test.js`

**Interfaces:**
- Produces: `generateContentStream(prompt, config, onChunk, signal)` in index.js that routes to the module via `getProvider(modelName)`; if the module lacks `generateContentStream`, wraps `generateContent` (calls `onChunk(full)` once).

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/providers/index.stream.test.js
import { generateContentStream } from "../../../lib/providers/index.js";

test("routes to provider module by model", async () => {
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "gpt-4o-mini" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(typeof full).toBe("string");
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (no dispatcher export).

- [ ] **Step 3: Implement** — append to `lib/providers/index.js`:

```js
export async function generateContentStream(prompt, config, onChunk, signal) {
  const provider = getProvider(config.model);
  if (typeof provider.generateContentStream === "function") {
    return provider.generateContentStream(prompt, config, onChunk, signal);
  }
  // Fallback: one-shot, single chunk
  const full = await provider.generateContent(prompt, config);
  onChunk(full);
  return full;
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/index.js tests/lib/providers/index.stream.test.js
git commit -m "feat(providers): streaming dispatcher with one-shot fallback"
```

---

## Task 6: `buildChatPrompt` + `PAGE_CONTEXT_MAX_CHARS` in ai-service

**Files:**
- Modify: `lib/ai-service.js`
- Modify: `tests/lib/ai-service.test.js` (add assertions in same commit)

**Interfaces:**
- Produces: `buildChatPrompt({ pageContext, history, question })` → `string`.
  - `history`: `Array<{role:'user'|'assistant', text:string}>`.
  - Returns a single prompt string with SYSTEM + PAGE CONTENT + CONVERSATION sections (per spec §6).
- Produces: `export const PAGE_CONTEXT_MAX_CHARS = 8000;`

- [ ] **Step 1: Write the failing test** (append to existing `tests/lib/ai-service.test.js`):

```js
import { buildChatPrompt, PAGE_CONTEXT_MAX_CHARS } from "../../lib/ai-service.js";

test("buildChatPrompt includes page context and history", () => {
  const prompt = buildChatPrompt({
    pageContext: "PAGE BODY",
    history: [{ role: "user", text: "prev q" }, { role: "assistant", text: "prev a" }],
    question: "new q",
  });
  expect(prompt).toContain("PAGE CONTENT:");
  expect(prompt).toContain("PAGE BODY");
  expect(prompt).toContain("[User]: prev q");
  expect(prompt).toContain("[Assistant]: prev a");
  expect(prompt).toContain("[User]: new q");
});

test("PAGE_CONTEXT_MAX_CHARS is 8000", () => {
  expect(PAGE_CONTEXT_MAX_CHARS).toBe(8000);
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (export missing).

- [ ] **Step 3: Implement** — append to `lib/ai-service.js`:

```js
export const PAGE_CONTEXT_MAX_CHARS = 8000;

export function buildChatPrompt({ pageContext = "", history = [], question = "" }) {
  const context = pageContext.slice(0, PAGE_CONTEXT_MAX_CHARS);
  const convo = history
    .map((m) => `[${m.role === "user" ? "User" : "Assistant"}]: ${m.text}`)
    .join("\n");
  return [
    "SYSTEM: You are Omni AI, a helpful assistant answering questions about the web page the user is viewing.",
    "Use the page content as context. If the page does not contain the answer, say so.",
    "Answer in the user's language when detectable, otherwise English.",
    "",
    "PAGE CONTENT:",
    context,
    "",
    "CONVERSATION:",
    convo,
    `[User]: ${question}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lib/ai-service.test.js`
Expected: PASS (existing 23 + 2 new = 25).

- [ ] **Step 5: Commit**

```bash
git add lib/ai-service.js tests/lib/ai-service.test.js
git commit -m "feat(ai-service): buildChatPrompt + PAGE_CONTEXT_MAX_CHARS"
```

---

## Task 7: Service Worker Port handler (`onConnect("omni-chat")`)

**Files:**
- Modify: `background/service-worker.js` (import `generateContentStream`; add listener)
- Modify: `lib/storage.js` is already imported (`getApiKey`, `getApiModel`).

**Interfaces:**
- Consumes: `generateContentStream` from `../lib/providers/index.js`.
- Consumes: existing `getApiKey(keyName)` and `getApiModel()` from `../lib/storage.js`.
- Produces: a Port listener that, on `CHAT_STREAM` message `{ type, prompt }`, resolves config from storage and streams back `{type:"chunk",text}` / `{type:"done",full}` / `{type:"error",message}`. On `disconnect`, aborts.

**Refinement note (spec §4):** per the agreed adjustment, the Sidebar sends only `{type:"CHAT_STREAM", prompt}`; the SW resolves `apiKey`+`model` from storage itself (same as `QUICK_ACTION`), so secrets are never sent over the Port.

- [ ] **Step 1: Write the failing test**

Add to a new `tests/background/service-worker.stream.test.js` (or extend existing SW test if present). Mock `chrome.runtime.onConnect` + `chrome.storage.local.get`:

```js
// minimal: assert generateContentStream is wired when a CHAT_STREAM arrives
// Use jest-chrome runtime.connect mock and a spy on generateContentStream.
test("onConnect omni-chat streams chunks back", async () => {
  const { generateContentStream } = require("../../../lib/providers/index.js");
  jest.spyOn(require("../../../lib/providers/index.js"), "generateContentStream")
    .mockImplementation(async (prompt, cfg, onChunk) => { onChunk("hi"); return "hi"; });
  // import SW after spies set (module side-effect registers listener)
  require("../../../background/service-worker.js");
  // drive the listener via jest-chrome's captured onConnect
  const port = { name: "omni-chat", onMessage: { addListener(){} }, onDisconnect: { addListener(){} }, postMessage: jest.fn() };
  chrome.runtime.onConnect.callListeners(port);
  // simulate CHAT_STREAM message
  // (port.onMessage.addListener was registered; invoke captured handler)
  // assert postMessage called with {type:"done", full:"hi"}
});
```

> If the SW module side-effects make this awkward, implement a thin `handleChatPort(port)` exported function and test that directly instead of the module-load side effect. Keep the test deterministic.

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement** — in `background/service-worker.js`:

Add import near top:
```js
import { generateContentStream } from "../lib/providers/index.js";
```

Add after the existing `chrome.runtime.onMessage` listener (before context menus or at end of listeners section):
```js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "omni-chat") return;
  const controller = new AbortController();
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== "CHAT_STREAM") return;
    try {
      const [apiKey, model] = await Promise.all([
        getApiKey("geminiApiKey").then((k) => k || getStoredApiKey()),
        getApiModel(),
      ]);
      const full = await generateContentStream(
        msg.prompt,
        { apiKey, model: model || "gemini-1.5-flash" },
        (text) => port.postMessage({ type: "chunk", text }),
        controller.signal,
      );
      port.postMessage({ type: "done", full });
    } catch (err) {
      if (!controller.signal.aborted) {
        port.postMessage({ type: "error", message: String(err?.message || err) });
      }
    }
  });
  port.onDisconnect.addListener(() => controller.abort());
});
```

> Note: `getStoredApiKey` already imported (line 2). For non-Gemini default models the apiKey must match the model's provider; for v1 the SW resolves the configured `apiModel` and its key via the same logic `generateContent` uses. Simplest correct v1: reuse the existing `getApiKey` resolution by calling `generateContent`'s internal key logic — extract a small `resolveConfig()` helper in `service-worker.js` that mirrors `ai-service.js` (model → providerId → keySetting). Implement `resolveConfig()` and use it for both `QUICK_ACTION` parity and the chat port. Keep it minimal.

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Run lint** `npx eslint background/service-worker.js` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add background/service-worker.js tests/background/service-worker.stream.test.js
git commit -m "feat(sw): omni-chat port streams responses, resolves config from storage"
```

---

## Task 8: i18n keys (10 locales)

**Files:**
- Modify: `_locales/en/messages.json` (+ 9 other locale files)

**Interfaces:**
- Produces: keys consumed by `sidepanel.js` / `sidepanel.html`:
  `sidepanel_tab_tools`, `sidepanel_tab_chat`, `sidepanel_chat_placeholder`,
  `sidepanel_chat_send`, `sidepanel_chat_stop`, `sidepanel_chat_new`,
  `sidepanel_chat_context`, `sidepanel_chat_empty`, `sidepanel_chat_error`.

- [ ] **Step 1: Add en keys** — edit `_locales/en/messages.json`, add inside the root object:
```json
  "sidepanel_tab_tools": { "message": "Tools" },
  "sidepanel_tab_chat": { "message": "Chat" },
  "sidepanel_chat_placeholder": { "message": "Ask about this page…" },
  "sidepanel_chat_send": { "message": "Send" },
  "sidepanel_chat_stop": { "message": "Stop" },
  "sidepanel_chat_new": { "message": "New chat" },
  "sidepanel_chat_context": { "message": "Context: %s" },
  "sidepanel_chat_empty": { "message": "Ask a question about the page you're viewing." },
  "sidepanel_chat_error": { "message": "Chat failed: %s" }
```
(insert before the final `}`; keep JSON valid — add trailing comma to the preceding entry.)

- [ ] **Step 2: Add same keys to the other 9 locales** (`vi`, `ja`, `ko`, `zh_CN`, `zh_TW`, `fr`, `de`, `es`, `pt_BR` — whatever exists under `_locales/`). For each, set the `message` to the English text (echo) so the key exists and the build does not break; native translations can follow later in a separate pass. Use a quick script:
```bash
for d in _locales/*/; do
  [ "$d" = "_locales/en/" ] && continue
  node -e "/* merge the 9 keys from en into \$d/messages.json, echoing en message */"
done
```
(or edit each file directly if the locale set is small). Verify every locale file still parses: `node -e "require('./_locales/en/messages.json')"`.

- [ ] **Step 3: Commit**

```bash
git add _locales/
git commit -m "feat(i18n): add Sidebar Chat keys to all locales"
```

---

## Task 9: Sidebar HTML — tab nav + chat panel

**Files:**
- Modify: `sidepanel/sidepanel.html`

**Interfaces:**
- Produces: DOM ids/classes consumed by `sidepanel.js` (Task 11):
  `.sidepanel-tabs`, `[data-tab="tools"]`, `[data-tab="chat"]`, `#toolsPanel`,
  `#chatPanel`, `#chatContext`, `#chatMessages`, `#chatInput`, `#chatSend`,
  `#chatStop`, `#chatNew`.

- [ ] **Step 1: Add tab nav + wrap existing main in `#toolsPanel`, add `#chatPanel`** — edit `sidepanel.html`:

Insert after `<div class="sidepanel-container">` opening (after header, before existing `<main class="page-tools">`):

```html
<nav class="sidepanel-tabs">
  <button class="tab-btn active" data-tab="tools">__MSG_sidepanel_tab_tools__</button>
  <button class="tab-btn" data-tab="chat">__MSG_sidepanel_tab_chat__</button>
</nav>
```

Wrap the existing `<main class="page-tools">…</main>` content by adding `id="toolsPanel"` to that `<main>` (change `<main class="page-tools">` → `<main class="page-tools" id="toolsPanel">`).

After `</main>` (before `<footer>`), add:
```html
<section id="chatPanel" class="chat-panel hidden">
  <div id="chatContext" class="chat-context"></div>
  <div id="chatMessages" class="chat-messages"></div>
  <div id="chatEmpty" class="chat-empty">__MSG_sidepanel_chat_empty__</div>
  <div class="chat-input-row">
    <textarea id="chatInput" rows="2" placeholder="__MSG_sidepanel_chat_placeholder__"></textarea>
    <button id="chatSend" class="ds-btn-primary">__MSG_sidepanel_chat_send__</button>
    <button id="chatStop" class="ds-btn-ghost hidden">__MSG_sidepanel_chat_stop__</button>
  </div>
  <button id="chatNew" class="ds-btn-ghost chat-new">__MSG_sidepanel_chat_new__</button>
</section>
```

- [ ] **Step 2: Validate HTML** — open in a quick check or rely on Playwright later. Ensure no unclosed tags (mirror the settings.html fix discipline from Task 6 memory: verify DOM node count via jsdom if a parser is handy).

- [ ] **Step 3: Commit**

```bash
git add sidepanel/sidepanel.html
git commit -m "feat(sidepanel): add tab nav and Chat panel markup"
```

---

## Task 10: Sidebar CSS — tabs + chat

**Files:**
- Modify: `sidepanel/sidepanel.css`

**Interfaces:**
- Produces: styles for `.sidepanel-tabs`, `.tab-btn`, `.tab-btn.active`,
  `.chat-panel`, `.chat-messages`, `.chat-bubble`, `.chat-bubble.user`,
  `.chat-bubble.assistant`, `.chat-context`, `.chat-input-row`, `.chat-empty`,
  `.chat-new`. Must use `--omni-*` tokens only.

- [ ] **Step 1: Append styles** to `sidepanel/sidepanel.css`:

```css
.sidepanel-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--omni-border, rgba(128,128,128,0.2));
}
.tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--omni-text-muted, #888);
  padding: 8px;
  cursor: pointer;
  font-weight: 600;
  border-bottom: 2px solid transparent;
}
.tab-btn.active {
  color: var(--omni-accent, #4f7cff);
  border-bottom-color: var(--omni-accent, #4f7cff);
}
.chat-panel { display: flex; flex-direction: column; height: 100%; padding: 12px; gap: 8px; }
.chat-context { font-size: 12px; color: var(--omni-text-muted, #888); }
.chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.chat-empty { color: var(--omni-text-muted, #888); font-size: 13px; }
.chat-bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
.chat-bubble.user { align-self: flex-end; background: var(--omni-accent, #4f7cff); color: #fff; }
.chat-bubble.assistant { align-self: flex-start; background: var(--omni-glass-bg, rgba(128,128,128,0.12)); }
.chat-input-row { display: flex; gap: 6px; align-items: flex-end; }
.chat-input-row textarea { flex: 1; resize: none; background: var(--omni-glass-bg, rgba(128,128,128,0.12)); color: var(--omni-text, #111); border: 1px solid var(--omni-border, rgba(128,128,128,0.2)); border-radius: 8px; padding: 8px; }
.chat-new { align-self: flex-start; }
```

- [ ] **Step 2: Commit**

```bash
git add sidepanel/sidepanel.css
git commit -m "feat(sidepanel): chat + tab styles using design tokens"
```

---

## Task 11: Sidebar JS — tab switch, page context, chat/stream/port

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `tests/sidepanel/sidepanel.test.js` (create if absent)

**Interfaces:**
- Consumes: `buildChatPrompt`, `PAGE_CONTEXT_MAX_CHARS` from `../lib/ai-service.js`.
- Consumes: `GET_PAGE_CONTENT` (existing content-script handler) via `chrome.tabs.sendMessage(..., {frameId:0})`.
- Produces: DOM behavior for the ids from Task 9; a `chrome.runtime.connect({name:"omni-chat"})` Port; `chatHistory` array; `pageCache` Map.

- [ ] **Step 1: Write the failing test** (`tests/sidepanel/sidepanel.test.js`):

```js
import { switchTab, appendChunk, stopChat } from "../../sidepanel/sidepanel.js";
// jsdom setup: a DOM with #toolsPanel, #chatPanel, [data-tab]
test("switchTab toggles panels", () => {
  document.body.innerHTML = `
    <button data-tab="tools"></button><button data-tab="chat"></button>
    <main id="toolsPanel"></main><section id="chatPanel" class="hidden"></section>`;
  switchTab("chat");
  expect(document.getElementById("chatPanel").classList.contains("hidden")).toBe(false);
  expect(document.getElementById("toolsPanel").classList.contains("hidden")).toBe(true);
});

test("appendChunk adds text to last assistant bubble", () => {
  document.body.innerHTML = `<div id="chatMessages"><div class="chat-bubble assistant"></div></div>`;
  appendChunk("Hello ");
  appendChunk("world");
  expect(document.querySelector(".chat-bubble.assistant").textContent).toBe("Hello world");
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (functions not exported).

- [ ] **Step 3: Implement** — extend `sidepanel.js`:

Add imports:
```js
import { buildChatPrompt, PAGE_CONTEXT_MAX_CHARS } from "../lib/ai-service.js";
```

Add state + functions (keep existing `init()`/`runPageAction` intact):
```js
const chat = {
  port: null,
  history: [],
  isStreaming: false,
  pageCache: new Map(),
};

export function switchTab(name) {
  const tools = document.getElementById("toolsPanel");
  const chatP = document.getElementById("chatPanel");
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  tools?.classList.toggle("hidden", name !== "tools");
  chatP?.classList.toggle("hidden", name !== "chat");
  chrome.storage.session.set({ omni_sidepanel_tab: name });
  if (name === "chat") ensurePageContext();
}

export function appendChunk(text) {
  const messages = document.getElementById("chatMessages");
  const empty = document.getElementById("chatEmpty");
  if (empty) empty.classList.add("hidden");
  let bubble = messages.querySelector(".chat-bubble.assistant:last-child");
  if (!bubble || bubble.dataset.done === "1") {
    bubble = document.createElement("div");
    bubble.className = "chat-bubble assistant";
    messages.appendChild(bubble);
  }
  bubble.textContent += text;
}

async function ensurePageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (chat.pageCache.has(tab.id)) {
    renderContext(tab.id);
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" }, { frameId: 0 });
    if (resp?.success && resp.content) {
      chat.pageCache.set(tab.id, { text: resp.content.slice(0, PAGE_CONTEXT_MAX_CHARS), title: resp.title || tab.title || "" });
      renderContext(tab.id);
    }
  } catch { /* page not readable; chat still allowed without context */ }
}

function renderContext(tabId) {
  const el = document.getElementById("chatContext");
  const cached = chat.pageCache.get(tabId);
  if (el && cached) el.textContent = i18n.getMessage("sidepanel_chat_context", cached.title);
}

export function stopChat() {
  if (chat.port) { chat.port.disconnect(); chat.port = null; }
  chat.isStreaming = false;
  setChatControls(false);
  const last = document.querySelector(".chat-bubble.assistant:last-child");
  if (last) last.dataset.done = "1";
}

function setChatControls(streaming) {
  document.getElementById("chatSend")?.toggleAttribute("disabled", streaming);
  document.getElementById("chatInput")?.toggleAttribute("disabled", streaming);
  document.getElementById("chatStop")?.classList.toggle("hidden", !streaming);
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const question = input?.value.trim();
  if (!question || chat.isStreaming) return;
  // user bubble
  const messages = document.getElementById("chatMessages");
  const ub = document.createElement("div");
  ub.className = "chat-bubble user";
  ub.textContent = question;
  messages.appendChild(ub);
  chat.history.push({ role: "user", text: question });
  input.value = "";

  const page = [...chat.pageCache.values()].pop();
  const prompt = buildChatPrompt({ pageContext: page?.text || "", history: chat.history, question });

  const assistantText = { value: "" };
  const port = chrome.runtime.connect({ name: "omni-chat" });
  chat.port = port;
  chat.isStreaming = true;
  setChatControls(true);

  port.onMessage.addListener((msg) => {
    if (msg.type === "chunk") {
      assistantText.value += msg.text;
      appendChunk(msg.text);
    } else if (msg.type === "done") {
      chat.history.push({ role: "assistant", text: msg.full || assistantText.value });
      stopChat();
    } else if (msg.type === "error") {
      appendChunk("\n" + i18n.getMessage("sidepanel_chat_error", msg.message));
      stopChat();
    }
  });
  port.postMessage({ type: "CHAT_STREAM", prompt });
}

function newChat() {
  chat.history = [];
  chat.port?.disconnect();
  chat.port = null;
  chat.isStreaming = false;
  document.getElementById("chatMessages").innerHTML = "";
  document.getElementById("chatEmpty")?.classList.remove("hidden");
  setChatControls(false);
}
```

Wire up listeners inside `setupEventListeners()` (add, do not replace existing):
```js
document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
document.getElementById("chatSend")?.addEventListener("click", sendChatMessage);
document.getElementById("chatStop")?.addEventListener("click", stopChat);
document.getElementById("chatNew")?.addEventListener("click", newChat);
const chatInput = document.getElementById("chatInput");
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});
chrome.tabs.onActivated.addListener(() => { if (!document.getElementById("chatPanel").classList.contains("hidden")) ensurePageContext(); });
// restore last tab on load
chrome.storage.session.get("omni_sidepanel_tab").then((s) => { if (s.omni_sidepanel_tab) switchTab(s.omni_sidepanel_tab); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sidepanel/sidepanel.test.js`
Expected: PASS.

- [ ] **Step 5: Run full verify**

Run: `npm run verify`
Expected: exit 0, all suites green (jest + eslint + tsc).

- [ ] **Step 6: Commit**

```bash
git add sidepanel/sidepanel.js tests/sidepanel/sidepanel.test.js
git commit -m "feat(sidepanel): tab switch, page context, streaming chat over Port"
```

---

## Task 12: E2E smoke + full verification

**Files:**
- Modify: `e2e/smoke.spec.js` (extend existing Side Panel spec)
- Run: `npm run verify` + `npx playwright test`

**Interfaces:**
- Consumes: existing `e2e/extension.fixtures.js` Side Panel opener.

- [ ] **Step 1: Extend e2e smoke** — add a test that opens the Side Panel, clicks the Chat tab, asserts `#chatPanel` is visible and `#toolsPanel` is hidden. Do NOT assert real streaming (network/mock-dependent; covered by unit tests).

```js
test("side panel chat tab renders", async ({ sidePanelPage }) => {
  await sidePanelPage.click('[data-tab="chat"]');
  await expect(sidePanelPage.locator("#chatPanel")).toBeVisible();
  await expect(sidePanelPage.locator("#toolsPanel")).toHaveClass(/hidden/);
});
```

- [ ] **Step 2: Run e2e**

Run: `npx playwright test`
Expected: green (existing 3 + new 1).

- [ ] **Step 3: Run full verify**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 4: Manual smoke (load unpacked)**
- [ ] Open Side Panel via toolbar icon; switch to Chat; on a real article page, ask a question; tokens stream into the assistant bubble; Stop aborts mid-stream; New chat clears; Copy (if added) works; Tools tab still works (summarize/translate/explain).
- [ ] Service worker console clean after idle.

- [ ] **Step 5: Commit e2e**

```bash
git add e2e/smoke.spec.js
git commit -m "test(e2e): side panel chat tab visibility smoke"
```

---

## Self-Review Notes (run by planner)

1. **Spec coverage:** §3 providers → Tasks 1–5 ✓. §4 SW port → Task 7 ✓. §5 page context → Task 11 (`ensurePageContext`) ✓. §6 buildChatPrompt → Task 6 ✓. §7 UI → Tasks 9–10 ✓. §8 logic → Task 11 ✓. §9 i18n → Task 8 ✓. §10 files → all touched ✓. §11 testing → Tasks 1–5,6,11,12 ✓. §12 risks → token growth accepted (v1), truncation constant `PAGE_CONTEXT_MAX_CHARS` ✓, reasoning_content marker `🧠 ` decided in Task 3 ✓.
2. **Placeholder scan:** No TBD/TODO. Task 7 notes a possible `resolveConfig()` extraction — that is an explicit, bounded implementation instruction, not a placeholder.
3. **Type consistency:** `generateContentStream(prompt, config, onChunk, signal)` signature is identical across Tasks 1–5 and the dispatcher (Task 5). Sidebar calls `chrome.runtime.connect({name:"omni-chat"})` and posts `{type:"CHAT_STREAM", prompt}`; SW listens for `name==="omni-chat"` and handles `msg.type==="CHAT_STREAM"` ✓. `buildChatPrompt({pageContext, history, question})` matches Task 6 impl and Task 11 call ✓. `appendChunk(text)` exported and used in Task 11 + tested in Task 11 ✓. i18n keys in Task 8 match those referenced in Tasks 9–11 ✓.
