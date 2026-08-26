/**
 * Omni AI - AI Providers Configuration
 * Defines available providers and their models
 */

export const AI_PROVIDERS = {
  google: {
    id: "google",
    name: "Google Gemini",
    keySetting: "geminiApiKey",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "google-custom", name: "Google Custom Model...", apiModel: "custom" },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    keySetting: "openaiApiKey",
    models: [
      { id: "openai-gpt-4o", name: "GPT-4o", apiModel: "gpt-4o" },
      { id: "openai-gpt-4o-mini", name: "GPT-4o Mini", apiModel: "gpt-4o-mini" },
      { id: "openai-gpt-4-turbo", name: "GPT-4 Turbo", apiModel: "gpt-4-turbo" },
      { id: "openai-custom", name: "OpenAI Custom Model...", apiModel: "custom" },
    ],
  },
  groq: {
    id: "groq",
    name: "Groq",
    keySetting: "groqApiKey",
    models: [
      { id: "groq-llama-3.3-70b", name: "Llama 3.3 70B", apiModel: "llama-3.3-70b-versatile" },
      { id: "groq-llama-3.1-8b", name: "Llama 3.1 8B", apiModel: "llama-3.1-8b-instant" },
      { id: "groq-gpt-oss-120b", name: "GPT-OSS 120B", apiModel: "openai/gpt-oss-120b" },
      { id: "groq-custom", name: "Groq Custom Model...", apiModel: "custom" },
    ],
  },
  customGateway: {
    id: "customGateway",
    name: "Custom Gateway",
    keySetting: "customGatewayApiKey",
    models: [{ id: "custom-gateway", name: "Custom Gateway", apiModel: "custom" }],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    keySetting: "anthropicApiKey",
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "claude-opus-5", name: "Claude Opus 5" },
      { id: "anthropic-custom", name: "Anthropic Custom Model...", apiModel: "custom" },
    ],
  },
};

/**
 * Get provider info by model ID
 * @param {string} modelId
 * @returns {{ id: string, name: string, models?: Array<{ id: string, name: string, apiModel?: string }>, keySetting?: string } | null} Provider object or null
 * (`apiModel` is optional: Google Gemini's stock entries omit it; every
 * custom/openai/groq/customGateway entry declares one.)
 */
export function getProviderByModel(modelId) {
  for (const provider of Object.values(AI_PROVIDERS)) {
    if (provider.models.find((m) => m.id === modelId)) {
      return provider;
    }
  }
  return null;
}

/**
 * Get API model name for a given model ID
 * @param {string} modelId
 * @returns {string|null} API model name or null
 */
export function getApiModelName(modelId) {
  // 1. Try exact ID match (e.g., "groq-mixtral")
  for (const provider of Object.values(AI_PROVIDERS)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      if (model.apiModel === "custom") {
        return modelId;
      }
      return model.apiModel || modelId;
    }
  }

  // 2. Try looking up by apiModel directly (handling "openai/gpt-oss-120b" case)
  for (const provider of Object.values(AI_PROVIDERS)) {
    const model = provider.models.find((m) => m.apiModel === modelId);
    if (model) {
      return model.apiModel;
    }
  }

  // 3. Last fallback: use the ID as-is (for true custom models like 'deepseek-v3')
  return modelId;
}
