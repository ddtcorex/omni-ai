/**
 * Groq Provider
 * Handles interaction with Groq API
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model mapping
const MODELS = {
  "groq-llama-3.3-70b": "llama-3.3-70b-versatile",
  "groq-llama-3.1-8b": "llama-3.1-8b-instant",
  "groq-llama-3.2-90b-vision": "llama-3.2-90b-vision-preview",
  "groq-llama-3.2-11b-vision": "llama-3.2-11b-vision-preview",
  "groq-llama-3.2-3b": "llama-3.2-3b-preview",
  "groq-llama-3.2-1b": "llama-3.2-1b-preview",
  "groq-deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
  "groq-mixtral": "mixtral-8x7b-32768",
  "groq-gemma2": "gemma2-9b-it",
};

/**
 * Generate content using Groq
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, temperature, maxTokens }
 */
export async function generateContent(prompt, config) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096 } = config;

  if (!apiKey) {
    throw new Error("Groq API key not configured");
  }

  const groqModel = MODELS[model] || "llama-3.3-70b-versatile";

  const body = {
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    model: groqModel,
    temperature,
    max_tokens: maxTokens,
  };

  const response = await fetch(GROQ_API_URL, {
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
