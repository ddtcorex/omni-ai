import { AI_PROVIDERS, LEGACY_MODELS, DEFAULT_MODEL, getApiModelName } from "../../lib/ai-providers";

describe("AI_PROVIDERS registry", () => {
  it("DEFAULT_MODEL points at a real, current model", () => {
    const allIds = Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id));
    expect(allIds).toContain(DEFAULT_MODEL);
  });

  it("every LEGACY_MODELS entry points at a real provider id, and is NOT also a current model", () => {
    const providerIds = new Set(Object.keys(AI_PROVIDERS));
    const allCurrentIds = new Set(Object.values(AI_PROVIDERS).flatMap((p) => p.models.map((m) => m.id)));
    Object.entries(LEGACY_MODELS).forEach(([modelId, providerId]) => {
      expect(providerIds.has(providerId)).toBe(true);
      expect(allCurrentIds.has(modelId)).toBe(false);
    });
  });

  it("getApiModelName no longer fuzzy-matches an unrelated model by suffix", () => {
    // "70b" alone used to risk matching "groq-llama-3.3-70b" via the removed
    // substring-fallback tier; it must now just pass through unchanged.
    expect(getApiModelName("70b")).toBe("70b");
  });
});
