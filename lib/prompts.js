/**
 * Omni AI - Prompt Templates
 * Reusable prompts for different AI actions
 */

// ============================================
// Action Prompts
// ============================================

export const ACTION_PROMPTS = {
  grammar: {
    name: "Fix Grammar & Spelling",
    icon: "✏️",
    description: "Correct errors while preserving meaning",
    prompt: (
      text,
      context,
    ) => `Fix all grammar, spelling, and punctuation errors in the following text. Preserve the original meaning and style. Context: ${context}

Text:
${text}

Corrected text:`,
  },

  clarity: {
    name: "Improve Clarity",
    icon: "💡",
    description: "Make text clearer and easier to understand",
    prompt: (
      text,
      context,
    ) => `Improve the clarity and readability of the following text while maintaining the original meaning. Context: ${context}

Text:
${text}

Improved text:`,
  },

  tone: {
    name: "Change Tone",
    icon: "🎭",
    description: "Adjust the tone of your writing",
    tones: [
      "professional",
      "casual",
      "friendly",
      "formal",
      "assertive",
      "empathetic",
    ],
    prompt: (
      text,
      context,
      tone = "professional",
    ) => `Rewrite the following text with a ${tone} tone while keeping the same meaning. Context: ${context}

Text:
${text}

Rewritten text:`,
  },

  concise: {
    name: "Make Concise",
    icon: "📐",
    description: "Shorten without losing meaning",
    prompt: (
      text,
      context,
    ) => `Make the following text more concise by removing unnecessary words and redundancy while preserving all key information. Context: ${context}

Text:
${text}

Concise text:`,
  },

  expand: {
    name: "Expand",
    icon: "📖",
    description: "Add more detail and depth",
    prompt: (
      text,
      context,
    ) => `Expand the following text by adding more detail, context, and depth while maintaining the original message. Context: ${context}

Text:
${text}

Expanded text:`,
  },

  rephrase: {
    name: "Rephrase",
    icon: "🔄",
    description: "Rewrite with different words",
    prompt: (
      text,
      context,
    ) => `Rephrase the following text using different words and sentence structures while keeping the same meaning. Context: ${context}

Text:
${text}

Rephrased text:`,
  },
};

// ============================================
// Quick Action Prompts
// ============================================

export const QUICK_ACTION_PROMPTS = {
  translate: {
    name: "Translate",
    icon: "🌐",
    description: "Translate to another language",
    prompt: (
      text,
      targetLang = "English",
    ) => `Translate the following text to ${targetLang}. Only output the translation.

Text:
${text}

Translation:`,
  },

  summarize: {
    name: "Summarize",
    icon: "📋",
    description: "Get key points from long text",
    prompt: (
      text,
    ) => `Summarize the following text in a concise manner. Focus on key points and main ideas.

Text:
${text}

Summary:`,
  },

  reply: {
    name: "Generate Reply",
    icon: "↩️",
    description: "AI-suggested response",
    prompt: (
      text,
      context,
      tone = "professional",
    ) => `Generate a ${tone} reply to the following ${context} message.

Message:
${text}

Reply:`,
  },

  explain: {
    name: "Explain",
    icon: "❓",
    description: "Simplify complex text",
    prompt: (
      text,
    ) => `Explain the following text in simple, easy-to-understand terms. Break down any complex concepts.

Text:
${text}

Explanation:`,
  },

  emojify: {
    name: "Emojify",
    icon: "😊",
    description: "Add relevant emojis",
    prompt: (
      text,
    ) => `Add relevant and appropriate emojis throughout the following text to make it more expressive. Don't overdo it - use emojis sparingly.

Text:
${text}

Emojified text:`,
  },
};

// ============================================
// Context Presets
// ============================================

export const CONTEXT_PRESETS = {
  email: {
    name: "Email",
    icon: "📧",
    description: "Professional email communication",
    defaultTone: "professional",
    guidelines: [
      "Use proper salutations and sign-offs",
      "Keep paragraphs concise",
      "Be clear and direct",
    ],
  },

  chat: {
    name: "Chat",
    icon: "💬",
    description: "Casual messaging (Slack, Discord, WhatsApp)",
    defaultTone: "casual",
    guidelines: [
      "Keep messages brief",
      "Use informal language when appropriate",
      "Emojis are acceptable",
    ],
  },

  social: {
    name: "Social",
    icon: "🐦",
    description: "Social media posts (Twitter, LinkedIn)",
    defaultTone: "engaging",
    guidelines: [
      "Be attention-grabbing",
      "Consider character limits",
      "Use hashtags appropriately",
    ],
  },

  technical: {
    name: "Technical",
    icon: "📝",
    description: "Documentation and code comments",
    defaultTone: "precise",
    guidelines: [
      "Be specific and accurate",
      "Use proper terminology",
      "Include examples when helpful",
    ],
  },

  academic: {
    name: "Academic",
    icon: "📚",
    description: "Formal academic writing",
    defaultTone: "formal",
    guidelines: [
      "Use formal language",
      "Avoid contractions",
      "Cite sources when applicable",
    ],
  },
};

// ============================================
// Custom Prompt Template
// ============================================

export const CUSTOM_PROMPT_TEMPLATE = {
  name: "",
  description: "",
  prompt: "",
  icon: "⚡",
  shortcuts: [],
  createdAt: null,
  updatedAt: null,
};

/**
 * Build a custom prompt with variables
 * @param {string} template - Prompt template with {{variable}} placeholders
 * @param {Object} variables - Variables to replace
 * @returns {string} Built prompt
 */
export function buildPrompt(template, variables = {}) {
  let prompt = template;

  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return prompt;
}

/**
 * Get prompt for action
 * @param {string} actionId - Action ID
 * @param {string} text - Text to process
 * @param {string} context - Context preset
 * @param {Object} options - Additional options
 * @returns {string} Generated prompt
 */
export function getActionPrompt(
  actionId,
  text,
  context = "email",
  options = {},
) {
  const action = ACTION_PROMPTS[actionId] || QUICK_ACTION_PROMPTS[actionId];

  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }

  const contextPreset = CONTEXT_PRESETS[context];
  const contextDesc = contextPreset?.description || context;

  return action.prompt(text, contextDesc, options.tone);
}

// Default export
export default {
  ACTION_PROMPTS,
  QUICK_ACTION_PROMPTS,
  CONTEXT_PRESETS,
  CUSTOM_PROMPT_TEMPLATE,
  buildPrompt,
  getActionPrompt,
};
