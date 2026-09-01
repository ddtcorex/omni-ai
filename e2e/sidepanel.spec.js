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

test("clicking Summarize reads the active tab's content (not a stray iframe's) and shows a result or a clear provider error", async () => {
  // The blank iframe is the regression check: manifest.json's content
  // script runs with all_frames:true AND match_about_blank:true, so this
  // iframe gets its own copy of content.js and will also answer a
  // broadcast GET_PAGE_CONTENT with empty content. If sidepanel.js ever
  // drops the { frameId: 0 } targeting, chrome.tabs.sendMessage's "first
  // frame to reply wins" behavior can return the iframe's empty content
  // instead of the real page's, and this test should catch it via the
  // "Nothing to work with" assertion below.
  const FIXTURE = `<!doctype html><html><body>
    <iframe src="about:blank"></iframe>
    <p>The quick brown fox jumps over the lazy dog, repeatedly, for testing purposes.</p>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    const extId = new URL(sw.url()).host;

    // Open the panel FIRST, then the fixture page, and bring the fixture
    // tab to front -- this makes the fixture tab (not the panel) the
    // "active" tab for chrome.tabs.query({ active, currentWindow }) inside
    // getActivePageContent(). The previous version of this test opened the
    // panel last, which made the panel itself the active tab and meant the
    // test only ever exercised the "can't read this page" error branch.
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    const pageTab = await context.newPage();
    await pageTab.goto(`http://127.0.0.1:${port}/`);
    await pageTab.bringToFront();

    // Click inside the panel's own page context rather than Playwright's
    // page.click(), which activates/focuses the target page and would flip
    // the panel back into being the "active" tab, undoing the setup above.
    await panel.evaluate(() => document.getElementById("summarizeBtn").click());

    // No API key is configured in this harness, so the real assertion is
    // that the panel reaches a terminal state (result or error) instead of
    // hanging on "Working on it..." forever -- same constraint the removed
    // popup e2e specs worked under.
    await expect(panel.locator("#statusLine.error, #resultArea:not(.hidden)")).toBeVisible();

    // The specific terminal state matters: it must NOT be one of the two
    // content-fetch error messages. Reaching either of those means
    // getActivePageContent() failed to read the fixture tab's real content
    // (e.g. the frameId race returned the blank iframe's empty text
    // instead) -- the only acceptable terminal states here are a real
    // result, or a provider-side error (no API key configured).
    const statusText = (await panel.locator("#statusLine").textContent()) || "";
    expect(statusText).not.toContain("Can't read this page");
    expect(statusText).not.toContain("Nothing to work with");
  } finally {
    await context.close();
    server.close();
  }
});
