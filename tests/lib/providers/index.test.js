import { getProvider, getProviderModule, Gemini, OpenAI, Groq, CustomGateway } from "../../../lib/providers/index";
import { AI_PROVIDERS } from "../../../lib/ai-providers";

describe("Provider routing", () => {
  it("resolves every model in AI_PROVIDERS to its own provider's module, not by prefix guessing", () => {
    const expected = {
      google: Gemini,
      openai: OpenAI,
      groq: Groq,
      customGateway: CustomGateway,
    };

    Object.values(AI_PROVIDERS).forEach((provider) => {
      const module = expected[provider.id];
      if (!module) return; // providers registered in later tasks are covered there
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
  });
});
