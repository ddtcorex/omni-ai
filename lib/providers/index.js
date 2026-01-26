import * as Gemini from "./gemini.js";
import * as Groq from "./groq.js";
import * as OpenAI from "./openai.js";
import * as Ollama from "./ollama.js";

/**
 * Get the correct provider based on the model name
 * @param {string} modelName
 */
export function getProvider(modelName) {
  if (modelName.startsWith("google-")) {
    return Gemini;
  }
  if (modelName.startsWith("groq-")) {
    return Groq;
  }
  if (modelName.startsWith("openai-")) {
    return OpenAI;
  }
  if (modelName.startsWith("ollama-")) {
    return Ollama;
  }
  // Default to Gemini for standard keys like "gemini-1.5-flash" or if unknown
  return Gemini;
}
