import { getStats, resetStats } from "./lib/history.js";
import { i18n } from "./lib/i18n.js";
import {
  initTheme,
  applyTheme,
  getThemePreference,
  setThemePreference,
} from "./lib/theme-manager.js";
import {
  AI_PROVIDERS,
  getProviderByModel,
  getApiModelName,
  LEGACY_MODELS,
  DEFAULT_MODEL,
} from "./lib/ai-providers.js";
import { buildPickerModel, isCacheFresh } from "./lib/model-catalog.js";
import {
  getSyncPreferences,
  setSyncPreferences,
  getLocalAiConfig,
  setLocalAiConfig,
  getSettingsBag,
  getModelCatalogCache,
} from "./lib/storage.js";
import { buildLanguageOptionGroups, LANGUAGES } from "./lib/languages.js";

/**
 * Omni AI: Options Page Script
 * Handles settings UI and storage
 */

// DOM Elements
const elements = {
  extVersion: document.getElementById("extVersion"),
  geminiApiKey: /** @type {HTMLInputElement} */ (document.getElementById("geminiApiKey")), // Google Key
  apiModel: /** @type {HTMLSelectElement} */ (document.getElementById("apiModel")),
  modelSearch: /** @type {HTMLInputElement|null} */ (document.getElementById("modelSearch")),
  modelSource: document.getElementById("modelSource"),
  modelRefresh: /** @type {HTMLButtonElement|null} */ (document.getElementById("modelRefresh")),
  customModelName: /** @type {HTMLInputElement} */ (document.getElementById("customModelName")),
  customModelGroup: document.getElementById("customModelGroup"),
  googleKeyGroup: document.getElementById("googleKeyGroup"), // Renamed from geminiKeyGroup to match provider
  groqApiKey: /** @type {HTMLInputElement} */ (document.getElementById("groqApiKey")),
  groqKeyGroup: document.getElementById("groqKeyGroup"),
  openaiApiKey: /** @type {HTMLInputElement} */ (document.getElementById("openaiApiKey")),
  openaiKeyGroup: document.getElementById("openaiKeyGroup"),
  anthropicApiKey: /** @type {HTMLInputElement} */ (document.getElementById("anthropicApiKey")),
  anthropicKeyGroup: document.getElementById("anthropicKeyGroup"),
  customGatewayKeyGroup: document.getElementById("customGatewayKeyGroup"),
  customGatewayBaseUrl: /** @type {HTMLInputElement} */ (
    document.getElementById("customGatewayBaseUrl")
  ),
  customGatewayApiKey: /** @type {HTMLInputElement} */ (
    document.getElementById("customGatewayApiKey")
  ),
  advancedDetails: /** @type {HTMLDetailsElement} */ (
    document.getElementById("advancedProviderSettings")
  ),
  toggleApiKey: document.getElementById("toggleApiKey"),
  validateBtn: /** @type {HTMLButtonElement} */ (document.getElementById("validateBtn")),
  validationStatus: document.getElementById("validationStatus"),
  // Theme
  themeSelector: /** @type {HTMLSelectElement} */ (document.getElementById("themeSelector")),
  // Preferences
  defaultPreset: /** @type {HTMLSelectElement} */ (document.getElementById("defaultPreset")),
  showFloatingButton: /** @type {HTMLSelectElement} */ (
    document.getElementById("showFloatingButton")
  ),
  primaryLanguage: /** @type {HTMLSelectElement} */ (document.getElementById("primaryLanguage")),
  defaultLanguage: /** @type {HTMLSelectElement} */ (document.getElementById("defaultLanguage")),
  shortcutsLink: document.getElementById("shortcutsLink"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),

  // History Stats
  statTotalActions: document.getElementById("statTotalActions"),
  statWordsProcessed: document.getElementById("statWordsProcessed"),
  statWordsGenerated: document.getElementById("statWordsGenerated"),
  refreshHistoryBtn: document.getElementById("refreshHistory"),
  clearHistoryBtn: document.getElementById("clearHistory"),
  historyList: document.getElementById("historyList"),
  flashActionsList: document.getElementById("flashActionsList"),
};

// State
let isGeminiKeyVisible = false;

// For detecting a first-time user's default Primary Language, not for the
// Settings UI's own display locale (that's UI_LOCALE_CODES, a different,
// narrower list): primaryLanguage is a translation target, so a browser UI
// language with no shipped _locales/ directory (e.g. Amharic) should still be
// recognized if it's one of the 43 translation languages.
const SUPPORTED_LOCALES = LANGUAGES.map((language) => language.code);

// Flash Actions: shown on hovering the floating quick-action icon, so common
// actions can run without opening the full quick-action menu.
const DEFAULT_FLASH_ACTIONS = ["smart_translate", "rephrase", "grammar"];
const MAX_FLASH_ACTIONS = 4;

/**
 * Disable unchecked flash-action checkboxes once MAX_FLASH_ACTIONS are
 * checked, so the floating icon's hover row can't grow unbounded; re-enable
 * them once the count drops back under the cap.
 */
function updateFlashActionCap() {
  if (!elements.flashActionsList) return;
  /** @type {HTMLInputElement[]} */
  const boxes = Array.from(elements.flashActionsList.querySelectorAll("[data-flash-action]"));
  const checkedCount = boxes.filter((box) => box.checked).length;
  boxes.forEach((box) => {
    box.disabled = !box.checked && checkedCount >= MAX_FLASH_ACTIONS;
  });
}

/**
 * Map a browser UI-language tag to one of this extension's supported locales.
 * @param {string|undefined} uiLanguage - e.g. "pt-BR", from chrome.i18n.getUILanguage()
 * @param {string[]} supported - supported locale codes
 * @param {string} fallback - locale to use when nothing matches
 */
export function detectSupportedLocale(uiLanguage, supported, fallback) {
  if (!uiLanguage) return fallback;
  const primary = uiLanguage.split("-")[0].toLowerCase();
  return supported.includes(primary) ? primary : fallback;
}

/**
 * Initialize options page
 */
export async function init() {
  if (elements.extVersion)
    elements.extVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  await i18n.init();
  await initTheme(); // Initialize theme
  localizeDOM();
  await loadSettings();
  await loadStats();
  setupEventListeners();
  updateModelVisibility(); // Initial check
  await hydrateModelCatalog();
}

/**
 * Populate AI Models dropdown
 */
/** Fetched catalogs for this page's lifetime, one entry per provider. */
const modelCatalogs = new Map();

let savedModelForPicker = null;
let savedProviderForPicker = null;
let modelSearchQuery = "";
let modelSourceCounts = { visible: 0, total: 0, query: "" };
let modelSourceByProvider = new Map();
let modelSourceFailure = false;
let modelSearchBound = false;
let selectedModelForPicker = null;
let selectedProviderForPicker = null;
let pendingRefreshProvider = null;

/**
 * The picker holds API model names, so a shipped id addresses its own model
 * through the same alias the request would use.
 * @param {string} savedModelId
 * @returns {string}
 */
function normalizeSavedIdForPicker(savedModelId) {
  return getApiModelName(savedModelId) || savedModelId;
}

/**
 * @param {number} timestamp
 * @returns {string}
 */
function formatCatalogDate(timestamp) {
  try {
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return "";
  }
}

/**
 * Paint the line under the picker: where this list came from, or why it is
 * empty. `data-source` carries the same fact for tests and styling.
 */
function paintModelSource() {
  const el = elements.modelSource;
  if (!el) return;

  const selectedProviderId = elements.apiModel?.selectedOptions?.[0]?.dataset.provider;
  const catalog = selectedProviderId ? modelCatalogs.get(selectedProviderId) : null;
  // A catalog entry with no list means "we asked and got nothing usable", which
  // renders exactly like the bundled case.
  const hasList = Boolean(catalog && Array.isArray(catalog.listed));

  const kind = hasList ? (catalog.fromCache ? "cache" : "live") : "bundled";
  el.dataset.source = kind;

  if (modelSourceCounts.query && modelSourceCounts.visible === 0) {
    el.textContent = i18n.getMessage("settings_modelsNoMatch");
    return;
  }
  if (modelSourceFailure) {
    const suffix = catalog?.fetchedAt ? ` ${formatCatalogDate(catalog.fetchedAt)}` : "";
    el.textContent = `${i18n.getMessage("settings_modelsRefreshFailed")}${suffix}`;
    return;
  }
  if (catalog?.fetchedAt) {
    const shown = selectedProviderId ? modelSourceByProvider.get(selectedProviderId) : null;
    const tail = shown && shown.visible < shown.total ? ` (${shown.visible}/${shown.total})` : "";
    const truncated = catalog.truncated ? ` ${i18n.getMessage("settings_modelsTruncated")}` : "";
    const when = formatCatalogDate(catalog.fetchedAt);
    el.textContent = `${i18n.getMessage("settings_modelsUpdated")}${
      when ? ` (${when})` : ""
    }${tail}${truncated}`;
    return;
  }
  if (elements.modelRefresh) {
    const provider = selectedProviderId ? AI_PROVIDERS[selectedProviderId] : null;
    const hasCredential = provider
      ? Boolean(keyFieldValue(provider.keySetting)) || provider.id === "customGateway"
      : false;
    elements.modelRefresh.disabled = !hasCredential;
  }

  const counts = selectedProviderId ? modelSourceByProvider.get(selectedProviderId) : null;
  const ratio =
    counts && counts.visible < counts.total ? ` (${counts.visible}/${counts.total})` : "";
  el.textContent = `${i18n.getMessage("settings_modelsBundled")}${ratio}`;
}

/**
 * Render every provider group of the model picker.
 *
 * The saved value stays the select's value, so loadSettings, saveSettings and
 * the storage contract are untouched. Passing a providerId records that
 * provider's fetched list; every other provider keeps rendering its bundled
 * catalog until it is fetched in turn.
 * @param {Object} [args]
 * @param {string} [args.providerId]
 * @param {Array<Object>|null} [args.listed]
 * @param {string|null} [args.savedModelId]
 * @param {string|null} [args.savedProviderId]
 * @param {number|null} [args.fetchedAt]
 * @param {boolean} [args.fromCache]
 * @param {boolean} [args.truncated] the provider returned more than it lists
 */
export function renderModelPicker({
  providerId,
  listed,
  savedModelId,
  savedProviderId,
  fetchedAt = null,
  fromCache = false,
  truncated = false,
} = {}) {
  const select = elements.apiModel;
  if (!select) return;

  if (savedModelId !== undefined) savedModelForPicker = savedModelId;
  if (savedProviderId !== undefined) savedProviderForPicker = savedProviderId;
  if (providerId) {
    modelCatalogs.set(providerId, {
      listed: Array.isArray(listed) ? listed : null,
      fetchedAt,
      fromCache,
      truncated: Boolean(truncated),
    });
    modelSourceFailure = false;
  }

  if (elements.modelSearch && !modelSearchBound) {
    modelSearchBound = true;
    elements.modelSearch.addEventListener("input", () => {
      modelSearchQuery = elements.modelSearch?.value || "";
      renderModelPicker();
    });
  }

  const query = modelSearchQuery.trim().toLowerCase();
  const ownerId = savedModelForPicker
    ? savedProviderForPicker || getProviderByModel(savedModelForPicker)?.id || null
    : null;
  // What the select holds right now: an in progress choice, else the saved one.
  // Both the id and its provider, because two groups can list the same id.
  const currentId = selectedModelForPicker || savedModelForPicker;
  const currentProvider = selectedModelForPicker
    ? selectedProviderForPicker || getProviderByModel(selectedModelForPicker)?.id || null
    : ownerId;
  select.textContent = "";

  let visible = 0;
  let total = 0;

  Object.values(AI_PROVIDERS).forEach((provider) => {
    const catalog = modelCatalogs.get(provider.id);
    const sentinels = (provider.models || [])
      .filter((model) => model.id.endsWith("-custom") || model.id === "custom-gateway")
      .map((model) => ({ id: model.id, label: model.name }));

    const picker = buildPickerModel({
      providerId: provider.id,
      listed: catalog ? catalog.listed : null,
      savedModelId: savedModelForPicker,
      bundled: provider.models,
      recommended: provider.recommended || [],
      toApiName: getApiModelName,
      query,
      sentinels,
      ownsSavedModel: provider.id === ownerId,
      keepId: provider.id === currentProvider ? currentId : null,
    });

    // Values are always the API model name, so a fetched id and its shipped
    // alias address the same option and the select can hold either.
    const entries = [];
    const legacy = savedModelForPicker ? LEGACY_MODELS[savedModelForPicker] : null;
    const legacyHere = Boolean(legacy && legacy.provider === provider.id);

    if (picker.pinned) {
      entries.push({
        value: picker.pinned.id,
        label: legacyHere
          ? `${i18n.getMessage("settings_legacyModelPrefix")} ${picker.pinned.id}`
          : `${picker.pinned.label} (${i18n.getMessage("settings_modelNoLongerOffered")})`,
      });
    } else if (legacyHere) {
      // A retired id the bundled list no longer carries: keep it selectable so
      // an upgrade never blanks the picker.
      entries.push({
        value: savedModelForPicker,
        label: `${i18n.getMessage("settings_legacyModelPrefix")} ${savedModelForPicker}`,
      });
    }
    picker.recommended.forEach((entry) => entries.push({ value: entry.id, label: entry.label }));
    picker.recent.forEach((entry) => entries.push({ value: entry.id, label: entry.label }));

    total += picker.total;

    const matching = entries;
    modelSourceByProvider.set(provider.id, {
      visible: matching.length,
      total: picker.total,
    });
    if (!matching.length) return;

    const group = document.createElement("optgroup");
    group.label = provider.name;
    matching.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      option.dataset.provider = provider.id;
      group.appendChild(option);
    });
    select.appendChild(group);
    visible += matching.length;
  });

  if (currentId && !selectPickerOption(select, currentId, currentProvider)) {
    selectedModelForPicker = null;
    selectedProviderForPicker = null;
  }

  modelSourceCounts = { visible, total, query };
  paintModelSource();
}

/**
 * Select the option for a model inside its own provider's group. Bundled
 * options carry the shipped id and fetched ones the API name, so both are
 * tried; the provider comes first because two groups can list the same id.
 * @param {HTMLSelectElement} select
 * @param {string} modelId
 * @param {string|null} providerId
 * @returns {boolean} whether an option was selected
 */
function selectPickerOption(select, modelId, providerId) {
  const values = [normalizeSavedIdForPicker(modelId), modelId];
  const options = Array.from(select.options);
  const match =
    options.find((o) => o.dataset.provider === providerId && values.includes(o.value)) ||
    options.find((o) => values.includes(o.value));
  if (!match) return false;
  match.selected = true;
  return true;
}

/**
 * Backwards compatible entry point: render the picker for an already saved id.
 * @param {string} [currentApiModel]
 */
export function populateModelSelect(currentApiModel) {
  renderModelPicker({ savedModelId: currentApiModel || null });
}

/**
 * Mark the catalog refresh as failed without dropping the rows on screen.
 * @param {boolean} failed
 */
export function setModelCatalogFailure(failed) {
  modelSourceFailure = Boolean(failed);
  paintModelSource();
}

let modelRefreshInFlight = false;

/** How long one provider listing may take before the source line reports a failure. */
const MODEL_REFRESH_TIMEOUT_MS = 15000;

/**
 * The provider that owns a key or base URL field.
 * @param {HTMLElement|null} input
 * @returns {{ id: string, keySetting?: string }|null}
 */
function providerForField(input) {
  if (!input) return null;
  return Object.values(AI_PROVIDERS).find((provider) => provider.keySetting === input.id) || null;
}

/**
 * Read the current value of a provider's key or base URL field.
 * @param {string} fieldId
 * @returns {string}
 */
function keyFieldValue(fieldId) {
  const field = /** @type {HTMLInputElement|null} */ (document.getElementById(fieldId));
  return field?.value?.trim() || "";
}

/**
 * The provider that owns the model currently selected in the picker.
 * @returns {{ id: string, keySetting?: string }|null}
 */
function selectedModelProvider() {
  const selectedProviderId = elements.apiModel?.selectedOptions?.[0]?.dataset.provider;
  if (selectedProviderId && AI_PROVIDERS[selectedProviderId]) {
    return AI_PROVIDERS[selectedProviderId];
  }
  const value = elements.apiModel?.value;
  return value ? getProviderByModel(value) : null;
}

/**
 * Ask the worker for one provider's catalog and render whatever comes back.
 * A failure keeps the rows already on screen and marks the source line: an
 * unreachable provider must never empty the picker.
 * @param {string} providerId
 * @param {{ key?: string, baseUrl?: string }} [options] `key` and `baseUrl` are in form
 *   values not yet saved
 */
export async function refreshModelCatalog(providerId, { key, baseUrl } = {}) {
  if (!providerId) return;
  if (modelRefreshInFlight) {
    // A second request while one is in flight is the newer intent, so it runs
    // next instead of being dropped.
    pendingRefreshProvider = { providerId, key, baseUrl };
    return;
  }
  modelRefreshInFlight = true;

  try {
    const payload = { provider: providerId };
    if (key) payload.key = key;
    if (baseUrl) payload.baseUrl = baseUrl;

    const response = await Promise.race([
      chrome.runtime.sendMessage({ type: "LIST_MODELS", payload }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ success: false, timedOut: true }), MODEL_REFRESH_TIMEOUT_MS),
      ),
    ]);

    if (!response || !response.success) {
      setModelCatalogFailure(true);
      return;
    }

    renderModelPicker({
      providerId,
      listed: Array.isArray(response.models) ? response.models : [],
      fetchedAt: response.fetchedAt || Date.now(),
      truncated: Boolean(response.truncated),
    });
  } catch {
    setModelCatalogFailure(true);
  } finally {
    modelRefreshInFlight = false;
    const queued = pendingRefreshProvider;
    pendingRefreshProvider = null;
    if (queued) void refreshModelCatalog(queued.providerId, queued);
  }
}

/**
 * Render the cached catalog for the saved model's provider, then refresh it
 * when the cache is missing or stale. At most one request per page load.
 */
async function hydrateModelCatalog() {
  const savedModel = savedModelForPicker || elements.apiModel?.value;
  const provider = savedProviderForPicker
    ? AI_PROVIDERS[savedProviderForPicker]
    : savedModel
      ? getProviderByModel(savedModel)
      : null;
  if (!provider) return;

  const cache = await getModelCatalogCache(provider.id);

  if (cache) {
    renderModelPicker({
      providerId: provider.id,
      listed: cache.models,
      fetchedAt: cache.fetchedAt,
      fromCache: true,
      truncated: Boolean(cache.truncated),
    });
  }

  const storedKey = keyFieldValue(provider.keySetting);
  const needsRefresh = !isCacheFresh(cache?.fetchedAt);
  if (needsRefresh && (storedKey || provider.id === "customGateway")) {
    await refreshModelCatalog(provider.id);
  }
}

/**
 * Render a language <select> from the shared registry.
 *
 * `pinnedCode` is the value that must stay selected: the registry appends it as
 * an option whenever it is unknown or filtered out, so a saved preference never
 * blanks the select.
 * @param {HTMLSelectElement|null} select
 * @param {string} [query]
 * @param {string} [pinnedCode]
 */
export function populateLanguageSelect(select, query = "", pinnedCode = select?.value || "") {
  if (!select) return;

  select.textContent = "";
  const groups = buildLanguageOptionGroups(query, {
    pinnedCode,
    getMessage: (key) => i18n.getMessage(key),
  });

  /**
   * @param {{ code: string, label: string }} option
   * @returns {HTMLOptionElement}
   */
  const buildOption = (option) => {
    const el = document.createElement("option");
    el.value = option.code;
    el.textContent = option.label;
    return el;
  };

  groups.forEach((group) => {
    if (!group.label) {
      group.options.forEach((option) => select.appendChild(buildOption(option)));
      return;
    }
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.options.forEach((option) => optgroup.appendChild(buildOption(option)));
    select.appendChild(optgroup);
  });

  if (pinnedCode) select.value = pinnedCode;
}

/**
 * Resolve every __MSG_key__ token in a string against the current i18n data.
 * @param {string} template
 * @returns {string}
 */
function resolveMessageTokens(template) {
  return template.replace(/__MSG_(\w+)__/g, (match, key) => i18n.getMessage(key) || match);
}

/**
 * localizeDOM() replaces __MSG_key__ tokens in place, so after the first call
 * the DOM only holds already-resolved text: nothing left for a plain
 * "scan for __MSG_" pass to find. That made a second call (e.g. after Save
 * changes Primary Language) a silent no-op. This cache remembers each
 * element's ORIGINAL token template the first time it's seen, so every later
 * call can still re-resolve it against fresh i18n data.
 * @type {{ attributes: Array<{el: Element, attr: string, template: string}>, textNodes: Array<{node: Text, template: string}> } | null}
 */
let localizationCache = null;

/**
 * Localize the DOM
 */
export function localizeDOM() {
  document.title = i18n.getMessage("extName") + " - " + i18n.getMessage("settings_title");

  if (!localizationCache) {
    localizationCache = { attributes: [], textNodes: [] };

    const elementsWithAttributes = document.querySelectorAll(
      '[title*="__MSG_"], [placeholder*="__MSG_"], [aria-label*="__MSG_"]',
    );
    elementsWithAttributes.forEach((el) => {
      ["title", "placeholder", "aria-label"].forEach((attr) => {
        const val = el.getAttribute(attr);
        if (val && val.includes("__MSG_")) {
          localizationCache.attributes.push({ el, attr, template: val });
        }
      });
    });

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      // @ts-expect-error legacy 4th argument (expandEntityReferences) is ignored by Chromium
      false,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("__MSG_")) {
        localizationCache.textNodes.push({ node, template: node.nodeValue });
      }
    }
  }

  localizationCache.attributes.forEach(({ el, attr, template }) => {
    el.setAttribute(attr, resolveMessageTokens(template));
  });
  localizationCache.textNodes.forEach(({ node, template }) => {
    node.nodeValue = resolveMessageTokens(template);
  });
}

/**
 * Load usage statistics
 */
async function loadStats() {
  try {
    const stats = await getStats();
    elements.statTotalActions.textContent = stats.totalActions || 0;
    elements.statWordsProcessed.textContent = stats.totalWordsProcessed || 0;
    elements.statWordsGenerated.textContent = stats.totalWordsGenerated || 0;

    // Future: Load history list if desired
  } catch (error) {
    console.error("Failed to load stats:", error);
  }
}

/**
 * Set up event listeners
 */
export function setupEventListeners() {
  // Model change listener
  elements.apiModel.addEventListener("change", () => {
    selectedModelForPicker = elements.apiModel.value || null;
    selectedProviderForPicker = elements.apiModel.selectedOptions?.[0]?.dataset.provider || null;
    updateModelVisibility();
    paintModelSource();

    const provider = selectedModelProvider();
    const key = provider ? keyFieldValue(provider.keySetting) : "";
    if (provider && (key || provider.id === "customGateway") && !modelCatalogs.has(provider.id)) {
      refreshModelCatalog(provider.id, { key: key || undefined });
    }
  });

  // Theme preview listener
  if (elements.themeSelector) {
    elements.themeSelector.addEventListener("change", (e) => {
      applyTheme(/** @type {HTMLSelectElement} */ (e.target).value);
    });
  }

  // Validate button
  if (elements.validateBtn) {
    elements.validateBtn.addEventListener("click", validateConfiguration);
  }

  // Flash Actions cap: re-evaluate on every checkbox change
  if (elements.flashActionsList) {
    elements.flashActionsList.addEventListener("change", updateFlashActionCap);
  }

  // Auto-validate on key blur (debounced; only when the value actually
  // changed from what was loaded/last validated for that field). Tracked
  // per-input (seeded from the value loadSettings() already populated) so a
  // blur on an untouched, already-saved key never re-triggers a call.
  const keyInputsForAutoValidate = [
    elements.geminiApiKey,
    elements.groqApiKey,
    elements.openaiApiKey,
    elements.anthropicApiKey,
    elements.customGatewayApiKey,
    elements.customGatewayBaseUrl,
  ];

  let autoValidateTimer;
  const lastValidatedValues = new Map();

  keyInputsForAutoValidate.forEach((input) => {
    if (!input) return;
    lastValidatedValues.set(input, (input.value || "").trim());
    input.addEventListener("blur", () => {
      const value = (input.value || "").trim();
      if (!value || value === lastValidatedValues.get(input)) return;
      clearTimeout(autoValidateTimer);
      autoValidateTimer = setTimeout(() => {
        lastValidatedValues.set(input, value);
        validateConfiguration();
        const provider = providerForField(input);
        if (provider) refreshModelCatalog(provider.id, { key: value });
      }, 500);
    });
  });

  // Refresh the fetched model list for the selected provider
  if (elements.modelRefresh) {
    elements.modelRefresh.addEventListener("click", () => {
      const provider = selectedModelProvider();
      if (!provider) return;
      const key = keyFieldValue(provider.keySetting);
      refreshModelCatalog(provider.id, {
        key: key || undefined,
        baseUrl: keyFieldValue("customGatewayBaseUrl") || undefined,
      });
    });
  }

  // Toggle API key visibility
  elements.toggleApiKey.addEventListener("click", toggleApiKeyVisibility);

  // Save button
  elements.saveBtn.addEventListener("click", saveSettings);

  // Shortcuts link (handle Chrome extension URLs)
  elements.shortcutsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  // History actions
  elements.refreshHistoryBtn.addEventListener("click", async () => {
    await loadStats();
  });

  elements.clearHistoryBtn.addEventListener("click", async () => {
    if (confirm(i18n.getMessage("settings_confirmClearHistory"))) {
      await resetStats();
      await loadStats();
    }
  });

  // Auto-save on change (optional)
  const inputs = [
    elements.geminiApiKey,
    elements.groqApiKey,
    elements.openaiApiKey,
    elements.anthropicApiKey,
    elements.customGatewayBaseUrl,
    elements.customGatewayApiKey,
    elements.apiModel,
    elements.defaultPreset,
    elements.primaryLanguage,
    elements.defaultLanguage,
  ];

  inputs.forEach((input) => {
    if (input)
      input.addEventListener("change", () => {
        // Debounce auto-save if desired
      });
  });
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  isGeminiKeyVisible = !isGeminiKeyVisible;
  elements.geminiApiKey.type = isGeminiKeyVisible ? "text" : "password";

  // Update icon
  const svg = elements.toggleApiKey.querySelector("svg");
  if (isGeminiKeyVisible) {
    svg.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    svg.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

/**
 * Update model visibility based on selection
 */
function updateModelVisibility() {
  const modelId = elements.apiModel.value;
  const provider = getProviderByModel(modelId);

  // Hide all groups first
  const groups = document.querySelectorAll(".setting-item[data-provider]");
  groups.forEach((el) => el.classList.add("hidden"));

  // Handle Custom Model Input
  if (modelId.endsWith("-custom") || modelId === "custom-gateway") {
    elements.customModelGroup.classList.remove("hidden");
  } else {
    elements.customModelGroup.classList.add("hidden");
  }

  const needsAdvanced = modelId.endsWith("-custom") || modelId === "custom-gateway";
  if (needsAdvanced && elements.advancedDetails) {
    elements.advancedDetails.open = true;
  }

  if (provider) {
    // Show matching group based on data-provider attribute
    const activeGroup = document.querySelector(`.setting-item[data-provider="${provider.id}"]`);
    if (activeGroup) {
      activeGroup.classList.remove("hidden");
    }
  }
}

/**
 * Validate current configuration
 */
export async function validateConfiguration() {
  const modelId = elements.apiModel.value;
  const provider = getProviderByModel(modelId);
  if (!provider) return;

  let validModelId = modelId;

  // Custom Model handling
  if (modelId.endsWith("-custom")) {
    const customName = elements.customModelName.value.trim();
    if (!customName) {
      showValidationStatus(i18n.getMessage("settings_errorNoCustomModel"), "error");
      return;
    }
    validModelId = customName;
  } else if (modelId === "custom-gateway") {
    const customName = elements.customModelName.value.trim();
    if (!customName) {
      showValidationStatus(i18n.getMessage("settings_errorNoCustomModel"), "error");
      return;
    }
    validModelId = customName;
  }

  // Get the Key and extra config for Custom Gateway
  let apiKey = "";
  let baseUrl = "";

  if (provider.id === "google") {
    apiKey = elements.geminiApiKey.value.trim();
  } else if (provider.id === "groq") {
    apiKey = elements.groqApiKey.value.trim();
  } else if (provider.id === "openai") {
    apiKey = elements.openaiApiKey.value.trim();
  } else if (provider.id === "anthropic") {
    apiKey = elements.anthropicApiKey.value.trim();
  } else if (provider.id === "customGateway") {
    apiKey = elements.customGatewayApiKey.value.trim();
    baseUrl = elements.customGatewayBaseUrl.value.trim();

    if (!baseUrl) {
      showValidationStatus(i18n.getMessage("settings_errorNoGatewayUrl"), "error");
      return;
    }
  }

  if (!apiKey && provider.id !== "customGateway") {
    showValidationStatus(i18n.getMessage("settings_errorNoApiKey"), "error");
    return;
  }

  showValidationStatus(i18n.getMessage("settings_validating"), "processing");
  setButtonLoading(true);

  try {
    const payload = { provider: provider.id, model: validModelId, key: apiKey };
    if (provider.id === "customGateway") {
      payload.baseUrl = baseUrl;
    }
    const response = await chrome.runtime.sendMessage({
      type: "VALIDATE_CONFIG",
      payload,
    });

    setButtonLoading(false);

    if (response.success) {
      showValidationStatus(i18n.getMessage("settings_configValid"), "success");
    } else {
      showValidationStatus(i18n.getMessage("error_prefix") + response.error, "error");
    }
  } catch (err) {
    setButtonLoading(false);
    showValidationStatus(
      `${i18n.getMessage("settings_connectionFailed")}: ${err.message}`,
      "error",
    );
  }
}

/**
 * Set button loading state
 */
function setButtonLoading(isLoading) {
  const btn = elements.validateBtn;
  if (!btn) return;

  if (isLoading) {
    btn.classList.add("loading");
    btn.disabled = true;
    const svg = btn.querySelector("svg");
    if (svg) svg.classList.add("ds-spin-icon");
    // Change icon to refresh/spinner
    btn.querySelector("span").textContent = i18n.getMessage("settings_checking");
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    const svg = btn.querySelector("svg");
    if (svg) svg.classList.remove("ds-spin-icon");
    btn.querySelector("span").textContent = i18n.getMessage("settings_validate");
  }
}

/**
 * Show validation status
 */
function showValidationStatus(message, type) {
  const el = elements.validationStatus;
  if (!el) return;

  // One notification shape everywhere: .ds-notice plus its status modifier.
  el.className = "ds-notice visible";
  const typeClass =
    type === "success"
      ? "ds-notice--success"
      : type === "error"
        ? "ds-notice--error"
        : type === "processing"
          ? "ds-notice--processing"
          : "";
  if (typeClass) el.classList.add(typeClass);

  // Icon based on type
  let icon = "";
  if (type === "success")
    icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  else if (type === "error")
    icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  else if (type === "processing")
    icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';

  el.innerHTML = `${icon}<span>${message}</span>`;

  // Auto hide after 5s if success
  if (type === "success") {
    setTimeout(() => {
      el.classList.remove("visible");
    }, 5000);
  }
}

export async function loadSettings() {
  try {
    // 1. Load Sync Preferences
    const currentTheme = await getThemePreference();
    /** @type {Record<string, any>} */
    const prefs = await getSyncPreferences();

    if (elements.themeSelector) {
      elements.themeSelector.value = currentTheme;
      applyTheme(elements.themeSelector.value);
    }
    const detectedLocale = detectSupportedLocale(
      chrome.i18n.getUILanguage(),
      SUPPORTED_LOCALES,
      "en",
    );
    // Render the language pickers from the shared registry right before the
    // saved value is applied, the same order populateModelSelect() uses, so a
    // saved code the registry does not know still gets an option to land on.
    const desiredPrimaryLanguage = prefs.primaryLanguage || detectedLocale;
    const desiredDefaultLanguage = prefs.defaultLanguage || "en";
    if (elements.primaryLanguage) {
      populateLanguageSelect(elements.primaryLanguage, "", desiredPrimaryLanguage);
      elements.primaryLanguage.value = desiredPrimaryLanguage;
    }
    if (elements.defaultLanguage) {
      populateLanguageSelect(elements.defaultLanguage, "", desiredDefaultLanguage);
      elements.defaultLanguage.value = desiredDefaultLanguage;
    }

    // 2. Load Local AI Config
    /** @type {Record<string, any>} */
    const config = await getLocalAiConfig();

    if (config.geminiApiKey) elements.geminiApiKey.value = config.geminiApiKey;
    if (config.groqApiKey) elements.groqApiKey.value = config.groqApiKey;
    if (config.openaiApiKey) elements.openaiApiKey.value = config.openaiApiKey;
    if (config.anthropicApiKey) elements.anthropicApiKey.value = config.anthropicApiKey;
    if (config.customModelName) elements.customModelName.value = config.customModelName;

    // Custom Gateway config
    if (elements.customGatewayBaseUrl)
      elements.customGatewayBaseUrl.value = config.customGatewayBaseUrl || "";
    if (elements.customGatewayApiKey)
      elements.customGatewayApiKey.value = config.customGatewayApiKey || "";

    // Load custom model name for selected provider
    const savedModel = config.apiModel || DEFAULT_MODEL;
    savedProviderForPicker = config.apiProvider || null;
    // populateModelSelect selects the saved model inside its saved provider's
    // group; setting .value here would pick the first group with that id.
    populateModelSelect(savedModel);
    if (!config.apiModel && !config.geminiApiKey) {
      elements.geminiApiKey?.focus();
    }
    if (savedModel === "custom-gateway" && config.customGatewayModelName) {
      elements.customModelName.value = config.customGatewayModelName;
    }
    const validPresets = ["professional", "casual", "friendly", "direct", "confident"];
    if (config.currentPreset && validPresets.includes(config.currentPreset)) {
      elements.defaultPreset.value = config.currentPreset;
    } else {
      elements.defaultPreset.value = "professional";
    }
    if (elements.showFloatingButton) {
      elements.showFloatingButton.value =
        config.settings?.showFloatingButton === false ? "off" : "on";
    }
    if (elements.flashActionsList) {
      const flashActions = config.settings?.flashActions || DEFAULT_FLASH_ACTIONS;
      elements.flashActionsList.querySelectorAll("[data-flash-action]").forEach((el) => {
        const box = /** @type {HTMLInputElement} */ (el);
        box.checked = flashActions.includes(box.dataset.flashAction);
      });
      updateFlashActionCap();
    }

    updateModelVisibility();
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

/**
 * Save settings to storage
 */
export async function saveSettings() {
  try {
    // Preferences to Sync
    const preferences = {
      primaryLanguage: elements.primaryLanguage.value,
      defaultLanguage: elements.defaultLanguage.value,
    };
    await setSyncPreferences(preferences);
    await setThemePreference(elements.themeSelector.value);

    // AI Config to Local
    /** @type {Record<string, any>} */
    const existingLocalSettings = await getSettingsBag();
    const aiConfig = {
      geminiApiKey: elements.geminiApiKey.value.trim(),
      groqApiKey: elements.groqApiKey.value.trim(),
      openaiApiKey: elements.openaiApiKey.value.trim(),
      anthropicApiKey: elements.anthropicApiKey.value.trim(),
      apiModel: elements.apiModel.value,
      apiProvider:
        elements.apiModel.selectedOptions?.[0]?.dataset.provider ||
        getProviderByModel(elements.apiModel.value)?.id ||
        "",
      customModelName: elements.customModelName.value.trim(),
      currentPreset: elements.defaultPreset.value,
      customGatewayBaseUrl: elements.customGatewayBaseUrl.value.trim(),
      customGatewayApiKey: elements.customGatewayApiKey.value.trim(),
      settings: {
        ...(existingLocalSettings || {}),
        showFloatingButton: elements.showFloatingButton?.value !== "off",
        flashActions: elements.flashActionsList
          ? /** @type {HTMLInputElement[]} */ (
              Array.from(elements.flashActionsList.querySelectorAll("[data-flash-action]"))
            )
              .filter((box) => box.checked)
              .map((box) => box.dataset.flashAction)
          : (existingLocalSettings?.flashActions ?? DEFAULT_FLASH_ACTIONS),
      },
    };

    // Save custom model name to gateway-specific key if custom gateway is selected
    if (elements.apiModel.value === "custom-gateway") {
      aiConfig.customGatewayModelName = elements.customModelName.value.trim();
    }
    await setLocalAiConfig(aiConfig);

    // Primary Language may have just changed: re-run i18n and re-localize
    // this page's own UI immediately (content.js's onPrimaryLanguageChanged
    // listener already handles it for other open tabs' overlays).
    await i18n.init();
    localizeDOM();
    if (elements.primaryLanguage) {
      populateLanguageSelect(elements.primaryLanguage, "", preferences.primaryLanguage);
    }
    if (elements.defaultLanguage) {
      populateLanguageSelect(elements.defaultLanguage, "", preferences.defaultLanguage);
    }

    showSaveStatus(i18n.getMessage("settings_saved"), "success");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showSaveStatus(i18n.getMessage("settings_failedToSave"), "error");
  }
}

/**
 * Show save status message
 */
function showSaveStatus(message, type = "success") {
  elements.saveStatus.textContent = message;
  // Colour comes from settings.css (.save-status / .save-status.error): an
  // inline colour cannot be overridden by the reduced-motion or theme rules,
  // and the status text now sits on the glass surface.
  elements.saveStatus.classList.toggle("ds-notice--error", type !== "success");
  elements.saveStatus.classList.toggle("ds-notice--success", type === "success");
  elements.saveStatus.classList.add("visible");

  setTimeout(() => {
    elements.saveStatus.classList.remove("visible");
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
