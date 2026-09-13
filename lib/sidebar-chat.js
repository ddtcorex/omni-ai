/**
 * Sidebar Chat helpers.
 * Shared between the service worker (streaming dispatch) and the popup sidebar UI.
 */

export const PAGE_CONTEXT_MAX_CHARS = 8000;

const SYSTEM_INSTRUCTION =
  "You are Omni AI, a helpful assistant embedded in the user's browser. " +
  "When the user's current page context is provided, use it to give relevant answers " +
  "about the page they are viewing. Be concise and clear.";

/**
 * Build a single prompt string from page context, prior chat history, and the
 * latest user message. Page context is truncated to PAGE_CONTEXT_MAX_CHARS to
 * avoid blowing past provider token limits.
 *
 * @param {Object} input
 * @param {string} input.userMessage - the latest user message
 * @param {string} [input.pageContext] - title/url/selected text of the page
 * @param {Array<{role:"user"|"assistant", content:string}>} [input.history]
 * @returns {string}
 */
export function buildChatPrompt({ userMessage, pageContext = "", history = [] }) {
  const parts = [];

  parts.push(SYSTEM_INSTRUCTION);

  if (pageContext && pageContext.trim()) {
    let ctx = pageContext;
    if (ctx.length > PAGE_CONTEXT_MAX_CHARS) {
      ctx = ctx.slice(0, PAGE_CONTEXT_MAX_CHARS) + "\n…[page context truncated]";
    }
    parts.push(`\nCurrent page context:\n${ctx}`);
  }

  if (Array.isArray(history) && history.length) {
    parts.push("\nConversation so far:");
    for (const turn of history) {
      const speaker = turn.role === "assistant" ? "Assistant" : "User";
      parts.push(`${speaker}: ${turn.content}`);
    }
  }

  parts.push(`\nUser: ${userMessage}`);
  return parts.join("\n");
}

/**
 * Build a short page-context string (title/url/selected text) for the chat.
 * @param {{title?:string, url?:string, text?:string}} page
 * @returns {string}
 */
export function buildPageContextString(page = {}) {
  const lines = [];
  if (page.title) lines.push(`Title: ${page.title}`);
  if (page.url) lines.push(`URL: ${page.url}`);
  if (page.text) lines.push(`\nSelected text:\n${page.text}`);
  return lines.join("\n");
}
