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
});
