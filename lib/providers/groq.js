/**
 * Groq Provider
 * Handles interaction with Groq API
 */

import { getApiModelName } from '../ai-providers.js';

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";



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

  const groqModel = getApiModelName(model) || "llama-3.3-70b-versatile";

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
