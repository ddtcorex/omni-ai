/**
 * Omni AI: the model choice as Settings shows it, and as storage holds it.
 *
 * Settings picks a provider, then either one of its listed models or a typed
 * custom name. Storage keeps the keys the runtime already reads: a typed name
 * is the provider's custom entry ("<provider>-custom" or "custom-gateway")
 * plus customModelName / customGatewayModelName. Mapping both ways here keeps
 * every saved configuration loading and saving unchanged.
 */

import {
  AI_PROVIDERS,
  getProviderByModel,
  getApiModelName,
  isCustomModelEntry,
} from "./ai-providers.js";

/**
 * @typedef {{ providerId: string|null, modelId: string|null, customName: string }} Selection
 */

/**
 * The registry id of a provider's custom entry (the one with apiModel "custom").
 * @param {string} providerId
 * @returns {string}
 */
export function customSentinelFor(providerId) {
  const entry = AI_PROVIDERS[providerId]?.models?.find((model) => model.apiModel === "custom");
  return entry ? entry.id : `${providerId}-custom`;
}

/**
 * @param {string} modelId
 * @returns {string}
 */
function apiName(modelId) {
  return getApiModelName(modelId) || modelId;
}

/**
 * What Settings shows for a stored configuration.
 * @param {Record<string, any>} config
 * @returns {Selection}
 */
export function selectionFromStored(config) {
  const model = config?.apiModel || "";
  const providerId = config?.apiProvider || (model && getProviderByModel(model)?.id) || null;
  if (!providerId) return { providerId: null, modelId: null, customName: "" };
  if (model === "custom-gateway") {
    return { providerId, modelId: null, customName: config.customGatewayModelName || "" };
  }
  if (isCustomModelEntry(model)) {
    return { providerId, modelId: null, customName: config.customModelName || "" };
  }
  return { providerId, modelId: model || null, customName: "" };
}

/**
 * The storage values for a selection. A saved model still selected is written
 * back exactly as stored, so an untouched Save never rewrites a shipped id.
 * @param {Selection} selection
 * @param {Record<string, any>} config the stored configuration
 * @returns {{ ok: true, values: Record<string, string> } | { ok: false, reason: "no-model" }}
 */
export function selectionToStored(selection, config) {
  const { providerId, modelId } = selection;
  if (!providerId) return { ok: true, values: {} };
  const customName = String(selection.customName || "").trim();

  if (customName) {
    return providerId === "customGateway"
      ? {
          ok: true,
          values: {
            apiProvider: providerId,
            apiModel: "custom-gateway",
            customGatewayModelName: customName,
          },
        }
      : {
          ok: true,
          values: {
            apiProvider: providerId,
            apiModel: customSentinelFor(providerId),
            customModelName: customName,
          },
        };
  }

  if (!modelId) return { ok: false, reason: "no-model" };

  const stored = config?.apiModel;
  const unchanged =
    stored &&
    providerId === selectionFromStored(config).providerId &&
    apiName(stored) === apiName(modelId);
  return { ok: true, values: { apiProvider: providerId, apiModel: unchanged ? stored : modelId } };
}
