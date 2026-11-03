/**
 * Shared helpers for the provider model listing calls.
 *
 * Only modules under lib/providers/ may call fetch() directly (AGENTS.md
 * directive 4), so every listing call lives here or in a sibling provider
 * module, never in settings or the service worker.
 */

/**
 * Normalize one provider entry into the shape the catalog works with.
 * @param {{ id: string, label?: string, created?: number, state?: string, methods?: string[]|null }} entry
 * `created` is Unix seconds, as every vendor returns it; null when absent.
 * @returns {{ id: string, label: string, createdAt: number|null, state: string, methods: string[]|null }}
 */
export function toListedModel({ id, label, created, state = "unknown", methods = null }) {
  return {
    id,
    label: label || id,
    createdAt: typeof created === "number" ? created * 1000 : null,
    state,
    methods,
  };
}

/**
 * GET an OpenAI-shaped model list (`{ data: [{ id, created }] }`).
 * OpenAI, Groq and Custom Gateway all speak it.
 * @param {string} url
 * @param {string} [apiKey] omitted from the headers when falsy, which some
 * local gateways require
 * @returns {Promise<{ models: Array<ReturnType<typeof toListedModel>>, truncated: false }>}
 */
export async function fetchOpenAiCompatibleList(url, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Model list error: ${response.status}`);
  }

  const data = await response.json();
  return {
    models: (data.data || []).map((model) =>
      toListedModel({ id: model.id, created: model.created }),
    ),
    truncated: false,
  };
}
