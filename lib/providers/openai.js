/**
 * OpenAI Provider
 * Handles interaction with OpenAI API
 */

import { getApiModelName } from '../ai-providers.js';

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Generate content using OpenAI
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, temperature, maxTokens }
 */
export async function generateContent(prompt, config) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096 } = config;

  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const openaiModel = getApiModelName(model) || "gpt-4o-mini";

  const body = {
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    model: openaiModel,
    temperature,
    max_completion_tokens: maxTokens,
  };

  const response = await fetch(OPENAI_API_URL, {
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
      error.error?.message || `OpenAI API error: ${response.status}`,
    );
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}
