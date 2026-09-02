const { chromium } = require("@playwright/test");
const http = require("node:http");
const path = require("node:path");

const EXT_PATH = path.resolve(__dirname, "..");

// Loads the unpacked MV3 extension (repo root) into Playwright's bundled
// Chromium. `channel: "chromium"` is REQUIRED post flag-removal: stable
// Chrome dropped --load-extension side-loading, and this channel enables
// headless mode while keeping the MV3 service-worker handle alive across
// idle suspension (docs/DEV-TOOLING.md §4).
async function launchWithExtension() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", // REQUIRED post flag-removal; enables headless
    headless: true,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  return { context, sw };
}

function serveFixtureHtml(html) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { launchWithExtension, serveFixtureHtml };
