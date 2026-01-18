/**
 * Gemini Provider
 * Handles interaction with Google Gemini API
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Generate content using Gemini
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, temperature, topP, maxTokens }
 */
export async function generateContent(prompt, config) {
  const {
    apiKey,
    model,
    temperature = 0.7,
    topP = 0.95,
    maxTokens = 8192,
  } = config;

  if (!apiKey) {
    throw new Error("Gemini API key not configured");
  }

  // model name is passed directly, e.g. "gemini-1.5-flash"
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

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
          console.warn(
            `[Gemini Provider] Rate limited, retrying in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
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
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  throw lastError || new Error("Failed to generate content after retries");
}
