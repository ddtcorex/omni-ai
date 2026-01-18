/**
 * Omni AI - Gemini API Client
 * Integration with Google Gemini API for AI-powered text processing
 */

// ============================================
// Constants
// ============================================
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-1.5-flash";

// Rate limiting
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

// ============================================
// API Client
// ============================================

/**
 * Generate content using Gemini API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Generated text
 */
export async function generateContent(prompt, options = {}) {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 8192,
    temperature = 0.7,
    topP = 0.95,
  } = options;

  const storedModel = await getModel();
  // Use stored model if options.model is default, otherwise respect options.model
  const activeModel =
    model === DEFAULT_MODEL ? storedModel || DEFAULT_MODEL : model;

  console.log(`[Omni AI] Using model: ${activeModel}`);

  // Dispatch to Groq if selected
  if (activeModel.startsWith("groq-")) {
    return generateGroqContent(prompt, activeModel, options);
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not configured. Please add your Gemini API key in Settings.",
    );
  }

  const url = `${GEMINI_API_BASE}/models/${activeModel}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      topP,
    },
  };

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        // Handle rate limiting
        if (response.status === 429) {
          const delay = RETRY_DELAY * Math.pow(2, attempt);
          console.warn(`[Gemini API] Rate limited, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        throw new Error(
          error.error?.message || `API error: ${response.status}`,
        );
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("Empty response from API");
      }

      return text;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY);
      }
    }
  }

  throw lastError || new Error("Failed to generate content after retries");
}

/**
 * Generate content using Groq API
 */
async function generateGroqContent(prompt, model, options) {
  const apiKey = await getGroqApiKey();
  if (!apiKey) {
    throw new Error("Groq API key not configured. Please add it in Settings.");
  }

  // Map internal model names to Groq model IDs
  const groqModelMap = {
    "groq-llama3": "llama3-70b-8192", // Llama 3 70B
    "groq-mixtral": "mixtral-8x7b-32768", // Mixtral 8x7B
  };

  const groqModel = groqModelMap[model] || "llama3-70b-8192";

  const url = "https://api.groq.com/openai/v1/chat/completions";

  const body = {
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    model: groqModel,
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 4096,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error?.message || `Groq API error: ${response.status}`,
    );
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

/**
 * Improve text based on action and context
 * @param {string} text - Text to improve
 * @param {string} action - Action type (grammar, clarity, tone, etc.)
 * @param {string} context - Context preset (email, chat, social, etc.)
 * @param {Object} options - Additional options
 * @returns {Promise<string>} Improved text
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
    temperature: 0.3, // Lower temperature for more consistent improvements
    ...options,
  });
}

/**
 * Translate text to target language
 * @param {string} text - Text to translate
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} Translated text
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
  const prompt = `Translate the following text to ${targetName}. Only output the translation, nothing else.

Text:
${text}

Translation:`;

  return await generateContent(prompt, { temperature: 0.2 });
}

/**
 * Summarize text
 * @param {string} text - Text to summarize
 * @param {Object} options - Options like length
 * @returns {Promise<string>} Summary
 */
export async function summarizeText(text, options = {}) {
  const { style = "concise" } = options;

  const prompt = `Summarize the following text in a ${style} manner. Focus on key points and main ideas.

Text:
${text}

Summary:`;

  return await generateContent(prompt, { temperature: 0.3 });
}

/**
 * Generate a reply to a message
 * @param {string} message - Original message to reply to
 * @param {string} context - Context preset
 * @param {string} tone - Desired tone
 * @returns {Promise<string>} Generated reply
 */
export async function generateReply(
  message,
  context = "email",
  tone = "professional",
) {
  const prompt = `Generate a ${tone} reply to the following ${context} message. The reply should be appropriate for a ${context} context.

Message:
${message}

Reply:`;

  return await generateContent(prompt, { temperature: 0.6 });
}

/**
 * Explain text in simple terms
 * @param {string} text - Text to explain
 * @returns {Promise<string>} Explanation
 */
export async function explainText(text) {
  const prompt = `Explain the following text in simple, easy-to-understand terms. Break down any complex concepts.

Text:
${text}

Explanation:`;

  return await generateContent(prompt, { temperature: 0.4 });
}

/**
 * Add relevant emojis to text
 * @param {string} text - Text to emojify
 * @returns {Promise<string>} Text with emojis
 */
export async function emojifyText(text) {
  const prompt = `Add relevant and appropriate emojis throughout the following text to make it more expressive and engaging. Don't overdo it - use emojis sparingly and meaningfully.

Text:
${text}

Emojified text:`;

  return await generateContent(prompt, { temperature: 0.5 });
}

/**
 * Quick ask - general question answering
 * @param {string} question - User's question
 * @param {string} context - Optional context
 * @returns {Promise<string>} Answer
 */
export async function quickAsk(question, context = "") {
  const prompt = context
    ? `Context: ${context}\n\nQuestion: ${question}\n\nAnswer:`
    : `Question: ${question}\n\nAnswer:`;

  return await generateContent(prompt, { temperature: 0.7 });
}

// ============================================
// System Prompts
// ============================================

/**
 * Get system prompt for writing improvements
 */
function getSystemPrompt(action, context, options = {}) {
  const contextDescriptions = {
    email: "professional email communication",
    chat: "casual chat messaging (Slack, Discord, WhatsApp)",
    social: "social media posts (Twitter, LinkedIn)",
    technical: "technical documentation or code comments",
    academic: "formal academic writing",
  };

  const contextDesc = contextDescriptions[context] || "general writing";
  const tone = options.tone || getDefaultTone(context);

  const actionPrompts = {
    grammar: `Fix all grammar, spelling, and punctuation errors in the text while preserving the original meaning and style. This is for ${contextDesc}.`,

    clarity: `Improve the clarity and readability of the text while maintaining the original meaning. Make it easier to understand. This is for ${contextDesc}.`,

    tone: `Rewrite the text with a ${tone} tone while keeping the same meaning. This is for ${contextDesc}.`,

    concise: `Make the text more concise by removing unnecessary words and redundancy while preserving all key information. This is for ${contextDesc}.`,

    expand: `Expand the text by adding more detail, context, and depth while maintaining the original message. This is for ${contextDesc}.`,

    rephrase: `Rephrase the text using different words and sentence structures while keeping the same meaning. This is for ${contextDesc}.`,
  };

  const basePrompt = actionPrompts[action] || actionPrompts.grammar;

  return `You are a professional writing assistant.

${basePrompt}

Rules:
- Output ONLY the improved text, nothing else
- Do not include explanations or notes
- Maintain the original language unless translating
- Keep formatting (paragraphs, lists) if present`;
}

/**
 * Get default tone for context
 */
function getDefaultTone(context) {
  const tones = {
    email: "professional",
    chat: "casual and friendly",
    social: "engaging and conversational",
    technical: "clear and precise",
    academic: "formal and scholarly",
  };
  return tones[context] || "professional";
}

// ============================================
// Utilities
// ============================================

/**
 * Get API key from storage
 */
async function getApiKey() {
  const result = await chrome.storage.local.get("apiKey");
  return result.apiKey || "";
}

/**
 * Get Groq API key from storage
 */
async function getGroqApiKey() {
  const result = await chrome.storage.local.get("groqApiKey");
  return result.groqApiKey || "";
}

/**
 * Get API model from storage
 */
async function getModel() {
  const result = await chrome.storage.local.get("apiModel");
  return result.apiModel || "";
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Exports
// ============================================

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
