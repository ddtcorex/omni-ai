/**
 * Omni AI - AI Service
 * Unified interface for multiple AI providers (Gemini, Groq, etc.)
 */

import { getProvider } from "./providers/index.js";

const DEFAULT_MODEL = "gemini-1.5-flash";

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
  const { model = DEFAULT_MODEL, maxTokens, temperature, topP } = options;

  // Resolve model
  const storedModel = await getModel();
  // Use stored model if options.model is default, otherwise respect options.model
  const activeModel =
    model === DEFAULT_MODEL ? storedModel || DEFAULT_MODEL : model;

  console.log(`[Omni AI] Using model: ${activeModel}`);

  // Resolve Provider
  const provider = getProvider(activeModel);

  // Handle Antigravity (OAuth)
  if (activeModel.startsWith("antigravity-")) {
    const token = await getAntigravityToken();
    const customEndpoint = await getAntigravityEndpoint();

    if (!token && !customEndpoint) {
      // If using custom endpoint, token might not be strict (depends on proxy), but let's assume token is still needed unless proxy handles it.
      // Actually, for local proxy "Opencode Auth", it likely handles auth.
      // But my getAntigravityToken returns getAuthToken() fallback.
      // So token will likely be present (even if invalid).
      // If user provides custom endpoint, maybe they don't need a valid token?
      // Let's keep the check but realize the token from getAuthToken might be "bad" but strict check !token only fails if not signed in at all.
    }

    if (!token) {
      throw new Error("Sign-in required (or Manual Token) to use Antigravity.");
    }

    return await provider.generateContent(prompt, {
      token,
      customEndpoint,
      model: activeModel,
      maxTokens,
      temperature,
      topP,
    });
  }

  // Handle Groq (API Key)
  let apiKey;
  if (activeModel.startsWith("groq-")) {
    apiKey = await getGroqApiKey();
    if (!apiKey) throw new Error("Groq API key not configured");
  } else {
    // Default Gemini
    apiKey = await getApiKey();
    if (!apiKey) throw new Error("Gemini API key not configured");
  }

  // Execute
  return await provider.generateContent(prompt, {
    apiKey,
    model: activeModel,
    maxTokens,
    temperature,
    topP,
  });
}

async function getAntigravityToken() {
  // 1. Check manual token
  const result = await chrome.storage.local.get("antigravityToken");
  if (result.antigravityToken && result.antigravityToken.trim()) {
    return result.antigravityToken.trim();
  }
  // 2. Fallback to Identity
  return await getAuthToken();
}

async function getAntigravityEndpoint() {
  const result = await chrome.storage.local.get("antigravityEndpoint");
  return result.antigravityEndpoint ? result.antigravityEndpoint.trim() : "";
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

// ... rest of exports ...

/**
 * Improve text based on action and context
 */
export async function improveText(
  text,
  action,
  context = "email",
  options = {},
) {
  const systemPrompt = getSystemPrompt(action, context, options);
  const fullPrompt = `${systemPrompt}\n\n---\n\nOriginal text:\n${text}\n\n---\n\nImproved text:`;

  return await generateContent(fullPrompt, {
    temperature: 0.3,
    ...options,
  });
}

/**
 * Translate text to target language
 */
export async function translateText(text, targetLanguage = "en") {
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
  const prompt = `Translate the following text to ${targetName}. Only output the translation, nothing else.\n\nText:\n${text}\n\nTranslation:`;

  return await generateContent(prompt, { temperature: 0.2 });
}

/**
 * Summarize text
 */
export async function summarizeText(text, options = {}) {
  const { style = "concise" } = options;
  const prompt = `Summarize the following text in a ${style} manner. Focus on key points and main ideas.\n\nText:\n${text}\n\nSummary:`;

  return await generateContent(prompt, { temperature: 0.3 });
}

/**
 * Generate a reply
 */
export async function generateReply(
  message,
  context = "email",
  tone = "professional",
) {
  const prompt = `Generate a ${tone} reply to the following ${context} message. The reply should be appropriate for a ${context} context.\n\nMessage:\n${message}\n\nReply:`;

  return await generateContent(prompt, { temperature: 0.6 });
}

/**
 * Explain text
 */
export async function explainText(text) {
  const prompt = `Explain the following text in simple, easy-to-understand terms. Break down any complex concepts.\n\nText:\n${text}\n\nExplanation:`;

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
    tone: `Rewrite the text with a ${tone} tone while keeping the same meaning. This is for ${contextDesc}.`,
    concise: `Make the text more concise by removing unnecessary words and redundancy while preserving all key information. This is for ${contextDesc}.`,
    expand: `Expand the text by adding more detail, context, and depth while maintaining the original message. This is for ${contextDesc}.`,
    rephrase: `Rephrase the text using different words and sentence structures while keeping the same meaning. This is for ${contextDesc}.`,
  };

  const basePrompt = actionPrompts[action] || actionPrompts.grammar;

  return `You are a professional writing assistant.\n\n${basePrompt}\n\nRules:\n- Output ONLY the improved text, nothing else\n- Do not include explanations or notes\n- Maintain the original language unless translating\n- Keep formatting (paragraphs, lists) if present`;
}

// ============================================
// Storage Helpers
// ============================================

async function getApiKey() {
  const result = await chrome.storage.local.get("apiKey");
  return result.apiKey || "";
}

async function getGroqApiKey() {
  const result = await chrome.storage.local.get("groqApiKey");
  return result.groqApiKey || "";
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
};
