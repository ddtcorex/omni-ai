import { generateContentStream } from "../../../lib/providers/anthropic.js";

function sse(type, delta) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, delta })}\n\n`;
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

test("parses Anthropic text deltas", async () => {
  mockFetchStream([
    sse("content_block_delta", { text: "Hi" }),
    sse("content_block_delta", { text: " there" }),
    sse("message_stop", {}),
  ]);
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "claude-3-5-sonnet-latest" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("Hi there");
  expect(chunks).toEqual(["Hi", " there"]);
});

test("ignores non-delta events", async () => {
  mockFetchStream([
    sse("message_start", {}),
    sse("content_block_start", {}),
    sse("content_block_delta", { text: "ok" }),
    sse("message_stop", {}),
  ]);
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "claude-3-5-sonnet-latest" },
    () => {},
    new AbortController().signal,
  );
  expect(full).toBe("ok");
});
