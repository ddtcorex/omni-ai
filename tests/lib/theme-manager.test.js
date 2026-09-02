import { THEMES, applyTheme, getThemePreference, setThemePreference } from "../../lib/theme-manager.js";

describe("theme-manager", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
  });

  test("applyTheme defaults to document.documentElement when no root is given", () => {
    applyTheme(THEMES.LIGHT);
    expect(document.documentElement.classList.contains("omni-ai-light-mode")).toBe(true);
  });

  test("applyTheme applies the class to a custom root instead of document.documentElement", () => {
    const customRoot = document.createElement("div");
    applyTheme(THEMES.LIGHT, customRoot);
    expect(customRoot.classList.contains("omni-ai-light-mode")).toBe(true);
    expect(document.documentElement.classList.contains("omni-ai-light-mode")).toBe(false);
  });

  test("applyTheme removes the class from the custom root for dark", () => {
    const customRoot = document.createElement("div");
    customRoot.classList.add("omni-ai-light-mode");
    applyTheme(THEMES.DARK, customRoot);
    expect(customRoot.classList.contains("omni-ai-light-mode")).toBe(false);
  });

  test("applyTheme resolves 'system' against matchMedia for a custom root", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn() });
    const customRoot = document.createElement("div");
    applyTheme(THEMES.SYSTEM, customRoot);
    expect(customRoot.classList.contains("omni-ai-light-mode")).toBe(false); // matches:true => dark
  });

  test("getThemePreference defaults to light", async () => {
    chrome.storage.sync.get.mockResolvedValue({});
    await expect(getThemePreference()).resolves.toBe(THEMES.LIGHT);
  });

  test("setThemePreference rejects an unknown theme value", async () => {
    await setThemePreference("neon");
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});
