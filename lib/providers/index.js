import * as Gemini from "./gemini.js";
import * as OpenAI from "./openai.js";
import * as Groq from "./groq.js";
import * as CustomGateway from "./custom-gateway.js";

/**
 * Get the correct provider based on the model name
 * @param {string} modelName
 */
export function getProvider(modelName) {
  if (modelName.startsWith("google-")) {
    return Gemini;
  }
  if (modelName.startsWith("openai-")) {
    return OpenAI;
  }
  if (modelName.startsWith("groq-")) {
    return Groq;
  }
  if (modelName.startsWith("custom-")) {
    return CustomGateway;
  }
  return Gemini;
}