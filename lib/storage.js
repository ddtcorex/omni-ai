/**
 * Omni AI - Storage
 * Typed owner for every Storage Map key not already owned by
 * lib/theme-manager.js (omni_ai_theme) or lib/history.js (history/usage
 * stats). See AGENTS.md's Storage Map and
 * docs/superpowers/specs/2026-09-02-code-quality-system-design.md.
 */

// ============================================
// Sync preferences (primaryLanguage, defaultLanguage)
// ============================================

export async function getSyncPreferences() {
  return chrome.storage.sync.get(["primaryLanguage", "defaultLanguage"]);
}

export async function setSyncPreferences(prefs) {
  return chrome.storage.sync.set(prefs);
}

export async function getPrimaryLanguage() {
  const { primaryLanguage } = await chrome.storage.sync.get("primaryLanguage");
  return primaryLanguage;
}

export async function getDefaultLanguage() {
  const { defaultLanguage } = await chrome.storage.sync.get("defaultLanguage");
  return defaultLanguage;
}

// ============================================
// Local AI config (keys, model, preset, custom gateway, custom model)
// ============================================

const LOCAL_AI_CONFIG_KEYS = [
  "geminiApiKey",
  "groqApiKey",
  "openaiApiKey",
  "anthropicApiKey",
  "apiModel",
  "customModelName",
  "currentPreset",
  "customGatewayBaseUrl",
  "customGatewayApiKey",
  "customGatewayModelName",
  "settings",
];

export async function getLocalAiConfig() {
  return chrome.storage.local.get(LOCAL_AI_CONFIG_KEYS);
}

export async function setLocalAiConfig(config) {
  return chrome.storage.local.set(config);
}

export async function getApiKey(keyName) {
  const result = await chrome.storage.local.get(keyName);
  return result[keyName];
}

export async function getApiModel() {
  const { apiModel } = await chrome.storage.local.get("apiModel");
  return apiModel;
}

export async function getCurrentPreset() {
  const { currentPreset } = await chrome.storage.local.get("currentPreset");
  return currentPreset;
}

export async function getCustomModelName() {
  const { customModelName } = await chrome.storage.local.get("customModelName");
  return customModelName;
}

export async function getCustomGatewayConfig() {
  return chrome.storage.local.get([
    "customGatewayBaseUrl",
    "customGatewayApiKey",
    "customGatewayModelName",
  ]);
}

export async function getSettingsBag() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings;
}
