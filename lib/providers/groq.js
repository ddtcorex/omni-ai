/**
 * Groq Provider
 * Handles interaction with Groq API
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model mapping
const MODELS = {
  "groq-llama3": "llama3-70b-8192",
  "groq-mixtral": "mixtral-8x7b-32768",
  "groq-gemma": "gemma-7b-it",
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

  const groqModel = MODELS[model] || "llama3-70b-8192";

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
