/**
 * Omni AI - AI Providers Configuration
 * Defines available providers and their models
 */

export const DEFAULT_MODEL = "gemini-3.6-flash";

export const AI_PROVIDERS = {
  google: {
    id: "google",
    name: "Google Gemini",
    keySetting: "geminiApiKey",
    models: [
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "google-custom", name: "Google Custom Model...", apiModel: "custom" },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    keySetting: "openaiApiKey",
    models: [
      { id: "openai-gpt-5.6-luna", name: "GPT-5.6 Luna", apiModel: "gpt-5.6-luna" },
      { id: "openai-gpt-5.6-terra", name: "GPT-5.6 Terra", apiModel: "gpt-5.6-terra" },
      { id: "openai-gpt-5.6-sol", name: "GPT-5.6 Sol", apiModel: "gpt-5.6-sol" },
      { id: "openai-custom", name: "OpenAI Custom Model...", apiModel: "custom" },
    ],
  },
  groq: {
    id: "groq",
    name: "Groq",
    keySetting: "groqApiKey",
    models: [
      { id: "groq-gpt-oss-20b", name: "GPT-OSS 20B", apiModel: "openai/gpt-oss-20b" },
      { id: "groq-llama-3.3-70b", name: "Llama 3.3 70B", apiModel: "llama-3.3-70b-versatile" },
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

export const LEGACY_MODELS = {
  "gemini-2.0-flash": "google",
  "gemini-2.5-flash-lite": "google",
  "gemini-2.5-flash": "google",
  "openai-gpt-4o": "openai",
  "openai-gpt-4o-mini": "openai",
  "openai-gpt-4-turbo": "openai",
  "groq-llama-3.1-8b": "groq",
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
