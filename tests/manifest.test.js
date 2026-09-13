const fs = require("fs");
const path = require("path");

describe("manifest.json MV3 validity", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));

  test("manifest_version is 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  test("background declares service_worker, not the MV2-only scripts fallback", () => {
    // Chrome rejects the manifest outright ("'background.scripts' requires
    // manifest version of 2 or lower") if `scripts` is present alongside
    // manifest_version 3, even with `service_worker` also set. A prior fix
    // for a non-blocking Firefox-only web-ext lint warning
    // (BACKGROUND_SERVICE_WORKER_NOFALLBACK) added this key and broke
    // loading in Chrome, the extension's primary and only supported target.
    expect(manifest.background.service_worker).toBe("background/service-worker.js");
    expect(manifest.background).not.toHaveProperty("scripts");
  });

  test("_execute_action command description explains what it does, not just the extension name", () => {
    // This description is what Chrome renders at chrome://extensions/shortcuts
    // for the row with no suggested_key. Reusing __MSG_popup_title__ ("Omni AI")
    // there told the user which extension, not what pressing the shortcut does.
    expect(manifest.commands._execute_action.description).toBe("__MSG_command_openPanel__");
  });

  test("quick_menu is declared first and defaults to Alt+O", () => {
    // "First" so it's the extension's headline shortcut in Chrome's shortcuts
    // UI (which follows manifest declaration order); Alt+O so it lands in the
    // 4-suggested_key budget (see the exactly-4 test below) instead of being
    // a 5th one, which previously hung Playwright's extension load (FOLLOWUPS #8).
    const commandNames = Object.keys(manifest.commands);
    expect(commandNames[0]).toBe("quick_menu");
    expect(manifest.commands.quick_menu.suggested_key).toEqual({ default: "Alt+O", mac: "Alt+O" });
  });

  test("quick_ask no longer has a default suggested_key (gave up its slot to quick_menu)", () => {
    expect(manifest.commands.quick_ask.suggested_key).toBeUndefined();
  });

  test("exactly 4 commands declare a suggested_key", () => {
    // Chrome only auto-binds up to 4 suggested_key shortcuts per extension at
    // install; a 5th previously hung Playwright's extension load (FOLLOWUPS #8).
    const withSuggestedKey = Object.values(manifest.commands).filter((c) => c.suggested_key);
    expect(withSuggestedKey).toHaveLength(4);
  });
});

describe("command_openPanel i18n key", () => {
  const locales = ["en", "vi"];

  test.each(locales)("_locales/%s/messages.json defines command_openPanel", (locale) => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(__dirname, `../_locales/${locale}/messages.json`), "utf8"),
    );
    expect(messages.command_openPanel).toBeDefined();
    expect(messages.command_openPanel.message).toEqual(expect.any(String));
    expect(messages.command_openPanel.message.length).toBeGreaterThan(0);
  });
});

describe("command_openQuickMenu i18n key", () => {
  const locales = ["en", "vi"];

  test.each(locales)("_locales/%s/messages.json defines command_openQuickMenu", (locale) => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(__dirname, `../_locales/${locale}/messages.json`), "utf8"),
    );
    expect(messages.command_openQuickMenu).toBeDefined();
    expect(messages.command_openQuickMenu.message).toEqual(expect.any(String));
    expect(messages.command_openQuickMenu.message.length).toBeGreaterThan(0);
  });
});
