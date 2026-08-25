/**
 * Custom Gateway Provider
 * Handles interaction with OpenAI-compatible gateways
 */

/**
 * Extract content from response choices
 * Handles various response formats (DeepSeek reasoning_content, standard content, etc.)
 */
function extractContent(choice) {
  // Try standard content field
  let content = choice?.message?.content || choice?.delta?.content;

  // Fallback to reasoning_content (DeepSeek-style models)
  if (!content) {
    content = choice?.message?.reasoning_content || choice?.delta?.reasoning_content;
  }

  return content || "";
}

/**
 * Generate content using a custom gateway
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, baseUrl, temperature, maxTokens }
 */
export async function generateContent(prompt, config) {
  const { apiKey, model, baseUrl, temperature = 0.7, maxTokens = 4096 } = config;

  if (!baseUrl) {
    throw new Error("Custom Gateway base URL not configured");
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens: maxTokens,
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Custom Gateway error: ${response.status}`);
  }

  // Check content type to determine if streaming
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream") || contentType.includes("stream")) {
    return await handleStreamingResponse(response);
  }

  // Non-streaming response
  const data = await response.json();
  return extractContent(data.choices?.[0]);
}

async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split by "data:" to handle both SSE format and raw JSON lines
    // Handle cases where JSON and "data:" are on same or different lines
    const segments = buffer.split(/(?=data:)/);
    buffer = segments.pop() || "";

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      // Handle SSE format: "data: {...}" or "data: [DONE]"
      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]" || dataStr === "[DONE]\n") continue;
        try {
          const data = JSON.parse(dataStr);
          const content = extractContent(data.choices?.[0]);
          if (content) {
            result += content;
          }
        } catch (e) {}
      }
      // Handle raw JSON without "data:" prefix (malformed SSE)
      else if (trimmed.startsWith("{")) {
        try {
          const data = JSON.parse(trimmed);
          const content = extractContent(data.choices?.[0]);
          if (content) {
            result += content;
          }
        } catch (e) {}
      }
    }
  }

  // Process remaining buffer (may contain trailing JSON or data:)
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ")) {
      const dataStr = trimmed.slice(6);
      if (dataStr !== "[DONE]") {
        try {
          const data = JSON.parse(dataStr);
          const content = extractContent(data.choices?.[0]);
          if (content) {
            result += content;
          }
        } catch (e) {}
      }
    } else if (trimmed.startsWith("{")) {
      try {
        const data = JSON.parse(trimmed);
        const content = extractContent(data.choices?.[0]);
        if (content) {
          result += content;
        }
      } catch (e) {}
    }
  }

  return result;
}
