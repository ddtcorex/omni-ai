import { generateContentStream } from "../../../lib/providers/openai.js";

function sseChunk(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function mockFetchStream(chunks) {
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
}

test("streams deltas and returns full text", async () => {
  mockFetchStream([sseChunk("Hello"), sseChunk(" world")]);
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "gpt-4o-mini" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(chunks).toEqual(["Hello", " world"]);
  expect(full).toBe("Hello world");
});

test("abort stops reading", async () => {
  const controller = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sseChunk("partial")));
      // never close; we abort after the first chunk is delivered
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  const p = generateContentStream(
    "hi",
    { apiKey: "k", model: "gpt-4o-mini" },
    (t) => chunks.push(t),
    controller.signal,
  );
  // let the first chunk flush into onChunk before aborting
  await new Promise((r) => setTimeout(r, 20));
  controller.abort();
  await expect(p).rejects.toBeDefined();
  expect(chunks).toEqual(["partial"]);
});

test("handles [DONE] sentinel", async () => {
  mockFetchStream([sseChunk("done"), "data: [DONE]\n\n"]);
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "gpt-4o-mini" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("done");
});

test("throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "unauthorized" } }),
  });
  await expect(
    generateContentStream(
      "hi",
      { apiKey: "k", model: "gpt-4o-mini" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("unauthorized");
});

test("abort via signal listener cancels reader", async () => {
  const controller = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sseChunk("a")));
      c.enqueue(enc.encode(sseChunk("b")));
      c.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const p = generateContentStream(
    "hi",
    { apiKey: "k", model: "gpt-4o-mini" },
    () => controller.abort(),
    controller.signal,
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
      { apiKey: "k", model: "gpt-4o-mini" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("OpenAI API error: 500");
});
