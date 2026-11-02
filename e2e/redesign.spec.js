const { test, expect } = require("@playwright/test");
const { launchWithExtension } = require("./extension.fixtures");

// Shared helpers for the settings page and side panel redesign spec.
// The visual work is CSS only, so these assert computed styles that prove the
// shared glass primitives actually landed on each surface.

async function openSettings(context, sw, theme) {
  const page = await context.newPage();
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/settings.html`);
  if (theme === "light") {
    await page.evaluate(() => chrome.storage.sync.set({ omni_ai_theme: "light" }));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/omni-ai-light-mode/);
  }
  return page;
}

test("settings page paints the glass shell on the page backdrop", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);

    const backdrop = await page.evaluate(
      () => getComputedStyle(document.body, "::before").backgroundImage,
    );
    expect(backdrop).toContain("radial-gradient");

    await expect(page.locator(".header-content.ds-surface")).toHaveCount(1);
    const headerFilter = await page.evaluate(
      () => getComputedStyle(document.querySelector(".header-content")).backdropFilter,
    );
    expect(headerFilter).not.toBe("none");

    const card = page.locator(".setting-card.ds-surface").first();
    await expect(card).toBeVisible();
    const cardFilter = await card.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(cardFilter).not.toBe("none");

    await expect(page.locator(".section-icon svg")).toHaveCount(5);
    const iconText = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".section-icon"))
        .map((el) => el.textContent.trim())
        .join(""),
    );
    expect(iconText).toBe("");
  } finally {
    await context.close();
  }
});

test("settings page flips its glass surface in light theme", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, "light");
    const bg = await page.evaluate(
      () => getComputedStyle(document.querySelector(".setting-card.ds-surface")).backgroundColor,
    );
    expect(bg).toBe("rgba(255, 255, 255, 0.84)");
  } finally {
    await context.close();
  }
});
