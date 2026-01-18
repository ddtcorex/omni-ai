/**
 * Antigravity Provider
 * Handles interaction with Antigravity Unified Gateway API
 */

const ANTIGRAVITY_API_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";
// Sandbox: https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent

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
    project: "antigravity-unified",
    model: modelId,
    request: {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        candidateCount: 1,
      },
      systemInstruction: {
        parts: [{ text: "You are a helpful AI assistant." }],
      },
    },
    userAgent: "antigravity",
    requestId: crypto.randomUUID(),
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

  let data;
  try {
    data = await response.json();
  } catch (e) {
    console.error("[Antigravity] Failed to parse JSON response");
    throw new Error(`Antigravity API error: ${response.status} (Invalid JSON)`);
  }

  console.log(`[Antigravity] Status: ${response.status}`);
  console.log("[Antigravity] Response:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    const message = data.error?.message || "";
    // Check for API activation link
    const activationMatch = message.match(
      /Enable it by visiting (https:\/\/[^\s]+)/,
    );
    if (activationMatch) {
      console.error(
        "%c🚨 ACTION REQUIRED: Enable the API to continue!",
        "color: red; font-size: 16px; font-weight: bold;",
      );
      console.error(`Click here: ${activationMatch[1]}`);
    }

    throw new Error(message || `Antigravity API error: ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Empty response from Antigravity API");
  }

  return text;
}
