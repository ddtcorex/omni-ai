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
