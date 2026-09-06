import { generateContentStream } from "../../../lib/providers/index.js";

jest.mock(
  "../../../lib/providers/gemini.js",
  () => ({
    generateContent: async (prompt) => `gemini-fallback:${prompt}`,
  }),
  { virtual: false },
);

function sseOpenAI(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

test("routes to provider module by model and streams", async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sseOpenAI("hello")));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "openai-gpt-4o-mini" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("hello");
  expect(chunks).toEqual(["hello"]);
});

test("falls back to one-shot generateContent when provider lacks stream", async () => {
  // unknown model => default provider (Gemini, mocked to omit generateContentStream)
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "does-not-exist-model" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("gemini-fallback:hi");
  expect(chunks).toEqual(["gemini-fallback:hi"]);
});
