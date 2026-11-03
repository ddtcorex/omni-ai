import {
  getSyncPreferences,
  setSyncPreferences,
  getPrimaryLanguage,
  getDefaultLanguage,
  getLocalAiConfig,
  setLocalAiConfig,
  getApiKey,
  getApiModel,
  getCurrentPreset,
  getCustomModelName,
  getCustomGatewayConfig,
  getSettingsBag,
  getModelCatalogCache,
  setModelCatalogCache,
} from "../../lib/storage.js";

describe("lib/storage.js", () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
  });

  test("getSyncPreferences reads both language keys in one call", async () => {
    chrome.storage.sync.get.mockResolvedValue({ primaryLanguage: "vi", defaultLanguage: "en" });
    await expect(getSyncPreferences()).resolves.toEqual({
      primaryLanguage: "vi",
      defaultLanguage: "en",
    });
    expect(chrome.storage.sync.get).toHaveBeenCalledWith(["primaryLanguage", "defaultLanguage"]);
  });

  test("setSyncPreferences writes both language keys", async () => {
    chrome.storage.sync.set.mockResolvedValue(undefined);
    await setSyncPreferences({ primaryLanguage: "fr", defaultLanguage: "de" });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      primaryLanguage: "fr",
      defaultLanguage: "de",
    });
  });

  test("getPrimaryLanguage returns undefined when unset (no opinionated default)", async () => {
    chrome.storage.sync.get.mockResolvedValue({});
    await expect(getPrimaryLanguage()).resolves.toBeUndefined();
  });

  test("getDefaultLanguage returns the stored value", async () => {
    chrome.storage.sync.get.mockResolvedValue({ defaultLanguage: "ja" });
    await expect(getDefaultLanguage()).resolves.toBe("ja");
  });

  test("getLocalAiConfig reads all local AI-config keys including settings in one call", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-3.6-flash" });
    await getLocalAiConfig();
    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      "geminiApiKey",
      "groqApiKey",
      "openaiApiKey",
      "anthropicApiKey",
      "apiModel",
      "apiProvider",
      "customModelName",
      "currentPreset",
      "customGatewayBaseUrl",
      "customGatewayApiKey",
      "customGatewayModelName",
      "settings",
    ]);
  });

  test("setLocalAiConfig writes the given config object as-is", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    const config = { geminiApiKey: "abc", apiModel: "gemini-3.6-flash" };
    await setLocalAiConfig(config);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(config);
  });

  test("getApiKey reads a named key generically", async () => {
    chrome.storage.local.get.mockResolvedValue({ anthropicApiKey: "sk-ant-xyz" });
    await expect(getApiKey("anthropicApiKey")).resolves.toBe("sk-ant-xyz");
    expect(chrome.storage.local.get).toHaveBeenCalledWith("anthropicApiKey");
  });

  test("getApiModel returns undefined when unset", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await expect(getApiModel()).resolves.toBeUndefined();
  });

  test("getCurrentPreset returns the stored value", async () => {
    chrome.storage.local.get.mockResolvedValue({ currentPreset: "casual" });
    await expect(getCurrentPreset()).resolves.toBe("casual");
  });

  test("getCustomModelName returns the stored value", async () => {
    chrome.storage.local.get.mockResolvedValue({ customModelName: "llama-3.1-8b-instant" });
    await expect(getCustomModelName()).resolves.toBe("llama-3.1-8b-instant");
  });

  test("getCustomGatewayConfig reads all three gateway keys in one call", async () => {
    chrome.storage.local.get.mockResolvedValue({ customGatewayBaseUrl: "https://x.test/v1" });
    await getCustomGatewayConfig();
    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      "customGatewayBaseUrl",
      "customGatewayApiKey",
      "customGatewayModelName",
    ]);
  });

  test("getSettingsBag returns the stored settings object", async () => {
    chrome.storage.local.get.mockResolvedValue({ settings: { showFloatingButton: false } });
    await expect(getSettingsBag()).resolves.toEqual({ showFloatingButton: false });
  });

  test("getSettingsBag returns undefined when never saved", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await expect(getSettingsBag()).resolves.toBeUndefined();
  });
});

describe("model catalog cache", () => {
  test("round-trips one provider and reports a miss for another", async () => {
    chrome.storage.local.get.mockResolvedValue({
      modelCatalog: { openai: { fetchedAt: 1, models: [], truncated: false } },
    });

    await expect(getModelCatalogCache("openai")).resolves.toEqual({
      fetchedAt: 1,
      models: [],
      truncated: false,
    });
    await expect(getModelCatalogCache("groq")).resolves.toBeNull();
  });

  test("writing one provider keeps the others", async () => {
    chrome.storage.local.get.mockResolvedValue({
      modelCatalog: { groq: { fetchedAt: 1, models: [], truncated: false } },
    });

    await setModelCatalogCache("openai", { fetchedAt: 2, models: [], truncated: false });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      modelCatalog: {
        groq: { fetchedAt: 1, models: [], truncated: false },
        openai: { fetchedAt: 2, models: [], truncated: false },
      },
    });
  });

  test("getLocalAiConfig reads apiProvider with the rest of the config", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await getLocalAiConfig();
    expect(chrome.storage.local.get).toHaveBeenCalledWith(expect.arrayContaining(["apiProvider"]));
  });
});
