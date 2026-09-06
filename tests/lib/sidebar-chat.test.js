import { buildChatPrompt, PAGE_CONTEXT_MAX_CHARS } from "../../lib/sidebar-chat.js";

test("includes system instruction and page context when present", () => {
  const prompt = buildChatPrompt({
    userMessage: "What is this page about?",
    pageContext: "Title: Example\nURL: https://example.com",
    history: [],
  });
  expect(prompt).toContain("You are Omni AI");
  expect(prompt).toContain("https://example.com");
  expect(prompt).toContain("What is this page about?");
});

test("truncates page context to PAGE_CONTEXT_MAX_CHARS", () => {
  const big = "x".repeat(PAGE_CONTEXT_MAX_CHARS + 500);
  const prompt = buildChatPrompt({ userMessage: "hi", pageContext: big, history: [] });
  // The embedded context string (between the label and the user message) must
  // be capped at PAGE_CONTEXT_MAX_CHARS plus a small fixed label/suffix overhead.
  const start = prompt.indexOf("Current page context:") + "Current page context:\n".length;
  const end = prompt.indexOf("\nUser: hi");
  const embedded = prompt.slice(start, end);
  expect(embedded.length).toBeLessThanOrEqual(PAGE_CONTEXT_MAX_CHARS + 60);
  expect(embedded).toContain("[page context truncated]");
});

test("serializes chat history", () => {
  const prompt = buildChatPrompt({
    userMessage: "follow up",
    pageContext: "",
    history: [{ role: "user", content: "first" }, { role: "assistant", content: "reply" }],
  });
  expect(prompt).toContain("User: first");
  expect(prompt).toContain("Assistant: reply");
  expect(prompt).toContain("follow up");
});

test("handles missing page context and history", () => {
  const prompt = buildChatPrompt({ userMessage: "hi" });
  expect(prompt).toContain("hi");
  expect(typeof prompt).toBe("string");
});
