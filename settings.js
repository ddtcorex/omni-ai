import { getStats, resetStats } from "./lib/history.js";
import { i18n } from "./lib/i18n.js";
import {
  initTheme,
  applyTheme,
  getThemePreference,
  setThemePreference,
} from "./lib/theme-manager.js";
import { AI_PROVIDERS, getApiModelName, DEFAULT_MODEL } from "./lib/ai-providers.js";
import {
  buildPickerModel,
  filterChatModels,
  isCacheFresh,
  pickerRows,
  FILTER_THRESHOLD,
} from "./lib/model-catalog.js";
import { selectionFromStored, selectionToStored } from "./lib/model-selection.js";
import {
  getSyncPreferences,
  setSyncPreferences,
  getLocalAiConfig,
  setLocalAiConfig,
  getSettingsBag,
  getModelCatalogCache,
} from "./lib/storage.js";
import { buildLanguageOptionGroups, LANGUAGES } from "./lib/languages.js";
import { renderNotice } from "./lib/notice.js";

/**
 * Omni AI: Options Page Script
 * Handles settings UI and storage
 */

// DOM Elements
const elements = {
  extVersion: document.getElementById("extVersion"),
  geminiApiKey: /** @type {HTMLInputElement} */ (document.getElementById("geminiApiKey")), // Google Key
  providerPicker: document.getElementById("providerPicker"),
  modelPicker: document.getElementById("modelPicker"),
  modelHint: document.getElementById("modelHint"),
  modelFilter: /** @type {HTMLInputElement|null} */ (document.getElementById("modelFilter")),
  modelFilterRow: document.getElementById("modelFilterRow"),
  modelMore: /** @type {HTMLButtonElement|null} */ (document.getElementById("modelMore")),
  modelShown: document.getElementById("modelShown"),
  keyStatus: document.getElementById("keyStatus"),
  keyStatusRow: document.getElementById("keyStatusRow"),
  modelRefresh: /** @type {HTMLButtonElement|null} */ (document.getElementById("modelRefresh")),
  customModelName: /** @type {HTMLInputElement} */ (document.getElementById("customModelName")),
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
  await hydrateModelCatalog(selection.providerId);
}

/**
 * The AI provider card: provider, its credentials, then a model.
 *
 * `selection` is what the card shows right now; nothing reaches storage
 * before Save. `drafts` keeps each provider's own choice for this page's
 * lifetime, so switching away and back restores it.
 */
/** @type {import("./lib/model-selection.js").Selection} */
let selection = { providerId: null, modelId: null, customName: "" };
/** @type {Map<string, { modelId: string|null, customName: string }>} */
const drafts = new Map();
/** Whether the model list shows past its first view, and the filter text. */
/** The AI keys as loaded or last saved; Save maps the selection against it. */
let storedAiConfig = {};
let modelListExpanded = false;
let modelFilterQuery = "";

/**
 * Make a row of role="radio" buttons one tab stop: arrows move the focus,
 * Space and Enter choose.
 * @param {HTMLElement|null} container
 * @param {(button: HTMLElement) => void} onSelect
 */
function bindRadioGroup(container, onSelect) {
  if (!container) return;
  const radios = () =>
    /** @type {HTMLElement[]} */ (Array.from(container.querySelectorAll('[role="radio"]')));
  const items = radios();
  const active = items.find((el) => el.getAttribute("aria-checked") === "true") || items[0];
  items.forEach((el) => (el.tabIndex = el === active ? 0 : -1));
  if (container.dataset.radioBound) return;
  container.dataset.radioBound = "true";
  container.addEventListener("keydown", (event) => {
    const list = radios();
    const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (index < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      list[(index + step + list.length) % list.length].focus();
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onSelect(list[index]);
    }
  });
}

/**
 * @param {string} label
 * @param {boolean} checked
 * @returns {HTMLButtonElement}
 */
function choiceButton(label, checked) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice ds-pill";
  button.setAttribute("role", "radio");
  button.setAttribute("aria-checked", String(checked));
  button.textContent = label;
  return button;
}

/** Render the provider row from the registry. */
function renderProviderPicker() {
  const row = elements.providerPicker;
  if (!row) return;
  row.textContent = "";
  Object.values(AI_PROVIDERS).forEach((provider) => {
    const button = choiceButton(provider.name, provider.id === selection.providerId);
    button.dataset.provider = provider.id;
    button.addEventListener("click", () => selectProvider(provider.id));
    row.appendChild(button);
  });
  bindRadioGroup(row, (button) => selectProvider(button.dataset.provider));
}

/** Remember the shown provider's choice before another one replaces it. */
function keepDraft() {
  if (selection.providerId) {
    drafts.set(selection.providerId, {
      modelId: selection.modelId,
      customName: selection.customName,
    });
  }
}

/**
 * Show a provider: its row checked, its credentials, its models.
 * @param {string} providerId
 */
export function selectProvider(providerId, { focus = true, hydrate = true } = {}) {
  if (!AI_PROVIDERS[providerId]) return;
  keepDraft();
  const draft = drafts.get(providerId) || { modelId: null, customName: "" };
  selection = { providerId, modelId: draft.modelId, customName: draft.customName };
  modelListExpanded = false;
  modelFilterQuery = "";
  if (elements.modelFilter) elements.modelFilter.value = "";
  renderProviderPicker();
  if (focus) {
    /** @type {HTMLElement|null|undefined} */ (
      elements.providerPicker?.querySelector(`[data-provider="${providerId}"]`)
    )?.focus({ preventScroll: true });
  }
  showKeyGroup();
  if (elements.customModelName) elements.customModelName.value = selection.customName;
  paintKeyStatus();
  renderModelArea();
  if (hydrate) void hydrateModelCatalog(providerId);
}

/** Show only the selected provider's credential fields. */
function showKeyGroup() {
  document.querySelectorAll(".setting-item[data-provider]").forEach((group) => {
    group.classList.toggle(
      "hidden",
      /** @type {HTMLElement} */ (group).dataset.provider !== selection.providerId,
    );
  });
}

/** Each provider's fetched list for this page's lifetime. */
/** @type {Map<string, { listed: Array<Object>, fetchedAt: number|null, truncated: boolean }>} */
const modelCatalogs = new Map();
/** What the last listing said, per provider. */
/** @type {Map<string, { state: "busy"|"ok"|"failed", message?: string }>} */
const listingStates = new Map();
/**
 * Providers whose list on screen came from a credential the worker did not
 * cache (still unsaved). A Save asks once more so the saved one is cached.
 */
const uncachedProviders = new Set();
let listingInFlight = false;
/**
 * Listings waiting behind the one in flight, one per provider: a newer intent
 * replaces that provider's own entry and never another provider's.
 * @type {Map<string, { key?: string, baseUrl?: string }>}
 */
const queuedListings = new Map();
/** How long one listing may take before it counts as failed. */
const LISTING_TIMEOUT_MS = 15000;

/**
 * The provider that owns a key or base URL field.
 * @param {HTMLElement|null} input
 * @returns {{ id: string, keySetting?: string }|null}
 */
function providerForField(input) {
  if (!input) return null;
  // The base URL is half of the gateway's credential.
  if (input.id === "customGatewayBaseUrl") return AI_PROVIDERS.customGateway;
  return Object.values(AI_PROVIDERS).find((provider) => provider.keySetting === input.id) || null;
}

/**
 * Read the current value of a key or base URL field.
 * @param {string} fieldId
 * @returns {string}
 */
function keyFieldValue(fieldId) {
  const field = /** @type {HTMLInputElement|null} */ (document.getElementById(fieldId));
  return field?.value?.trim() || "";
}

/** A base URL with its trailing slashes dropped, so two spellings compare equal. */
function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

/**
 * The credential a provider's fields hold right now, saved or not. A gateway
 * key always travels with its base URL: the worker must never pair a key typed
 * for one gateway with the URL of another.
 * @param {string} providerId
 * @returns {{ key?: string, baseUrl?: string }}
 */
function formCredential(providerId) {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) return {};
  const credential = {};
  const key = keyFieldValue(provider.keySetting);
  if (key) credential.key = key;
  if (providerId === "customGateway") {
    const baseUrl = keyFieldValue("customGatewayBaseUrl");
    if (baseUrl) credential.baseUrl = baseUrl;
  }
  return credential;
}

/**
 * Whether a provider's fields hold enough to list its models: a key, or for
 * the gateway a base URL (its key is optional).
 * @param {string} providerId
 * @returns {boolean}
 */
function hasCredential(providerId) {
  if (providerId === "customGateway") return Boolean(keyFieldValue("customGatewayBaseUrl"));
  const keySetting = AI_PROVIDERS[providerId]?.keySetting;
  return Boolean(keySetting && keyFieldValue(keySetting));
}

/**
 * Repaint the card when a provider's listing changed, but only if that
 * provider is the one shown: a late reply never paints over another one.
 * @param {string} providerId
 */
function paintIfShown(providerId) {
  if (providerId !== selection.providerId) return;
  paintKeyStatus();
  renderModelArea();
}

/** The line under the credentials: checking, valid with a count, or failed. */
function paintKeyStatus() {
  const el = elements.keyStatus;
  const providerId = selection.providerId;
  if (elements.keyStatusRow) elements.keyStatusRow.hidden = !providerId;
  if (!el || !providerId) return;

  const listing = listingStates.get(providerId);
  const catalog = modelCatalogs.get(providerId);
  const state = listing?.state || (catalog ? "ok" : "idle");
  el.dataset.state = state;
  if (state === "busy") {
    el.textContent = i18n.getMessage("settings_keyChecking");
  } else if (state === "failed") {
    el.textContent = i18n.getMessage("settings_modelsLoadFailed", [listing?.message || ""]);
  } else if (state === "ok" && catalog) {
    const chat = filterChatModels(providerId, catalog.listed);
    const count = (chat.length ? chat : catalog.listed).length;
    el.textContent = i18n.getMessage("settings_keyValid", [String(count)]);
  } else {
    el.textContent = "";
  }

  if (elements.modelRefresh) {
    elements.modelRefresh.disabled = state === "busy" || !hasCredential(providerId);
    elements.modelRefresh.setAttribute("aria-busy", String(state === "busy"));
  }
}

/**
 * List one provider's models through the worker. A listing is the key check:
 * it succeeds only with a credential the provider accepts. A failure keeps
 * any list already on screen and shows the provider's own words.
 * @param {string} providerId
 * @param {{ key?: string, baseUrl?: string }} [credential] form values not yet saved;
 *   empty means the saved ones
 */
export async function refreshModelCatalog(providerId, credential = {}) {
  if (!providerId) return;
  if (listingInFlight) {
    // The newer intent for this provider runs later instead of being dropped.
    queuedListings.set(providerId, credential);
    return;
  }
  listingInFlight = true;
  listingStates.set(providerId, { state: "busy" });
  paintIfShown(providerId);
  let timer;

  try {
    const payload = { provider: providerId };
    if (credential.key) payload.key = credential.key;
    if (credential.baseUrl) payload.baseUrl = credential.baseUrl;
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type: "LIST_MODELS", payload }),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ success: false, error: i18n.getMessage("settings_connectionFailed") }),
          LISTING_TIMEOUT_MS,
        );
      }),
    ]);

    if (!response?.success) {
      listingStates.set(providerId, { state: "failed", message: String(response?.error || "") });
      return;
    }
    if (response.cached === false) uncachedProviders.add(providerId);
    else uncachedProviders.delete(providerId);
    modelCatalogs.set(providerId, {
      listed: Array.isArray(response.models) ? response.models : [],
      fetchedAt: response.fetchedAt || Date.now(),
      truncated: Boolean(response.truncated),
    });
    listingStates.set(providerId, { state: "ok" });
  } catch (error) {
    listingStates.set(providerId, { state: "failed", message: String(error?.message || "") });
  } finally {
    clearTimeout(timer);
    listingInFlight = false;
    paintIfShown(providerId);
    const [next] = queuedListings.entries();
    if (next) {
      queuedListings.delete(next[0]);
      void refreshModelCatalog(next[0], next[1]);
    }
  }
}

/**
 * Show a provider's cached list, then list it again when the cache is
 * missing or stale and its saved credential is filled in. Runs once per
 * provider per page load.
 * @param {string|null} providerId
 */
async function hydrateModelCatalog(providerId) {
  if (!providerId || modelCatalogs.has(providerId) || listingStates.has(providerId)) return;

  let cache = await getModelCatalogCache(providerId);
  // A gateway catalog lists what one base URL offers. Once the URL points
  // elsewhere it describes the wrong gateway, however fresh it is.
  if (
    cache &&
    providerId === "customGateway" &&
    normalizeBaseUrl(cache.baseUrl) !== normalizeBaseUrl(keyFieldValue("customGatewayBaseUrl"))
  ) {
    cache = null;
  }
  if (cache && !modelCatalogs.has(providerId)) {
    modelCatalogs.set(providerId, {
      listed: Array.isArray(cache.models) ? cache.models : [],
      fetchedAt: cache.fetchedAt || null,
      truncated: Boolean(cache.truncated),
    });
    paintIfShown(providerId);
  }
  // The cache read yields, and a key typed meanwhile may already have
  // started (or queued) this provider's listing: never list it twice.
  const listingStarted = listingStates.has(providerId) || queuedListings.has(providerId);
  if (!listingStarted && !isCacheFresh(cache?.fetchedAt) && hasCredential(providerId)) {
    await refreshModelCatalog(providerId);
  }
}

/**
 * @param {string|null} modelId
 * @returns {string}
 */
function apiNameOf(modelId) {
  return modelId ? getApiModelName(modelId) || modelId : "";
}

/**
 * The rows of the selected provider's model buttons: its fetched list when
 * there is one, else only the selected model's own button.
 * @param {string} providerId
 * @returns {{ rows: Array<{ id: string, label: string, state: string, recommended: boolean }>, hidden: number, total: number }}
 */
function modelRowsFor(providerId) {
  const provider = AI_PROVIDERS[providerId];
  const catalog = modelCatalogs.get(providerId);
  const current = apiNameOf(selection.modelId);
  if (!catalog) {
    if (!current) return { rows: [], hidden: 0, total: 0 };
    const shipped = provider.models.find((m) => apiNameOf(m.id) === current);
    return {
      rows: [
        { id: current, label: shipped?.name || current, state: "unlisted", recommended: false },
      ],
      hidden: 0,
      total: 0,
    };
  }
  const picker = buildPickerModel({
    providerId,
    listed: catalog.listed,
    savedModelId: selection.modelId,
    bundled: provider.models,
    recommended: provider.recommended || [],
    toApiName: getApiModelName,
    cap: Infinity,
    query: modelFilterQuery,
    sentinels: [],
    keepId: current || null,
  });
  const { rows, hidden } = pickerRows(picker, {
    expanded: modelListExpanded || Boolean(modelFilterQuery.trim()),
    keepId: current || null,
  });
  return { rows, hidden, total: picker.total };
}

/** The model area for the selected provider: hint, filter, buttons, More. */
function renderModelArea() {
  const providerId = selection.providerId;
  const hasList = Boolean(providerId && modelCatalogs.has(providerId));
  if (elements.modelHint) {
    elements.modelHint.textContent = hasList
      ? ""
      : providerId
        ? i18n.getMessage(
            providerId === "customGateway"
              ? "settings_modelsEnterGatewayUrl"
              : "settings_modelsEnterKey",
          )
        : i18n.getMessage("settings_modelsChooseProvider");
  }

  const picker = elements.modelPicker;
  if (!picker) return;
  picker.textContent = "";
  const { rows, hidden, total } = providerId
    ? modelRowsFor(providerId)
    : { rows: [], hidden: 0, total: 0 };

  if (elements.modelFilterRow) {
    elements.modelFilterRow.hidden = !(total > FILTER_THRESHOLD || modelFilterQuery);
  }

  // A typed name is the choice while it holds text, so no button is checked.
  const current = selection.customName.trim() ? "" : apiNameOf(selection.modelId);
  rows.forEach((row) => {
    const label =
      row.state === "missing"
        ? `${row.label} (${i18n.getMessage("settings_modelNoLongerOffered")})`
        : row.label;
    const button = choiceButton(label, row.id === current);
    button.dataset.model = row.id;
    button.dataset.state = row.state;
    if (row.label !== row.id) button.title = row.id;
    if (row.recommended) {
      const tag = document.createElement("span");
      tag.className = "choice-tag";
      tag.textContent = `· ${i18n.getMessage("settings_modelRecommended")}`;
      button.appendChild(tag);
    }
    button.addEventListener("click", () => chooseModel(row.id));
    picker.appendChild(button);
  });
  bindRadioGroup(picker, (button) => chooseModel(button.dataset.model));

  if (elements.modelMore) {
    const collapsible = modelListExpanded && !modelFilterQuery.trim();
    elements.modelMore.hidden = !(hidden > 0 || collapsible);
    elements.modelMore.textContent =
      hidden > 0
        ? i18n.getMessage("settings_modelsMore", [String(hidden)])
        : i18n.getMessage("settings_modelsLess");
  }
}

/**
 * Pick a model button: it becomes the choice and the typed name is cleared.
 * @param {string} modelId
 */
function chooseModel(modelId) {
  selection.modelId = modelId;
  selection.customName = "";
  if (elements.customModelName) elements.customModelName.value = "";
  renderModelArea();
  /** @type {HTMLElement|null|undefined} */ (
    elements.modelPicker?.querySelector('[aria-checked="true"]')
  )?.focus({ preventScroll: true });
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
  // Leaving a key or base URL field with a new value lists that provider's
  // models: the listing is the key check, and it costs no model call.
  const credentialInputs = [
    elements.geminiApiKey,
    elements.groqApiKey,
    elements.openaiApiKey,
    elements.anthropicApiKey,
    elements.customGatewayApiKey,
    elements.customGatewayBaseUrl,
  ];
  credentialInputs.forEach((input) => {
    if (!input) return;
    let lastValue = (input.value || "").trim();
    input.addEventListener("blur", () => {
      const value = (input.value || "").trim();
      if (value === lastValue) return;
      lastValue = value;
      const provider = providerForField(input);
      if (provider && hasCredential(provider.id)) {
        void refreshModelCatalog(provider.id, formCredential(provider.id));
      }
    });
  });

  elements.modelRefresh?.addEventListener("click", () => {
    if (selection.providerId) {
      void refreshModelCatalog(selection.providerId, formCredential(selection.providerId));
    }
  });

  elements.modelMore?.addEventListener("click", () => {
    modelListExpanded = !modelListExpanded;
    renderModelArea();
  });

  elements.modelFilter?.addEventListener("input", () => {
    modelFilterQuery = elements.modelFilter.value;
    renderModelArea();
  });

  // A typed model name replaces the buttons' choice for this provider.
  elements.customModelName?.addEventListener("input", () => {
    selection.customName = elements.customModelName.value;
    if (selection.customName.trim()) selection.modelId = null;
    renderModelArea();
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
 * Validate current configuration
 */
export async function validateConfiguration() {
  const provider = selection.providerId ? AI_PROVIDERS[selection.providerId] : null;
  if (!provider) return;

  const customName = selection.customName.trim();
  const validModelId =
    customName ||
    (selection.modelId ? getApiModelName(selection.modelId) || selection.modelId : "");
  if (!validModelId) {
    showValidationStatus(i18n.getMessage("settings_errorChooseModel"), "error");
    return;
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
      // The icon and colour already say it failed; the provider's words follow.
      showValidationStatus(response.error, "error");
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
  // One notice shape everywhere, and the provider's text is set as text.
  renderNotice(elements.validationStatus, type, message);
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
    // saved value is applied, so a saved code the registry does not know
    // still gets an option to land on.
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

    // Custom Gateway config
    if (elements.customGatewayBaseUrl)
      elements.customGatewayBaseUrl.value = config.customGatewayBaseUrl || "";
    if (elements.customGatewayApiKey)
      elements.customGatewayApiKey.value = config.customGatewayApiKey || "";

    storedAiConfig = { ...config };
    // The provider card shows the stored choice. An install that only ever
    // saved a Gemini key runs Gemini's default model, so it shows that.
    const saved = selectionFromStored(
      config.apiModel || !config.geminiApiKey
        ? config
        : { ...config, apiModel: DEFAULT_MODEL, apiProvider: "google" },
    );
    drafts.clear();
    selection = { providerId: null, modelId: null, customName: "" };
    if (saved.providerId) {
      drafts.set(saved.providerId, { modelId: saved.modelId, customName: saved.customName });
      selectProvider(saved.providerId, { focus: false, hydrate: false });
    } else {
      renderProviderPicker();
      showKeyGroup();
      renderModelArea();
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

    // The provider card's choice, in the keys the runtime reads. A provider
    // picked with no model yet is not saved: the stored model keeps working
    // and the rest of the page still saves.
    const mapped = selectionToStored(selection, storedAiConfig);
    if (mapped.ok) {
      Object.assign(aiConfig, mapped.values);
    } else {
      // Refused: the provider card writes nothing, so a key or base URL edited
      // for a model not chosen yet never changes what the saved model runs on.
      [
        "geminiApiKey",
        "groqApiKey",
        "openaiApiKey",
        "anthropicApiKey",
        "customGatewayBaseUrl",
        "customGatewayApiKey",
      ].forEach((key) => delete aiConfig[key]);
    }
    await setLocalAiConfig(aiConfig);
    storedAiConfig = { ...storedAiConfig, ...aiConfig };

    // The list on screen came from a credential that was not saved yet; now it
    // is, so one more listing lets the worker cache it for the next visit.
    if (mapped.ok && selection.providerId && uncachedProviders.has(selection.providerId)) {
      void refreshModelCatalog(selection.providerId);
    }

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
    paintKeyStatus();
    renderModelArea();

    if (!mapped.ok) {
      showSaveStatus(i18n.getMessage("settings_errorChooseModel"), "error");
      return;
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
  renderNotice(elements.saveStatus, type === "success" ? "success" : "error", message);

  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    elements.saveStatus.classList.remove("visible");
  }, 3000);
}

let saveStatusTimer;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
