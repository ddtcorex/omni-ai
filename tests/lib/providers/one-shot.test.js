import { generateContent as openaiGenerate } from "../../../lib/providers/openai.js";
import { generateContent as groqGenerate } from "../../../lib/providers/groq.js";
import { generateContent as anthropicGenerate } from "../../../lib/providers/anthropic.js";
import { generateContent as geminiGenerate } from "../../../lib/providers/gemini.js";
import { generateContent as cgGenerate } from "../../../lib/providers/custom-gateway.js";

function mockFetchJson(payload, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: () => "" },
    json: async () => payload,
  });
}

beforeEach(() => {
  chrome.i18n.getMessage.mockImplementation((key) => key);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("openai generateContent returns text", async () => {
  mockFetchJson({ choices: [{ message: { content: "hi there" } }] });
  const text = await openaiGenerate("hi", { apiKey: "k", model: "openai-gpt-4o-mini" });
  expect(text).toBe("hi there");
});

test("openai generateContent throws without apiKey", async () => {
  await expect(openaiGenerate("hi", { model: "x" })).rejects.toThrow(
    "error_apiKeyNotConfigured_openai",
  );
});

test("openai generateContent surfaces API error", async () => {
  mockFetchJson({ error: { message: "bad" } }, { ok: false, status: 401 });
  await expect(openaiGenerate("hi", { apiKey: "k", model: "x" })).rejects.toThrow("bad");
});

test("groq generateContent returns text and throws on missing key", async () => {
  mockFetchJson({ choices: [{ message: { content: "groq say" } }] });
  expect(await groqGenerate("hi", { apiKey: "k", model: "groq-llama-3.3-70b" })).toBe("groq say");
  await expect(groqGenerate("hi", { model: "x" })).rejects.toThrow(
    "error_apiKeyNotConfigured_groq",
  );
});

test("groq generateContent falls back to default model name when model missing", async () => {
  let captured;
  global.fetch = jest.fn().mockImplementation(async (url, opts) => {
    captured = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "" },
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    };
  });
  await groqGenerate("hi", { apiKey: "k", model: undefined });
  expect(captured.model).toBe("llama-3.3-70b-versatile");
});

test("anthropic generateContent returns text", async () => {
  mockFetchJson({ content: [{ type: "text", text: "claude here" }] });
  const text = await anthropicGenerate("hi", { apiKey: "k", model: "claude-haiku-4-5" });
  expect(text).toBe("claude here");
});

test("anthropic generateContent throws without apiKey", async () => {
  await expect(anthropicGenerate("hi", { model: "x" })).rejects.toThrow(
    "error_apiKeyNotConfigured_anthropic",
  );
});

test("gemini generateContent returns text", async () => {
  mockFetchJson({ candidates: [{ content: { parts: [{ text: "gemini out" }] } }] });
  const text = await geminiGenerate("hi", { apiKey: "k", model: "gemini-2.0-flash" });
  expect(text).toBe("gemini out");
});

test("gemini generateContent throws without apiKey", async () => {
  await expect(geminiGenerate("hi", { model: "x" })).rejects.toThrow(
    "error_apiKeyNotConfigured_gemini",
  );
});

test("gemini generateContent retries on 429 then succeeds", async () => {
  let calls = 0;
  global.fetch = jest.fn().mockImplementation(async () => {
    calls++;
    if (calls === 1) {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "retry ok" }] } }] }),
    };
  });
  const text = await geminiGenerate("hi", { apiKey: "k", model: "gemini-2.0-flash" });
  expect(text).toBe("retry ok");
  expect(calls).toBe(2);
});

test("custom-gateway generateContent returns text and requires baseUrl", async () => {
  mockFetchJson({
    choices: [{ message: { content: "cg out" }, reasoning_content: "thinking" }],
  });
  expect(
    await cgGenerate("hi", {
      apiKey: "k",
      model: "custom-gateway",
      baseUrl: "https://gw.example.com",
    }),
  ).toBe("cg out");
  await expect(cgGenerate("hi", { model: "x" })).rejects.toThrow(
    "error_customGatewayBaseUrlNotConfigured",
  );
});
