/**
 * Omni AI - Custom Prompts Manager
 * Storage and management of user-created prompts
 */

// ============================================
// Storage Keys
// ============================================
const STORAGE_KEY = "customPrompts";

// ============================================
// Prompt Schema
// ============================================

/**
 * Create a new custom prompt object
 * @param {Object} data - Prompt data
 * @returns {Object} Complete prompt object
 */
export function createPrompt(data = {}) {
  return {
    id: data.id || generateId(),
    name: data.name || "Untitled Prompt",
    description: data.description || "",
    prompt: data.prompt || "{{text}}",
    icon: data.icon || "⚡",
    category: data.category || "custom",
    tags: data.tags || [],
    isDefault: false,
    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Get all custom prompts
 * @returns {Promise<Array>} List of custom prompts
 */
export async function getAllPrompts() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

/**
 * Get a prompt by ID
 * @param {string} id - Prompt ID
 * @returns {Promise<Object|null>} Prompt or null
 */
export async function getPrompt(id) {
  const prompts = await getAllPrompts();
  return prompts.find((p) => p.id === id) || null;
}

/**
 * Save a new prompt
 * @param {Object} data - Prompt data
 * @returns {Promise<Object>} Created prompt
 */
export async function savePrompt(data) {
  const prompts = await getAllPrompts();
  const prompt = createPrompt(data);

  prompts.push(prompt);
  await chrome.storage.sync.set({ [STORAGE_KEY]: prompts });

  console.log("[Custom Prompts] Saved prompt:", prompt.name);
  return prompt;
}

/**
 * Update an existing prompt
 * @param {string} id - Prompt ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated prompt or null
 */
export async function updatePrompt(id, updates) {
  const prompts = await getAllPrompts();
  const index = prompts.findIndex((p) => p.id === id);

  if (index === -1) {
    console.error("[Custom Prompts] Prompt not found:", id);
    return null;
  }

  prompts[index] = {
    ...prompts[index],
    ...updates,
    updatedAt: Date.now(),
  };

  await chrome.storage.sync.set({ [STORAGE_KEY]: prompts });

  console.log("[Custom Prompts] Updated prompt:", prompts[index].name);
  return prompts[index];
}

/**
 * Delete a prompt
 * @param {string} id - Prompt ID
 * @returns {Promise<boolean>} Success status
 */
export async function deletePrompt(id) {
  const prompts = await getAllPrompts();
  const filtered = prompts.filter((p) => p.id !== id);

  if (filtered.length === prompts.length) {
    console.error("[Custom Prompts] Prompt not found:", id);
    return false;
  }

  await chrome.storage.sync.set({ [STORAGE_KEY]: filtered });

  console.log("[Custom Prompts] Deleted prompt:", id);
  return true;
}

// ============================================
// Search & Filter
// ============================================

/**
 * Search prompts by name or description
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching prompts
 */
export async function searchPrompts(query) {
  const prompts = await getAllPrompts();
  const lowerQuery = query.toLowerCase();

  return prompts.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
  );
}

/**
 * Get prompts by category
 * @param {string} category - Category name
 * @returns {Promise<Array>} Matching prompts
 */
export async function getPromptsByCategory(category) {
  const prompts = await getAllPrompts();
  return prompts.filter((p) => p.category === category);
}

// ============================================
// Import/Export
// ============================================

/**
 * Export all prompts to JSON
 * @returns {Promise<string>} JSON string
 */
export async function exportPrompts() {
  const prompts = await getAllPrompts();
  return JSON.stringify(
    {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      prompts,
    },
    null,
    2,
  );
}

/**
 * Import prompts from JSON
 * @param {string} json - JSON string
 * @param {boolean} merge - Merge with existing or replace
 * @returns {Promise<number>} Number of imported prompts
 */
export async function importPrompts(json, merge = true) {
  try {
    const data = JSON.parse(json);
    const imported = data.prompts || [];

    if (!Array.isArray(imported)) {
      throw new Error("Invalid prompts format");
    }

    if (merge) {
      const existing = await getAllPrompts();
      const existingIds = new Set(existing.map((p) => p.id));

      // Add new prompts, skip duplicates
      const newPrompts = imported.filter((p) => !existingIds.has(p.id));
      const merged = [...existing, ...newPrompts.map((p) => createPrompt(p))];

      await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
      return newPrompts.length;
    } else {
      await chrome.storage.sync.set({
        [STORAGE_KEY]: imported.map((p) => createPrompt(p)),
      });
      return imported.length;
    }
  } catch (error) {
    console.error("[Custom Prompts] Import failed:", error);
    throw error;
  }
}

// ============================================
// Default Prompts Library
// ============================================

export const DEFAULT_PROMPTS = [
  {
    id: "default-eli5",
    name: "Explain Like I'm 5",
    description: "Explain complex topics in simple terms",
    prompt:
      "Explain the following in simple terms that a 5-year-old would understand:\n\n{{text}}\n\nSimple explanation:",
    icon: "👶",
    category: "education",
    tags: ["explain", "simple", "learning"],
  },
  {
    id: "default-bullets",
    name: "Convert to Bullet Points",
    description: "Turn text into organized bullet points",
    prompt:
      "Convert the following text into clear, organized bullet points:\n\n{{text}}\n\nBullet points:",
    icon: "📋",
    category: "formatting",
    tags: ["bullets", "list", "organize"],
  },
  {
    id: "default-email-subject",
    name: "Generate Email Subject",
    description: "Create compelling email subject lines",
    prompt:
      "Based on the following email content, generate 3 compelling subject line options:\n\n{{text}}\n\nSubject lines:",
    icon: "✉️",
    category: "email",
    tags: ["email", "subject", "marketing"],
  },
  {
    id: "default-tweet-thread",
    name: "Create Tweet Thread",
    description: "Convert content into a Twitter thread",
    prompt:
      "Convert the following content into an engaging Twitter thread (each tweet under 280 characters, numbered):\n\n{{text}}\n\nThread:",
    icon: "🐦",
    category: "social",
    tags: ["twitter", "thread", "social"],
  },
  {
    id: "default-code-review",
    name: "Code Review",
    description: "Review code and suggest improvements",
    prompt:
      "Review the following code and provide:\n1. Potential bugs or issues\n2. Performance improvements\n3. Best practice suggestions\n\nCode:\n{{text}}\n\nReview:",
    icon: "🔍",
    category: "technical",
    tags: ["code", "review", "developer"],
  },
];

/**
 * Install default prompts (if not exists)
 */
export async function installDefaultPrompts() {
  const prompts = await getAllPrompts();
  const existingIds = new Set(prompts.map((p) => p.id));

  const newDefaults = DEFAULT_PROMPTS.filter((p) => !existingIds.has(p.id)).map(
    (p) => ({
      ...createPrompt(p),
      isDefault: true,
    }),
  );

  if (newDefaults.length > 0) {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: [...prompts, ...newDefaults],
    });
    console.log(
      "[Custom Prompts] Installed",
      newDefaults.length,
      "default prompts",
    );
  }

  return newDefaults.length;
}

// ============================================
// Execute Prompt
// ============================================

/**
 * Execute a custom prompt with text
 * @param {string} promptId - Prompt ID
 * @param {string} text - Input text
 * @returns {Promise<string>} Processed prompt
 */
export function buildPromptWithText(promptTemplate, text) {
  return promptTemplate.replace(/\{\{text\}\}/g, text);
}

// ============================================
// Utilities
// ============================================

/**
 * Generate unique ID
 */
function generateId() {
  return (
    "prompt_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).substr(2, 9)
  );
}

// ============================================
// Default Export
// ============================================

export default {
  createPrompt,
  getAllPrompts,
  getPrompt,
  savePrompt,
  updatePrompt,
  deletePrompt,
  searchPrompts,
  getPromptsByCategory,
  exportPrompts,
  importPrompts,
  installDefaultPrompts,
  buildPromptWithText,
  DEFAULT_PROMPTS,
};
