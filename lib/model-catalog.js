/**
 * Omni AI: model catalog logic
 *
 * Pure functions that turn a provider's fetched model list into what the
 * settings picker shows. No fetch and no chrome.storage here: the wire calls
 * live in lib/providers/*, the cache lives in lib/storage.js, and this module
 * stays testable without either.
 */

/**
 * Id heuristics for providers whose payload does not say what a model is for.
 * A rule returns true to keep. Providers with no rule keep everything, because
 * a wrong include-list silently hides models the user paid for.
 * @type {Record<string, (model: { id: string }) => boolean>}
 */
const CHAT_ID_RULES = {
  openai: (model) => /^(gpt-|chatgpt-|codex-)/.test(model.id) || /^o\d/.test(model.id),
  // Gemini's methods field is authoritative, but a payload without it must not
  // let the image and embedding families through.
  google: (model) => !/embedding|aqa|imagen|veo|lyria/i.test(model.id),
  groq: (model) => !/whisper|tts|guard/i.test(model.id),
  anthropic: () => true,
  customGateway: () => true,
};

/**
 * Keep the entries this extension can actually send a chat prompt to.
 * @param {string} providerId
 * @param {Array<{ id: string, state?: string, methods?: string[]|null }>} models
 * @returns {Array<Object>} the surviving models, in their original order
 */
export function filterChatModels(providerId, models = []) {
  const rule = CHAT_ID_RULES[providerId] || (() => true);

  return models.filter((model) => {
    if (model.state === "retired") return false;
    if (Array.isArray(model.methods) && !model.methods.includes("generateContent")) {
      return false;
    }
    return rule(model);
  });
}

/** How long a fetched catalog is considered current. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How many non recommended entries the picker renders unsearched. */
export const LIST_CAP = 20;

/** Recommended entries shown at the top of a provider's group. */
const RECOMMENDED_LIMIT = 2;

/**
 * Is a cached catalog still worth rendering as current?
 * @param {number|null|undefined} fetchedAt
 * @param {number} [now]
 */
export function isCacheFresh(fetchedAt, now = Date.now()) {
  if (!fetchedAt) return false;
  return now - fetchedAt < CACHE_TTL_MS;
}

/**
 * The API name a stored id actually resolves to. Two namespaces address the
 * same model: the shipped id (`openai-gpt-5.6-sol`) and the raw name
 * (`gpt-5.6-sol`). Comparing them without this shows a false "no longer
 * offered" row beside a duplicate.
 * @param {string|null|undefined} savedModelId
 * @param {(id: string) => string} toApiName
 * @returns {string|null}
 */
export function normalizeSavedId(savedModelId, toApiName) {
  if (!savedModelId) return null;
  return toApiName(savedModelId) || savedModelId;
}

/**
 * @param {{ id: string, label?: string, state?: string }} model
 * @returns {{ id: string, label: string, state: string }}
 */
function toEntry(model) {
  return { id: model.id, label: model.label || model.id, state: model.state || "unknown" };
}

/**
 * Turn a fetched (or absent) catalog into the picker's rows.
 *
 * `listed === null` means nothing was fetched, so the bundled catalog renders
 * instead, with its recommended tier first. A live list is filtered, then
 * pinned, recommended and recent are cut from it. A filter that matches
 * nothing degrades to the raw list: noise is better than a dead end.
 * @param {Object} args
 * @param {string} args.providerId
 * @param {Array<Object>|null} args.listed
 * @param {string|null} args.savedModelId
 * @param {Array<{ id: string, name?: string }>} [args.bundled]
 * @param {string[]} [args.recommended] shipped ids of this provider's tier
 * @param {(id: string) => string} [args.toApiName]
 * @param {number} [args.cap]
 * @param {string} [args.query] search text; applied before the cap so a match
 *   past it is still reachable
 * @param {Array<{ id: string, label: string }>} [args.sentinels] extra rows that
 *   are not models (the `-custom` escape hatches) and survive any catalog
 * @param {boolean} [args.ownsSavedModel] false when this provider is not the
 *   one that saved the current model, so it never pins a foreign id
 */
export function buildPickerModel({
  providerId,
  listed,
  savedModelId,
  bundled = [],
  recommended = [],
  toApiName = (id) => id,
  cap = LIST_CAP,
  query = "",
  sentinels = [],
  ownsSavedModel = true,
}) {
  const savedApiName = ownsSavedModel ? normalizeSavedId(savedModelId, toApiName) : null;
  const needle = String(query || "")
    .trim()
    .toLowerCase();
  const matchesQuery = (entry) =>
    !needle ||
    entry.id.toLowerCase().includes(needle) ||
    String(entry.label || "")
      .toLowerCase()
      .includes(needle);

  const pushMissingSentinels = (entries) => {
    sentinels.forEach((sentinel) => {
      const entry = toEntry(sentinel);
      if (!matchesQuery(entry)) return;
      if (!entries.some((existing) => existing.id === entry.id)) entries.push(entry);
    });
  };

  const bundledModel = () => {
    const entries = bundled.map((entry) =>
      toEntry({ id: entry.id, label: entry.name, state: "unknown" }),
    );
    pushMissingSentinels(entries);
    const tier = new Set(recommended);
    const matching = entries.filter(matchesQuery);
    return {
      pinned: null,
      recommended: matching.filter((entry) => tier.has(entry.id)),
      recent: matching.filter((entry) => !tier.has(entry.id)).slice(0, cap),
      total: entries.length,
      matches: matching.length,
      source: "bundled",
    };
  };

  if (!Array.isArray(listed)) return bundledModel();

  const chat = filterChatModels(providerId, listed);
  const usable = chat.length > 0 ? chat : listed;
  // A live catalog that filters down to nothing would otherwise leave the group
  // holding only a "no longer offered" row: a dead end, not an empty answer.
  if (usable.length === 0) return bundledModel();

  const byId = new Map(usable.map((model) => [model.id, model]));
  const pinned =
    savedApiName && !byId.has(savedApiName)
      ? { id: savedApiName, label: savedApiName, state: "missing" }
      : null;

  const top = [];
  const pushTop = (id) => {
    if (top.length >= RECOMMENDED_LIMIT) return;
    const hit = byId.get(id);
    if (!hit || top.some((entry) => entry.id === hit.id)) return;
    if (!matchesQuery(toEntry(hit))) return;
    top.push(toEntry(hit));
  };

  if (savedApiName && byId.has(savedApiName)) pushTop(savedApiName);
  for (const id of recommended) pushTop(toApiName(id));

  const topIds = new Set(top.map((entry) => entry.id));
  const rest = usable
    .filter((model) => !topIds.has(model.id))
    .map(toEntry)
    .filter(matchesQuery)
    .sort((a, b) => {
      const aTime = byId.get(a.id)?.createdAt || 0;
      const bTime = byId.get(b.id)?.createdAt || 0;
      return bTime - aTime || a.label.localeCompare(b.label);
    });

  const recent = rest.slice(0, cap);
  pushMissingSentinels(recent);

  return {
    pinned,
    recommended: top,
    recent,
    total: usable.length + sentinels.length,
    matches: top.length + rest.length,
    source: "live",
  };
}
