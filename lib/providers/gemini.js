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
  const { apiKey, model, temperature = 0.7, topP = 0.95, maxTokens = 8192 } = config;

  if (!apiKey) {
    throw new Error(chrome.i18n.getMessage("error_apiKeyNotConfigured_gemini"));
  }

  // model name is passed directly, e.g. "gemini-2.0-flash"
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
          console.warn(`[Gemini Provider] Rate limited, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw new Error(error.error?.message || `API error: ${response.status}`);
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

/**
 * Stream content from Gemini using the SSE endpoint.
 * @param {string} prompt
 * @param {Object} config - { apiKey, model, temperature?, topP?, maxTokens? }
 * @param {(text:string)=>void} onChunk
 * @param {AbortSignal} signal
 * @returns {Promise<string>} full assembled text
 */
export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, temperature = 0.7, topP = 0.95, maxTokens = 8192 } = config;
  if (!apiKey) throw new Error(chrome.i18n.getMessage("error_apiKeyNotConfigured_gemini"));

  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature, topP },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
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
      try {
        const json = JSON.parse(data);
        const parts = json.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            full += part.text;
            onChunk(part.text);
          }
        }
      } catch {
        /* ignore malformed keepalive lines */
      }
    }
  }
  return full;
}
