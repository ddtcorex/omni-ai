const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

const HOST_SEL = "#omni-ai-shadow-host"; // OMNI_UI_HOST_ID, content/content.js:110

const FIXTURE = `<!doctype html><html><body>
<p id="target">The quick brown fox jumps over the lazy dog.</p>
</body></html>`;

test("selecting text mounts the Omni AI shadow UI", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    // drag-select the sentence
    const box = await page.locator("#target").boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    const host = page.locator(HOST_SEL);
    await expect(host).toHaveCount(1);
    // The quick-action button mounts after a 10ms mouseup debounce in
    // content.js handleSelectionChange(), so poll instead of sleeping.
    // The host itself is 0x0 and its <style> is attached eagerly at init —
    // only the selection-triggered quick button (.omni-ai-quick-btn, built
    // in content.js presentQuickActionButton) proves the selection UI
    // actually appeared; generic [class*='omni'] would also match static
    // chrome like the overlay host styles.
    await expect
      .poll(
        () =>
          page.evaluate((sel) => {
            const el = document.querySelector(sel);
            const root = el && el.shadowRoot;
            return root ? root.querySelectorAll(".omni-ai-quick-btn").length : 0;
          }, HOST_SEL),
        { timeout: 5000 },
      )
      .toBeGreaterThan(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("popup page loads and renders its chat shell", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/popup/popup.html`);

    await expect(page).toHaveTitle("Omni AI");
    await expect(page.locator("#chatContainer")).toBeVisible();
    await expect(page.locator("#emptyState")).toBeVisible();
    await expect(page.locator("#settingsBtn")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("settings page loads and renders provider configuration", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/settings.html`);

    // <title>__MSG_extName__ - __MSG_settings_title__</title> resolves via chrome.i18n
    await expect(page).toHaveTitle(/Omni AI/);
    await expect(page.locator("#apiModel")).toBeVisible();
    // Provider key groups start collapsed (class "hidden") until their
    // provider tab is selected — assert DOM attachment, not visibility.
    await expect(page.locator("#geminiApiKey")).toBeAttached();
    await expect(page.locator("#customGatewayBaseUrl")).toBeAttached();
  } finally {
    await context.close();
  }
});
