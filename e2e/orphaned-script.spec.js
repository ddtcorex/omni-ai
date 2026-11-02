const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Reloading the extension leaves the previous content script running in tabs
// that were already open, with an invalid extension context
// (chrome.runtime.id is undefined). Such an orphaned script must take its UI
// down and stop listening, or it draws a second, stale toolbar next to the
// one of the script that replaced it (spec follow-up C).

const FIXTURE = `<!doctype html><html><body style="padding:40px">
  <p id="t">Alpha beta gamma delta epsilon and more words here.</p>
  <p id="u" style="margin-top:120px">Another line of plain page text to select.</p>
</body></html>`;

async function seedConfig(sw) {
  await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true, flashActions: [] },
    });
  });
}

async function dragSelect(page, id) {
  const box = await page.locator(`#${id}`).boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
}

const shadowCount = (page, selector) =>
  page.evaluate(
    (q) =>
      document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelectorAll(q).length ?? 0,
    selector,
  );

const hostCount = (page) =>
  page.evaluate(() => document.querySelectorAll("#omni-ai-shadow-host").length);

// Reload the extension: the page keeps the old content script, now orphaned.
async function reloadExtension(context, sw) {
  const next = context.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await next;
}

test("an orphaned script removes its toolbar and host and ignores later selections", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelect(page, "t");
    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn")).toBe(1);

    await reloadExtension(context, sw);
    await dragSelect(page, "u");

    await expect.poll(() => hostCount(page)).toBe(0);
    // Later selections draw nothing: its listeners are gone.
    await dragSelect(page, "t");
    await page.waitForTimeout(300);
    expect(await hostCount(page)).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("an orphaned script removes an open card", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelect(page, "t");
    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn")).toBe(1);
    await page.evaluate(() =>
      document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector(".omni-ai-quick-btn")
        .click(),
    );
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay")).toBe(1);

    await reloadExtension(context, sw);
    // Escape no longer reaches a card listener once it tore down; the next
    // selection does the teardown.
    await dragSelect(page, "u");

    await expect.poll(() => hostCount(page)).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("an orphaned script keeps a shared host that still holds another script's UI", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await dragSelect(page, "t");
    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn")).toBe(1);

    await reloadExtension(context, sw);
    // The script that replaced it mounts into the same host (found by id).
    await page.evaluate(() => {
      const live = document.createElement("div");
      live.className = "live-script-ui";
      document.getElementById("omni-ai-shadow-host").shadowRoot.appendChild(live);
    });
    await dragSelect(page, "u");

    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn")).toBe(0);
    expect(await hostCount(page)).toBe(1);
    expect(await shadowCount(page, ".live-script-ui")).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});
