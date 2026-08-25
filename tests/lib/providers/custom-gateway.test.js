/**
 * Characterization tests for the Custom Gateway provider (shipped behavior).
 *
 * Pins: base-URL trailing-slash normalization, content-type-based streaming
 * detection, SSE delta parsing with the [DONE] sentinel, the DeepSeek-style
 * reasoning_content fallback, bare-JSON line tolerance, request body/header
 * mapping, and gateway error propagation.
 *
 * SSE responses are simulated with node:stream/web ReadableStream +
 * node:util Text{En,De}coder because the jsdom test environment does not
 * provide web streams or fetch.
 */
const { ReadableStream: NodeReadableStream } = require("node:stream/web");
const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require("node:util");

function sseResponse(chunks, contentType = "text/event-stream") {
  const encoder = new NodeTextEncoder();
  const stream = new NodeReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return { ok: true, headers: new Map([["content-type", contentType]]), body: stream };
}

// Adapter so the provider's `response.headers.get(...)` works with our Map
// without pulling in undici internals. Captures the Map BEFORE replacing
// headers — spreading inside the getter would see the replacement itself.
function wrapHeaders(res) {
  const map = res.headers;
  res.headers = {
    get: (k) => (k.toLowerCase() === "content-type" ? (map.get("content-type") ?? null) : null),
  };
  return res;
}

describe("Custom Gateway Provider", () => {
  let generateContent;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
    // jsdom shims: the streaming path needs ReadableStream bodies + TextDecoder.
    global.ReadableStream = global.ReadableStream || NodeReadableStream;
    global.TextEncoder = global.TextEncoder || NodeTextEncoder;
    global.TextDecoder = global.TextDecoder || NodeTextDecoder;
    generateContent = require("../../../lib/providers/custom-gateway").generateContent;
  });

  it("throws when baseUrl is missing", async () => {
    await expect(generateContent("hi", { apiKey: "k", model: "m" })).rejects.toThrow(/base url/i);
  });

  it("parses standard SSE deltas and skips the [DONE] sentinel", async () => {
    global.fetch.mockResolvedValue(
      wrapHeaders(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    await expect(
      generateContent("hi", { baseUrl: "https://gw.example/", apiKey: "k", model: "m" }),
    ).resolves.toBe("Hello");
  });

  it("falls back to DeepSeek-style reasoning_content and omits Authorization without apiKey", async () => {
    global.fetch.mockResolvedValue(
      wrapHeaders(sseResponse(['data: {"choices":[{"delta":{"reasoning_content":"abc"}}]}\n\n'])),
    );
    await expect(
      generateContent("hi", { baseUrl: "https://gw.example", model: "deepseek-r" }),
    ).resolves.toBe("abc");
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("handles malformed bare-JSON lines without a data: prefix", async () => {
    global.fetch.mockResolvedValue(
      wrapHeaders(sseResponse(['{"choices":[{"message":{"content":"plain"}}]}\n'])),
    );
    await expect(
      generateContent("hi", { baseUrl: "https://gw.example", model: "m" }),
    ).resolves.toBe("plain");
  });

  it("maps non-streaming message.content and strips the trailing slash from baseUrl", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "answer" } }] }),
    });
    await expect(
      generateContent("hi", { baseUrl: "https://gw.example/", apiKey: "k", model: "gpt-x" }),
    ).resolves.toBe("answer");

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://gw.example/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer k");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-x"); // custom models pass through unmapped
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(4096);
  });

  it("strips every trailing slash from baseUrl", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    await generateContent("hi", { baseUrl: "https://gw.example///", apiKey: "k", model: "m" });
    expect(global.fetch.mock.calls[0][0]).toBe("https://gw.example/chat/completions");
  });

  it("surfaces gateway error messages", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: async () => ({ error: { message: "quota exceeded" } }),
    });
    await expect(
      generateContent("hi", { baseUrl: "https://gw.example", model: "m" }),
    ).rejects.toThrow("quota exceeded");
  });
});
