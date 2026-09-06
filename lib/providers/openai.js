/**
 * OpenAI Provider
 * Handles interaction with OpenAI API
 */

import { getApiModelName } from "../ai-providers.js";

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
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

const OPENAI_STREAM_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Stream content from OpenAI, invoking onChunk per delta.
 * @param {string} prompt
 * @param {Object} config - { apiKey, model, temperature?, maxTokens?, baseUrl? }
 * @param {(text:string)=>void} onChunk
 * @param {AbortSignal} signal
 * @returns {Promise<string>} full assembled text
 */
export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, temperature = 0.7, maxTokens = 4096, baseUrl } = config;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const openaiModel = getApiModelName(model) || "gpt-4o-mini";
  const body = {
    model: openaiModel,
    stream: true,
    temperature,
    max_completion_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch(baseUrl || OPENAI_STREAM_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  signal?.addEventListener("abort", () => {
    reader.cancel().catch(() => {});
  });
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        /* ignore malformed keepalive lines */
      }
    }
  }
  return full;
}
