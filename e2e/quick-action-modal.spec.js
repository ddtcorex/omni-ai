const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Covers the full on-page modal lifecycle that unit tests can't reach:
// floating button -> quick-action menu -> AI result overlay -> Replace,
// across the standard (<input>) and rich-text (contenteditable) adapters.
// The Gemini network call is stubbed via context.route() so no real API key
// or network access is required.

async function seedConfig(sw) {
  // onInstalled's initializeSettings() writes chrome.storage.local
  // asynchronously; wait for it to finish before overriding, so our seed
  // isn't the one that loses the race and gets clobbered by the defaults.
  await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true },
    });
  });
}

function stubGemini(context, replyText) {
  return context.route("**/generativelanguage.googleapis.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: replyText }] } }] }),
    });
  });
}

test("replaces a partial input selection via the quick-action menu", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "WORLD-IMPROVED");

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.evaluate(() => {
      const el = document.getElementById("target");
      el.focus();
      el.setSelectionRange(6, 11); // selects "world"
    });
    await page.locator("#target").dispatchEvent("mouseup");

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.click();

    // showQuickActionMenu() awaits chrome.storage.sync.get() before it builds
    // the menu DOM and binds click handlers (content.js ~line 848) — give
    // that a beat so the click below lands after listeners are attached.
    const rephraseBtn = page.locator('[data-action="rephrase"]');
    await expect(rephraseBtn).toBeVisible();
    await page.waitForTimeout(200);
    await rephraseBtn.click();

    const replaceBtn = page.locator("#omniAiReplace");
    await expect(replaceBtn).toBeVisible({ timeout: 5000 });
    await replaceBtn.click();

    await expect(page.locator("#target")).toHaveValue(
      "Hello WORLD-IMPROVED, this is a test.",
    );
  } finally {
    await context.close();
    server.close();
  }
});

test("replaces the full input value when nothing is selected", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "FULL-REPLY-TEXT");

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.locator("#target").click(); // focus only, cursor collapsed -> full-text mode
    await page.locator("#target").dispatchEvent("mouseup");

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.click();

    // showQuickActionMenu() awaits chrome.storage.sync.get() before it builds
    // the menu DOM and binds click handlers (content.js ~line 848) — give
    // that a beat so the click below lands after listeners are attached.
    const replyBtn = page.locator('[data-action="reply"]');
    await expect(replyBtn).toBeVisible();
    await page.waitForTimeout(200);
    await replyBtn.click();

    const replaceBtn = page.locator("#omniAiReplace");
    await expect(replaceBtn).toBeVisible({ timeout: 5000 });
    await replaceBtn.click();

    await expect(page.locator("#target")).toHaveValue("FULL-REPLY-TEXT");
  } finally {
    await context.close();
    server.close();
  }
});

test("replaces a selection inside a contenteditable composer", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <div id="target" contenteditable="true">Hello world, this is a composer.</div>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "RICHTEXT-IMPROVED");

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.evaluate(() => {
      const el = document.getElementById("target");
      el.focus();
      const range = document.createRange();
      range.setStart(el.firstChild, 6);
      range.setEnd(el.firstChild, 11); // selects "world"
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.locator("#target").dispatchEvent("mouseup");

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.click();

    // showQuickActionMenu() awaits chrome.storage.sync.get() before it builds
    // the menu DOM and binds click handlers (content.js ~line 848) — give
    // that a beat so the click below lands after listeners are attached.
    const rephraseBtn = page.locator('[data-action="rephrase"]');
    await expect(rephraseBtn).toBeVisible();
    await page.waitForTimeout(200);
    await rephraseBtn.click();

    const replaceBtn = page.locator("#omniAiReplace");
    await expect(replaceBtn).toBeVisible({ timeout: 5000 });
    await replaceBtn.click();

    await expect(page.locator("#target")).toHaveText(
      "Hello RICHTEXT-IMPROVED, this is a composer.",
    );
  } finally {
    await context.close();
    server.close();
  }
});

test("hides the floating button when showFloatingButton is disabled", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    // onInstalled's initializeSettings() also writes chrome.storage.local
    // asynchronously; wait for it to finish (currentPreset only ever comes
    // from its defaults) before overriding showFloatingButton, so our write
    // isn't the one that gets clobbered by the race.
    await sw.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const { currentPreset } = await chrome.storage.local.get("currentPreset");
        if (currentPreset) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await chrome.storage.local.set({ settings: { showFloatingButton: false } });
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.evaluate(() => {
      const el = document.getElementById("target");
      el.focus();
      el.setSelectionRange(0, 5);
    });
    await page.locator("#target").dispatchEvent("mouseup");
    await page.waitForTimeout(300);

    await expect(page.locator(".omni-ai-quick-btn")).toHaveCount(0);
  } finally {
    await context.close();
    server.close();
  }
});
