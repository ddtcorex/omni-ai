/**
 * Omni AI - AI Service
 * Unified interface for multiple AI providers (Google Gemini, OpenAI, Groq, Custom Gateway)
 */

import { getProvider, getProviderModule } from "./providers/index.js";
import { AI_PROVIDERS, getProviderByModel, DEFAULT_MODEL } from "./ai-providers.js";

// ============================================
// Core API
// ============================================

/**
 * Generate content using the configured AI provider
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Generated text
 */
export async function generateContent(prompt, options = {}) {
  let { model = DEFAULT_MODEL, maxTokens, temperature, topP, provider: providerHint } = options;

  // Resolve model from storage if not explicitly provided
  if (model === DEFAULT_MODEL) {
    const storedModel = await getModel();
    if (storedModel) model = storedModel;
  }

  let activeModel = model;
  let providerId = providerHint || "";

  // Handle Custom Model resolution
  let isCustomGatewayModel = activeModel === "custom-gateway" || providerId === "customGateway";

  if (activeModel.endsWith("-custom") || activeModel === "custom-gateway") {
    if (activeModel === "custom-gateway") {
      const { customGatewayModelName } = await chrome.storage.local.get("customGatewayModelName");
      if (customGatewayModelName) {
        activeModel = customGatewayModelName;
      }
      providerId = providerId || "customGateway";
    } else if (providerId === "customGateway") {
      const { customGatewayModelName } = await chrome.storage.local.get("customGatewayModelName");
      if (customGatewayModelName) {
        activeModel = customGatewayModelName;
      }
    } else {
      const providerKey = activeModel.split("-")[0];
      const { customModelName } = await chrome.storage.local.get("customModelName");
      if (customModelName) {
        activeModel = customModelName;
        providerId = providerId || providerKey;
      }
    }

    // Update isCustomGatewayModel after resolution
    isCustomGatewayModel = providerId === "customGateway";
  }

  // Handle Keys (Explicit override or Storage)
  let apiKey = options.apiKey;

  if (!apiKey) {
    // If we have an explicit providerId from a custom model, use that
    const providerSettings = providerId
      ? AI_PROVIDERS[providerId]
      : getProviderByModel(activeModel);

    if (providerSettings) {
      apiKey = await getProviderKey(providerSettings.keySetting);
    } else {
      // Fallback for legacy/unknown models (default to Gemini Key)
      apiKey = await getProviderKey("geminiApiKey");
    }
  }

  if (!apiKey) {
    // Custom Gateway may not require API Key (e.g., OpenRouter free tier, local gateways)
    if (!isCustomGatewayModel) {
      throw new Error(`API key not configured for ${activeModel}`);
    }
  }

  // Extra config for Custom Gateway
  let gatewayBaseUrl = "";

  const isCG =
    isCustomGatewayModel || activeModel === "custom-gateway" || activeModel.startsWith("custom-");

  if (isCG) {
    // Prefer passed options.baseUrl (from validation), otherwise read from storage
    if (options.baseUrl) {
      gatewayBaseUrl = options.baseUrl;
    } else {
      /** @type {{ customGatewayBaseUrl?: string }} */
      const gwConfig = await chrome.storage.local.get(["customGatewayBaseUrl"]);
      gatewayBaseUrl = gwConfig.customGatewayBaseUrl || "";
    }
  }

  // Resolve Provider Implementation
  const provider = providerId ? getProviderById(providerId) : getProvider(activeModel);

  // Execute
  const extraConfig = isCustomGatewayModel ? { baseUrl: gatewayBaseUrl } : {};
  return await provider.generateContent(prompt, {
    apiKey,
    model: activeModel,
    maxTokens,
    temperature,
    topP,
    ...extraConfig,
  });
}

/**
 * Helper to get provider by its ID (google, groq, etc.)
 */
function getProviderById(id) {
  return getProviderModule(id);
}

// ... rest of exports ...

/**
 * Improve text based on action and context
 */
export async function improveText(text, action, context = "email", options = {}) {
  const systemPrompt = getSystemPrompt(action, context, options);
  const fullPrompt = `${systemPrompt}\n\n---\n\nOriginal text:\n${text}\n\n---\n\nImproved text:`;
  const defaultTemperature = action === "rephrase" ? 0.15 : 0.3;

  return await generateContent(fullPrompt, {
    temperature: defaultTemperature,
    ...options,
  });
}

/**
 * Translate text to target language
 */
const languageNames = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  vi: "Vietnamese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
};

/**
 * Translate text to target language
 */
export async function translateText(text, targetLanguage = "en") {
  const targetName = languageNames[targetLanguage] || targetLanguage;
  const prompt = `Translate the following text to ${targetName}.
Rules:
- Output ONLY the translation, nothing else.
- STRICTLY preserve all original formatting, including line breaks, paragraphs, lists, and spacing.
- Do not merge lines or paragraphs.

Text:
${text}

Translation:`;

  return await generateContent(prompt, { temperature: 0.2 });
}

/**
 * Smart translate: Detects language and toggles direction
 */
export async function smartTranslate(text, primaryLanguage = "en", defaultLanguage = "en") {
  const primaryName = languageNames[primaryLanguage] || primaryLanguage;
  const defaultName = languageNames[defaultLanguage] || defaultLanguage;

  const prompt = `Analyze the following text.
If the text is in ${primaryName}, translate it to ${defaultName}.
Otherwise, translate it to ${primaryName}.
Rules:
- Output ONLY the translation, nothing else.
- STRICTLY preserve all original formatting, including line breaks, paragraphs, lists, and spacing.
- Do not merge lines or paragraphs.

Text:
${text}

Translation:`;

  return await generateContent(prompt, { temperature: 0.2 });
}

/**
 * Summarize text
 */
export async function summarizeText(text, options = {}) {
  const { style = "concise" } = options;
  const prompt = `Summarize the following text in a ${style} manner in the SAME language as the original text. Do not translate.\n\nText:\n${text}\n\nSummary:`;

  return await generateContent(prompt, { temperature: 0.3 });
}

/**
 * Generate a reply
 */
export async function generateReply(message, context = "email", tone = "professional") {
  const prompt = `Generate a ${tone} reply to the following ${context} message. The reply should be appropriate for a ${context} context.\n\nMessage:\n${message}\n\nReply:`;

  return await generateContent(prompt, { temperature: 0.6 });
}

/**
 * Explain text
 */
export async function explainText(text, targetLanguage = "en") {
  const languageNames = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese (Simplified)",
    vi: "Vietnamese",
    ru: "Russian",
    ar: "Arabic",
    hi: "Hindi",
  };

  const targetName = languageNames[targetLanguage] || targetLanguage;
  const prompt = `Explain the following text in simple, easy-to-understand terms in ${targetName}. Break down any complex concepts.\n\nText:\n${text}\n\nExplanation:`;

  return await generateContent(prompt, { temperature: 0.4 });
}

/**
 * Emojify text
 */
export async function emojifyText(text) {
  const prompt = `Add relevant and appropriate emojis throughout the following text to make it more expressive and engaging. Don't overdo it.\n\nText:\n${text}\n\nEmojified text:`;

  return await generateContent(prompt, { temperature: 0.5 });
}

/**
 * Quick ask
 */
export async function quickAsk(question, context = "") {
  const prompt = context
    ? `Context: ${context}\n\nQuestion: ${question}\n\nAnswer:`
    : `Question: ${question}\n\nAnswer:`;

  return await generateContent(prompt, { temperature: 0.7 });
}

// ============================================
// Helpers
// ============================================

function getSystemPrompt(action, context, options = {}) {
  const contextDescriptions = {
    email: "professional email communication",
    chat: "casual chat messaging (Slack, Discord, WhatsApp)",
    social: "social media posts (Twitter, LinkedIn)",
    technical: "technical documentation or code comments",
    academic: "formal academic writing",
  };

  const contextDesc = contextDescriptions[context] || "general writing";
  const tone = options.tone || "professional";

  const actionPrompts = {
    grammar: `Fix all grammar, spelling, and punctuation errors in the text while preserving the original meaning and style. This is for ${contextDesc}.`,
    clarity: `Improve the clarity and readability of the text while maintaining the original meaning. Make it easier to understand. This is for ${contextDesc}.`,
    tone: `Rewrite the text with a ${tone} tone while keeping the same meaning. Use simple, everyday words that everyone understands. This is for ${contextDesc}.`,
    concise: `Make the text more concise by removing unnecessary words and redundancy while preserving all key information.`,
    expand: `Expand the text by adding more detail, context, and depth while maintaining the original message.`,
    rephrase: `Rephrase the text using simple, common words that ordinary people use in daily life. Avoid fancy, formal, or rare vocabulary. Keep the meaning exactly the same. Stay close to the original phrasing and sentence structure.`,
  };

  const basePrompt = actionPrompts[action] || actionPrompts.grammar;
  const rephraseRules =
    action === "rephrase"
      ? "\n- Use ONLY simple, common words that people use every day\n- Do NOT use formal, fancy, or rare vocabulary\n- Keep names, numbers, dates, technical terms, and key facts exactly as they are\n- Make minimal changes - only replace difficult words with simpler ones\n- Keep sentence length and structure close to the original"
      : "";

  return `You are a helpful writing assistant who uses simple, everyday language that everyone can understand.\n\n${basePrompt}\n\nRules:\n- Output ONLY the improved text, nothing else\n- Do not include explanations or notes\n- DETECT the language of the original text and output in the SAME language\n- Do NOT translate the text unless explicitly asked\n- STRICTLY preserve all original formatting (paragraphs, lists, indentation) exactly. Do not merge lines.${rephraseRules}`;
}

// ============================================
// Storage Helpers
// ============================================

async function getProviderKey(keyName) {
  const result = await chrome.storage.local.get(keyName);
  return result[keyName] || "";
}

async function getModel() {
  const result = await chrome.storage.local.get("apiModel");
  return result.apiModel || "";
}

export default {
  generateContent,
  improveText,
  translateText,
  summarizeText,
  generateReply,
  explainText,
  emojifyText,
  quickAsk,
  smartTranslate,
};
