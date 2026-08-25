const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Covers two CSS-robustness regressions found during manual testing:
// (1) an unbroken long token (URL, code) in an AI result must wrap inside
//     its card instead of forcing horizontal overflow, and
// (2) the shadow UI's isolation from host-page CSS must survive even if the
//     page later strips the shadow host's inline style attribute (a real
//     failure mode: any page script that resets/clears attributes on
//     document.body's direct children, e.g. a "declutter" script or a full
//     DOM re-render).

const LONG_TOKEN = "https://example.com/" + "a".repeat(180) + "/end";

async function seedConfig(sw) {
  await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-2.0-flash",
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

test("wraps a long unbroken token in the result card instead of overflowing it", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, LONG_TOKEN);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.locator("#target").click();
    await page.locator("#target").dispatchEvent("mouseup");
    await expect(page.locator(".omni-ai-quick-btn")).toHaveCount(1, { timeout: 5000 });
    await page.locator(".omni-ai-quick-btn").click();

    const replyBtn = page.locator('[data-action="reply"]');
    await expect(replyBtn).toBeVisible();
    await page.waitForTimeout(200);
    await replyBtn.click();

    await expect(page.locator(".omni-ai-result-text")).toBeVisible({ timeout: 5000 });
    const overflow = await page.evaluate(() => {
      const contentArea = document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector(".omni-ai-content-area");
      return contentArea.scrollWidth - contentArea.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("wraps a long unbroken token in the auto grammar-check suggestion card", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, LONG_TOKEN);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.evaluate(() => {
      const el = document.getElementById("target");
      el.focus();
      el.setSelectionRange(0, 5);
    });
    await page.locator("#target").dispatchEvent("mouseup");
    await expect(page.locator(".omni-ai-quick-btn")).toHaveCount(1, { timeout: 5000 });
    await page.locator(".omni-ai-quick-btn").click();

    // The grammar smart-fix check auto-fires when the menu opens on an
    // input; wait for it to populate .omni-ai-suggestion-content.
    const suggestionContent = page.locator(".omni-ai-suggestion-content");
    await expect(suggestionContent).toBeVisible({ timeout: 5000 });
    await expect(suggestionContent).toContainText("example.com", { timeout: 5000 });

    const overflow = await page.evaluate(() => {
      const el = document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector(".omni-ai-suggestion-content");
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("stays isolated from host-page CSS even if the shadow host's inline style is stripped", async () => {
  const FIXTURE = `<!doctype html><html><body>
    <input id="target" type="text" value="Hello world, this is a test." />
  </body></html>`;
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "Reply text");

    const page = await context.newPage();
    // Aggressive host-page CSS the shadow tree's own top-level classes
    // don't explicitly reset (text-align, cursor) — a stand-in for the
    // kind of global reset/framework CSS real sites ship.
    await page.addStyleTag({
      content: `* { text-align: right !important; cursor: not-allowed !important; }`,
    });
    await page.goto(`http://127.0.0.1:${port}/`);

    await page.locator("#target").click();
    await page.locator("#target").dispatchEvent("mouseup");
    await expect(page.locator(".omni-ai-quick-btn")).toHaveCount(1, { timeout: 5000 });

    // Simulate a page script stripping the shadow host's inline style
    // attribute (a full DOM reset, a "declutter" cleanup script, etc.) —
    // the only isolation content.js applies is a one-time inline style, so
    // this used to remove all protection until overlay.css got its own
    // :host rule.
    await page.evaluate(() => {
      document.getElementById("omni-ai-shadow-host").removeAttribute("style");
    });

    await page.locator(".omni-ai-quick-btn").click();
    const replyBtn = page.locator('[data-action="reply"]');
    await expect(replyBtn).toBeVisible();
    await page.waitForTimeout(200);
    await replyBtn.click();

    const resultText = page.locator(".omni-ai-result-text");
    await expect(resultText).toBeVisible({ timeout: 5000 });
    const style = await resultText.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { textAlign: cs.textAlign, cursor: cs.cursor };
    });
    expect(style.textAlign).not.toBe("right");
    expect(style.cursor).not.toBe("not-allowed");
  } finally {
    await context.close();
    server.close();
  }
});
