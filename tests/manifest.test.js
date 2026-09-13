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
