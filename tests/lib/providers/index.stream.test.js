import { generateContentStream } from "../../../lib/providers/index.js";

jest.mock(
  "../../../lib/providers/gemini.js",
  () => ({
    generateContent: async (prompt) => `gemini-fallback:${prompt}`,
  }),
  { virtual: false },
);

jest.mock(
  "../../../lib/providers/custom-gateway.js",
  () => ({
    generateContentStream: async (prompt, config, onChunk) => {
      onChunk(`custom-gateway:${prompt}`);
      return `custom-gateway:${prompt}`;
    },
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

test("uses config.provider to route correctly even when the model id isn't in the registry (Custom Gateway with a user-typed upstream model name)", async () => {
  // Regression: getChatConfig() overwrites config.model with the raw
  // customGatewayModelName the user typed (e.g. "gpt-4o-mini"), which never
  // matches any AI_PROVIDERS models[].id. Without an explicit provider hint,
  // getProvider(config.model) silently falls back to Gemini -- so the
  // Custom Gateway API key gets sent to Google's real endpoint, which
  // rejects it with "API key not valid. Please pass a valid API key."
  const chunks = [];
  const full = await generateContentStream(
    "hi",
    { apiKey: "k", model: "gpt-4o-mini", provider: "customGateway" },
    (t) => chunks.push(t),
    new AbortController().signal,
  );
  expect(full).toBe("custom-gateway:hi");
  expect(chunks).toEqual(["custom-gateway:hi"]);
});
