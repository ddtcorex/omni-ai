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

test("throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: "bad request" } }),
  });
  await expect(
    generateContentStream(
      "hi",
      { apiKey: "k", model: "claude-3-5-sonnet-latest" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("bad request");
});

test("aborts mid-stream", async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sse("content_block_delta", { text: "a" })));
      c.enqueue(enc.encode(sse("content_block_delta", { text: "b" })));
      c.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const ac = new AbortController();
  const p = generateContentStream(
    "hi",
    { apiKey: "k", model: "claude-3-5-sonnet-latest" },
    () => ac.abort(),
    ac.signal,
  );
  await expect(p).rejects.toThrow("Aborted");
});

test("stream error falls back when json parse fails", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error("bad json");
    },
  });
  await expect(
    generateContentStream(
      "hi",
      { apiKey: "k", model: "claude-3-5-sonnet-latest" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("Anthropic API error: 500");
});
