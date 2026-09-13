import { getProviderByModel } from "../ai-providers.js";
import * as Gemini from "./gemini.js";
import * as OpenAI from "./openai.js";
import * as Groq from "./groq.js";
import * as CustomGateway from "./custom-gateway.js";
import * as Anthropic from "./anthropic.js";

export { Gemini, OpenAI, Groq, CustomGateway, Anthropic };

const MODULES = {
  google: Gemini,
  openai: OpenAI,
  groq: Groq,
  customGateway: CustomGateway,
  anthropic: Anthropic,
};

export function getProviderModule(providerId) {
  return MODULES[providerId] || Gemini;
}

export function getProvider(modelName) {
  const provider = getProviderByModel(modelName);
  return provider ? getProviderModule(provider.id) : Gemini;
}

/**
 * Stream content through the provider matched by model.
 * Falls back to a one-shot generateContent call (single onChunk) if the
 * provider module does not implement generateContentStream.
 * @param {string} prompt
 * @param {Object} config - { apiKey, model, ... }
 * @param {(text:string)=>void} onChunk
 * @param {AbortSignal} signal
 * @returns {Promise<string>} full assembled text
 */
export async function generateContentStream(prompt, config, onChunk, signal) {
  // Prefer an explicit provider hint over re-deriving from config.model: a
  // caller (e.g. getChatConfig() for Custom Gateway) may have already
  // overwritten config.model with the raw upstream model name the user
  // typed, which never matches an AI_PROVIDERS models[].id and would
  // otherwise silently fall back to Gemini.
  const provider = config.provider ? getProviderModule(config.provider) : getProvider(config.model);
  if (typeof provider.generateContentStream === "function") {
    return provider.generateContentStream(prompt, config, onChunk, signal);
  }
  const full = await provider.generateContent(prompt, config);
  onChunk(full);
  return full;
}
