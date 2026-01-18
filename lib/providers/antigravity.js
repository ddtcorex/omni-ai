/**
 * Antigravity Provider
 * Handles interaction with Antigravity Unified Gateway API
 */

const ANTIGRAVITY_API_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

/**
 * Generate content using Antigravity
 * @param {string} prompt - The prompt text
 * @param {Object} config - { token, model, temperature, maxTokens }
 */
export async function generateContent(prompt, config) {
  const { token, model, temperature = 0.7, maxTokens = 8192 } = config;

  if (!token) {
    throw new Error(
      "Authentcation token not found. Please sign in via the extension popup.",
    );
  }

  // Extract model name if prefixed (e.g. "antigravity-claude-sonnet-4-5" -> "claude-sonnet-4-5")
  const modelId = model.replace(/^antigravity-/, "");

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      candidateCount: 1,
    },
    systemInstructions: [
      {
        parts: [{ text: "You are a helpful AI assistant." }],
      },
    ],
    model: `models/${modelId}`, // e.g. models/claude-sonnet-4-5
  };

  const response = await fetch(ANTIGRAVITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "antigravity/1.11.5 windows/amd64",
      "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
      "Client-Metadata": JSON.stringify({
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
      }),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error?.message || `Antigravity API error: ${response.status}`,
    );
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Empty response from Antigravity API");
  }

  return text;
}
