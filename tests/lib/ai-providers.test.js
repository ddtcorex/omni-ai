import {
  AI_PROVIDERS,
  LEGACY_MODELS,
  DEFAULT_MODEL,
  getApiModelName,
  getProviderByModel,
} from "../../lib/ai-providers";

describe("AI_PROVIDERS registry", () => {
  it("DEFAULT_MODEL points at a real, current model", () => {
    const allIds = Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id));
    expect(allIds).toContain(DEFAULT_MODEL);
  });

  it("every LEGACY_MODELS entry points at a real provider id, and is NOT also a current model", () => {
    const providerIds = new Set(Object.keys(AI_PROVIDERS));
    const allCurrentIds = new Set(Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id)));
    Object.entries(LEGACY_MODELS).forEach(([modelId, { provider, apiModel }]) => {
      expect(providerIds.has(provider)).toBe(true);
      expect(allCurrentIds.has(modelId)).toBe(false);
      expect(typeof apiModel).toBe("string");
      expect(apiModel.length).toBeGreaterThan(0);
    });
  });

  it("routes every legacy model to its real provider, not to null (which fell back to Gemini)", () => {
    Object.entries(LEGACY_MODELS).forEach(([modelId, { provider }]) => {
      expect(getProviderByModel(modelId)).toBe(AI_PROVIDERS[provider]);
    });

    // The concrete regression: a v2.2.0 user still on a retired OpenAI model.
    const openaiProvider = getProviderByModel("openai-gpt-4o");
    expect(openaiProvider).not.toBeNull();
    expect(openaiProvider.id).toBe("openai");
    expect(openaiProvider.keySetting).toBe("openaiApiKey");
  });

  it("resolves legacy model ids to their real API model names", () => {
    expect(getApiModelName("openai-gpt-4o")).toBe("gpt-4o");
    expect(getApiModelName("openai-gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(getApiModelName("openai-gpt-4-turbo")).toBe("gpt-4-turbo");
    expect(getApiModelName("groq-llama-3.1-8b")).toBe("llama-3.1-8b-instant");
    expect(getApiModelName("gemini-2.0-flash")).toBe("gemini-2.0-flash");
  });

  it("getApiModelName no longer fuzzy-matches an unrelated model by suffix", () => {
    // "70b" alone used to risk matching "groq-llama-3.3-70b" via the removed
    // substring-fallback tier; it must now just pass through unchanged.
    expect(getApiModelName("70b")).toBe("70b");
  });
});
