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

test("Save button stays visible (fixed) while scrolling, on a tall-enough window", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    // Above the 750px min-height media query threshold in settings.css —
    // see the comment on .save-actions for why the fixed positioning is
    // gated behind window height at all.
    await page.setViewportSize({ width: 900, height: 900 });
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/settings.html`);

    // Scroll to roughly the middle of the page, NOT the very bottom: since
    // the Save button is the last element in the document, scrolling all
    // the way to document.body.scrollHeight reveals it regardless of
    // position: fixed (it's just where normal flow ends up). The real
    // test is a scroll position where normal flow would put the button
    // well below the viewport but fixed positioning pins it in view.
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    await page.evaluate((y) => window.scrollTo(0, y), scrollHeight / 2);

    const box = await page.locator("#saveBtn").boundingBox();

    expect(box).not.toBeNull();
    // "Visible in the viewport" — top is non-negative and bottom doesn't
    // exceed the viewport height. Without position: fixed, at a mid-page
    // scroll offset the button (being the last element, normally far
    // below the fold) would report a y coordinate well past viewportHeight.
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight + 1); // +1 for sub-pixel rounding
  } finally {
    await context.close();
  }
});

test("Save button does not overlap Validate Configuration on a short window", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    // Below the 750px threshold — .save-actions falls back to normal
    // document flow instead of position: fixed. Regression test for the
    // bug where an unconditional fixed/sticky bar overlapped the Validate
    // Configuration button on short windows (DevTools open, an
    // unmaximized browser, etc.), since that button alone can sit close
    // to where a ~116px-tall fixed bottom bar would otherwise render.
    await page.setViewportSize({ width: 900, height: 700 });
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/settings.html`);

    const validateBox = await page.locator("#validateBtn").boundingBox();
    const saveBox = await page.locator("#saveBtn").boundingBox();

    expect(validateBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    // No vertical overlap: Validate Configuration's bottom edge sits at or
    // above the Save button's top edge.
    expect(validateBox.y + validateBox.height).toBeLessThanOrEqual(saveBox.y);
  } finally {
    await context.close();
  }
});
