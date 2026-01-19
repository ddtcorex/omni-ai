/**
 * Omni AI - AI Providers Configuration
 * Defines available providers and their models
 */

export const AI_PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google Gemini',
    keySetting: 'apiKey', // The storage key for this provider's API key
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Free Tier)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Best Quality)' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fastest)' }
    ]
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    keySetting: 'groqApiKey',
    models: [
      { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B (Versatile)' },
      { id: 'groq-llama-3.1-8b', name: 'Llama 3.1 8B (Instant)' },
      { id: 'groq-mixtral', name: 'Mixtral 8x7b (Smart)' },
      { id: 'groq-gemma2', name: 'Gemma 2 9B' }
    ]
  }
};

/**
 * Get provider info by model ID
 * @param {string} modelId 
 * @returns {object|null} Provider object or null
 */
export function getProviderByModel(modelId) {
  for (const provider of Object.values(AI_PROVIDERS)) {
    if (provider.models.find(m => m.id === modelId)) {
      return provider;
    }
  }
  return null;
}
