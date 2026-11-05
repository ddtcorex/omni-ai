import {
  getProvider,
  listModels,
  getProviderModule,
  Gemini,
  OpenAI,
  Groq,
  CustomGateway,
  Anthropic,
} from "../../../lib/providers/index";
import { AI_PROVIDERS } from "../../../lib/ai-providers";

describe("Provider routing", () => {
  it("resolves every model in AI_PROVIDERS to its own provider's module, not by prefix guessing", () => {
    const expected = {
      google: Gemini,
      openai: OpenAI,
      groq: Groq,
      customGateway: CustomGateway,
      anthropic: Anthropic,
    };

    // No skip guard on purpose: a provider added to AI_PROVIDERS without an
    // entry here must fail loudly rather than be silently unasserted.
    expect(Object.keys(expected).sort()).toEqual(Object.keys(AI_PROVIDERS).sort());

    Object.values(AI_PROVIDERS).forEach((provider) => {
      const module = expected[provider.id];
      provider.models.forEach((model) => {
        expect(getProvider(model.id)).toBe(module);
      });
    });
  });

  it("falls back to Gemini for a totally unknown model id", () => {
    expect(getProvider("some-made-up-model")).toBe(Gemini);
  });

  it("getProviderModule resolves by provider id directly, not by faking a model-name prefix", () => {
    expect(getProviderModule("google")).toBe(Gemini);
    expect(getProviderModule("groq")).toBe(Groq);
    expect(getProviderModule("openai")).toBe(OpenAI);
    expect(getProviderModule("customGateway")).toBe(CustomGateway);
    expect(getProviderModule("anthropic")).toBe(Anthropic);
  });

  it("routes a legacy model id to its real provider module, not the Gemini fallback", () => {
    expect(getProvider("openai-gpt-4o")).toBe(OpenAI);
    expect(getProvider("groq-llama-3.1-8b")).toBe(Groq);
    expect(getProvider("gemini-2.0-flash")).toBe(Gemini);
  });
});

describe("Model listing dispatch", () => {
  it("dispatches listModels through the provider module map", async () => {
    global.fetch = jest.fn(async (u) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(u).includes("anthropic") ? { data: [], has_more: false } : { data: [] },
    }));

    await expect(listModels("anthropic", { apiKey: "k" })).resolves.toEqual({
      models: [],
      truncated: false,
    });
    await expect(listModels("openai", { apiKey: "k" })).resolves.toEqual({
      models: [],
      truncated: false,
    });
  });

  it("throws for a provider id that is not in the module map instead of falling back to Gemini", async () => {
    await expect(listModels("nope", { apiKey: "k" })).rejects.toThrow(
      "Model listing is not supported",
    );
  });
});
