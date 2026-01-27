/**
 * Omni AI - AI Providers Configuration
 * Defines available providers and their models
 */

export const AI_PROVIDERS = {
  google: {
    id: "google",
    name: "Google Gemini",
    keySetting: "apiKey", // The storage key for this provider's API key
    models: [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      {
        id: "google-custom",
        name: "Google Custom Model...",
        apiModel: "custom",
      },
    ],
  },
  groq: {
    id: "groq",
    name: "Groq",
    keySetting: "groqApiKey",
    models: [
      {
        id: "groq-llama-3.3-70b",
        name: "Llama 3.3 70B",
        apiModel: "llama-3.3-70b-versatile",
      },
      {
        id: "groq-llama-3.1-8b",
        name: "Llama 3.1 8B",
        apiModel: "llama-3.1-8b-instant",
      },
      {
        id: "groq-gpt-oss-120b",
        name: "GPT-OSS 120B",
        apiModel: "openai/gpt-oss-120b",
      },
      { id: "groq-custom", name: "Groq Custom Model...", apiModel: "custom" },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    keySetting: "openaiApiKey",
    models: [
      { id: "openai-gpt-4o", name: "GPT-4o", apiModel: "gpt-4o" },
      {
        id: "openai-gpt-4o-mini",
        name: "GPT-4o Mini",
        apiModel: "gpt-4o-mini",
      },
      {
        id: "openai-gpt-4-turbo",
        name: "GPT-4 Turbo",
        apiModel: "gpt-4-turbo",
      },
      {
        id: "openai-custom",
        name: "OpenAI Custom Model...",
        apiModel: "custom",
      },
    ],
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    keySetting: "ollamaEndpoint", // We'll use this key for the endpoint URL
    models: [
      {
        id: "ollama-translategemma",
        name: "TranslateGemma (4B/12B/27B)",
        apiModel: "translategemma",
      },
      {
        id: "ollama-llama3.1",
        name: "Llama 3.1 (8B/70B)",
        apiModel: "llama3.1",
      },
      { id: "ollama-gemma2", name: "Gemma 2 (2B/9B/27B)", apiModel: "gemma2" },
      {
        id: "ollama-custom",
        name: "Ollama Custom Model...",
        apiModel: "custom",
      },
    ],
  },
};

/**
 * Get provider info by model ID
 * @param {string} modelId
 * @returns {object|null} Provider object or null
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

  // 3. Try matching without provider prefix (e.g., "llama-3.1-8b" matching "groq-llama-3.1-8b")
  // Only apply this logic if the modelId doesn't look like a complex path (e.g. "openai/..."")
  if (!modelId.includes("/")) {
    for (const provider of Object.values(AI_PROVIDERS)) {
      const model = provider.models.find(
        (m) => m.id.includes("-" + modelId) || m.id.endsWith(modelId),
      );
      if (model && model.apiModel !== "custom") {
        return model.apiModel || model.id;
      }
    }
  }

  // 4. Last fallback: use the ID as-is (for true custom models like 'deepseek-v3')
  return modelId;
}
