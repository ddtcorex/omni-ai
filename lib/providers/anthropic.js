/**
 * Anthropic Provider
 * Handles interaction with the Claude Messages API
 */

import { defaultApiModel, getApiModelName } from "../ai-providers.js";
import { LIST_PAGE_CAP, LIST_PAGE_SIZE, toListedModel } from "./model-listing.js";
import { providerError } from "./errors.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";

/**
 * Generate content using Claude
 * @param {string} prompt - The prompt text
 * @param {Object} config - { apiKey, model, temperature, topP, maxTokens }
 *
 * `temperature` / `topP` are accepted for call-site uniformity (ai-service.js
 * passes the same config shape to every provider) but are deliberately NOT
 * forwarded to Anthropic: on Claude Sonnet 5 / Opus 5 the sampling parameters
 * (`temperature`, `top_p`, `top_k`) were removed from the request surface, and
 * sending any of them (even at a default-looking value) returns HTTP 400.
 */
export async function generateContent(prompt, config) {
  const { apiKey, model, maxTokens = 4096 } = config;

  if (!apiKey) {
    throw new Error(chrome.i18n.getMessage("error_apiKeyNotConfigured_anthropic"));
  }

  const claudeModel = getApiModelName(model) || defaultApiModel("anthropic");

  const body = {
    model: claudeModel,
    max_tokens: maxTokens,
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
    throw providerError(error.error?.message || `Anthropic API error: ${response.status}`, {
      status: response.status,
      body: error,
    });
  }

  const data = await response.json();
  // Claude Sonnet 5 / Opus 5 run adaptive thinking by default, so `content` may
  // start with a `thinking` block (empty text under the default
  // `display: "omitted"`). Find the text block instead of assuming index 0.
  const textBlock = (data.content || []).find((block) => block.type === "text");
  return textBlock?.text || "";
}

/**
 * Stream content from Anthropic's Messages API.
 * @param {string} prompt
 * @param {Object} config - { apiKey, model, maxTokens? }
 * @param {(text:string)=>void} onChunk
 * @param {AbortSignal} signal
 * @returns {Promise<string>} full assembled text
 */
export async function generateContentStream(prompt, config, onChunk, signal) {
  const { apiKey, model, maxTokens = 4096 } = config;
  if (!apiKey) throw new Error(chrome.i18n.getMessage("error_apiKeyNotConfigured_anthropic"));

  const claudeModel = getApiModelName(model) || defaultApiModel("anthropic");
  const body = {
    model: claudeModel,
    max_tokens: maxTokens,
    stream: true,
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
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw providerError(error.error?.message || `Anthropic API error: ${response.status}`, {
      status: response.status,
      body: error,
    });
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
        if (json.type === "content_block_delta" && json.delta?.text) {
          full += json.delta.text;
          onChunk(json.delta.text);
        }
      } catch {
        /* ignore malformed lines */
      }
    }
  }
  return full;
}

/**
 * Map one Anthropic ModelInfo into the normalized listing shape.
 * `deprecated_at` is the documented signal; `lifecycle_stage` / `status` are
 * read defensively because only the SDK types promise them.
 * @param {Object} model
 */
function toAnthropicModel(model) {
  const stage = String(model.lifecycle_stage || model.status || "").toLowerCase();
  let state = "active";
  if (stage === "retired") {
    state = "retired";
  } else if (stage === "deprecated" || model.deprecated_at) {
    // Anthropic can announce the stage before it stamps a date.
    state = "deprecated";
  }

  const listed = toListedModel({ id: model.id, label: model.display_name, state });
  listed.createdAt = model.created_at ? Date.parse(model.created_at) : null;
  return listed;
}

/**
 * List the models this key can use. Anthropic pages its catalog, so this
 * follows `has_more` up to LIST_PAGE_CAP and keeps what it already has when a
 * later page fails.
 * @param {{ apiKey?: string }} [config]
 */
export async function listModels(config = {}) {
  const { apiKey } = config;
  const models = [];
  let afterId = null;
  let hasMore = false;

  for (let page = 0; page < LIST_PAGE_CAP; page += 1) {
    const query = `limit=${LIST_PAGE_SIZE}${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ""}`;
    let data;

    try {
      const response = await fetch(`${ANTHROPIC_MODELS_URL}?${query}`, {
        headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw providerError(error.error?.message || `Anthropic API error: ${response.status}`, {
          status: response.status,
          body: error,
        });
      }

      data = await response.json();
    } catch (err) {
      // A failure after page one: keep what we have rather than losing the lot.
      if (page === 0) throw err;
      hasMore = true;
      break;
    }

    for (const model of data.data || []) {
      models.push(toAnthropicModel(model));
    }

    hasMore = Boolean(data.has_more) && Boolean(data.last_id);
    if (!hasMore) break;
    afterId = data.last_id;
  }

  return { models, truncated: hasMore };
}
