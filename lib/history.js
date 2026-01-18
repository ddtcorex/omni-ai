/**
 * Omni AI - Usage History & Analytics
 * Track and display user's AI usage for insights
 */

// ============================================
// Storage Keys
// ============================================
const HISTORY_KEY = "usageHistory";
const STATS_KEY = "usageStats";
const MAX_HISTORY_ITEMS = 100;
const AUTO_DELETE_DAYS = 30;

// ============================================
// History Schema
// ============================================

/**
 * Create a history entry
 * @param {Object} data - Entry data
 * @returns {Object} History entry
 */
export function createHistoryEntry(data) {
  return {
    id: generateId(),
    action: data.action,
    inputText: truncateText(data.inputText, 200),
    outputText: truncateText(data.outputText, 500),
    preset: data.preset || "email",
    site: data.site || "",
    timestamp: Date.now(),
    wordCount: countWords(data.inputText),
    outputWordCount: countWords(data.outputText),
  };
}

// ============================================
// History Operations
// ============================================

/**
 * Add entry to history
 * @param {Object} data - Entry data
 * @returns {Promise<Object>} Created entry
 */
export async function addToHistory(data) {
  const history = await getHistory();
  const entry = createHistoryEntry(data);

  // Add to beginning
  history.unshift(entry);

  // Limit size
  const trimmed = history.slice(0, MAX_HISTORY_ITEMS);

  await chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
  await updateStats(entry);

  return entry;
}

/**
 * Get full history
 * @returns {Promise<Array>} History entries
 */
export async function getHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return result[HISTORY_KEY] || [];
}

/**
 * Get history filtered by action type
 * @param {string} action - Action type
 * @returns {Promise<Array>} Filtered entries
 */
export async function getHistoryByAction(action) {
  const history = await getHistory();
  return history.filter((h) => h.action === action);
}

/**
 * Search history by text
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching entries
 */
export async function searchHistory(query) {
  const history = await getHistory();
  const lowerQuery = query.toLowerCase();

  return history.filter(
    (h) =>
      h.inputText.toLowerCase().includes(lowerQuery) ||
      h.outputText.toLowerCase().includes(lowerQuery),
  );
}

/**
 * Clear all history
 * @returns {Promise<void>}
 */
export async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
  console.log("[History] Cleared all history");
}

/**
 * Delete old entries
 * @returns {Promise<number>} Number of deleted entries
 */
export async function deleteOldEntries() {
  const history = await getHistory();
  const cutoff = Date.now() - AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000;

  const filtered = history.filter((h) => h.timestamp > cutoff);
  const deleted = history.length - filtered.length;

  if (deleted > 0) {
    await chrome.storage.local.set({ [HISTORY_KEY]: filtered });
    console.log("[History] Deleted", deleted, "old entries");
  }

  return deleted;
}

// ============================================
// Statistics
// ============================================

/**
 * Update usage statistics
 * @param {Object} entry - History entry
 */
async function updateStats(entry) {
  const stats = await getStats();

  // Increment action count
  stats.actionCounts[entry.action] =
    (stats.actionCounts[entry.action] || 0) + 1;

  // Update totals
  stats.totalActions++;
  stats.totalWordsProcessed += entry.wordCount;
  stats.totalWordsGenerated += entry.outputWordCount;

  // Update daily stats
  const today = new Date().toISOString().split("T")[0];
  stats.dailyUsage[today] = (stats.dailyUsage[today] || 0) + 1;

  // Keep only last 30 days
  const dates = Object.keys(stats.dailyUsage).sort();
  if (dates.length > 30) {
    const toDelete = dates.slice(0, dates.length - 30);
    toDelete.forEach((d) => delete stats.dailyUsage[d]);
  }

  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

/**
 * Get usage statistics
 * @returns {Promise<Object>} Statistics
 */
export async function getStats() {
  const result = await chrome.storage.local.get(STATS_KEY);
  return (
    result[STATS_KEY] || {
      totalActions: 0,
      totalWordsProcessed: 0,
      totalWordsGenerated: 0,
      actionCounts: {},
      dailyUsage: {},
    }
  );
}

/**
 * Get most used actions
 * @param {number} limit - Number of actions to return
 * @returns {Promise<Array>} Top actions
 */
export async function getTopActions(limit = 5) {
  const stats = await getStats();

  return Object.entries(stats.actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([action, count]) => ({ action, count }));
}

/**
 * Reset statistics
 * @returns {Promise<void>}
 */
export async function resetStats() {
  await chrome.storage.local.remove(STATS_KEY);
  console.log("[History] Reset statistics");
}

// ============================================
// Utilities
// ============================================

function generateId() {
  return (
    "hist_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).substr(2, 9)
  );
}

function truncateText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

function countWords(text) {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ============================================
// Default Export
// ============================================

export default {
  addToHistory,
  getHistory,
  getHistoryByAction,
  searchHistory,
  clearHistory,
  deleteOldEntries,
  getStats,
  getTopActions,
  resetStats,
};
