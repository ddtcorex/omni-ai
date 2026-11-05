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
