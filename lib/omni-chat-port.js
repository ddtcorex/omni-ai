/**
 * Omni Chat streaming port handler.
 * Wires a chrome.runtime Port (named "omni-chat") to the streaming provider.
 * Pure logic with injected dependencies so it can be unit-tested without a browser.
 */

import { buildChatPrompt } from "./sidebar-chat.js";

/**
 * @param {Object} deps
 * @param {(prompt:string, config:object, onChunk:(t:string)=>void, signal:AbortSignal)=>Promise<string>} deps.generateContentStream
 * @param {(model?:string, temperature?:number)=>Promise<object>} deps.getChatConfig - resolves provider config (apiKey, model, ...)
 * @returns {(port:chrome.runtime.Port)=>Promise<void>}
 */
export function createOmniChatHandler({ generateContentStream, getChatConfig }) {
  return async function handlePort(port) {
    const controller = new AbortController();

    const onMessage = async (msg) => {
      if (!msg || msg.type !== "chat") return;
      try {
        const config = await getChatConfig(msg.model, msg.temperature);
        const prompt = buildChatPrompt({
          userMessage: msg.message,
          pageContext: msg.pageContext,
          history: msg.history || [],
        });
        const full = await generateContentStream(
          prompt,
          config,
          (text) => port.postMessage({ type: "chunk", text }),
          controller.signal,
        );
        port.postMessage({ type: "done", text: full });
      } catch (error) {
        if (error && error.name === "AbortError") return;
        port.postMessage({ type: "error", error: error?.message || String(error) });
      }
    };

    const onDisconnect = () => controller.abort();

    if (typeof port.onMessage?.addListener === "function") {
      port.onMessage.addListener(onMessage);
    }
    if (typeof port.onDisconnect?.addListener === "function") {
      port.onDisconnect.addListener(onDisconnect);
    }
  };
}
