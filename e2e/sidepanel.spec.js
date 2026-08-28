const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

test("side panel loads and renders the three Page Tools buttons", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    await expect(page).toHaveTitle("Omni AI");
    await expect(page.locator("#summarizeBtn")).toBeVisible();
    await expect(page.locator("#translateBtn")).toBeVisible();
    await expect(page.locator("#explainBtn")).toBeVisible();
    await expect(page.locator("#resultArea")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("clicking Summarize reads the active tab's content and shows a result or a clear error", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <p>The quick brown fox jumps over the lazy dog, repeatedly, for testing purposes.</p>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    const pageTab = await context.newPage();
    await pageTab.goto(`http://127.0.0.1:${port}/`);
    await pageTab.bringToFront();

    const extId = new URL(sw.url()).host;
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
    await panel.click("#summarizeBtn");

    // No API key is configured in this harness, so the real assertion is
    // that the panel reaches a terminal state (result or error) instead of
    // hanging on "Working on it..." forever -- same constraint the removed
    // popup e2e specs worked under.
    await expect(panel.locator("#statusLine.error, #resultArea:not(.hidden)")).toBeVisible();
  } finally {
    await context.close();
    server.close();
  }
});
