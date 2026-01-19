/**
 * Omni AI - AI Providers Configuration
 * Defines available providers and their models
 */

export const AI_PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google Gemini',
    keySetting: 'apiKey', // The storage key for this provider's API key
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-2.0-pro-exp', name: 'Gemini 2.0 Pro Experimental' }
    ]
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    keySetting: 'groqApiKey',
    models: [
      { id: 'groq-deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B' },
      { id: 'groq-llama-3.3-70b', name: 'Llama 3.3 70B' },
      { id: 'groq-llama-3.1-8b', name: 'Llama 3.1 8B' },
      { id: 'groq-llama-3.2-90b-vision', name: 'Llama 3.2 90B Vision' },
      { id: 'groq-llama-3.2-11b-vision', name: 'Llama 3.2 11B Vision' },
      { id: 'groq-llama-3.2-3b', name: 'Llama 3.2 3B' },
      { id: 'groq-llama-3.2-1b', name: 'Llama 3.2 1B' },
      { id: 'groq-mixtral', name: 'Mixtral 8x7b' },
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
