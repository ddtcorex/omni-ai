const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Covers Flash Actions: hovering the floating quick-action icon for a beat
// reveals a row of user-configured shortcuts (Settings > Flash Actions) that
// run an action directly, skipping the full quick-action menu entirely.

const FIXTURE = `<!doctype html><html><body>
<p id="target">The quick brown fox jumps over the lazy dog for flash-action testing.</p>
</body></html>`;

async function seedConfig(sw, flashActions) {
  // onInstalled's initializeSettings() writes chrome.storage.local
  // asynchronously; wait for it to finish before overriding, so our seed
  // isn't the one that loses the race and gets clobbered by the defaults.
  await sw.evaluate(async (actions) => {
    for (let i = 0; i < 50; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true, flashActions: actions },
    });
  }, flashActions);
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

async function dragSelectTarget(page) {
  const box = await page.locator("#target").boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("hovering the floating icon for the configured delay reveals the configured flash actions", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase", "grammar"]);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });

    await quickBtn.hover();
    await page.waitForTimeout(650);

    await expect(page.locator(".omni-ai-flash-btn")).toHaveCount(2);
    await expect(page.locator('[data-flash-action="rephrase"]')).toBeVisible();
    await expect(page.locator('[data-flash-action="grammar"]')).toBeVisible();
  } finally {
    await context.close();
    server.close();
  }
});

test("moving the mouse away before the hover delay elapses never reveals the flash actions", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });

    await quickBtn.hover();
    await page.waitForTimeout(100); // well under the 500ms reveal delay
    await page.mouse.move(0, 0); // leave the button before it fires
    await page.waitForTimeout(650);

    await expect(page.locator(".omni-ai-flash-btn")).toHaveCount(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("clicking a flash action shows the AI result directly, without the quick-action menu ever opening", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);
    await stubGemini(context, "REPHRASED-VIA-FLASH");

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.hover();

    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });
    await flashBtn.click();

    // The full quick-action menu (opened by clicking the icon itself, or by
    // showQuickActionMenu()) never renders on this path.
    await expect(page.locator(".omni-ai-menu-grid")).toHaveCount(0);

    await expect(page.locator(".omni-ai-content-area")).toContainText("REPHRASED-VIA-FLASH", {
      timeout: 5000,
    });
  } finally {
    await context.close();
    server.close();
  }
});

test("moving from the floating icon into the flash-actions row keeps it visible", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase", "grammar"]);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.hover();

    const flashBtn = page.locator('[data-flash-action="grammar"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });

    // Move from the icon into the row itself; this must not trigger the
    // hide-grace timeout (150ms) that fires once the icon is left.
    await flashBtn.hover();
    await page.waitForTimeout(300);

    await expect(page.locator(".omni-ai-flash-btn")).toHaveCount(2);
  } finally {
    await context.close();
    server.close();
  }
});
