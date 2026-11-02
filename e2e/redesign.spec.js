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

test("settings fields, flash pills and save bar wear the new material", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await expect(page.locator("#apiModel")).toHaveClass(/ds-field/);
    await expect(page.locator("#saveBtn")).toHaveClass(/ds-btn-primary/);

    const barFilter = await page.evaluate(
      () => getComputedStyle(document.querySelector(".save-actions")).backdropFilter,
    );
    expect(barFilter).not.toBe("none");

    const chip = page.locator(".flash-action-option.ds-pill").first();
    await chip.locator("input").check();
    const selected = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(selected).not.toBe("rgba(0, 0, 0, 0)");
  } finally {
    await context.close();
  }
});

test("a save status does not grow the save bar", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await page.setViewportSize({ width: 900, height: 900 });
    const before = await page.locator(".save-actions").boundingBox();
    await page.evaluate(() => {
      const status = document.getElementById("saveStatus");
      status.textContent = "Changes saved";
      status.classList.add("visible");
    });
    const after = await page.locator(".save-actions").boundingBox();
    expect(after.height).toBe(before.height);
  } finally {
    await context.close();
  }
});

test("settings page honours reduced motion", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".settings-section"))
        .map((el) => getComputedStyle(el).animationDuration)
        .join(","),
    );
    expect(durations.split(",").every((duration) => duration === "0s")).toBe(true);
  } finally {
    await context.close();
  }
});

async function openPanel(context, sw, theme) {
  const page = await context.newPage();
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
  if (theme === "light") {
    await page.evaluate(() => chrome.storage.sync.set({ omni_ai_theme: "light" }));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/omni-ai-light-mode/);
  }
  return page;
}

test("side panel shell is glass and its tabs are a segmented pill", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    const shell = await page.evaluate(
      () => getComputedStyle(document.querySelector(".sidepanel-container")).backdropFilter,
    );
    expect(shell).not.toBe("none");

    const active = page.locator("#tabChat");
    const bg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(await active.getAttribute("aria-selected")).toBe("true");

    await expect(page.locator(".tab-icon svg")).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test("side panel glass flips in light theme", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw, "light");
    const bg = await page.evaluate(
      () => getComputedStyle(document.querySelector(".sidepanel-container")).backgroundColor,
    );
    expect(bg).toBe("rgba(255, 255, 255, 0.84)");
  } finally {
    await context.close();
  }
});

test("the panel does not overflow at 280px with long labels", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    await page.setViewportSize({ width: 280, height: 700 });
    const overflow = await page.evaluate(() => ({
      horizontal:
        document.querySelector(".tab-nav").scrollWidth >
        document.querySelector(".tab-nav").clientWidth + 1,
      doc: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    expect(overflow.horizontal).toBe(false);
    expect(overflow.doc).toBe(false);
  } finally {
    await context.close();
  }
});
