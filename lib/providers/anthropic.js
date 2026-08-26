/**
 * Anthropic Provider
 * Handles interaction with the Claude Messages API
 */

import { getApiModelName } from "../ai-providers.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Generate content using Claude
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, temperature, topP, maxTokens }
 */
export async function generateContent(prompt, config) {
  const { apiKey, model, temperature = 0.7, topP = 0.95, maxTokens = 4096 } = config;

  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const claudeModel = getApiModelName(model) || "claude-sonnet-5";

  const body = {
    model: claudeModel,
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}
