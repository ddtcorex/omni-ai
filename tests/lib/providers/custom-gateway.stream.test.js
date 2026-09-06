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

test("throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "boom" } }),
  });
  await expect(
    generateContentStream(
      "hi",
      { apiKey: "k", model: "m", baseUrl: "https://gw/v1/chat/completions" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("boom");
});

test("aborts mid-stream", async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(sse({ choices: [{ delta: { content: "a" } }] })));
      controller.enqueue(enc.encode(sse({ choices: [{ delta: { content: "b" } }] })));
      controller.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const ac = new AbortController();
  const p = generateContentStream(
    "hi",
    { apiKey: "k", model: "m", baseUrl: "https://gw/v1/chat/completions" },
    () => ac.abort(),
    ac.signal,
  );
  await expect(p).rejects.toThrow("Aborted");
});

test("stream error falls back when json parse fails", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("bad json");
    },
  });
  await expect(
    generateContentStream(
      "hi",
      { apiKey: "k", model: "m", baseUrl: "https://gw/v1/chat/completions" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("Custom Gateway error: 502");
});
