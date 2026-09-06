import { createOmniChatHandler } from "../../lib/omni-chat-port.js";

function fakePort() {
  const messages = [];
  const listeners = [];
  const disconnectListeners = [];
  return {
    name: "omni-chat",
    postMessage: (m) => messages.push(m),
    onMessage: { addListener: (fn) => listeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    _messages: messages,
    _listeners: listeners,
    _disconnectListeners: disconnectListeners,
    emit(msg) {
      listeners.forEach((l) => l(msg));
    },
    disconnect() {
      disconnectListeners.forEach((l) => l());
    },
  };
}

const fakeStreaming = (full, chunks) => async (prompt, config, onChunk, signal) => {
  for (const c of chunks) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onChunk(c);
  }
  return full;
};

const fakeConfig = async () => ({ apiKey: "k", model: "openai-gpt-4o-mini" });

test("streams chunks then done", async () => {
  const port = fakePort();
  const handler = createOmniChatHandler({
    generateContentStream: fakeStreaming("Hello world", ["Hello", " world"]),
    getChatConfig: fakeConfig,
  });
  await handler(port);
  port.emit({ type: "chat", message: "hi", pageContext: "ctx", history: [] });
  // allow async listener to resolve
  await new Promise((r) => setTimeout(r, 10));
  const types = port._messages.map((m) => m.type);
  expect(types).toContain("chunk");
  expect(types).toContain("done");
  expect(port._messages.find((m) => m.type === "done").text).toBe("Hello world");
});

test("posts error on failure", async () => {
  const port = fakePort();
  const handler = createOmniChatHandler({
    generateContentStream: async () => {
      throw new Error("boom");
    },
    getChatConfig: fakeConfig,
  });
  await handler(port);
  port.emit({ type: "chat", message: "hi" });
  await new Promise((r) => setTimeout(r, 10));
  const err = port._messages.find((m) => m.type === "error");
  expect(err).toBeDefined();
  expect(err.error).toBe("boom");
});

test("aborts streaming on disconnect", async () => {
  let aborted = false;
  const streaming = async (prompt, config, onChunk, signal) => {
    await new Promise((r) => setTimeout(r, 30));
    if (signal?.aborted) {
      aborted = true;
      throw new DOMException("Aborted", "AbortError");
    }
    return "x";
  };
  const port = fakePort();
  const handler = createOmniChatHandler({ generateContentStream: streaming, getChatConfig: fakeConfig });
  await handler(port);
  port.emit({ type: "chat", message: "hi" });
  port.disconnect();
  await new Promise((r) => setTimeout(r, 50));
  expect(aborted).toBe(true);
});
