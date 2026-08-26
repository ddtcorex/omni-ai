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
