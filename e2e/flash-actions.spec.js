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

test("the default flash actions render Translate first, then Rephrase and Grammar", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    // Seed only the API bits and leave settings.flashActions untouched, so
    // this exercises onInstalled's initializeSettings() default order.
    await sw.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const { currentPreset } = await chrome.storage.local.get("currentPreset");
        if (currentPreset) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await chrome.storage.local.set({
        apiModel: "gemini-3.6-flash",
        geminiApiKey: "fake-key-for-e2e",
      });
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.hover();
    await page.waitForTimeout(650);

    const order = await page
      .locator(".omni-ai-flash-btn")
      .evaluateAll((els) => els.map((el) => el.dataset.flashAction));
    expect(order).toEqual(["translate_primary", "rephrase", "grammar"]);
  } finally {
    await context.close();
    server.close();
  }
});

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

test("clicking a flash action does not reposition or recreate the floating icon", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);
    // Delay the AI response so there's a deterministic window, after the
    // click but before the result arrives, to check the icon hasn't moved.
    await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "SLOW-REPLY" }] } }] }),
      });
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    // Read the inline top/left content.js actually assigns, not the rendered
    // bounding box -- :hover's CSS transform:scale() legitimately changes the
    // box's rendered size/position and would make this assertion flaky for
    // reasons unrelated to the bug (a stale hover transition mid-flight).
    const originalPosition = await quickBtn.evaluate((el) => ({
      top: el.style.top,
      left: el.style.left,
    }));

    await quickBtn.hover();
    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });
    await flashBtn.click();

    // handleSelectionChange() re-checks the selection 10ms after any mouseup
    // that reaches document; give that a wide berth, still well before the
    // deliberately-delayed (300ms) AI response arrives and removes the icon.
    await page.waitForTimeout(150);

    await expect(quickBtn).toHaveCount(1);
    expect(await quickBtn.evaluate((el) => ({ top: el.style.top, left: el.style.left }))).toEqual(
      originalPosition,
    );
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
