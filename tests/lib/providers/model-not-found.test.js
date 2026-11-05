import { generateContent as openaiGenerate } from "../../../lib/providers/openai.js";
import { generateContent as anthropicGenerate } from "../../../lib/providers/anthropic.js";
import { generateContent as geminiGenerate } from "../../../lib/providers/gemini.js";
import { listModels as anthropicList } from "../../../lib/providers/anthropic.js";
import { generateContent as gatewayGenerate } from "../../../lib/providers/custom-gateway.js";

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

test("a bare 404 from a gateway is a wrong address, not a missing model", async () => {
  // The base URL is the user's, so a 404 most often means a wrong path. Saying
  // "this model is gone" would send them to the picker for nothing.
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));

  const error = await gatewayGenerate("hi", {
    apiKey: "k",
    model: "m",
    baseUrl: "https://gw.example/wrong",
  }).catch((e) => e);
  expect(error.code).toBeUndefined();
});

test("a gateway that names the missing model still tags it", async () => {
  global.fetch = jest.fn(async () =>
    jsonResponse(
      { error: { message: "Model gone-model not found", code: "model_not_found" } },
      404,
    ),
  );

  await expect(
    gatewayGenerate("hi", { apiKey: "k", model: "gone-model", baseUrl: "https://gw.example/v1" }),
  ).rejects.toMatchObject({ code: "model_not_found" });
});
