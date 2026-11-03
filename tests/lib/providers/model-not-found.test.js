import { generateContent as openaiGenerate } from "../../../lib/providers/openai.js";
import { generateContent as anthropicGenerate } from "../../../lib/providers/anthropic.js";
import { generateContent as geminiGenerate } from "../../../lib/providers/gemini.js";
import { listModels as anthropicList } from "../../../lib/providers/anthropic.js";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("a 404 from OpenAI tags the error as a missing model", async () => {
  global.fetch = jest.fn(async () =>
    jsonResponse({ error: { message: "The model does not exist", code: "model_not_found" } }, 404),
  );

  await expect(openaiGenerate("hi", { apiKey: "k", model: "gone" })).rejects.toMatchObject({
    code: "model_not_found",
  });
});

test("a 404 from Anthropic tags the error as a missing model", async () => {
  global.fetch = jest.fn(async () =>
    jsonResponse({ error: { type: "not_found_error", message: "model: gone" } }, 404),
  );

  await expect(anthropicGenerate("hi", { apiKey: "k", model: "gone" })).rejects.toMatchObject({
    code: "model_not_found",
  });
});

test("a 404 from Gemini tags the error as a missing model", async () => {
  global.fetch = jest.fn(async () =>
    jsonResponse(
      { error: { code: 404, status: "NOT_FOUND", message: "models/gone is not found" } },
      404,
    ),
  );

  await expect(geminiGenerate("hi", { apiKey: "k", model: "gone" })).rejects.toMatchObject({
    code: "model_not_found",
  });
});

test("a rate limit error is not a missing model", async () => {
  global.fetch = jest.fn(async () => jsonResponse({ error: { message: "rate limited" } }, 429));

  const error = await openaiGenerate("hi", { apiKey: "k", model: "x" }).catch((e) => e);
  expect(error.code).toBeUndefined();
});

test("an Anthropic model marked deprecated without a timestamp is still deprecated", async () => {
  global.fetch = jest.fn(async () =>
    jsonResponse({
      data: [{ id: "claude-old", lifecycle_stage: "deprecated", deprecated_at: null }],
      has_more: false,
    }),
  );

  const result = await anthropicList({ apiKey: "k" });
  expect(result.models[0].state).toBe("deprecated");
});
