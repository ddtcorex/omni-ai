/**
 * Ollama Provider
 * Handles interaction with local Ollama instance
 */

const DEFAULT_ENDPOINT = "http://localhost:11434";

/**
 * Generate content using Ollama
 * @param {string} prompt - The prompt text
 * @param {Object} config - { model, endpoint, temperature, topP }
 */
export async function generateContent(prompt, config) {
  const {
    model,
    endpoint,
    apiKey, // In the unified service, apiKey might hold the endpoint URL for Ollama
    maxTokens,
    temperature = 0.7,
    topP = 0.9,
  } = config;

  // Use explicit endpoint, or apiKey (which acts as endpoint for Ollama), or default
  const activeEndpoint = endpoint || apiKey || DEFAULT_ENDPOINT;

  // Remove 'ollama-' prefix to get the actual model name
  // e.g., 'ollama-llama3' -> 'llama3'
  const apiModel = model.replace(/^ollama-/, "");

  const url = `${activeEndpoint}/api/generate`;

  const body = {
    model: apiModel,
    prompt: prompt,
    stream: false,
    options: {
      temperature,
      top_p: topP,
      num_predict: maxTokens,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          'Ollama connection forbidden (403). Please restart Ollama with OLLAMA_ORIGINS="*" environment variable.',
        );
      }

      const errorText = await response.text();
      throw new Error(
        `Ollama API Error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("[Ollama Provider] Error:", error);
    throw error;
  }
}
