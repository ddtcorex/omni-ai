import { generateContentStream } from "../../../lib/providers/custom-gateway.js";

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function mockFetchStream(chunks) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
}

test("streams content and reasoning_content", async () => {
  mockFetchStream([
    sse({ choices: [{ delta: { reasoning_content: "thinking" } }] }),
    sse({ choices: [{ delta: { content: "answer" } }] }),
    "data: [DONE]\n\n",
  ]);
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "deepseek-chat", baseUrl: "https://gw/v1/chat/completions" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(chunks.some((c) => c.includes("thinking"))).toBe(true);
  expect(chunks.some((c) => c.includes("answer"))).toBe(true);
  expect(full).toContain("thinking");
  expect(full).toContain("answer");
});

test("falls back when no reasoning/content", async () => {
  mockFetchStream([sse({ choices: [{ delta: {} }] }), "data: [DONE]\n\n"]);
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "m", baseUrl: "https://gw/v1/chat/completions" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("");
});
