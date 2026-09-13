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

test("the flash row renders in canonical order regardless of the order saved in storage", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    // Simulate a pre-existing install whose settings.flashActions was
    // persisted in the OLD order, before Translate was moved first --
    // chrome.storage.local survives a dev "Reload extension", so this is a
    // real state a user's browser can be in even after a code update.
    await seedConfig(sw, ["grammar", "rephrase", "translate_primary"]);

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

test("Replace works after running a flash action on an <input> field", async () => {
  const INPUT_FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(INPUT_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);
    await stubGemini(context, "WORLD-VIA-FLASH");

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
    await quickBtn.hover();

    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });
    await flashBtn.click();

    const replaceBtn = page.locator("#omniAiReplace");
    await expect(replaceBtn).toBeVisible({ timeout: 5000 });
    await replaceBtn.click();

    await expect(page.locator("#target")).toHaveValue("Hello WORLD-VIA-FLASH, this is a test.");
  } finally {
    await context.close();
    server.close();
  }
});

test("Replace recovers by id when the page re-renders the field mid-flight, instead of silently no-oping", async () => {
  const INPUT_FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(INPUT_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);
    // Delay the AI response so there's room to swap the DOM node before
    // Replace becomes clickable -- simulating a live page (e.g. a comment
    // counter poll) re-rendering the field while a flash action is in flight.
    await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: "RECOVERED-REPLY" }] } }],
        }),
      });
    });

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
    await quickBtn.hover();

    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });
    await flashBtn.click();

    // Replace the original node with a fresh one sharing the same id --
    // exactly what a framework re-render (e.g. React) does under the hood.
    await page.evaluate(() => {
      const old = document.getElementById("target");
      const fresh = document.createElement("input");
      fresh.type = "text";
      fresh.id = "target";
      fresh.value = "Freshly re-rendered value";
      old.replaceWith(fresh);
    });

    const replaceBtn = page.locator("#omniAiReplace");
    await expect(replaceBtn).toBeVisible({ timeout: 5000 });
    await replaceBtn.click();

    // Recovered node has no original selection, so this falls back to a
    // whole-field replace rather than the originally-selected substring.
    await expect(page.locator("#target")).toHaveValue("RECOVERED-REPLY");
  } finally {
    await context.close();
    server.close();
  }
});

test("Replace fails gracefully (overlay stays open) when the field is removed entirely and can't be recovered", async () => {
  const INPUT_FIXTURE = `<!doctype html><html><body>
    <input type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(INPUT_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);
    await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: "ORPHANED-REPLY" }] } }],
        }),
      });
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.evaluate(() => {
      const el = document.querySelector("input");
      el.focus();
      el.setSelectionRange(6, 11);
    });
    await page.locator("input").dispatchEvent("mouseup");

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    await quickBtn.hover();

    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });
    await flashBtn.click();

    // No id to recover by -- the field is just gone by the time Replace is
    // clickable (e.g. the user's comment form got removed/collapsed).
    await page.evaluate(() => document.querySelector("input").remove());

    const replaceBtn = page.locator("#omniAiReplace");
    await expect(replaceBtn).toBeVisible({ timeout: 5000 });
    await replaceBtn.click();

    // Replace couldn't do anything real, so it must not claim success by
    // closing the overlay -- that would look like a silent, misleading no-op.
    await expect(replaceBtn).toBeVisible();
  } finally {
    await context.close();
    server.close();
  }
});

test("the flash row is vertically centered on the floating icon, not just top-aligned", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, ["rephrase"]);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelectTarget(page);

    const quickBtn = page.locator(".omni-ai-quick-btn");
    await expect(quickBtn).toHaveCount(1, { timeout: 5000 });
    const iconBox = await quickBtn.boundingBox();
    const iconCenter = iconBox.y + iconBox.height / 2;

    await quickBtn.hover();
    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });

    const flashBox = await flashBtn.boundingBox();
    const flashCenter = flashBox.y + flashBox.height / 2;

    // Was previously top-aligned (row.top = icon.top), which drifts a couple
    // px off-center whenever the icon's rendered height doesn't exactly
    // equal its authored size (e.g. residual scale from its entrance
    // animation) -- aligning centers directly is robust to that.
    expect(Math.abs(flashCenter - iconCenter)).toBeLessThan(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("a hovered flash button scales up by the same factor as the floating icon", async () => {
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

    const flashBtn = page.locator('[data-flash-action="rephrase"]');
    await expect(flashBtn).toBeVisible({ timeout: 2000 });
    await flashBtn.hover();
    await page.waitForTimeout(200); // let the hover-in transition finish

    const hoveredBox = await flashBtn.boundingBox();
    // 22px base * 1.15, matching .omni-ai-quick-btn:hover's own scale factor.
    expect(hoveredBox.width).toBeCloseTo(25.3, 0);
    expect(hoveredBox.height).toBeCloseTo(25.3, 0);
  } finally {
    await context.close();
    server.close();
  }
});
