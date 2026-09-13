import { generateContentStream } from "../../../lib/providers/gemini.js";

function geminiSse(text) {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
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

test("parses Gemini SSE text parts", async () => {
  mockFetchStream([geminiSse("Hello"), geminiSse(" Gemini")]);
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "gemini-1.5-flash" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("Hello Gemini");
  expect(chunks).toEqual(["Hello", " Gemini"]);
});

test("abort stops reading", async () => {
  const controller = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(geminiSse("partial")));
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  const p = generateContentStream(
    "hi",
    { apiKey: "k", model: "gemini-1.5-flash" },
    (t) => chunks.push(t),
    controller.signal,
  );
  await new Promise((r) => setTimeout(r, 20));
  controller.abort();
  await expect(p).rejects.toBeDefined();
  expect(chunks).toEqual(["partial"]);
});

test("throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: "forbidden" } }),
  });
  await expect(
    generateContentStream(
      "hi",
      { apiKey: "k", model: "gemini-1.5-flash" },
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("forbidden");
});

test("abort via signal listener cancels reader", async () => {
  const controller = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(geminiSse("a")));
      c.enqueue(enc.encode(geminiSse("b")));
      c.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const p = generateContentStream(
    "hi",
    { apiKey: "k", model: "gemini-1.5-flash" },
    () => controller.abort(),
    controller.signal,
  );
  await expect(p).rejects.toThrow("Aborted");
});
