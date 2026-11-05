/**
 * The provider first model picker, driven through the real settings.html
 * markup so ids, order and roles are the shipped ones.
 */
const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "settings.html"), "utf8");
const BODY = HTML.slice(HTML.indexOf("<body"), HTML.lastIndexOf("</body>")).replace(
  /^<body[^>]*>/,
  "",
);

/** A storage double: one object shared by get and set, like chrome.storage.local. */
function useStorage(initial = {}) {
  const local = { ...initial };
  chrome.storage.local.get.mockImplementation(async (keys) => {
    if (!keys) return { ...local };
    const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
    return Object.fromEntries(list.filter((k) => k in local).map((k) => [k, local[k]]));
  });
  chrome.storage.local.set.mockImplementation(async (values) => {
    Object.assign(local, values);
  });
  return local;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const providerButton = (id) => document.querySelector(`#providerPicker [data-provider="${id}"]`);
const visible = (el) => Boolean(el) && !el.classList.contains("hidden") && !el.hidden;

let Settings;

async function boot(stored = {}, { listModels } = {}) {
  jest.resetModules();
  document.body.innerHTML = BODY;
  chrome.i18n.getMessage.mockImplementation((key, subs) =>
    subs === undefined ? key : `${key}:${[].concat(subs).join(",")}`,
  );
  chrome.i18n.getUILanguage = jest.fn().mockReturnValue("en-US");
  chrome.runtime.getManifest = jest.fn(() => ({ version: "0.0.0" }));
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  chrome.storage.sync.get.mockResolvedValue({});
  global.fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
  const local = useStorage(stored);
  chrome.runtime.sendMessage.mockReset();
  chrome.runtime.sendMessage.mockImplementation(async (msg) => {
    if (msg.type === "LIST_MODELS" && listModels) return listModels(msg.payload);
    return { success: true };
  });
  Settings = await import("../settings.js");
  await Settings.init();
  await flush();
  return local;
}

describe("provider row", () => {
  test("renders one radio per provider, the saved one checked", async () => {
    await boot({ apiProvider: "openai", apiModel: "gpt-5.7-nova" });

    const radios = Array.from(document.querySelectorAll("#providerPicker [role=radio]"));
    expect(radios.map((r) => r.dataset.provider)).toEqual([
      "google",
      "openai",
      "groq",
      "anthropic",
      "customGateway",
    ]);
    expect(providerButton("openai").getAttribute("aria-checked")).toBe("true");
    expect(providerButton("google").getAttribute("aria-checked")).toBe("false");
  });

  test("choosing a provider shows only its key group", async () => {
    await boot({});
    providerButton("openai").click();

    expect(visible(document.getElementById("openaiKeyGroup"))).toBe(true);
    for (const id of [
      "googleKeyGroup",
      "groqKeyGroup",
      "anthropicKeyGroup",
      "customGatewayKeyGroup",
    ]) {
      expect(visible(document.getElementById(id))).toBe(false);
    }
  });

  test("the gateway shows its base URL above an optional key", async () => {
    await boot({});
    providerButton("customGateway").click();

    const group = document.getElementById("customGatewayKeyGroup");
    expect(visible(group)).toBe(true);
    const fields = Array.from(group.querySelectorAll("input")).map((i) => i.id);
    expect(fields).toEqual(["customGatewayBaseUrl", "customGatewayApiKey"]);
  });

  test("the provider row is one tab stop and arrows move the selection", async () => {
    await boot({ apiProvider: "google", apiModel: "gemini-3.6-flash" });
    const radios = Array.from(document.querySelectorAll("#providerPicker [role=radio]"));
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);

    providerButton("google").focus();
    providerButton("google").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(providerButton("openai"));

    providerButton("openai").dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(providerButton("openai").getAttribute("aria-checked")).toBe("true");
    expect(visible(document.getElementById("openaiKeyGroup"))).toBe(true);
  });

  test("switching provider changes no stored value", async () => {
    await boot({ apiProvider: "google", apiModel: "gemini-3.6-flash", geminiApiKey: "AIza-k" });
    chrome.storage.local.set.mockClear();

    providerButton("groq").click();
    providerButton("customGateway").click();
    await flush();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

const models = (...ids) =>
  ids.map((id, i) => ({ id, label: id, createdAt: 100 - i, state: "active", methods: null }));
const listReply = (...ids) => ({
  success: true,
  models: models(...ids),
  fetchedAt: 1,
  cached: true,
});
const sent = (type) => chrome.runtime.sendMessage.mock.calls.filter(([m]) => m.type === type);
const keyStatus = () => document.getElementById("keyStatus");

function typeAndBlur(id, value) {
  const input = document.getElementById(id);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("blur"));
}

describe("key check on blur", () => {
  test("a key blur lists models and never validates", async () => {
    await boot({}, { listModels: () => listReply("gpt-5.7-nova", "gpt-5.6-terra") });
    providerButton("openai").click();
    typeAndBlur("openaiApiKey", "sk-new-key");
    await flush();

    expect(sent("LIST_MODELS")).toHaveLength(1);
    expect(sent("LIST_MODELS")[0][0].payload).toEqual({ provider: "openai", key: "sk-new-key" });
    expect(sent("VALIDATE_CONFIG")).toHaveLength(0);
    expect(keyStatus().dataset.state).toBe("ok");
    expect(keyStatus().textContent).toBe("settings_keyValid:2");
  });

  test("a blur on an unchanged key lists nothing", async () => {
    await boot({ apiProvider: "openai", apiModel: "gpt-5.7-nova", openaiApiKey: "sk-saved" });
    chrome.runtime.sendMessage.mockClear();
    document.getElementById("openaiApiKey").dispatchEvent(new Event("blur"));
    await flush();

    expect(sent("LIST_MODELS")).toHaveLength(0);
  });

  test("a failed listing shows the provider's words", async () => {
    await boot({}, { listModels: () => ({ success: false, error: "API key not valid" }) });
    providerButton("google").click();
    typeAndBlur("geminiApiKey", "AIza-bad");
    await flush();

    expect(keyStatus().dataset.state).toBe("failed");
    expect(keyStatus().textContent).toBe("settings_modelsLoadFailed:API key not valid");
  });

  test("a gateway base URL blur sends the typed URL with the typed key", async () => {
    await boot(
      {
        apiProvider: "customGateway",
        apiModel: "custom-gateway",
        customGatewayBaseUrl: "https://old.example/v1",
        customGatewayApiKey: "gw-saved",
      },
      { listModels: () => listReply("qwen3.8-27b") },
    );
    chrome.runtime.sendMessage.mockClear();
    document.getElementById("customGatewayApiKey").value = "gw-typed";
    typeAndBlur("customGatewayBaseUrl", "https://new.example/v1");
    await flush();

    expect(sent("LIST_MODELS").at(-1)[0].payload).toEqual({
      provider: "customGateway",
      key: "gw-typed",
      baseUrl: "https://new.example/v1",
    });
  });

  test("a keyless gateway is listed once its base URL is filled", async () => {
    await boot({}, { listModels: () => listReply("local-model") });
    providerButton("customGateway").click();
    expect(document.getElementById("modelHint").textContent).toBe("settings_modelsEnterGatewayUrl");
    typeAndBlur("customGatewayBaseUrl", "http://localhost:11434/v1");
    await flush();

    expect(sent("LIST_MODELS")[0][0].payload).toEqual({
      provider: "customGateway",
      baseUrl: "http://localhost:11434/v1",
    });
  });

  test("a reply for another provider does not paint the one shown", async () => {
    let resolveOpenai;
    await boot(
      {},
      {
        listModels: (payload) =>
          payload.provider === "openai"
            ? new Promise((resolve) => (resolveOpenai = resolve))
            : listReply("llama"),
      },
    );
    providerButton("openai").click();
    typeAndBlur("openaiApiKey", "sk-new-key");
    providerButton("groq").click();
    resolveOpenai(listReply("gpt-5.7-nova", "gpt-5.6-terra"));
    await flush();

    expect(keyStatus().dataset.state).toBe("idle");
    expect(document.getElementById("modelHint").textContent).toBe("settings_modelsEnterKey");

    providerButton("openai").click();
    expect(keyStatus().textContent).toBe("settings_keyValid:2");
  });

  test("before a list the hint shows and no shipped model renders", async () => {
    await boot({});
    providerButton("anthropic").click();

    expect(document.getElementById("modelHint").textContent).toBe("settings_modelsEnterKey");
    expect(document.querySelectorAll("#modelPicker [role=radio]")).toHaveLength(0);
  });

  test("opening settings with a saved key and no cache lists exactly that provider", async () => {
    await boot(
      { apiProvider: "groq", apiModel: "llama-3.3-70b-versatile", groqApiKey: "gsk-saved" },
      { listModels: () => listReply("llama-3.3-70b-versatile") },
    );

    expect(sent("LIST_MODELS").map(([m]) => m.payload)).toEqual([{ provider: "groq" }]);
  });

  test("a fresh cache renders without a request", async () => {
    await boot({
      apiProvider: "openai",
      apiModel: "gpt-5.7-nova",
      openaiApiKey: "sk-saved",
      modelCatalog: { openai: { fetchedAt: Date.now(), models: models("gpt-5.7-nova") } },
    });

    expect(sent("LIST_MODELS")).toHaveLength(0);
    expect(keyStatus().textContent).toBe("settings_keyValid:1");
  });

  test("a gateway cache from another base URL is not used", async () => {
    await boot(
      {
        apiProvider: "customGateway",
        apiModel: "custom-gateway",
        customGatewayBaseUrl: "https://new.example/v1",
        modelCatalog: {
          customGateway: {
            fetchedAt: Date.now(),
            models: models("old-model"),
            baseUrl: "https://old.example/v1",
          },
        },
      },
      { listModels: () => listReply("new-model") },
    );

    expect(sent("LIST_MODELS")).toHaveLength(1);
  });

  test("a refresh that arrives while another is in flight runs next", async () => {
    let first;
    let calls = 0;
    await boot(
      {},
      {
        listModels: () => {
          calls += 1;
          return calls === 1 ? new Promise((resolve) => (first = resolve)) : listReply("b");
        },
      },
    );
    providerButton("openai").click();
    typeAndBlur("openaiApiKey", "sk-one");
    typeAndBlur("openaiApiKey", "sk-two");
    first(listReply("a"));
    await flush();
    await flush();

    expect(sent("LIST_MODELS").map(([m]) => m.payload.key)).toEqual(["sk-one", "sk-two"]);
  });

  test("listings queued behind a slow one all run, each with its own credential", async () => {
    let releaseFirst;
    let calls = 0;
    await boot(
      {
        apiProvider: "google",
        apiModel: "gemini-3.6-flash",
        anthropicApiKey: "ant-saved",
        modelCatalog: {
          anthropic: { fetchedAt: 1, models: models("claude-sonnet-5") },
        },
      },
      {
        listModels: () => {
          calls += 1;
          return calls === 1 ? new Promise((resolve) => (releaseFirst = resolve)) : listReply("m");
        },
      },
    );
    providerButton("google").click();
    typeAndBlur("geminiApiKey", "AIza-slow");
    providerButton("openai").click();
    typeAndBlur("openaiApiKey", "sk-typed");
    providerButton("anthropic").click();
    await flush();
    releaseFirst(listReply("g"));
    for (let i = 0; i < 6; i++) await flush();

    const payloads = sent("LIST_MODELS").map(([m]) => m.payload);
    expect(payloads).toContainEqual({ provider: "openai", key: "sk-typed" });
    expect(payloads.some((p) => p.provider === "anthropic")).toBe(true);
  });

  test("the refresh control lists the shown provider again", async () => {
    await boot(
      {
        apiProvider: "openai",
        apiModel: "gpt-5.7-nova",
        openaiApiKey: "sk-saved",
        modelCatalog: { openai: { fetchedAt: Date.now(), models: models("gpt-5.7-nova") } },
      },
      { listModels: () => listReply("gpt-5.7-nova", "gpt-5.8") },
    );
    document.getElementById("modelRefresh").click();
    await flush();

    expect(sent("LIST_MODELS")).toHaveLength(1);
    expect(keyStatus().textContent).toBe("settings_keyValid:2");
  });
});

const modelButtons = () => Array.from(document.querySelectorAll("#modelPicker [role=radio]"));
const checkedModel = () =>
  modelButtons().find((b) => b.getAttribute("aria-checked") === "true")?.dataset.model;
const cached = (providerId, ids, extra = {}) => ({
  modelCatalog: { [providerId]: { fetchedAt: Date.now(), models: models(...ids), ...extra } },
});
const many = (n) => Array.from({ length: n }, (_, i) => `model-${String(i).padStart(3, "0")}`);
const filter = () => document.getElementById("modelFilter");
const more = () => document.getElementById("modelMore");

describe("model buttons", () => {
  test("forty models show twelve buttons and More shows all", async () => {
    await boot({
      apiProvider: "customGateway",
      apiModel: "model-000",
      customGatewayBaseUrl: "https://gw.example/v1",
      ...cached("customGateway", many(40), { baseUrl: "https://gw.example/v1" }),
    });

    expect(modelButtons()).toHaveLength(12);
    expect(more().hidden).toBe(false);
    expect(more().textContent).toBe("settings_modelsMore:28");
    more().click();
    expect(modelButtons()).toHaveLength(40);
    expect(more().textContent).toBe("settings_modelsLess");
  });

  test("the filter appears past thirty models and searches the whole list", async () => {
    await boot({
      apiProvider: "customGateway",
      apiModel: "model-000",
      customGatewayBaseUrl: "https://gw.example/v1",
      ...cached("customGateway", many(31), { baseUrl: "https://gw.example/v1" }),
    });

    expect(document.getElementById("modelFilterRow").hidden).toBe(false);
    filter().value = "model-030";
    filter().dispatchEvent(new Event("input", { bubbles: true }));
    expect(modelButtons().map((b) => b.dataset.model)).toEqual(["model-000", "model-030"]);
  });

  test("thirty models or fewer get no filter", async () => {
    await boot({
      apiProvider: "customGateway",
      apiModel: "model-000",
      customGatewayBaseUrl: "https://gw.example/v1",
      ...cached("customGateway", many(30), { baseUrl: "https://gw.example/v1" }),
    });

    expect(document.getElementById("modelFilterRow").hidden).toBe(true);
  });

  test("typing a custom name unchecks the buttons, clicking a button clears it", async () => {
    await boot({
      apiProvider: "openai",
      apiModel: "gpt-5.7-nova",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova", "gpt-5.6-terra"]),
    });
    const custom = document.getElementById("customModelName");
    expect(checkedModel()).toBe("gpt-5.7-nova");

    custom.value = "ft:my-model";
    custom.dispatchEvent(new Event("input", { bubbles: true }));
    expect(checkedModel()).toBeUndefined();

    modelButtons()
      .find((b) => b.dataset.model === "gpt-5.6-terra")
      .click();
    expect(custom.value).toBe("");
    expect(checkedModel()).toBe("gpt-5.6-terra");
  });

  test("spaces in the custom field leave the button checked", async () => {
    await boot({
      apiProvider: "openai",
      apiModel: "gpt-5.7-nova",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova"]),
    });
    const custom = document.getElementById("customModelName");
    custom.value = "   ";
    custom.dispatchEvent(new Event("input", { bubbles: true }));

    expect(checkedModel()).toBe("gpt-5.7-nova");
  });

  test("a provider switch opens collapsed with an empty filter", async () => {
    await boot({
      apiProvider: "customGateway",
      apiModel: "model-000",
      customGatewayBaseUrl: "https://gw.example/v1",
      openaiApiKey: "sk",
      modelCatalog: {
        customGateway: {
          fetchedAt: Date.now(),
          models: models(...many(40)),
          baseUrl: "https://gw.example/v1",
        },
        openai: { fetchedAt: Date.now(), models: models(...many(40)) },
      },
    });
    more().click();
    filter().value = "model-01";
    filter().dispatchEvent(new Event("input", { bubbles: true }));

    providerButton("openai").click();
    await flush();

    expect(filter().value).toBe("");
    expect(modelButtons()).toHaveLength(12);
  });

  test("a saved model the list no longer has stays checked with its label", async () => {
    await boot({
      apiProvider: "openai",
      apiModel: "gpt-5.8-orion",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova"]),
    });

    const gone = modelButtons()[0];
    expect(gone.dataset.model).toBe("gpt-5.8-orion");
    expect(gone.getAttribute("aria-checked")).toBe("true");
    expect(gone.dataset.state).toBe("missing");
    expect(gone.textContent).toContain("settings_modelNoLongerOffered");
  });

  test("a saved gateway custom name shows in the field with no button checked", async () => {
    await boot({
      apiProvider: "customGateway",
      apiModel: "custom-gateway",
      customGatewayModelName: "qwen3.8-27b",
      customGatewayBaseUrl: "https://gw.example/v1",
      ...cached("customGateway", ["qwen3.8-27b", ...many(287)], {
        baseUrl: "https://gw.example/v1",
      }),
    });

    expect(document.getElementById("customModelName").value).toBe("qwen3.8-27b");
    expect(checkedModel()).toBeUndefined();
    expect(modelButtons().some((b) => b.dataset.model === "custom-gateway")).toBe(false);
    expect(modelButtons().some((b) => b.dataset.state === "missing")).toBe(false);
  });

  test("a saved shipped id checks its API name button", async () => {
    await boot({
      apiProvider: "openai",
      apiModel: "openai-gpt-5.6-terra",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova", "gpt-5.6-terra"]),
    });

    expect(checkedModel()).toBe("gpt-5.6-terra");
    expect(modelButtons().filter((b) => b.dataset.model === "gpt-5.6-terra")).toHaveLength(1);
  });

  test("a saved model with no list yet shows as its own checked button", async () => {
    await boot({ apiProvider: "openai", apiModel: "gpt-5.7-nova" });

    expect(modelButtons().map((b) => b.dataset.model)).toEqual(["gpt-5.7-nova"]);
    expect(checkedModel()).toBe("gpt-5.7-nova");
    expect(document.getElementById("modelHint").textContent).toBe("settings_modelsEnterKey");
  });

  test("the recommended model says so and a named model keeps its id as a tooltip", async () => {
    await boot({
      apiProvider: "openai",
      apiModel: "gpt-5.7-nova",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova", "gpt-5.6-terra"]),
    });
    const terra = modelButtons().find((b) => b.dataset.model === "gpt-5.6-terra");

    expect(terra.textContent).toContain("GPT-5.6 Terra");
    expect(terra.textContent).toContain("settings_modelRecommended");
    expect(terra.title).toBe("gpt-5.6-terra");
  });
});

const saveStatus = () => document.getElementById("saveStatus");
const validation = () => document.getElementById("validationStatus");
async function clickSave() {
  document.getElementById("saveBtn").click();
  await flush();
  await flush();
}

describe("save and check", () => {
  test("a model button saves its API name with the provider", async () => {
    const local = await boot({
      apiProvider: "openai",
      apiModel: "gpt-5.7-nova",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova", "gpt-5.6-terra"]),
    });
    modelButtons()
      .find((b) => b.dataset.model === "gpt-5.6-terra")
      .click();
    await clickSave();

    expect(local.apiProvider).toBe("openai");
    expect(local.apiModel).toBe("gpt-5.6-terra");
    expect(saveStatus().classList.contains("ds-notice--success")).toBe(true);
  });

  test("an untouched open and save keeps a shipped id byte for byte", async () => {
    const local = await boot({
      apiProvider: "openai",
      apiModel: "openai-gpt-5.6-terra",
      openaiApiKey: "sk",
      ...cached("openai", ["gpt-5.7-nova", "gpt-5.6-terra"]),
    });
    await clickSave();

    expect(local.apiModel).toBe("openai-gpt-5.6-terra");
    expect(local.apiProvider).toBe("openai");
  });

  test("a gateway custom name saves the gateway entry", async () => {
    const local = await boot({ customGatewayBaseUrl: "https://gw.example/v1" });
    providerButton("customGateway").click();
    const custom = document.getElementById("customModelName");
    custom.value = "qwen3.8-27b";
    custom.dispatchEvent(new Event("input", { bubbles: true }));
    await clickSave();

    expect(local).toMatchObject({
      apiProvider: "customGateway",
      apiModel: "custom-gateway",
      customGatewayModelName: "qwen3.8-27b",
    });
  });

  test("save after switching provider with no model refuses the AI config", async () => {
    const local = await boot({
      apiProvider: "google",
      apiModel: "gemini-3.6-flash",
      geminiApiKey: "AIza",
    });
    chrome.storage.sync.set.mockClear();
    providerButton("groq").click();
    document.getElementById("groqApiKey").value = "gsk-new";
    await clickSave();

    expect(local.apiModel).toBe("gemini-3.6-flash");
    expect(local.apiProvider).toBe("google");
    expect(local.groqApiKey).toBeUndefined();
    expect(chrome.storage.sync.set).toHaveBeenCalled();
    expect(saveStatus().classList.contains("ds-notice--error")).toBe(true);
    expect(saveStatus().textContent).toBe("settings_errorChooseModel");
  });

  test("a refused save keeps the stored gateway URL the saved model runs on", async () => {
    const local = await boot({
      apiProvider: "customGateway",
      apiModel: "custom-gateway",
      customGatewayModelName: "llama3",
      customGatewayBaseUrl: "https://a.example/v1",
    });
    document.getElementById("customGatewayBaseUrl").value = "https://b.example/v1";
    const custom = document.getElementById("customModelName");
    custom.value = "";
    custom.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("defaultPreset").value = "casual";
    await clickSave();

    expect(local.customGatewayBaseUrl).toBe("https://a.example/v1");
    expect(local.apiModel).toBe("custom-gateway");
    expect(local.customGatewayModelName).toBe("llama3");
    expect(local.currentPreset).toBe("casual");
    expect(saveStatus().classList.contains("ds-notice--error")).toBe(true);
  });

  test("a fresh install saves without a provider and writes no model", async () => {
    const local = await boot({});
    await clickSave();

    expect(local.apiModel).toBeUndefined();
    expect(saveStatus().classList.contains("ds-notice--success")).toBe(true);
  });

  test("save after a listing with unsaved credentials lists once more", async () => {
    let cachedFlag = false;
    await boot(
      {},
      {
        listModels: () => ({ ...listReply("gpt-5.7-nova"), cached: cachedFlag }),
      },
    );
    providerButton("openai").click();
    typeAndBlur("openaiApiKey", "sk-typed");
    await flush();
    modelButtons()[0].click();
    cachedFlag = true;
    chrome.runtime.sendMessage.mockClear();
    await clickSave();

    expect(sent("LIST_MODELS").map(([m]) => m.payload)).toEqual([{ provider: "openai" }]);
  });

  test("check configuration sends the typed custom name", async () => {
    await boot({ apiProvider: "openai", apiModel: "gpt-5.7-nova", openaiApiKey: "sk" });
    const custom = document.getElementById("customModelName");
    custom.value = "ft:my-model";
    custom.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("validateBtn").click();
    await flush();

    expect(sent("VALIDATE_CONFIG")[0][0].payload).toEqual({
      provider: "openai",
      model: "ft:my-model",
      key: "sk",
    });
  });

  test("check sends the API name of a saved shipped id", async () => {
    await boot({ apiProvider: "openai", apiModel: "openai-gpt-5.6-terra", openaiApiKey: "sk" });
    document.getElementById("validateBtn").click();
    await flush();

    expect(sent("VALIDATE_CONFIG")[0][0].payload.model).toBe("gpt-5.6-terra");
  });

  test("check with no model shows the choose a model error", async () => {
    await boot({});
    providerButton("openai").click();
    document.getElementById("openaiApiKey").value = "sk";
    document.getElementById("validateBtn").click();
    await flush();

    expect(sent("VALIDATE_CONFIG")).toHaveLength(0);
    expect(validation().classList.contains("ds-notice--error")).toBe(true);
    expect(validation().textContent).toBe("settings_errorChooseModel");
  });

  test("a provider's validation error is shown as text, not markup", async () => {
    await boot({ apiProvider: "openai", apiModel: "gpt-5.7-nova", openaiApiKey: "sk" });
    chrome.runtime.sendMessage.mockImplementation(async (msg) =>
      msg.type === "VALIDATE_CONFIG"
        ? { success: false, error: '<img src=x onerror="alert(1)">' }
        : { success: true },
    );
    document.getElementById("validateBtn").click();
    await flush();

    expect(validation().querySelector("img")).toBeNull();
    expect(validation().textContent).toBe('<img src=x onerror="alert(1)">');
    expect(validation().classList.contains("ds-notice--error")).toBe(true);
  });
});
