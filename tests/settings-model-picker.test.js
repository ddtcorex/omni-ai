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
